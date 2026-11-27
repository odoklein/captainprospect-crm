// ============================================
// KAVKOM — webhook payloads, authentication, numbers. Pure: no Prisma, no fetch, tested.
//
// Kavkom (Réglages avancés → Intégrations → Webhook) POSTs to one URL:
//   live      a call's state changes (inbound « Entrants », outbound « Sortants »):
//             callUuid / call_uuid, state, direction, number, extension or presenceId "1001@domain"
//   cdr       the call is over: xml_cdr_uuid, direction, caller_id_number, destination_number,
//             outside_number, start/answer/end (epoch or stamp), duration, billsec,
//             hangup_cause, recording_url
//   transcription  form-urlencoded, one value holding JSON: cdr_uuid + transcription_data
// Field names follow FusionPBX (Kavkom's engine), but Kavkom lets the admin remap them
// (« Mapping »), and its documentation is thin: every field is read under its usual
// aliases, and anything we cannot place is dropped, never guessed.
// No signature: the admin adds a header (Authorization: Bearer <KAVKOM_WEBHOOK_SECRET>).
// References: https://help.kavkom.com/en/integration-api/webhook-phone-system/
//             https://help.kavkom.com/en/api-integration/kavkom-api/
// ============================================

import { timingSafeEqual } from "node:crypto";
import type { TelephonyStatus } from "@/lib/telephony/status";

/** TelephonyCall.provider of Kavkom calls. */
export const KAVKOM_PROVIDER = "kavkom";

// ── Authentication ──────────────────────────────────────────────────────────

export type SecretCheck = { ok: true } | { ok: false; status: 401 | 503; reason: string };

/** The secret Kavkom sends back: Authorization: Bearer <s>, or a plain secret header. */
export function receivedSecret(header: (name: string) => string | null): string | null {
    const auth = header("authorization")?.trim();
    if (auth) return auth.replace(/^bearer\s+/i, "").trim() || null;
    for (const name of ["x-webhook-secret", "x-kavkom-secret", "x-api-key"]) {
        const v = header(name)?.trim();
        if (v) return v;
    }
    return null;
}

/** No secret configured refuses everything: the URL is public. */
export function checkKavkomSecret(configured: string | undefined, received: string | null): SecretCheck {
    const expected = configured?.trim();
    if (!expected) return { ok: false, status: 503, reason: "KAVKOM_WEBHOOK_SECRET not set" };
    const a = Buffer.from(expected);
    const b = Buffer.from(received?.trim() ?? "");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, status: 401, reason: "bad secret" };
    return { ok: true };
}

// ── Reading fields ──────────────────────────────────────────────────────────

type Rec = Record<string, unknown>;

const str = (v: unknown): string | null => {
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return typeof v === "string" && v.trim() ? v.trim() : null;
};
const num = (v: unknown): number | null => {
    const n = typeof v === "string" && v.trim() ? Number(v) : v;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** First non-empty value among the aliases, looking one level into `data` / `call` / `cdr` too. */
function pick(b: Rec, ...keys: string[]): unknown {
    const scopes = [b, ...["data", "call", "cdr", "variables"].map((k) => b[k]).filter((v): v is Rec => !!v && typeof v === "object" && !Array.isArray(v))];
    for (const scope of scopes) {
        for (const k of keys) {
            const v = scope[k];
            if (v !== undefined && v !== null && v !== "") return v;
        }
    }
    return undefined;
}
const pickStr = (b: Rec, ...keys: string[]) => str(pick(b, ...keys));
const pickNum = (b: Rec, ...keys: string[]) => num(pick(b, ...keys));

const UUID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,199}$/;
const id = (v: string | null) => (v && UUID_RE.test(v) ? v : null);

/** "1001", "1001@acme.kavkom.com", "sip:1001@…" → "1001". Extensions are short digit strings. */
export function extensionOf(raw: string | null | undefined): string | null {
    const s = raw?.trim().replace(/^sips?:/i, "").split("@")[0]?.trim();
    return s && /^\d{2,7}$/.test(s) ? s : null;
}

