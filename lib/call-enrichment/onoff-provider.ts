// ============================================
// Onoff Business as a call source. Like Twilio, nothing is asked to a remote API:
// Onoff pushes every call to /api/webhooks/onoff and we read our own OnoffCall rows.
// The recording comes back as the stable "onoff:<id>" reference.
// ============================================

import { findOnoffCalls, rankOnoffMatches } from "@/lib/onoff/service";
import type { CallProvider, CallProviderInput, CallRecord } from "./provider";

export class OnoffProvider implements CallProvider {
    async fetchMatchingCallRecord(input: CallProviderInput): Promise<CallRecord | null> {
        const calls = await findOnoffCalls({ phones: input.phones, windowStart: input.windowStart, windowEnd: input.windowEnd, sdrId: input.sdrId });
        const best = rankOnoffMatches(calls, input.sdrId)[0];
        if (!best) return null;
        return {
            recordingUrl: best.recordingUrl ?? undefined,
            // Notes typed in the Onoff app during the call: the only text Onoff sends.
            summary: best.notes ?? undefined,
            duration: best.durationSec || undefined,
            providerCallId: best.id,
            startedAt: best.startedAt,
        };
    }
}
