// ============================================
// TELEPHONY — Twilio adapter (server-only): access tokens, webhook
// signatures, TwiML. Only the small Twilio sub-modules are loaded, never the
// REST client.
// ============================================

import type { NextRequest } from "next/server";
import AccessToken from "twilio/lib/jwt/AccessToken";
import VoiceResponse from "twilio/lib/twiml/VoiceResponse";
import { validateRequest } from "twilio/lib/webhooks/webhooks";
import { runtimeAppUrl } from "@/lib/runtime-config/env";
import type { TwilioConfig } from "./config";

/** One hour: the SDK refreshes it (tokenWillExpire) while the tab stays open. */
const TOKEN_TTL_SEC = 3600;
/** Hard ceiling on one call, as a guard against a line left open. */
export const MAX_CALL_SEC = 2 * 60 * 60;

/** Twilio client identity for a CRM user. Letters, digits and _ only. */
export function identityFor(userId: string): string {
    return `u_${userId.replace(/[^A-Za-z0-9_]/g, "")}`;
}

/**
 * The user part of a "client:u_…" identity, as `identityFor` wrote it: for a UUID user id the
 * hyphens are gone, so compare it with `identityFor(id)`, never with the raw id.
 */
export function userIdFromIdentity(from: string | null | undefined): string | null {
    const m = /^client:u_([A-Za-z0-9_]+)$/.exec((from ?? "").trim());
    return m ? m[1] : null;
}

export function createVoiceToken(config: TwilioConfig, userId: string): { token: string; identity: string; ttlSec: number } {
    const identity = identityFor(userId);
    const token = new AccessToken(config.accountSid, config.apiKeySid, config.apiKeySecret, {
        identity,
        ttl: TOKEN_TTL_SEC,
    });
    // incomingAllow: calls to the user's Twilio number ring in their browser (inbound webhook → <Client>).
    token.addGrant(new AccessToken.VoiceGrant({ outgoingApplicationSid: config.twimlAppSid, incomingAllow: true }));
    return { token: token.toJwt(), identity, ttlSec: TOKEN_TTL_SEC };
}

// ── Webhooks ────────────────────────────────────────────────────────────────

export type TwilioParams = Record<string, string>;

function forwardedBase(req: NextRequest): string | null {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (!host) return null;
    const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    return `${proto}://${host}`;
}

/** Base URL for the callbacks we hand Twilio: the configured app URL, else the host Twilio reached. */
export function callbackBase(req: NextRequest): string {
    return runtimeAppUrl() ?? forwardedBase(req) ?? req.nextUrl.origin;
}

/** URLs Twilio may have signed: the configured public URL, then the forwarded host. */
function candidateUrls(req: NextRequest): string[] {
    const pathAndQuery = `${req.nextUrl.pathname}${req.nextUrl.search}`;
    const urls = new Set<string>();
    const base = runtimeAppUrl();
    if (base) urls.add(`${base}${pathAndQuery}`);
    const fwd = forwardedBase(req);
    if (fwd) urls.add(`${fwd}${pathAndQuery}`);
    return [...urls];
}

/**
 * Reads the form body and checks X-Twilio-Signature. Webhook routes are outside
 * the auth middleware: this signature is their only gate.
 */
export async function readSignedTwilioRequest(
    req: NextRequest,
    config: TwilioConfig,
): Promise<{ ok: true; params: TwilioParams } | { ok: false; reason: string }> {
    const signature = req.headers.get("x-twilio-signature");
    if (!signature) return { ok: false, reason: "missing_signature" };

    let params: TwilioParams;
    try {
        const form = await req.formData();
        params = {};
        for (const [k, v] of form.entries()) if (typeof v === "string") params[k] = v;
    } catch {
        return { ok: false, reason: "bad_body" };
    }

    if (params.AccountSid && params.AccountSid !== config.accountSid) return { ok: false, reason: "wrong_account" };

    for (const url of candidateUrls(req)) {
        if (validateRequest(config.authToken, signature, url, params)) return { ok: true, params };
    }
    return { ok: false, reason: "mismatch" };
}

// ── TwiML ───────────────────────────────────────────────────────────────────

