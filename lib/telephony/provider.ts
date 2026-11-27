// ============================================
// TELEPHONY — which line a user's « Appeler » goes through (server-only).
//
//   kavkom   the user has a Kavkom extension and Kavkom's API is configured: the CRM asks
//            Kavkom to ring the SDR's Kavkom app (or desk phone), then the prospect
//   twilio   the user has a Twilio number: the call is placed from the browser
//   null     neither: phone links keep opening tel: (Allo, or the SDR's own phone)
// Kavkom wins when both are set (the manager gave the extension on purpose); the
// parallel dialer (lib/dialer) always uses Twilio, which can bridge several calls.
// ============================================

import { getKavkomConfig, normalizeExtension, type KavkomConfig } from "@/lib/kavkom/config";
import { callerIdFor, getTwilioConfig, type TwilioConfig } from "./config";

export type CallProvider =
    | { kind: "kavkom"; config: KavkomConfig; extension: string }
    | { kind: "twilio"; config: TwilioConfig; callerId: string };

export function providerFor(user: { kavkomExtension?: string | null; twilioCallerId?: string | null }): CallProvider | null {
    const kavkom = getKavkomConfig();
    const extension = normalizeExtension(user.kavkomExtension);
    if (kavkom && extension) return { kind: "kavkom", config: kavkom, extension };
    const twilio = getTwilioConfig();
    const callerId = twilio ? callerIdFor(twilio, user.twilioCallerId) : null;
    if (twilio && callerId) return { kind: "twilio", config: twilio, callerId };
    return null;
}

/** Some call provider is configured for the agency (journal, « Sans statut »). */
export const anyCallProviderConfigured = () => Boolean(getTwilioConfig() || getKavkomConfig());
