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
            standByAt: true,
            standByReason: true,
            reportedBy: { select: { id: true, name: true } },
            standBy: { select: { id: true, name: true } },
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
                standByAt: m.meetingFeedback.standByAt?.toISOString() ?? null,
                standByReason: m.meetingFeedback.standByReason,
                standByBy: m.meetingFeedback.standBy?.name ?? null,
            }
            : null,
    };
}

/**
 * GET /api/manager/rdv-absences?scope=all|pending|reported
 *
 * `all` (default) returns the three lists, which is what the page needs in one trip:
 * `pending`  — past meetings with no verdict yet, the ones to act on.
 * `reported` — no-shows already recorded, so a mistake can be spotted.
 * `standby`  — no-shows set aside: still recorded, but off the SDR boards.
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

    const [pendingRows, reportedRows, sdrs] = await Promise.all([
        scope === "reported"
            ? Promise.resolve([] as MeetingRow[])
            : fetchMeetings({ ...baseWhere, meetingFeedback: { is: null } }),
        scope === "pending"
            ? Promise.resolve([] as MeetingRow[])
            : fetchMeetings({ ...baseWhere, meetingFeedback: { is: { outcome: "NO_SHOW" } } }),
        prisma.user.findMany({
            where: { role: { in: ["SDR", "BOOKER"] }, isActive: true },
            select: { id: true, name: true, email: true },
            orderBy: { name: "asc" },
        }),
    ]);

    const pending = pendingRows.map(serialise);
    const allReported = reportedRows.map(serialise);
    // A no-show set aside is still a no-show on record — it just belongs in its
    // own list rather than in the active backlog everyone is working through.
    const reported = allReported.filter((m) => !m.feedback?.standByAt);
    const standby = allReported.filter((m) => m.feedback?.standByAt);

    return successResponse({
        pending,
        reported,
        standby,
        sdrs,
        kpis: {
            absents: reported.length,
            pending: pending.length,
            pendingLate: pending.filter((m) => !m.portalWindowOpen).length,
            reportedManually: reported.filter((m) => m.feedback?.source === "MANAGER_MANUAL").length,
            standby: standby.length,
            windowHours: NO_SHOW_REPORT_WINDOW_HOURS,
        },
    });
});

const ReportBody = z.object({
    actionId: z.string().min(1),
    recontactRequested: z.enum(["YES", "NO", "MAYBE"]).default("YES"),
    note: z.string().max(1000).optional(),
    reassignSdrId: z.string().optional(),
});

/**
 * POST /api/manager/rdv-absences
 *
 * Records a NO_SHOW or reassigns an existing NO_SHOW to an SDR.
 * Because the SDR dashboard reads `meetingFeedback.outcome === "NO_SHOW"`,
 * and prioritises ABSENT_RDV at the top of the queue, writing it here pushes
 * it directly to the SDR's active calling view.
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
            ...(note !== null ? { clientNote: note } : {}),
            reportedById: session.user.id,
            // Re-flagging or reassigning an absence means it is live again:
            // it would be pushed to an SDR who cannot see it otherwise.
            standByAt: null,
            standByReason: null,
            standById: null,
        },
    });

    // Reassign SDR if a target SDR was selected and differs from current
    let targetSdrId = action.sdr?.id;
    if (body.reassignSdrId && body.reassignSdrId !== action.sdrId) {
        await prisma.action.update({
            where: { id: action.id },
            data: { sdrId: body.reassignSdrId },
        });
        targetSdrId = body.reassignSdrId;
    }

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

    // Notify the SDR (initial or newly reassigned) that this contact is a priority absent RDV
    if (targetSdrId) {
        createNotification({
            userId: targetSdrId,
            title: `⚠ RDV absent à relancer : ${contact}`,
            message: `${company} — ${clientName}. Signalé absent par ${reporter}. À rappeler en priorité absolue.`,
            type: "warning",
            link: "/sdr/action",
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

const StandByBody = z.object({
    actionId: z.string().min(1),
    /** true = set aside, false = put it back in the active backlog. */
    standBy: z.boolean(),
    reason: z.string().max(1000).optional(),
});

/**
 * PATCH /api/manager/rdv-absences
 *
 * "Absent en stand by": the absence is real and stays on record, but it is not
 * something anyone should be calling right now. Stamping `standByAt` is what
 * takes it off the SDR absence banner and out of the priority calling queue —
 * the alternative was to cancel or re-flag the RDV, which misreports what
 * happened. Sending `standBy: false` puts it straight back.
 */
export const PATCH = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const body = await validateRequest(request, StandByBody);

    const action = await prisma.action.findUnique({
        where: { id: body.actionId },
        include: MEETING_INCLUDE,
    });
    if (!action) throw new NotFoundError("RDV introuvable");
    if (!action.meetingFeedback || action.meetingFeedback.outcome !== "NO_SHOW") {
        throw new ValidationError("Ce RDV n'est pas signalé absent");
    }

    await prisma.meetingFeedback.update({
        where: { actionId: action.id },
        data: body.standBy
            ? {
                standByAt: new Date(),
                standByReason: body.reason?.trim() || null,
                standById: session.user.id,
            }
            : { standByAt: null, standByReason: null, standById: null },
    });

    const refreshed = await prisma.action.findUnique({
        where: { id: action.id },
        include: MEETING_INCLUDE,
    });

    return successResponse(refreshed ? serialise(refreshed) : null);
});
