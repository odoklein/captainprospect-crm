// ============================================
// /api/manager/rdv-absences
// Manual no-show reporting, for meetings whose 48h self-service window closed.
// GET  — meetings still awaiting a verdict (+ what was already reported)
// POST — flag one as absent; it lands on the SDR ("télépro") dashboard at once
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    requireRole,
    withErrorHandler,
    validateRequest,
    NotFoundError,
    ValidationError,
} from "@/lib/api-utils";
import {
    isNoShowReportWindowOpen,
    NO_SHOW_REPORT_WINDOW_HOURS,
} from "@/lib/meetings/noShowWindow";
import { notifyManagersClientSignal, createNotification } from "@/lib/notifications";
import { alertClientsLiveLateNoShow } from "@/lib/slack/clientsLive";

/** How far back the list looks. Older than this and a no-show is history, not a task. */
const LOOKBACK_DAYS = 120;

const MEETING_INCLUDE = {
    contact: {
        select: {
            firstName: true,
            lastName: true,
            company: { select: { name: true } },
        },
    },
    company: { select: { name: true } },
    sdr: { select: { id: true, name: true } },
    meetingFeedback: {
        select: {
            outcome: true,
            recontactRequested: true,
            clientNote: true,
            source: true,
            updatedAt: true,
            reportedBy: { select: { id: true, name: true } },
        },
    },
    campaign: {
        select: {
            name: true,
            mission: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
        },
    },
} as const;

function fetchMeetings(where: Record<string, unknown>) {
    return prisma.action.findMany({
        where,
        include: MEETING_INCLUDE,
        orderBy: { callbackDate: "desc" },
        take: 400,
    });
}

type MeetingRow = Awaited<ReturnType<typeof fetchMeetings>>[number];

function contactName(m: MeetingRow): string {
    const name = [m.contact?.firstName, m.contact?.lastName].filter(Boolean).join(" ");
    return name || m.company?.name || "Contact";
}

function companyName(m: MeetingRow): string {
    return m.contact?.company?.name || m.company?.name || "Entreprise inconnue";
}

function serialise(m: MeetingRow) {
    return {
        id: m.id,
        callbackDate: m.callbackDate?.toISOString() ?? null,
        meetingType: m.meetingType,
        contactName: contactName(m),
        companyName: companyName(m),
        missionId: m.campaign?.mission?.id ?? null,
        missionName: m.campaign?.mission?.name ?? null,
        campaignName: m.campaign?.name ?? null,
        clientId: m.campaign?.mission?.client?.id ?? null,
        clientName: m.campaign?.mission?.client?.name ?? "Client",
        sdr: m.sdr ? { id: m.sdr.id, name: m.sdr.name } : null,
        /** false = the client can no longer report it themselves, so it is ours to raise. */
        portalWindowOpen: isNoShowReportWindowOpen(m.callbackDate),
        feedback: m.meetingFeedback
            ? {
                outcome: m.meetingFeedback.outcome,
                recontactRequested: m.meetingFeedback.recontactRequested,
                note: m.meetingFeedback.clientNote,
                source: m.meetingFeedback.source,
                reportedBy: m.meetingFeedback.reportedBy?.name ?? null,
                reportedAt: m.meetingFeedback.updatedAt.toISOString(),
            }
            : null,
    };
}

