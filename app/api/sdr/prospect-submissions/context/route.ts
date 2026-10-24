// ============================================
// GET /api/sdr/prospect-submissions/context?companyId=&contactId=
// What the action drawer needs to offer "Nouvelle société": the mission's
// mode, its active lists, the referrer on screen and, when this company was
// itself added by an SDR, its origin line. Read-only.
// ============================================

import { NextRequest } from "next/server";
import { errorResponse, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { getProspectCreationMode } from "@/lib/prospect-submissions/settings";
import { canSubmitOnMission, missionIdOfCompany, resolveReferrer, SUBMITTER_ROLES } from "@/lib/prospect-submissions/access";
import { getOrigin, loadMissionContext } from "@/lib/prospect-submissions/service";
import { prisma } from "@/lib/prisma";

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(SUBMITTER_ROLES, request);
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    const contactId = searchParams.get("contactId");
    if (!companyId) return errorResponse("companyId requis", 400);

    const missionId = await missionIdOfCompany(companyId);
    if (!missionId) return errorResponse("Société introuvable", 404);

    const [mission, mode, origin, company] = await Promise.all([
        loadMissionContext(missionId),
        getProspectCreationMode(missionId),
        getOrigin(companyId),
        prisma.company.findUnique({ where: { id: companyId }, select: { listId: true } }),
    ]);
    if (!mission) return errorResponse("Mission introuvable", 404);

    const allowed = mode !== "OFF" && mission.isWorkable && (await canSubmitOnMission(session.user, missionId));
    const referrer = allowed ? await resolveReferrer(missionId, companyId, contactId) : null;
    const defaultListId = mission.lists.some((l) => l.id === company?.listId)
        ? company!.listId
        : (mission.lists[0]?.id ?? null);

    return successResponse({
        mode: allowed ? mode : "OFF",
        missionId,
        missionName: mission.name,
        lists: allowed ? mission.lists : [],
        defaultListId: allowed ? defaultListId : null,
        referrer,
        origin,
    });
});
