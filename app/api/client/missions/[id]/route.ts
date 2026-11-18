import { NextRequest } from "next/server";
import { requireRole, errorResponse, successResponse, withErrorHandler } from "@/lib/api-utils";
import { saveClientMission } from "@/lib/onboarding/client-missions";
import { missionBriefSchema } from "@/lib/onboarding/self-service-schema";

export const PATCH = withErrorHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const session = await requireRole(["CLIENT"], request);
    const parsed = missionBriefSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Brief invalide.", 400);
    return successResponse(await saveClientMission(session.user.id, parsed.data, (await params).id));
});