export function twiml(body: VoiceResponse): Response {
    return new Response(body.toString(), { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}

/** Spoken refusal, then hang up — the SDR hears why in their headset. */
export function rejectTwiml(message: string): VoiceResponse {
    const vr = new VoiceResponse();
    vr.say({ language: "fr-FR" }, message);
    vr.hangup();
    return vr;
}

export function emptyTwiml(): VoiceResponse {
    return new VoiceResponse();
}

/** Played to the prospect after they pick up, before the bridge — only when recording or transcribing. */
export function recordingNoticeTwiml(): VoiceResponse {
    const vr = new VoiceResponse();
    vr.say({ language: "fr-FR" }, "Bonjour. Cet appel est susceptible d'être enregistré et transcrit.");
    return vr;
}

export function dialTwiml(params: {
    to: string;
    callerId: string;
    record: boolean;
    transcription?: { engine: string; model: string; language: string } | null;
    urls: { dialAction: string; legStatus: string; recording: string; notice: string; transcription?: string };
}): VoiceResponse {
    const vr = new VoiceResponse();
    // Live transcription runs on the browser leg: inbound = the SDR, outbound = the prospect.
    if (params.transcription && params.urls.transcription) {
        vr.start().transcription({
            name: "crm-live",
            track: "both_tracks",
            languageCode: params.transcription.language,
            transcriptionEngine: params.transcription.engine,
            speechModel: params.transcription.model,
            partialResults: false,
            enableAutomaticPunctuation: true,
            inboundTrackLabel: "sdr",
            outboundTrackLabel: "prospect",
            statusCallbackUrl: params.urls.transcription,
            statusCallbackMethod: "POST",
        });
    }
    const informed = params.record || Boolean(params.transcription);
    const dial = vr.dial({
        callerId: params.callerId,
        answerOnBridge: true, // the browser hears real ringback; "accept" fires when the prospect answers
        timeout: 30,
        timeLimit: MAX_CALL_SEC,
        action: params.urls.dialAction,
        method: "POST",
        ...(params.record
            ? {
                  record: "record-from-answer-dual" as const,
                  recordingStatusCallback: params.urls.recording,
                  recordingStatusCallbackEvent: ["completed" as const],
                  recordingStatusCallbackMethod: "POST",
              }
            : {}),
    });
    dial.number(
        {
            statusCallback: params.urls.legStatus,
            statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
            statusCallbackMethod: "POST",
            ...(informed ? { url: params.urls.notice, method: "POST" } : {}),
        },
        params.to,
    );
    return vr;
}

/** Recording URL as stored: the .mp3 media of a Recording resource, on api.twilio.com. */
export function recordingMediaUrl(accountSid: string, recordingSid: string): string | null {
    if (!/^AC[0-9a-f]{32}$/i.test(accountSid) || !/^RE[0-9a-f]{32}$/i.test(recordingSid)) return null;
    return `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}.mp3`;
}

/** Matches a stored Twilio recording URL; used by the recording stream proxy. */
export function isTwilioRecordingUrl(url: URL, accountSid: string): boolean {
    return (
        url.protocol === "https:" &&
        url.hostname === "api.twilio.com" &&
        url.pathname.startsWith(`/2010-04-01/Accounts/${accountSid}/Recordings/RE`)
    );
}

// ── Inbound ─────────────────────────────────────────────────────────────────

/**
 * A prospect called a user's Twilio number: ring that user's browser
 * (<Client>) for `ringSec`, with who is calling as parameters so the island
 * can show it before answering. On this call the caller is the inbound track.
 */
export function inboundTwiml(params: {
    identity: string;
    ringSec: number;
    record: boolean;
    transcription?: { engine: string; model: string; language: string } | null;
    parameters: Record<string, string>;
    urls: { dialAction: string; legStatus: string; recording: string; transcription?: string };
}): VoiceResponse {
    const vr = new VoiceResponse();
    if (params.record || params.transcription) {
        vr.say({ language: "fr-FR" }, "Bonjour. Cet appel est susceptible d'être enregistré et transcrit.");
    }
    if (params.transcription && params.urls.transcription) {
        vr.start().transcription({
            name: "crm-live",
            track: "both_tracks",
            languageCode: params.transcription.language,
            transcriptionEngine: params.transcription.engine,
            speechModel: params.transcription.model,
            partialResults: false,
            enableAutomaticPunctuation: true,
            inboundTrackLabel: "prospect",
            outboundTrackLabel: "sdr",
            statusCallbackUrl: params.urls.transcription,
            statusCallbackMethod: "POST",
        });
    }
    const dial = vr.dial({
        timeout: params.ringSec,
        timeLimit: MAX_CALL_SEC,
        action: params.urls.dialAction,
        method: "POST",
        ...(params.record
            ? {
                  record: "record-from-answer-dual" as const,
                  recordingStatusCallback: params.urls.recording,
                  recordingStatusCallbackEvent: ["completed" as const],
                  recordingStatusCallbackMethod: "POST",
              }
            : {}),
    });
    const client = dial.client({
        statusCallback: params.urls.legStatus,
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        statusCallbackMethod: "POST",
    });
    client.identity(params.identity);
    for (const [name, value] of Object.entries(params.parameters)) {
        if (value) client.parameter({ name, value: value.slice(0, 200) });
    }
    return vr;
}

/** Nobody answered (or the user is unavailable): their greeting, then a message of up to 2 minutes. */
export function voicemailTwiml(params: { greeting: string; recording: string; done: string }): VoiceResponse {
    const vr = new VoiceResponse();
    vr.say({ language: "fr-FR" }, params.greeting);
    vr.record({
        maxLength: 120,
        timeout: 5,
        playBeep: true,
        finishOnKey: "#",
        action: params.done,
        method: "POST",
        recordingStatusCallback: params.recording,
        recordingStatusCallbackEvent: ["completed"],
        recordingStatusCallbackMethod: "POST",
    });
    vr.say({ language: "fr-FR" }, "Merci, au revoir.");
    vr.hangup();
    return vr;
}

export function defaultGreeting(firstName: string | null, brand: string): string {
    return `Bonjour, vous êtes bien chez ${firstName ? `${firstName}, de ` : ""}${brand}. Je ne suis pas disponible pour le moment : laissez-moi un message après le bip, je vous rappelle rapidement.`;
}
