import { NextRequest, after } from "next/server";
import { NotFoundError, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { TELEPHONY_ROLES } from "@/lib/telephony/roles";
import { readSummaryState, summarizeCall } from "@/lib/telephony/summary";
import { suggestCallResult } from "@/lib/telephony/suggestion";
import { statusConfigService } from "@/lib/services/StatusConfigService";
import type { TelephonyStatus } from "@/lib/telephony/status";
import { proposalsForCall } from "@/lib/post-call/service";

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

    // Follow-ups beyond the outcome (tasks, email draft, facts, meeting, exclusion): additive,
    // and never allowed to break the card — the outcome above stays the way to qualify the call.
    let followUps: Awaited<ReturnType<typeof proposalsForCall>> = { proposals: [], gaps: [] };
    try {
        const contact = call.contactId
            ? await prisma.contact.findUnique({ where: { id: call.contactId }, select: { firstName: true, email: true } })
            : null;
        followUps = await proposalsForCall({
            call: { id: call.id, sdrId: call.sdrId, contactId: call.contactId, companyId: call.companyId, campaignId: call.campaignId, aiSummaryStatus: call.aiSummaryStatus },
            summary: summary.status === "done" ? summary.data : null,
            disposition: suggestion,
            contact,
        });
    } catch (err) {
        console.error("[telephony/suggestion] proposals", err);
    }

    return successResponse({
        suggestion,
        target: { contactId: call.contactId, companyId: call.companyId, campaignId: call.campaignId },
        proposals: followUps.proposals,
        gaps: followUps.gaps,
        // What the AI heard vs. what nobody verified, for the « IA / à vérifier » panel.
        insight: summary.status === "done"
            ? {
                  interest: summary.data.interest ?? null,
                  decisionMakerStatus: summary.data.decisionMakerStatus ?? null,
                  statedRole: summary.data.statedRole ?? null,
                  confidence: summary.data.confidence ?? null,
                  evidence: summary.data.evidence ?? [],
              }
            : null,
    });
});
