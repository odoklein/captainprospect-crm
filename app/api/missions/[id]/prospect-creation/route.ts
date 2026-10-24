// ============================================
// GET/PUT /api/missions/[id]/prospect-creation
// Can SDRs add companies to this mission? OFF / VALIDATION / DIRECT.
// Kept apart from PUT /api/missions/[id], which BD and BOOKER may also call:
// this one is a manager decision.
// ============================================

import { NextRequest } from "next/server";
import { errorResponse, requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { prospectCreationModeSchema } from "@/lib/prospect-submissions/schemas";
import { getProspectCreationMode, setProspectCreationMode } from "@/lib/prospect-submissions/settings";

export const GET = withErrorHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requireRole(["MANAGER", "BUSINESS_DEVELOPER"], request);
    const { id } = await params;
    return successResponse({ mode: await getProspectCreationMode(id) });
});

export const PUT = withErrorHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const session = await requireRole(["MANAGER"], request);
    const { id } = await params;
    const { mode } = await validateRequest(request, prospectCreationModeSchema);

    const mission = await prisma.mission.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!mission) return errorResponse("Mission introuvable", 404);

    const before = await getProspectCreationMode(id);
    await setProspectCreationMode(id, mode);
    audit(request, session, {
        action: "UPDATE",
        entityType: "Mission",
        entityId: id,
        summary: `Ajout de sociétés par les SDR : ${before} → ${mode} (${mission.name})`,
        before: { sdrProspectCreation: before },
        after: { sdrProspectCreation: mode },
    });
    return successResponse({ mode });
});