/** A number outside the PBX: 8+ digits once separators are gone. */
export function externalNumber(raw: string | null | undefined): string | null {
    const s = raw?.trim().replace(/^sips?:/i, "").split("@")[0]?.trim();
    if (!s) return null;
    const digits = s.replace(/[^\d]/g, "");
    if (digits.length < 8 || digits.length > 16) return null;
    if (s.startsWith("+")) return `+${digits}`;
    if (digits.startsWith("00")) return `+${digits.slice(2)}`;
    if (digits.startsWith("0") && digits.length === 10) return `+33${digits.slice(1)}`; // French national form
    if (digits.startsWith("33") && digits.length === 11) return `+${digits}`;
    return `+${digits}`;
}

/**
 * Epoch (s or ms) or a "YYYY-MM-DD HH:MM:SS" stamp. FusionPBX stamps carry no zone and are
 * the PBX's local time: read as Europe/Paris (Kavkom runs in Paris). ISO with a zone is kept.
 */
export function kavkomDate(v: unknown, now = Date.now()): Date | null {
    const n = num(v);
    if (n !== null) {
        if (n <= 0) return null;
        const ms = n > 1e12 ? n : n * 1000;
        const d = new Date(ms);
        // Anything more than a year away is not a call time.
        return Math.abs(ms - now) < 366 * 86_400_000 ? d : null;
    }
    const s = str(v);
    if (!s) return null;
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
        const d = new Date(s);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
    if (!m) return null;
    return parisWallClock(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] ?? 0));
}

/** A Paris wall-clock time → the instant. */
export function parisWallClock(y: number, mo: number, d: number, h: number, mi: number, s: number): Date {
    const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
    const offsetAt = (t: number) => {
        const parts = new Intl.DateTimeFormat("en-GB", {
            timeZone: "Europe/Paris", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
        }).formatToParts(new Date(t));
        const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
        return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - t;
    };
    const guess = asUtc - offsetAt(asUtc);
    return new Date(asUtc - offsetAt(guess));
}

/** Only https audio links are kept: the server fetches them. */
const httpsUrl = (v: unknown): string | null => {
    const s = str(v);
    if (!s) return null;
    try {
        return new URL(s).protocol === "https:" ? s : null;
    } catch {
        return null;
    }
};

export type KavkomDirection = "INBOUND" | "OUTBOUND" | "LOCAL";

function direction(raw: string | null): KavkomDirection | null {
    const d = raw?.toLowerCase();
    if (!d) return null;
    if (d.startsWith("in")) return "INBOUND";
    if (d.startsWith("out")) return "OUTBOUND";
    if (d.startsWith("loc") || d === "internal") return "LOCAL";
    return null;
}

/** The prospect's number and our extension, whichever way the call went. */
function sides(b: Rec, dir: KavkomDirection | null): { external: string | null; extension: string | null } {
    const callerNumber = pickStr(b, "caller_id_number", "caller_number", "callerIdNumber", "from", "src");
    const destination = pickStr(b, "destination_number", "caller_destination", "destination", "dst", "to", "callee");
    const outside = pickStr(b, "outside_number", "outsideNumber", "external_number", "externalNumber", "number", "phone", "remote_number");
    const ext =
        extensionOf(pickStr(b, "extension", "extension_number", "extensionNumber", "agent_extension", "ext", "presenceId", "presence_id", "user_extension")) ??
        (dir === "INBOUND" ? extensionOf(destination) : extensionOf(callerNumber)) ??
        extensionOf(callerNumber) ??
        extensionOf(destination);
    const order = dir === "INBOUND" ? [outside, callerNumber, destination] : [outside, destination, callerNumber];
    const external = order.map((n) => externalNumber(n)).find(Boolean) ?? null;
    return { external, extension: ext };
}

// ── Events ──────────────────────────────────────────────────────────────────

export type KavkomLiveState = "ringing" | "answered" | "ended";

export interface KavkomLiveEvent {
    kind: "live";
    callUuid: string;
    state: KavkomLiveState;
    direction: KavkomDirection | null;
    external: string | null;
    extension: string | null;
    at: Date;
    answeredAt: Date | null;
    durationSec: number | null;
}

export interface KavkomCdrEvent {
    kind: "cdr";
    /** xml_cdr_uuid: the CDR's id (get_file_link, transcription's cdr_uuid). */
    cdrUuid: string;
    /** The call's own uuid when Kavkom sends it apart (call_uuid of active_call/call). */
    callUuid: string | null;
    direction: KavkomDirection | null;
    external: string | null;
    extension: string | null;
    startedAt: Date;
    answeredAt: Date | null;
    endedAt: Date | null;
    durationSec: number | null;
    talkSec: number | null;
    hangupCause: string | null;
    status: TelephonyStatus;
    recordingUrl: string | null;
    hasRecording: boolean;
    voicemail: boolean;
}

