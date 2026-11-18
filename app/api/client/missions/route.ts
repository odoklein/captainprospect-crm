import { NextRequest } from "next/server";
import { requireRole, errorResponse, successResponse, withErrorHandler } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { clientMissionSelect, clientMissionView, requireClientSpace, saveClientMission } from "@/lib/onboarding/client-missions";
import { missionBriefSchema } from "@/lib/onboarding/self-service-schema";
import { portalVisibleMissionWhere } from "@/lib/portal-visibility";

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["CLIENT"], request);
    const client = await requireClientSpace(session.user.id);
    const missions = await prisma.mission.findMany({
        where: { clientId: client.id, ...portalVisibleMissionWhere() },
        select: clientMissionSelect, orderBy: { createdAt: "desc" },
    });
    return successResponse({ client: { id: client.id, name: client.name }, missions: missions.map(clientMissionView) });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["CLIENT"], request);
    const parsed = missionBriefSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Brief invalide.", 400);
    return successResponse(await saveClientMission(session.user.id, parsed.data), 201);
});
