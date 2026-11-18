import { NextRequest } from "next/server";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { AGENCY_INVITE_KEY, ensureAgencyInvite, getAgencyInvite } from "@/lib/onboarding/agency-invite";
import { prisma } from "@/lib/prisma";

function response(token: string | null) {
    return successResponse({ path: token ? `/onboarding/invite/${token}` : null });
}

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    return response(await getAgencyInvite());
});

export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    return response(await ensureAgencyInvite());
});

export const DELETE = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    await prisma.systemConfig.deleteMany({ where: { key: AGENCY_INVITE_KEY } });
    return response(null);
});
