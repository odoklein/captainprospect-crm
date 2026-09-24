import { NextRequest } from "next/server";
import { IncomingCallStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { errorResponse, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { activeCallsWhere, INCOMING_CALL_ROLES, presentIncomingCall } from "@/lib/incoming-calls/present";

export const dynamic = "force-dynamic";

/**
 * GET /api/incoming-calls[?init=1]
 *
 * Polled every few seconds by IncomingCallPanel, so it stays a single indexed
 * query. `init=1` (first load only) also says whether the user has a line at
 * all, letting the panel stop polling for everyone else.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(INCOMING_CALL_ROLES, request);
    const userId = session.user.id;

    const rows = await prisma.incomingCall.findMany({
        where: activeCallsWhere(userId),
        orderBy: { startedAt: "desc" },
        take: 20,
    });

    let enabled: boolean | undefined;
    if (request.nextUrl.searchParams.get("init") === "1") {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { alloPhoneNumber: true } });
        // A line matched by Allo user email (no number typed in the CRM) still counts.
        enabled = Boolean(user?.alloPhoneNumber?.trim()) || rows.length > 0 ||
            (await prisma.incomingCall.count({
                where: { sdrId: userId, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
            })) > 0;
    }

    const now = Date.now();
    return successResponse({ enabled, calls: rows.map((row) => presentIncomingCall(row, now)) });
});

const bulkSchema = z.object({ dismissMissed: z.literal(true) });

/** PATCH /api/incoming-calls { dismissMissed: true } — clears the missed-call reminders. */
export const PATCH = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(INCOMING_CALL_ROLES, request);
    const parsed = bulkSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse("Requête invalide", 400);

    const { count } = await prisma.incomingCall.updateMany({
        where: { sdrId: session.user.id, status: IncomingCallStatus.MISSED, dismissedAt: null },
        data: { dismissedAt: new Date() },
    });
    return successResponse({ dismissed: count });
});
