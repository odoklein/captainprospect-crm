import { clientVisibleActionWhere } from "@/lib/meetings/clientVisibility";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { portalVisibleMissionWhere } from "@/lib/portal-visibility";
import { buildStatusVocabulary, loadMissionStatuses } from "@/lib/prospection-export/load";
import { buildStageResolver } from "@/lib/prospection-export/portal";
import type { PortalCompanyTimelineResponse, PortalTimelineEntry } from "@/lib/prospection-export/portal-types";

const TIMELINE_LIMIT = 200;

// ============================================
// GET /api/client/database/[companyId]
// History of one company for the portal drawer: date, channel, status and the
// scheduled callback/meeting — no notes, call summaries or SDR names.
// ============================================

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ companyId: string }> }
) => {
    const session = await requireRole(["CLIENT"], request);
    const clientId = (session.user as { clientId?: string | null }).clientId;
    const { companyId } = await params;
    if (!clientId) return errorResponse("Entreprise introuvable", 404);

    // Ownership check: the company must sit in one of this client's visible missions.
    const company = await prisma.company.findFirst({
        where: { id: companyId, list: { mission: { clientId, AND: [portalVisibleMissionWhere()] } } },
        select: {
            list: { select: { missionId: true } },
            contacts: { select: { id: true, firstName: true, lastName: true } },
        },
    });
    if (!company) return errorResponse("Entreprise introuvable", 404);

    const [actions, statuses] = await Promise.all([
        prisma.action.findMany({
            where: { AND: [{ OR: [{ contact: { companyId } }, { contactId: null, companyId }] }, clientVisibleActionWhere] },
            select: { id: true, contactId: true, channel: true, result: true, callbackDate: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: TIMELINE_LIMIT + 1,
        }),
        loadMissionStatuses(company.list.missionId),
    ]);
    const vocabulary = buildStatusVocabulary(statuses);
    const stageFor = buildStageResolver(statuses);

    const contactNames = new Map(
        company.contacts.map((c) => [c.id, [c.firstName, c.lastName].filter(Boolean).join(" ") || null])
    );

    const timeline: PortalTimelineEntry[] = actions.slice(0, TIMELINE_LIMIT).map((a) => {
        const scheduled = a.result === "MEETING_BOOKED" || vocabulary.isCallback(a.result);
        return {
            id: a.id,
            at: a.createdAt.toISOString(),
            channel: a.channel,
            label: vocabulary.labelFor(a.result),
            stage: stageFor(a.result),
            contactName: a.contactId ? contactNames.get(a.contactId) ?? null : null,
            scheduledAt: scheduled && a.callbackDate ? a.callbackDate.toISOString() : null,
        };
    });

    const body: PortalCompanyTimelineResponse = { timeline, truncated: actions.length > TIMELINE_LIMIT };
    return successResponse(body);
});
