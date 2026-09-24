import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { NotFoundError, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { fetchPhoneHistory } from "@/lib/incoming-calls/caller-lookup";
import { INCOMING_CALL_ROLES } from "@/lib/incoming-calls/present";

export const dynamic = "force-dynamic";

/**
 * GET /api/incoming-calls/[id]/phone-history
 *
 * Every Allo call with this number from call-vault — separate from the dossier
 * because the vault can take seconds and the panel shouldn't wait on it.
 */
export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) => {
    const session = await requireRole(INCOMING_CALL_ROLES, request);
    const { id } = await params;

    const row = await prisma.incomingCall.findUnique({
        where: { id },
        select: { sdrId: true, fromNumber: true, toNumber: true, callerKey: true, startedAt: true },
    });
    if (!row || row.sdrId !== session.user.id) throw new NotFoundError("Appel introuvable");
    if (!row.callerKey) return successResponse({ available: true, calls: [] });

    const history = await fetchPhoneHistory(row.fromNumber, row.toNumber);
    // Once synced, the vault knows this very call too — it isn't "history".
    const calls = history.calls.filter(
        (c) =>
            !(
                c.direction === "INBOUND" &&
                c.startedAt &&
                Math.abs(Date.parse(c.startedAt) - row.startedAt.getTime()) < 2 * 60_000
            ),
    );
    return successResponse({ available: history.available, calls });
});
