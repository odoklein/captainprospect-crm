// ============================================
// ONOFF BUSINESS — webhook payload and authentication. Pure: no Prisma, tested.
//
// Onoff pushes one event per call to the URL configured in its B2B console
// (Intégrations → Webhook « Appels », Advanced/Max plans):
//   eventName CDR       call log
//             RECORDING same, with callRecordingUrl (sent instead of CDR when recording is on)
//             VM        voicemail, with voicemailUrl
// Headers: X-API-KEY = the key typed in Onoff's « Api key » field, if any.
// Retries: 4 more times on a 4xx/5xx, then the event is lost — so we answer
// 200 to anything we cannot use (bad shape, test data) and only 401 to a bad key.
// Reference: https://docs.onoffbusiness.com/webhook/reference/send-call-log
// ============================================

import { timingSafeEqual } from "node:crypto";
import { phoneKey } from "@/lib/exclusions/matching";

export type OnoffEventName = "CDR" | "RECORDING" | "VM";
export type OnoffDirection = "INBOUND" | "OUTBOUND";
export type OnoffStatus = "ANSWERED" | "MISSED_CALL" | "BUSY" | "WRONG_NUMBER" | "VMS" | "UNKNOWN";

export interface OnoffCallEvent {
    id: string;
    event: OnoffEventName;
    onoffUserEmail: string | null;
    onoffUserNumber: string | null;
    externalNumber: string;
    externalKey: string | null;
    externalName: string | null;
    direction: OnoffDirection;
    status: OnoffStatus;
    startedAt: Date;
    endedAt: Date | null;
    durationSec: number | null;
    recordingUrl: string | null;
    voicemailUrl: string | null;
    notes: string | null;
    tags: { tagId?: string; tagName?: string; tagColor?: string }[] | null;
}

/** Minimum length of the key shared with Onoff: long enough not to be guessed. */
export const ONOFF_KEY_MIN_LENGTH = 24; // also enforced on save (lib/integrations/catalog checkIntegrationValue)

export type KeyCheck = { ok: true } | { ok: false; status: 401 | 503; reason: string };

/**
 * The key is the only gate on a public URL: with none configured, refuse everything
 * rather than accept calls from anyone.
 */
export function checkOnoffKey(configured: string | undefined, received: string | null): KeyCheck {
    const expected = configured?.trim();
    if (!expected) return { ok: false, status: 503, reason: "ONOFF_WEBHOOK_KEY not set" };
    const got = received?.trim() ?? "";
    const a = Buffer.from(expected);
    const b = Buffer.from(got);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, status: 401, reason: "bad X-API-KEY" };
    return { ok: true };
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const int = (v: unknown): number | null => {
    const n = typeof v === "string" ? Number(v) : v;
    return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};
const date = (v: unknown): Date | null => {
    const s = str(v);
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
};
/** Only https audio links are kept: the server fetches them later. */
const httpsUrl = (v: unknown): string | null => {
    const s = str(v);
    if (!s) return null;
    try {
        return new URL(s).protocol === "https:" ? s : null;
    } catch {
        return null;
    }
};

const STATUSES: OnoffStatus[] = ["ANSWERED", "MISSED_CALL", "BUSY", "WRONG_NUMBER", "VMS", "UNKNOWN"];

/** Normalises one webhook body. Returns null when it cannot describe a call (missing id, number or start). */
export function parseOnoffEvent(body: unknown): OnoffCallEvent | null {
    if (!body || typeof body !== "object") return null;
    const b = body as Record<string, unknown>;
    const id = str(b.id);
    const externalNumber = str(b.externalNumber);
    const startedAt = date(b.callStarted);
    if (!id || !externalNumber || !startedAt) return null;

    const rawEvent = str(b.eventName)?.toUpperCase();
    const event: OnoffEventName = rawEvent === "RECORDING" || rawEvent === "VM" ? rawEvent : "CDR";
    const rawStatus = str(b.callStatus)?.toUpperCase() as OnoffStatus | undefined;
    const tags = Array.isArray(b.tags)
        ? b.tags
              .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
              .map((t) => ({ tagId: str(t.tagId) ?? undefined, tagName: str(t.tagName) ?? undefined, tagColor: str(t.tagColor) ?? undefined }))
        : null;

    return {
        id,
        event,
        onoffUserEmail: str(b.onoffUserEmail)?.toLowerCase() ?? null,
        onoffUserNumber: str(b.onoffUserNumber),
        externalNumber,
        externalKey: phoneKey(externalNumber),
        externalName: str(b.externalName),
        direction: str(b.callDirection)?.toUpperCase() === "INBOUND" ? "INBOUND" : "OUTBOUND",
        status: rawStatus && STATUSES.includes(rawStatus) ? rawStatus : "UNKNOWN",
        startedAt,
        endedAt: date(b.callEnded),
        durationSec: int(b.callDuration),
        recordingUrl: httpsUrl(b.callRecordingUrl),
        voicemailUrl: httpsUrl(b.voicemailUrl),
        notes: str(b.callNotes),
        tags: tags?.length ? tags : null,
    };
}

export interface OnoffUserCandidate {
    id: string;
    email: string;
    onoffPhoneNumber: string | null;
}

/** The CRM user behind an Onoff call: same e-mail first, then the Onoff number on their profile. */
export function matchOnoffUser(event: Pick<OnoffCallEvent, "onoffUserEmail" | "onoffUserNumber">, users: OnoffUserCandidate[]): string | null {
    if (event.onoffUserEmail) {
        const byEmail = users.find((u) => u.email.trim().toLowerCase() === event.onoffUserEmail);
        if (byEmail) return byEmail.id;
    }
    const key = phoneKey(event.onoffUserNumber);
    if (key) {
        const byNumber = users.find((u) => phoneKey(u.onoffPhoneNumber) === key);
        if (byNumber) return byNumber.id;
    }
    return null;
}

/** Stable reference stored in Action.callRecordingUrl; resolved server-side by /api/actions/[id]/recording. */
export const onoffRecordingRef = (callId: string) => `onoff:${callId}`;

export function parseOnoffRecordingRef(value: string | null | undefined): string | null {
    const m = /^onoff:([A-Za-z0-9._:-]{1,200})$/.exec(value?.trim() ?? "");
    return m ? m[1] : null;
}
