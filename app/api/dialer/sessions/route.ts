import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { TELEPHONY_ROLES } from "@/lib/telephony/roles";
import { getSdrMissionScope } from "@/lib/sdr-today-missions";
import { dialerAvailability } from "@/lib/dialer/runtime";
import { sessionView } from "@/lib/dialer/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/dialer/sessions — is parallel mode available to me, and my live session if any. */
export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole([...TELEPHONY_ROLES], request);
    const availability = await dialerAvailability();
    const live = await prisma.dialerSession.findFirst({ where: { sdrId: session.user.id, status: { not: "ENDED" } }, select: { id: true } });
    return successResponse({
        available: availability.ok,
        reason: availability.ok ? null : availability.reason,
        maxLines: availability.ok ? availability.policy.maxLinesPerSdr : null,
        session: live ? await sessionView(live.id) : null,
    });
});

const startSchema = z.object({ missionId: z.string().min(1), campaignId: z.string().min(1).optional().nullable() });

/** POST /api/dialer/sessions — opens a parallel session (or returns the one already open). */
export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole([...TELEPHONY_ROLES], request);
    const availability = await dialerAvailability();
    if (!availability.ok) return errorResponse(availability.reason, 503);
    const data = await validateRequest(request, startSchema);

    if (session.user.role === "SDR") {
        const scope = await getSdrMissionScope(session.user.id);
        if (!scope.includes(data.missionId)) return errorResponse("Mission hors de votre planning du jour", 403);
    }
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { twilioCallerId: true } });
    if (!user?.twilioCallerId) return errorResponse("Aucun numéro Twilio attribué à cet utilisateur (Paramètres → Téléphonie)", 409);

    const existing = await prisma.dialerSession.findFirst({ where: { sdrId: session.user.id, status: { not: "ENDED" } } });
    if (existing) return successResponse(await sessionView(existing.id));

    const policy = availability.policy;
    const maxLines = Math.min(policy.maxLinesPerSdr, policy.missionMaxLines[data.missionId] ?? policy.maxLinesPerSdr);
    try {
        const created = await prisma.dialerSession.create({
            data: {
                sdrId: session.user.id,
                missionId: data.missionId,
                campaignId: data.campaignId ?? null,
                mode: "PARALLEL",
                conferenceName: `dsess_${crypto.randomUUID().replace(/-/g, "")}`,
                maxLines,
                policySnapshot: policy as unknown as object,
            },
        });
        return successResponse(await sessionView(created.id), 201);
    } catch (err) {
        // Two tabs started at once: the partial unique index kept one; return it.
        const again = await prisma.dialerSession.findFirst({ where: { sdrId: session.user.id, status: { not: "ENDED" } } });
        if (again) return successResponse(await sessionView(again.id));
        throw err;
    }
});
