// ============================================
// Twilio softphone calls as a call source. Unlike Call Vault and Allo there is
// no remote API here: the softphone already stores every call (TelephonyCall),
// its recording URL, its live transcript and its AI summary in our database.
// ============================================

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { CallProvider, CallProviderInput, CallRecord } from "./provider";
import { transcriptText } from "@/lib/telephony/transcription";
import { readSummaryState, summaryText } from "@/lib/telephony/summary";

export interface TwilioCallMatch {
    id: string;
    actionId: string | null;
    contactId: string | null;
    companyId: string | null;
    fromNumber: string;
    toNumber: string;
    direction: "INBOUND" | "OUTBOUND";
    status: string;
    durationSec: number;
    startedAt: string;
    summary: string | null;
    transcription: string | null;
    /** api.twilio.com media URL — stable, streamed through /api/actions/[id]/recording. */
    recordingUrl: string | null;
    /** Live conversation still running: the transcript is partial. */
    inProgress: boolean;
}

export interface TwilioSearch {
    phones: string[];
    contactId?: string | null;
    companyId?: string | null;
    actionId?: string | null;
    windowStart: Date;
    windowEnd: Date;
    limit?: number;
}

/**
 * Softphone calls of a prospect in a time window: the call already linked to the
 * action, calls placed to that contact (or company-level calls of that company),
 * and calls to/from one of its numbers. Newest first.
 */
export async function findTwilioCalls(search: TwilioSearch): Promise<TwilioCallMatch[]> {
    const or: Prisma.TelephonyCallWhereInput[] = [];
    if (search.actionId) or.push({ actionId: search.actionId });
    if (search.contactId) or.push({ contactId: search.contactId });
    if (search.companyId) or.push({ companyId: search.companyId, contactId: null });
    if (search.phones.length) {
        or.push({ toNumber: { in: search.phones } });
        or.push({ fromNumber: { in: search.phones } });
    }
    if (or.length === 0) return [];

    const rows = await prisma.telephonyCall.findMany({
        where: {
            OR: [
                // The call linked to this very action, whenever it happened.
                ...(search.actionId ? [{ actionId: search.actionId }] : []),
                { AND: [{ OR: or }, { startedAt: { gte: search.windowStart, lte: search.windowEnd } }] },
            ],
        },
        include: { transcript: { orderBy: [{ at: "asc" }, { seq: "asc" }] } },
        orderBy: { startedAt: "desc" },
        take: search.limit ?? 30,
    });

    return rows.map((c) => {
        const state = readSummaryState(c);
        const inProgress = !c.endedAt;
        return {
            id: c.id,
            actionId: c.actionId,
            contactId: c.contactId,
            companyId: c.companyId,
            fromNumber: c.fromNumber,
            toNumber: c.toNumber,
            direction: c.direction,
            status: c.status,
            durationSec: c.durationSec ?? c.recordingDurationSec ?? 0,
            startedAt: c.startedAt.toISOString(),
            summary: state.status === "done" ? summaryText(state.data) : null,
            transcription: c.transcript.length ? transcriptText(c.transcript) : null,
            recordingUrl: c.recordingUrl,
            inProgress,
        };
    });
}

/** Linked to the action > has content > longer > newer. */
export function rankTwilioMatches(calls: TwilioCallMatch[], actionId?: string | null): TwilioCallMatch[] {
    const score = (c: TwilioCallMatch) =>
        (actionId && c.actionId === actionId ? 10_000_000 : 0) +
        (c.summary ? 1_000_000 : 0) +
        (c.transcription ? 100_000 : 0) +
        (c.recordingUrl ? 10_000 : 0) +
        Math.min(c.durationSec, 3600);
    return [...calls].sort((a, b) => score(b) - score(a) || b.startedAt.localeCompare(a.startedAt));
}

export function hasCallContent(c: { summary?: string | null; transcription?: string | null; recordingUrl?: string | null }): boolean {
    return Boolean(c.summary?.trim() || c.transcription?.trim() || c.recordingUrl?.trim());
}

export class TwilioProvider implements CallProvider {
    async fetchMatchingCallRecord(input: CallProviderInput): Promise<CallRecord | null> {
        const calls = await findTwilioCalls({
            phones: input.phones,
            contactId: input.contactId,
            companyId: input.companyId,
            actionId: input.actionId,
            windowStart: input.windowStart,
            windowEnd: input.windowEnd,
            limit: 20,
        });
        const best = rankTwilioMatches(
            // A call still on the line has a partial transcript: wait for it to end.
            calls.filter((c) => !c.inProgress && hasCallContent(c)),
            input.actionId,
        )[0];
        if (!best) return null;
        return {
            summary: best.summary ?? undefined,
            transcription: best.transcription ?? undefined,
            recordingUrl: best.recordingUrl ?? undefined,
            duration: best.durationSec || undefined,
            providerCallId: best.id,
            startedAt: best.startedAt,
        };
    }
}