export interface KavkomTranscriptLine {
    speaker: "sdr" | "prospect" | "mixed";
    text: string;
    offsetSec: number | null;
}

export interface KavkomTranscriptionEvent {
    kind: "transcription";
    cdrUuid: string;
    lines: KavkomTranscriptLine[];
    summary: string | null;
}

export type KavkomEvent = KavkomLiveEvent | KavkomCdrEvent | KavkomTranscriptionEvent;

/** Live state names Kavkom (and FreeSWITCH underneath) uses. */
export function mapLiveState(raw: string | null | undefined): KavkomLiveState | null {
    const s = (raw ?? "").trim().toLowerCase().replace(/^cs_|^channel_/, "");
    if (!s) return null;
    if (["ringing", "ring", "early", "progress", "progress_media", "calling", "dialing", "trying", "routing", "init", "new", "created", "start", "started", "originate"].includes(s)) return "ringing";
    if (["answered", "answer", "active", "bridge", "bridged", "up", "in_progress", "inprogress", "connected", "talking", "exchange", "execute", "park", "hold", "held"].includes(s)) return "answered";
    if (["hangup", "hungup", "hang_up", "ended", "end", "down", "destroy", "terminated", "completed", "finished", "missed", "reporting"].includes(s)) return "ended";
    return null;
}

/** A call never answered: which outcome, from FreeSWITCH's hangup cause. */
export function statusFromHangup(cause: string | null, answered: boolean): TelephonyStatus {
    if (answered) return "COMPLETED";
    switch ((cause ?? "").toUpperCase()) {
        case "USER_BUSY":
        case "CALL_REJECTED":
        case "NORMAL_CIRCUIT_CONGESTION":
            return "BUSY";
        case "ORIGINATOR_CANCEL":
        case "LOSE_RACE":
        case "PICKED_OFF":
            return "CANCELED";
        case "UNALLOCATED_NUMBER":
        case "NO_ROUTE_DESTINATION":
        case "INVALID_NUMBER_FORMAT":
        case "INCOMPATIBLE_DESTINATION":
        case "DESTINATION_OUT_OF_ORDER":
        case "NETWORK_OUT_OF_ORDER":
        case "SERVICE_UNAVAILABLE":
        case "RECOVERY_ON_TIMER_EXPIRE":
        case "MANDATORY_IE_MISSING":
            return "FAILED";
        default:
            return "NO_ANSWER";
    }
}

