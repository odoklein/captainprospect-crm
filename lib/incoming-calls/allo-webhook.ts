// Allo (WithAllo) webhook plumbing: signature verification + payload normalization.
// Pure functions only — the route (app/api/webhooks/allo) owns the DB side.
//
// Allo signs deliveries per the Standard Webhooks spec:
//   headers  webhook-id, webhook-timestamp (unix seconds), webhook-signature ("v1,<b64> v1,<b64>…")
//   content  `${id}.${timestamp}.${rawBody}`, HMAC-SHA256 keyed with the base64 part of "whsec_<b64>"
// https://help.withallo.com/en/v2/api-reference/webhooks/verifying-signatures

import crypto from "crypto";

const TOLERANCE_SEC = 5 * 60;

export interface WebhookHeaders {
    id: string | null;
    timestamp: string | null;
    signature: string | null;
}

export type SignatureCheck =
    | { ok: true }
    | { ok: false; reason: "missing_headers" | "bad_timestamp" | "expired" | "bad_secret" | "mismatch" };

export function verifyAlloSignature(params: {
    secret: string;
    headers: WebhookHeaders;
    rawBody: string;
    nowSec?: number;
}): SignatureCheck {
    const { id, timestamp, signature } = params.headers;
    if (!id || !timestamp || !signature) return { ok: false, reason: "missing_headers" };

    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return { ok: false, reason: "bad_timestamp" };
    const now = params.nowSec ?? Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > TOLERANCE_SEC) return { ok: false, reason: "expired" };

    const key = Buffer.from(params.secret.replace(/^whsec_/, ""), "base64");
    if (key.length === 0) return { ok: false, reason: "bad_secret" };

    const expected = crypto
        .createHmac("sha256", key)
        .update(`${id}.${timestamp}.${params.rawBody}`)
        .digest();

    // Several signatures when Allo is rotating the secret — any match is enough.
    for (const entry of signature.split(" ")) {
        const [version, value] = entry.split(",", 2);
        if (version !== "v1" || !value) continue;
        const given = Buffer.from(value, "base64");
        if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) {
            return { ok: true };
        }
    }
    return { ok: false, reason: "mismatch" };
}

// ============================================
// PAYLOADS
// ============================================

export type AlloCallEvent =
    | {
          kind: "received";
          callerNumber: string;
          lineNumber: string;
          startedAt: Date;
          userEmail: string | null;
          personName: string | null;
          companyName: string | null;
      }
    | {
          kind: "answered";
          callerNumber: string;
          lineNumber: string;
          startedAt: Date | null;
          answeredAt: Date;
          userEmail: string | null;
      }
    | {
          kind: "completed";
          providerCallId: string | null;
          callerNumber: string;
          lineNumber: string;
          startedAt: Date | null;
          durationSec: number;
          result: string | null;
          answered: boolean;
          summary: string | null;
          recordingUrl: string | null;
          userEmail: string | null;
      }
    | { kind: "ignored"; reason: string };

type Obj = Record<string, unknown>;

function str(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function date(value: unknown): Date | null {
    if (typeof value !== "string" && typeof value !== "number") return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function obj(value: unknown): Obj | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Obj) : null;
}

/**
 * Allo's `result` vocabulary isn't documented beyond "ANSWERED". Anything that
 * reads as "nobody talked to them" counts as missed; with no result at all, a
 * zero-length call is missed.
 */
export function isAnsweredResult(result: string | null, durationSec: number): boolean {
    if (!result) return durationSec > 0;
    const r = result.toUpperCase();
    if (/NO_?ANSWER|NOT_?ANSWERED|UNANSWERED/.test(r)) return false;
    if (/MISS|VOICEMAIL|BUSY|FAIL|CANCEL|REJECT|ABANDON/.test(r)) return false;
    return true;
}

/**
 * Maps one webhook envelope onto the three call events the panel cares about.
 * Only inbound calls are kept: outbound ones are the SDR's own dials, which
 * call-vault already syncs.
 */
export function parseAlloEvent(body: unknown, envelopeFallbackTime = new Date()): AlloCallEvent {
    const envelope = obj(body);
    const topic = str(envelope?.topic);
    const data = obj(envelope?.data);
    if (!topic || !data) return { kind: "ignored", reason: "malformed" };

    const eventTime = date(envelope?.timestamp) ?? envelopeFallbackTime;
    const userEmail = str(data.user_email)?.toLowerCase() ?? null;

    if (topic === "call.received") {
        const callerNumber = str(data.from_number);
        const lineNumber = str(data.to_number) ?? str(data.to);
        if (!callerNumber || !lineNumber) return { kind: "ignored", reason: "missing_numbers" };

        const person = obj(data.person);
        const personName = [str(person?.name), str(person?.last_name)].filter(Boolean).join(" ") || null;
        return {
            kind: "received",
            callerNumber,
            lineNumber,
            startedAt: date(data.started_at) ?? eventTime,
            userEmail,
            personName,
            companyName: str(obj(data.company)?.name),
        };
    }

    if (topic === "call.answered") {
        const direction = str(data.direction)?.toUpperCase();
        if (direction && direction !== "INBOUND") return { kind: "ignored", reason: "outbound" };
        const callerNumber = str(data.from_number);
        const lineNumber = str(data.to_number) ?? str(data.to);
        if (!callerNumber || !lineNumber) return { kind: "ignored", reason: "missing_numbers" };
        return {
            kind: "answered",
            callerNumber,
            lineNumber,
            startedAt: date(data.started_at),
            answeredAt: date(data.answered_at) ?? eventTime,
            userEmail,
        };
    }

    if (topic === "call.completed") {
        const direction = (str(data.type) ?? str(data.direction))?.toUpperCase();
        if (direction !== "INBOUND") return { kind: "ignored", reason: "outbound" };
        const callerNumber = str(data.from_number) ?? str(data.from);
        const lineNumber = str(data.to) ?? str(data.to_number);
        if (!callerNumber || !lineNumber) return { kind: "ignored", reason: "missing_numbers" };

        const minutes = typeof data.length_in_minutes === "number" ? data.length_in_minutes : 0;
        const durationSec = Math.max(0, Math.round(minutes * 60));
        const result = str(data.result);
        const recording = str(data.recording_url);
        return {
            kind: "completed",
            providerCallId: str(data.id),
            callerNumber,
            lineNumber,
            startedAt: date(data.start_date) ?? date(data.started_at),
            durationSec,
            result,
            answered: isAnsweredResult(result, durationSec),
            summary: str(data.summary),
            recordingUrl: recording && /^https?:\/\//i.test(recording) ? recording : null,
            userEmail,
        };
    }

    return { kind: "ignored", reason: `topic:${topic}` };
}
