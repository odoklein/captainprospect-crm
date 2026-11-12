import { NextRequest, after } from "next/server";
import { NotFoundError, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { TELEPHONY_ROLES } from "@/lib/telephony/roles";
import { readSummaryState, summarizeCall } from "@/lib/telephony/summary";
import { suggestCallResult } from "@/lib/telephony/suggestion";
import { statusConfigService } from "@/lib/services/StatusConfigService";
import type { TelephonyStatus } from "@/lib/telephony/status";

export const dynamic = "force-dynamic";

/** An answered call whose summary never started gets one after this delay (lost Twilio callback). */
const LAZY_SUMMARY_AFTER_MS = 20_000;

/**
 * GET /api/telephony/calls/[id]/suggestion
 * The result to propose for an ended call (card under the call island), with
 * what the client needs to save it through POST /api/actions. Its own SDR only.
 */
export const GET = withErrorHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const session = await requireRole([...TELEPHONY_ROLES], request);
    const { id } = await params;
    const call = await prisma.telephonyCall.findUnique({
        where: { id },
        select: {
            id: true, sdrId: true, status: true, direction: true, answeredAt: true, startedAt: true, endedAt: true, actionId: true,
            campaignId: true, contactId: true, companyId: true,
            aiSummary: true, aiSummaryStatus: true, aiSummaryError: true, aiSummaryAt: true,
        },
    });
    if (!call || call.sdrId !== session.user.id) throw new NotFoundError("Appel introuvable");

    const statuses = call.campaignId
        ? (await statusConfigService.getEffectiveStatusConfig({ campaignId: call.campaignId }).catch(() => ({ statuses: [] }))).statuses
        : [];
    const suggestion = suggestCallResult({
        direction: call.direction,
        status: call.status as TelephonyStatus,
        answeredAt: call.answeredAt,
        startedAt: call.startedAt,
        endedAt: call.endedAt,
        actionId: call.actionId,
        campaignId: call.campaignId,
        summary: readSummaryState(call),
        statuses: statuses.map((s) => ({
            code: s.code,
            label: s.label,
            color: s.color ?? null,
            requiresNote: Boolean(s.requiresNote),
            triggersCallback: Boolean(s.triggersCallback),
        })),
    });

    const summary = readSummaryState(call);
    if (
        suggestion.state === "waiting" &&
        summary.status === "none" &&
        call.answeredAt &&
        call.endedAt &&
        Date.now() - call.endedAt.getTime() > LAZY_SUMMARY_AFTER_MS
    ) {
        after(() => summarizeCall(id).catch((e) => console.error("[telephony/suggestion] lazy summary", e)));
    }

    return successResponse({
        suggestion,
        target: { contactId: call.contactId, companyId: call.companyId, campaignId: call.campaignId },
    });
});
