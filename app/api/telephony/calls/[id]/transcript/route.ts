import { NextRequest, after } from "next/server";
import { NotFoundError, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { TELEPHONY_ROLES } from "@/lib/telephony/roles";
import { readSummaryState, summarizeCall } from "@/lib/telephony/summary";

export const dynamic = "force-dynamic";

/** An ended call whose summary never started (lost "stopped" callback) gets one after this delay. */
const LAZY_SUMMARY_AFTER_MS = 20_000;

/**
 * GET /api/telephony/calls/[id]/transcript?since=<ISO>
 * Live transcript lines (newer than `since`) and the AI summary state.
 * The call's own SDR, or a manager.
 */
export const GET = withErrorHandler(
    async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
        const session = await requireRole([...TELEPHONY_ROLES], request);
        const { id } = await params;
        const call = await prisma.telephonyCall.findUnique({
            where: { id },
            select: {
                id: true, sdrId: true, status: true, endedAt: true,
                aiSummary: true, aiSummaryStatus: true, aiSummaryError: true, aiSummaryAt: true,
            },
        });
        if (!call || (call.sdrId !== session.user.id && session.user.role !== "MANAGER")) {
            throw new NotFoundError("Appel introuvable");
        }

        const sinceRaw = new URL(request.url).searchParams.get("since");
        const since = sinceRaw ? new Date(sinceRaw) : null;
        const lines = await prisma.telephonyTranscriptLine.findMany({
            where: { callId: id, ...(since && !Number.isNaN(since.getTime()) ? { createdAt: { gt: since } } : {}) },
            orderBy: [{ at: "asc" }, { seq: "asc" }],
            select: { id: true, speaker: true, text: true, at: true, createdAt: true },
            take: 500,
        });

        let summary = readSummaryState(call);
        if (summary.status === "none" && call.endedAt && Date.now() - call.endedAt.getTime() > LAZY_SUMMARY_AFTER_MS) {
            after(() => summarizeCall(id).catch((e) => console.error("[telephony/transcript] lazy summary", e)));
            summary = { status: "pending" };
        }

        return successResponse({
            live: !call.endedAt,
            lines: lines.map((l) => ({ id: l.id, speaker: l.speaker, text: l.text, at: l.at.toISOString(), receivedAt: l.createdAt.toISOString() })),
            summary,
        });
    },
);
