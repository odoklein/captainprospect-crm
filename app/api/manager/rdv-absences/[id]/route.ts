// ============================================
// /api/manager/rdv-absences/[id]
// Everything a manager needs to decide what happens to one absent RDV:
// who the contact is, what was said, what has happened since, and who could
// pick it back up. Read-only; the writes stay on /api/manager/rdv-absences.
// ============================================

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    requireRole,
    withErrorHandler,
    NotFoundError,
} from "@/lib/api-utils";

/** How far back "has this contact been worked" and "who works this mission" look. */
const ACTIVITY_DAYS = 90;
const HISTORY_LIMIT = 12;

/** A booker's note can be an essay; the drawer only needs the gist. */
function clip(text: string | null | undefined, max = 600): string | null {
    const t = text?.trim();
    if (!t) return null;
    return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}

function strings(json: unknown): string[] {
    return Array.isArray(json) ? json.filter((v): v is string => typeof v === "string" && v.trim() !== "") : [];
}

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) => {
    await requireRole(["MANAGER"], request);
    const { id } = await params;

    const action = await prisma.action.findUnique({
        where: { id },
        include: {
            contact: {
                select: {
                    id: true, firstName: true, lastName: true, title: true,
                    email: true, phone: true, additionalPhones: true, additionalEmails: true,
                    linkedin: true,
                },
            },
            company: { select: { id: true, name: true, industry: true, website: true, size: true, country: true, phone: true } },
            sdr: { select: { id: true, name: true, email: true } },
            confirmedBy: { select: { name: true } },
            interlocuteur: { select: { firstName: true, lastName: true, title: true } },
            campaign: {
                select: {
                    id: true, name: true, missionId: true,
                    mission: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
                },
            },
        },
    });
    if (!action || action.result !== "MEETING_BOOKED") throw new NotFoundError("RDV introuvable");

    // The contact's company is the fallback identity when the RDV was booked on
    // the company rather than a person.
    const company = action.company
        ?? (action.contact
            ? await prisma.company.findFirst({
                where: { contacts: { some: { id: action.contact.id } } },
                select: { id: true, name: true, industry: true, website: true, size: true, country: true, phone: true },
            })
            : null);

    const since = new Date(Date.now() - ACTIVITY_DAYS * 86_400_000);
    const missionId = action.campaign?.missionId ?? null;
    const sameTarget = action.contactId
        ? { contactId: action.contactId }
        : action.companyId ? { companyId: action.companyId } : null;

    const [history, siblings, assignments, missionActivity, openAbsences] = await Promise.all([
        // Every touch on this contact except the RDV itself, most recent first.
        sameTarget
            ? prisma.action.findMany({
                where: { ...sameTarget, id: { not: action.id } },
                orderBy: { createdAt: "desc" },
                take: HISTORY_LIMIT,
                select: {
                    id: true, createdAt: true, result: true, channel: true, note: true,
                    duration: true, callbackDate: true,
                    sdr: { select: { id: true, name: true } },
                },
            })
            : Promise.resolve([]),
        // Other RDV for the same target: a newer one means it was probably replaced.
        sameTarget
            ? prisma.action.findMany({
                where: { ...sameTarget, id: { not: action.id }, result: { in: ["MEETING_BOOKED", "MEETING_CANCELLED"] } },
                orderBy: { callbackDate: "desc" },
                take: 5,
                select: {
                    id: true, callbackDate: true, result: true, cancellationReason: true,
                    confirmationStatus: true, meetingType: true,
                    meetingFeedback: { select: { outcome: true } },
                },
            })
            : Promise.resolve([]),
        missionId
            ? prisma.sDRAssignment.findMany({ where: { missionId }, select: { sdrId: true } })
            : Promise.resolve([]),
        missionId
            ? prisma.action.groupBy({
                by: ["sdrId"],
                where: { campaign: { missionId }, createdAt: { gte: since } },
                _count: { _all: true },
            })
            : Promise.resolve([]),
        // Absences each SDR is already carrying: do not stack them on the same person.
        prisma.action.groupBy({
            by: ["sdrId"],
            where: {
                result: "MEETING_BOOKED",
                meetingFeedback: { is: { outcome: "NO_SHOW", standByAt: null, outOfScopeAt: null } },
            },
            _count: { _all: true },
        }),
    ]);

    const users = await prisma.user.findMany({
        where: { role: { in: ["SDR", "BOOKER"] }, isActive: true },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
    });

    const assigned = new Set(assignments.map((a) => a.sdrId));
    const missionCounts = new Map(missionActivity.map((g) => [g.sdrId, g._count._all]));
    const absenceCounts = new Map(openAbsences.map((g) => [g.sdrId, g._count._all]));
    const calledContact = new Map<string, number>();
    for (const h of history) calledContact.set(h.sdr.id, (calledContact.get(h.sdr.id) ?? 0) + 1);

    // Same order the manager reasons in: who knows this contact, then who is on
    // the mission, then who has room.
    const sdrs = users
        .map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            isBooker: u.id === action.sdrId,
            onMission: assigned.has(u.id),
            missionActions: missionCounts.get(u.id) ?? 0,
            touchedContact: calledContact.get(u.id) ?? 0,
            openAbsences: absenceCounts.get(u.id) ?? 0,
        }))
        .sort((a, b) =>
            Number(b.touchedContact > 0) - Number(a.touchedContact > 0)
            || Number(b.onMission) - Number(a.onMission)
            || b.missionActions - a.missionActions
            || a.openAbsences - b.openAbsences
            || a.name.localeCompare(b.name, "fr"));

    const absenceAt = action.callbackDate;
    const afterAbsence = absenceAt ? history.filter((h) => h.createdAt > absenceAt) : [];
    const newerMeeting = absenceAt
        ? siblings.find((s) =>
            s.result === "MEETING_BOOKED"
            && s.callbackDate != null && s.callbackDate > absenceAt
            && s.meetingFeedback?.outcome !== "NO_SHOW")
        : null;

    const fiche = action.rdvFiche && typeof action.rdvFiche === "object" && !Array.isArray(action.rdvFiche)
        ? action.rdvFiche as Record<string, unknown>
        : null;
    const ficheText = (key: string) => (typeof fiche?.[key] === "string" ? clip(fiche[key] as string, 500) : null);

    return successResponse({
        id: action.id,
        meeting: {
            date: action.callbackDate?.toISOString() ?? null,
            type: action.meetingType,
            category: action.meetingCategory,
            address: action.meetingAddress,
            joinUrl: action.meetingJoinUrl,
            phone: action.meetingPhone ?? action.contact?.phone ?? null,
            bookedAt: action.createdAt.toISOString(),
            confirmationStatus: action.confirmationStatus,
            confirmedAt: action.confirmedAt?.toISOString() ?? null,
            confirmedBy: action.confirmedBy?.name ?? null,
            interlocuteur: action.interlocuteur
                ? {
                    name: [action.interlocuteur.firstName, action.interlocuteur.lastName].filter(Boolean).join(" "),
                    title: action.interlocuteur.title,
                }
                : null,
            channel: action.channel,
        },
        contact: action.contact
            ? {
                name: [action.contact.firstName, action.contact.lastName].filter(Boolean).join(" ") || null,
                title: action.contact.title,
                email: action.contact.email,
                phones: [action.contact.phone, ...strings(action.contact.additionalPhones)].filter(Boolean) as string[],
                emails: [action.contact.email, ...strings(action.contact.additionalEmails)].filter(Boolean) as string[],
                linkedin: action.contact.linkedin,
            }
            : null,
        company: company
            ? {
                name: company.name,
                industry: company.industry,
                website: company.website,
                size: company.size,
                country: company.country,
                phone: company.phone,
            }
            : null,
        booker: action.sdr,
        mission: action.campaign?.mission
            ? {
                id: action.campaign.mission.id,
                name: action.campaign.mission.name,
                clientName: action.campaign.mission.client?.name ?? null,
                campaignName: action.campaign.name,
            }
            : null,
        context: {
            bookingNote: clip(action.note),
            callSummary: clip(action.callSummary),
            contexte: ficheText("contexte"),
            besoins: ficheText("besoinsProblemes"),
            objections: ficheText("objectionsFreins"),
            notes: ficheText("notesImportantes"),
        },
        /** What happened to this contact after the RDV was missed. */
        followUp: {
            attemptsSinceAbsence: afterAbsence.length,
            lastAttemptAt: afterAbsence[0]?.createdAt.toISOString() ?? null,
            newerMeeting: newerMeeting
                ? {
                    id: newerMeeting.id,
                    date: newerMeeting.callbackDate?.toISOString() ?? null,
                    type: newerMeeting.meetingType,
                    confirmationStatus: newerMeeting.confirmationStatus,
                }
                : null,
        },
        history: history.map((h) => ({
            id: h.id,
            at: h.createdAt.toISOString(),
            result: h.result,
            channel: h.channel,
            note: clip(h.note, 240),
            duration: h.duration,
            sdrName: h.sdr.name,
            afterAbsence: absenceAt ? h.createdAt > absenceAt : false,
        })),
        sdrs,
    });
});