/** A form body whose one value is JSON (the transcription webhook), or a JSON string. */
export function unwrapBody(body: unknown): unknown {
    if (typeof body === "string") {
        try {
            return unwrapBody(JSON.parse(body));
        } catch {
            return null;
        }
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return body;
    const b = body as Rec;
    const keys = Object.keys(b);
    // { payload: "{…}" } / { data: "{…}" } / { "{…}": "" }
    if (keys.length === 1) {
        const only = b[keys[0]];
        if (typeof only === "string" && /^\s*[{[]/.test(only)) return unwrapBody(only);
        if ((only === "" || only === undefined) && /^\s*[{[]/.test(keys[0])) return unwrapBody(keys[0]);
    }
    for (const k of ["payload", "data", "body", "json"]) {
        if (typeof b[k] === "string" && /^\s*[{[]/.test(b[k] as string)) {
            const inner = unwrapBody(b[k]);
            if (inner && typeof inner === "object") return { ...b, [k]: undefined, ...(inner as Rec) };
        }
    }
    return body;
}

function speakerOf(raw: unknown, channelLabels: { sdr?: string; prospect?: string }): KavkomTranscriptLine["speaker"] {
    const s = str(raw)?.toLowerCase() ?? "";
    if (!s) return "mixed";
    if (channelLabels.sdr && s === channelLabels.sdr) return "sdr";
    if (channelLabels.prospect && s === channelLabels.prospect) return "prospect";
    if (/^(agent|sdr|user|operator|caller_a|a|left|speaker_?0|0|extension|internal|moi|me)$/.test(s)) return "sdr";
    if (/^(client|customer|prospect|contact|caller_b|b|right|speaker_?1|1|external|remote|callee)$/.test(s)) return "prospect";
    return "mixed";
}

/** transcription_data in any of the shapes it comes in: text, [{text, speaker}], {segments: […]}, {summary, text}. */
export function parseTranscriptionData(raw: unknown): { lines: KavkomTranscriptLine[]; summary: string | null } {
    let data = raw;
    if (typeof data === "string") {
        const t = data.trim();
        if (/^[{[]/.test(t)) {
            try {
                data = JSON.parse(t);
            } catch {
                /* plain text */
            }
        }
    }
    if (typeof data === "string") {
        const text = data.trim();
        return { lines: text ? [{ speaker: "mixed", text: text.slice(0, 60_000), offsetSec: null }] : [], summary: null };
    }
    const obj = data && typeof data === "object" && !Array.isArray(data) ? (data as Rec) : null;
    const summary = obj ? str(obj.summary ?? obj.resume ?? obj.résumé ?? obj.abstract) : null;
    const list = Array.isArray(data)
        ? data
        : obj
          ? ([obj.segments, obj.utterances, obj.transcription, obj.transcript, obj.dialogue, obj.lines, obj.results].find(Array.isArray) as unknown[] | undefined)
          : undefined;
    const lines: KavkomTranscriptLine[] = [];
    if (list) {
        for (const item of list.slice(0, 5_000)) {
            if (typeof item === "string") {
                if (item.trim()) lines.push({ speaker: "mixed", text: item.trim(), offsetSec: null });
                continue;
            }
            if (!item || typeof item !== "object") continue;
            const it = item as Rec;
            const text = str(it.text ?? it.transcript ?? it.content ?? it.sentence ?? it.value);
            if (!text) continue;
            lines.push({
                speaker: speakerOf(it.speaker ?? it.role ?? it.channel ?? it.speaker_label ?? it.who, {}),
                text: text.slice(0, 5_000),
                offsetSec: num(it.start ?? it.start_time ?? it.startTime ?? it.offset ?? it.begin),
            });
        }
    } else if (obj) {
        const text = str(obj.text ?? obj.full_text ?? obj.content ?? (typeof obj.transcription === "string" ? obj.transcription : null));
        if (text) lines.push({ speaker: "mixed", text: text.slice(0, 60_000), offsetSec: null });
    }
    return { lines, summary: summary ? summary.slice(0, 20_000) : null };
}

/**
 * One webhook body → one event, or null when it describes nothing we can store
 * (Kavkom's « Tester » sends an empty request).
 */
export function parseKavkomEvent(rawBody: unknown, now = new Date()): KavkomEvent | null {
    const body = unwrapBody(rawBody);
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const b = body as Rec;
    const event = pickStr(b, "event", "event_type", "eventName", "type")?.toLowerCase() ?? null;

    // Transcription
    const transcription = pick(b, "transcription_data", "transcriptionData", "transcription", "transcript");
    if (transcription !== undefined && (event === null || event.includes("transcri"))) {
        const cdrUuid = id(pickStr(b, "cdr_uuid", "xml_cdr_uuid", "cdrUuid", "uuid", "call_uuid", "callUuid"));
        if (!cdrUuid) return null;
        const parsed = parseTranscriptionData(transcription);
        const summary = parsed.summary ?? pickStr(b, "summary", "transcription_summary", "resume");
        if (!parsed.lines.length && !summary) return null;
        return { kind: "transcription", cdrUuid, lines: parsed.lines, summary };
    }

    const dir = direction(pickStr(b, "direction", "call_direction", "callDirection"));
    const { external, extension } = sides(b, dir);

    // End of call (CDR)
    const looksCdr =
        event === "cdr" ||
        pick(b, "xml_cdr_uuid", "hangup_cause", "billsec", "end_epoch", "end_stamp") !== undefined;
    if (looksCdr) {
        const cdrUuid = id(pickStr(b, "xml_cdr_uuid", "cdr_uuid", "uuid", "call_uuid", "callUuid"));
        const startedAt = kavkomDate(pick(b, "start_epoch", "start_stamp", "startEpoch", "createdEpoch", "start_time", "started_at", "date"), now.getTime());
        if (!cdrUuid || !startedAt) return null;
        const answeredAt = kavkomDate(pick(b, "answer_epoch", "answer_stamp", "answeredEpoch", "answer_time", "answered_at"), now.getTime());
        const endedAt = kavkomDate(pick(b, "end_epoch", "end_stamp", "endEpoch", "end_time", "ended_at"), now.getTime());
        const durationSec = pickNum(b, "duration", "call_duration");
        const talkSec = pickNum(b, "billsec", "bill_sec", "talk_time", "billable_seconds");
        const hangupCause = pickStr(b, "hangup_cause", "hangupCause", "call_result", "status");
        const answered = (talkSec ?? 0) > 0 || Boolean(answeredAt) || /^answered$/i.test(hangupCause ?? "");
        const recordingUrl = httpsUrl(pick(b, "recording_url", "recordingUrl", "record_url", "recording"));
        const recordName = pickStr(b, "record_name", "recording_name", "file", "record_path");
        const voicemail = /voicemail|vm_/i.test(pickStr(b, "last_app", "app", "call_flow", "destination_type") ?? "") || /voicemail/i.test(pickStr(b, "status") ?? "");
        const callUuid = id(pickStr(b, "call_uuid", "callUuid", "bridge_uuid", "originating_leg_uuid"));
        return {
            kind: "cdr",
            cdrUuid,
            callUuid: callUuid && callUuid !== cdrUuid ? callUuid : null,
            direction: dir,
            external,
            extension,
            startedAt,
            answeredAt: answered ? answeredAt ?? (talkSec && endedAt ? new Date(endedAt.getTime() - talkSec * 1000) : null) : null,
            endedAt: endedAt ?? (durationSec != null ? new Date(startedAt.getTime() + durationSec * 1000) : null),
            durationSec: durationSec != null && durationSec >= 0 ? Math.round(durationSec) : null,
            talkSec: talkSec != null && talkSec >= 0 ? Math.round(talkSec) : null,
            hangupCause,
            status: statusFromHangup(hangupCause, answered),
            recordingUrl,
            hasRecording: Boolean(recordingUrl || recordName),
            voicemail,
        };
    }

    // Live state
    const callUuid = id(pickStr(b, "callUuid", "call_uuid", "uuid", "callId", "call_id", "channel_uuid"));
    const state = mapLiveState(pickStr(b, "state", "callState", "call_state", "status", "event_state") ?? event);
    if (!callUuid || !state) return null;
    const answeredAt = kavkomDate(pick(b, "answeredEpoch", "answered_epoch", "answer_epoch", "answeredAt"), now.getTime());
    return {
        kind: "live",
        callUuid,
        state,
        direction: dir,
        external,
        extension,
        at: kavkomDate(pick(b, "timestamp", "eventEpoch", "event_epoch", "time"), now.getTime()) ?? now,
        answeredAt,
        durationSec: (() => {
            const d = pickNum(b, "duration", "billsec");
            return d != null && d >= 0 ? Math.round(d) : null;
        })(),
    };
}

// ── Dialing ─────────────────────────────────────────────────────────────────

export type DialFormat = "national" | "e164" | "e164_plain" | "intl00";

export function parseDialFormat(raw: string | null | undefined): DialFormat {
    const v = raw?.trim().toLowerCase();
    return v === "e164" || v === "e164_plain" || v === "intl00" ? v : "national";
}

/**
 * The destination as Kavkom's outbound routes expect it. A French PBX dials French numbers in
 * national form (06…), the rest with 00; KAVKOM_DIAL_FORMAT switches to +33… or 33… or 0033….
 */
export function formatDestination(e164: string, format: DialFormat): string {
    const digits = e164.replace(/[^\d]/g, "");
    switch (format) {
        case "e164":
            return `+${digits}`;
        case "e164_plain":
            return digits;
        case "intl00":
            return `00${digits}`;
        default:
            return digits.startsWith("33") && digits.length === 11 ? `0${digits.slice(2)}` : `00${digits}`;
    }
}

// ── Recording reference ─────────────────────────────────────────────────────

/** Stored in TelephonyCall.recordingUrl / Action.callRecordingUrl; resolved at playback (get_file_link). */
export const kavkomRecordingRef = (cdrUuid: string) => `kavkom:${cdrUuid}`;

export function parseKavkomRecordingRef(value: string | null | undefined): string | null {
    const m = /^kavkom:([A-Za-z0-9._:-]{6,200})$/.exec(value?.trim() ?? "");
    return m ? m[1] : null;
}

/** parentCallSid of a Kavkom call: never a Twilio CA…, still unique and "placed". */
export const kavkomCallSid = (callUuid: string) => `kavkom:${callUuid}`;
