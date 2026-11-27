import { NextRequest } from "next/server";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { phoneKey } from "@/lib/exclusions/matching";
import { TELEPHONY_ROLES } from "@/lib/telephony/roles";
import { KAVKOM_PROVIDER } from "@/lib/kavkom/webhook";

export const dynamic = "force-dynamic";

/**
 * GET /api/telephony/kavkom/inbound?from=<number> — who is ringing in the CRM tab right now.
 * Kavkom's live webhook created the row (and the « Appels à traiter » fiche) a moment before
 * the call reached the browser: the call bar gets its name, company and call id from it.
 * The signed-in user's own calls only, from the last two minutes.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole([...TELEPHONY_ROLES], request);
    const key = phoneKey(new URL(request.url).searchParams.get("from"));
    if (!key) return successResponse(null);
    const rows = await prisma.telephonyCall.findMany({
        where: { provider: KAVKOM_PROVIDER, direction: "INBOUND", sdrId: session.user.id, startedAt: { gte: new Date(Date.now() - 2 * 60_000) } },
        orderBy: { startedAt: "desc" },
        take: 10,
        select: { id: true, toNumber: true, contactId: true, companyId: true, campaignId: true, incomingCallId: true },
    });
    const row = rows.find((r) => phoneKey(r.toNumber) === key);
    if (!row) return successResponse(null);
    const incoming = row.incomingCallId
        ? await prisma.incomingCall.findUnique({ where: { id: row.incomingCallId }, select: { callerName: true, companyName: true } })
        : null;
    return successResponse({
        callId: row.id,
        contactId: row.contactId,
        companyId: row.companyId,
        campaignId: row.campaignId,
        callerName: incoming?.callerName ?? null,
        companyName: incoming?.companyName ?? null,
    });
});