/**
 * GET /api/manager/rdv-absences?scope=all|pending|reported
 *
 * `all` (default) returns both lists, which is what the page needs in one trip:
 * `pending`  — past meetings with no verdict yet, the ones to act on.
 * `reported` — no-shows already recorded, so a mistake can be spotted.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);

    const scope = request.nextUrl.searchParams.get("scope") ?? "all";
    const now = new Date();
    const lookbackFrom = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);

    const baseWhere = {
        result: "MEETING_BOOKED" as const,
        confirmationStatus: "CONFIRMED" as const,
        callbackDate: { gte: lookbackFrom, lt: now },
    };

    const [pendingRows, reportedRows] = await Promise.all([
        scope === "reported"
            ? Promise.resolve([] as MeetingRow[])
            : fetchMeetings({ ...baseWhere, meetingFeedback: { is: null } }),
        scope === "pending"
            ? Promise.resolve([] as MeetingRow[])
            : fetchMeetings({ ...baseWhere, meetingFeedback: { is: { outcome: "NO_SHOW" } } }),
    ]);

    const pending = pendingRows.map(serialise);
    const reported = reportedRows.map(serialise);

    return successResponse({
        pending,
        reported,
        kpis: {
            pending: pending.length,
            // What Jeff actually asked for: the ones the client can no longer
            // signal from the portal, which is why this space exists.
            pendingLate: pending.filter((m) => !m.portalWindowOpen).length,
            reportedManually: reported.filter((m) => m.feedback?.source === "MANAGER_MANUAL").length,
            windowHours: NO_SHOW_REPORT_WINDOW_HOURS,
        },
    });
});

const ReportBody = z.object({
    actionId: z.string().min(1),
    recontactRequested: z.enum(["YES", "NO", "MAYBE"]).default("YES"),
    note: z.string().max(1000).optional(),
});

/**
 * POST /api/manager/rdv-absences
 *
 * Records a NO_SHOW by hand. Because the SDR dashboard reads
 * `meetingFeedback.outcome === "NO_SHOW"`, writing it here is all it takes for
 * the RDV to appear there — no separate sync.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const body = await validateRequest(request, ReportBody);

    const action = await prisma.action.findUnique({
        where: { id: body.actionId },
        include: MEETING_INCLUDE,
    });
    if (!action) throw new NotFoundError("RDV introuvable");
    if (action.result !== "MEETING_BOOKED") {
        throw new ValidationError("Cette action n'est pas un rendez-vous");
    }
    if (action.meetingFeedback?.outcome === "NO_SHOW") {
        throw new ValidationError("Ce rendez-vous est déjà signalé absent");
    }

    const note = body.note?.trim() || null;

    await prisma.meetingFeedback.upsert({
        where: { actionId: action.id },
        create: {
            actionId: action.id,
            outcome: "NO_SHOW",
            recontactRequested: body.recontactRequested,
            clientNote: note,
            source: "MANAGER_MANUAL",
            reportedById: session.user.id,
        },
        update: {
            outcome: "NO_SHOW",
            recontactRequested: body.recontactRequested,
            clientNote: note,
            source: "MANAGER_MANUAL",
            reportedById: session.user.id,
        },
    });

    const clientName = action.campaign?.mission?.client?.name ?? "Client";
    const contact = contactName(action);
    const company = companyName(action);
    const meetingDate = action.callbackDate?.toISOString() ?? null;
    const reporter = session.user.name ?? session.user.email ?? "un manager";

    notifyManagersClientSignal({
        clientName,
        contactName: contact,
        companyName: company,
        missionName: action.campaign?.mission?.name,
        meetingDate,
        outcome: "NO_SHOW",
        recontact: body.recontactRequested,
        clientNote: note,
    }).catch(() => {});

    // The SDR who booked it is the one who has to rework the prospect.
    if (action.sdr?.id) {
        createNotification({
            userId: action.sdr.id,
            title: `RDV absent : ${contact}`,
            message: `${company} — ${clientName}. Signalé absent par ${reporter}.`,
            type: "warning",
            link: "/sdr/meetings",
        }).catch(() => {});
    }

    void alertClientsLiveLateNoShow({
        clientName,
        contactName: contact,
        companyName: company,
        missionName: action.campaign?.mission?.name ?? null,
        meetingDate,
        sdrName: action.sdr?.name ?? null,
        reportedBy: reporter,
        note,
    });

    const refreshed = await prisma.action.findUnique({
        where: { id: action.id },
        include: MEETING_INCLUDE,
    });

    return successResponse(refreshed ? serialise(refreshed) : null);
});
