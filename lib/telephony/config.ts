// ============================================
// TELEPHONY — Twilio configuration (server-only).
//
// Credentials are integration keys (Paramètres → Intégrations, or container env).
// Behaviour switches are container env, read at request time:
//   TWILIO_RECORD_CALLS=1          record answered calls (off by default — the
//                                   prospect then hears a recording notice first)
//   TWILIO_ALLOWED_COUNTRIES=FR,BE  destinations that may be dialled (default FR,BE,CH,LU,MC)
//   TWILIO_EDGE=dublin              Twilio edge the browser connects to (default dublin, EU)
//   TWILIO_TRANSCRIBE_CALLS=1       live transcription + AI summary at the end (off by default;
//                                   the prospect hears the notice first, like for recording)
//   TWILIO_TRANSCRIPTION_ENGINE / TWILIO_TRANSCRIPTION_MODEL   default google / telephony (fr-FR)
// ============================================

import type { CountryCode } from "libphonenumber-js";
import { integrationKey } from "@/lib/integrations/keys";
import { runtimeAppUrl, runtimeEnv } from "@/lib/runtime-config/env";
import { parseAllowedCountries, toE164 } from "./phone";

export interface TwilioConfig {
    accountSid: string;
    authToken: string;
    apiKeySid: string;
    apiKeySecret: string;
    twimlAppSid: string;
    defaultCallerId: string | null;
    record: boolean;
    transcription: { engine: string; model: string; language: string } | null;
    allowedCountries: CountryCode[];
    edge: string;
}

const REQUIRED = [
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_API_KEY_SID",
    "TWILIO_API_KEY_SECRET",
    "TWILIO_TWIML_APP_SID",
] as const;

export function missingTwilioKeys(): string[] {
    return REQUIRED.filter((name) => !integrationKey(name));
}

/** Null when any credential is missing: the softphone is off and phone links use tel:. */
export function getTwilioConfig(): TwilioConfig | null {
    const accountSid = integrationKey("TWILIO_ACCOUNT_SID");
    const authToken = integrationKey("TWILIO_AUTH_TOKEN");
    const apiKeySid = integrationKey("TWILIO_API_KEY_SID");
    const apiKeySecret = integrationKey("TWILIO_API_KEY_SECRET");
    const twimlAppSid = integrationKey("TWILIO_TWIML_APP_SID");
    if (!accountSid || !authToken || !apiKeySid || !apiKeySecret || !twimlAppSid) return null;

    // "06 12 34 56 78", "+33 6…", "0033…" all accepted: stored as typed, used as E.164.
    const callerId = toE164(integrationKey("TWILIO_CALLER_ID"));
    const record = runtimeEnv("TWILIO_RECORD_CALLS");
    const transcribe = runtimeEnv("TWILIO_TRANSCRIBE_CALLS");
    return {
        accountSid,
        authToken,
        apiKeySid,
        apiKeySecret,
        twimlAppSid,
        defaultCallerId: callerId,
        record: record === "1" || record?.toLowerCase() === "true",
        transcription:
            transcribe === "1" || transcribe?.toLowerCase() === "true"
                ? {
                      engine: runtimeEnv("TWILIO_TRANSCRIPTION_ENGINE") ?? "google",
                      model: runtimeEnv("TWILIO_TRANSCRIPTION_MODEL") ?? "telephony",
                      language: runtimeEnv("TWILIO_TRANSCRIPTION_LANGUAGE") ?? "fr-FR",
                  }
                : null,
        allowedCountries: parseAllowedCountries(runtimeEnv("TWILIO_ALLOWED_COUNTRIES")),
        edge: runtimeEnv("TWILIO_EDGE") ?? "dublin",
    };
}

/** The caller id for a user: their own Twilio number, else the workspace default. */
export function callerIdFor(config: TwilioConfig, userCallerId: string | null | undefined): string | null {
    return toE164(userCallerId) ?? config.defaultCallerId;
}

/** Absolute URL Twilio must call back (webhooks are signed against it). */
export function publicUrl(path: string): string | null {
    const base = runtimeAppUrl();
    return base ? `${base}${path}` : null;
}
