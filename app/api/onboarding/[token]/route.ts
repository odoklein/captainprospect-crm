import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { errorResponse, successResponse, withErrorHandler } from "@/lib/api-utils";
import { getAgencyInvite, registerInvitedClient, validInviteToken } from "@/lib/onboarding/agency-invite";
import { registrationSchema } from "@/lib/onboarding/self-service-schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/geo-ip";
import { getLicense } from "@/lib/license/server";
import { isSuspended } from "@/lib/license/resolve";

type Context = { params: Promise<{ token: string }> };

export const GET = withErrorHandler(async (_request: NextRequest, { params }: Context) => {
    const { token } = await params;
    if (!validInviteToken(token, await getAgencyInvite())) return errorResponse("Ce lien d’invitation n’est plus valide. Contactez l’agence.", 404);
    return successResponse({ available: true });
});

export const POST = withErrorHandler(async (request: NextRequest, { params }: Context) => {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) return errorResponse("Origine non autorisée.", 403);
    if (!checkRateLimit(`client-signup:${getClientIp(request) ?? "unknown"}`, 5, 15 * 60 * 1000).allowed) {
        return errorResponse("Trop de tentatives. Réessayez dans 15 minutes.", 429);
    }
    // Public route is outside session middleware, but still respects suspension.
    if (isSuspended(await getLicense())) return errorResponse("Les inscriptions sont temporairement suspendues.", 403);
    const body = await request.json().catch(() => null);
    const parsed = registrationSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Vérifiez les informations.", 400);
    const { token } = await params;
    try {
        await registerInvitedClient(token, parsed.data);
        return successResponse({ redirectTo: "/client/missions?new=1" }, 201);
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            return errorResponse("Impossible de créer ce compte. Essayez de vous connecter ou contactez l’agence.", 409);
        }
        throw error;
    }
});
