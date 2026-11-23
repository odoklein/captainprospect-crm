// ============================================
// ONOFF BUSINESS — public REST API (MAX plan only), used to import past calls.
// The webhook (./webhook.ts) only sees calls from the day it was plugged in;
// this reads the history, and fresh recording links (Onoff signs them for 10 min).
//
//   Base     https://public-apigateway.onoffapp.net
//   Auth     x-api-key: <ONOFF_API_KEY>   (B2B console → Intégrations → Clés API, admin)
//   Limits   2 req/s sustained, burst 4 → 429
//
//   GET /api/v1/members                      ?offset&limit          → { members, nextOffset }
//   GET /api/v1/calls                        ?startDate&endDate&memberIdRef&offset&limit
//                                                                    → { callLogs, nextOffset }
//   GET /api/v1/calls/:callId/logs           note, tags, recording/voicemail ids,
//                                            callTranscription (AI summary, diarization), callEvaluation
//   GET /api/v1/calls/:callId/recording      → { url }  pre-signed, 10 min
//   GET /api/v1/calls/:voicemailId/voicemail → { url }
// Reference: https://docs.onoffbusiness.com/api/introduction
//
// The mapping half of this file is pure (no fetch, no Prisma) and tested in api.test.ts.
// ============================================

import { phoneKey } from "@/lib/exclusions/matching";
import type { OnoffStatus } from "./webhook";

export const ONOFF_API_BASE = "https://public-apigateway.onoffapp.net";

// ── Wire types (only the fields we read) ─────────────────────────────────────

export interface OnoffApiMember {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    numberIdRefs?: string[];
}

export interface OnoffApiCallLog {
    id: string;
    memberIdRef?: string;
    numberIdRef?: string;
    externalPhoneNumber?: string;
    externalNumber?: string;
    direction?: string;
    duration?: number;
    startedDate?: string;
    endedDate?: string;
    status?: string;
}

export interface OnoffApiCallDetails extends OnoffApiCallLog {
    note?: string;
    tags?: string[];
    callRecordingId?: string;
    voicemailId?: string;
    callTranscription?: {
        summarization?: string;
        diarization?: { speakerLabel?: string; speakerIndex?: number; text?: string; startTime?: string }[];
        actionItems?: { action?: string; done?: boolean }[];
    } | null;
    callEvaluation?: { totalScore?: number; summarization?: string; values?: Record<string, unknown> | null } | null;
}

// ── Client ──────────────────────────────────────────────────────────────────

export class OnoffApiError extends Error {
    constructor(public status: number, message: string) {
        super(message);
        this.name = "OnoffApiError";
    }
}

/** French message a manager can act on, from an API failure. */
export function onoffApiErrorMessage(e: unknown): string {
    if (e instanceof OnoffApiError) {
        if (e.status === 401 || e.status === 403) return "Clé API Onoff refusée. Vérifiez-la, et que votre abonnement Onoff est bien MAX.";
        if (e.status === 429) return "Onoff limite le nombre de requêtes : réessayez dans une minute.";
        if (e.status >= 500) return "Onoff ne répond pas pour le moment. Réessayez plus tard.";
        return `Onoff a refusé la requête (${e.status}).`;
    }
    return "Impossible de joindre Onoff.";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 2 req/s sustained: one request every 550 ms per client, retries on 429 / 5xx. */
export class OnoffApiClient {
    private nextSlot = 0;

    constructor(
        private apiKey: string,
        private base = ONOFF_API_BASE,
        private fetchImpl: typeof fetch = fetch,
        private spacingMs = 550,
    ) {}

    private async slot() {
        const now = Date.now();
        const wait = Math.max(0, this.nextSlot - now);
        this.nextSlot = Math.max(now, this.nextSlot) + this.spacingMs;
        if (wait) await sleep(wait);
    }

    async get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
        const url = new URL(path, this.base);
        for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
        for (let attempt = 0; ; attempt++) {
            await this.slot();
            let res: Response;
            try {
                res = await this.fetchImpl(url, { headers: { "x-api-key": this.apiKey, Accept: "application/json" }, cache: "no-store" });
            } catch (e) {
                if (attempt < 3) {
                    await sleep(1_000 * (attempt + 1));
                    continue;
                }
                throw e;
            }
            if (res.ok) return (await res.json()) as T;
            if ((res.status === 429 || res.status >= 500) && attempt < 5) {
                await sleep(res.status === 429 ? 2_000 * (attempt + 1) : 1_500 * (attempt + 1));
                continue;
            }
            const body = await res.json().catch(() => null) as { error?: { message?: string } } | null;
            throw new OnoffApiError(res.status, body?.error?.message || res.statusText || "Onoff API error");
        }
    }

    async listMembers(): Promise<OnoffApiMember[]> {
        const out: OnoffApiMember[] = [];
        let offset: string | undefined;
        for (let page = 0; page < 200; page++) {
            const r = await this.get<{ members?: OnoffApiMember[]; nextOffset?: string }>("/api/v1/members", { limit: 100, offset });
            out.push(...(r.members ?? []));
            if (!r.nextOffset || r.nextOffset === offset || !r.members?.length) break;
            offset = r.nextOffset;
        }
        return out;
    }

    /** Every call of one member between two Paris days (inclusive), all pages. */
    async *listCalls(memberId: string, fromDay: string, toDay: string): AsyncGenerator<OnoffApiCallLog[]> {
        for (const [start, end] of dayChunks(fromDay, toDay, 31)) {
            let offset: string | undefined;
            for (let page = 0; page < 2_000; page++) {
                const r = await this.get<{ callLogs?: OnoffApiCallLog[]; nextOffset?: string }>("/api/v1/calls", {
                    startDate: start,
                    // endDate's inclusiveness isn't documented: ask one day more, upserts absorb the overlap.
                    endDate: addDays(end, 1),
                    memberIdRef: memberId,
                    limit: 100,
                    offset,
                });
                if (r.callLogs?.length) yield r.callLogs;
                if (!r.nextOffset || r.nextOffset === offset || !r.callLogs?.length) break;
                offset = r.nextOffset;
            }
        }
    }

    callDetails(callId: string) {
        return this.get<OnoffApiCallDetails>(`/api/v1/calls/${encodeURIComponent(callId)}/logs`);
    }

    async recordingUrl(callId: string): Promise<string | null> {
        const r = await this.get<{ url?: string }>(`/api/v1/calls/${encodeURIComponent(callId)}/recording`);
        return r.url ?? null;
    }

    async voicemailUrl(voicemailId: string): Promise<string | null> {
        const r = await this.get<{ url?: string }>(`/api/v1/calls/${encodeURIComponent(voicemailId)}/voicemail`);
        return r.url ?? null;
    }
}

// ── Dates ───────────────────────────────────────────────────────────────────

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = (s: unknown): s is string => typeof s === "string" && DAY_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export function addDays(day: string, n: number): string {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

export function daysBetween(fromDay: string, toDay: string): number {
    return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000);
}

/** [from, to] split in windows of at most `size` days, inclusive both ends. */
export function dayChunks(fromDay: string, toDay: string, size: number): [string, string][] {
    const out: [string, string][] = [];
    for (let start = fromDay; daysBetween(start, toDay) >= 0; start = addDays(start, size)) {
        const end = addDays(start, size - 1);
        out.push([start, daysBetween(end, toDay) >= 0 ? end : toDay]);
        if (out.length > 1_000) break;
    }
    return out;
}

/**
 * Onoff's dates come as "2025-10-08T14:30:00" — no offset. Read as UTC (what its
 * gateway stores); a value that carries its own offset is kept as is.
 */
export function parseOnoffDate(v: unknown): Date | null {
    if (typeof v !== "string" || !v.trim()) return null;
    const s = v.trim();
    const withZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`;
    const d = new Date(withZone);
    return Number.isNaN(d.getTime()) ? null : d;
}

// ── Mapping ─────────────────────────────────────────────────────────────────

/** "33612345678" → "+33612345678"; anything already formatted is kept. */
export function e164ish(n: string | undefined | null): string | null {
    const s = n?.trim();
    if (!s) return null;
    if (s.startsWith("+")) return s;
    return /^\d{8,15}$/.test(s) ? `+${s}` : s;
}

/** API statuses (call states) → the webhook's call outcomes. */
export function mapApiStatus(status: string | undefined, durationSec: number | null): OnoffStatus {
    const s = status?.toUpperCase();
    if (s === "ANSWER") return "ANSWERED";
    if (s === "END") return durationSec && durationSec > 0 ? "ANSWERED" : "MISSED_CALL";
    if (s === "BUSY") return "BUSY";
    if (s === "VMS") return "VMS";
    if (s === "UNKNOWN_SUBSCRIBER") return "WRONG_NUMBER";
    if (s === "ABORT" || s === "FALLBACK" || s === "DROPPED_VERIFICATION") return "MISSED_CALL";
    return "UNKNOWN";
}

export const memberName = (m: OnoffApiMember) => [m.firstName, m.lastName].filter(Boolean).join(" ").trim() || m.email || m.id;

export interface ImportedCallBase {
    apiCallId: string;
    memberId: string | null;
    onoffUserEmail: string | null;
    onoffUserNumber: string | null;
    externalNumber: string;
    externalKey: string | null;
    direction: "INBOUND" | "OUTBOUND";
    status: OnoffStatus;
    startedAt: Date;
    endedAt: Date | null;
    durationSec: number | null;
}

/** One list row → the fields of an OnoffCall. Null when it cannot describe a call. */
export function mapCallLog(log: OnoffApiCallLog, member: OnoffApiMember | null): ImportedCallBase | null {
    const externalNumber = e164ish(log.externalPhoneNumber ?? log.externalNumber);
    const startedAt = parseOnoffDate(log.startedDate);
    if (!log.id || !externalNumber || !startedAt) return null;
    const durationSec = typeof log.duration === "number" && Number.isFinite(log.duration) && log.duration >= 0 ? Math.round(log.duration) : null;
    return {
        apiCallId: log.id,
        memberId: log.memberIdRef ?? member?.id ?? null,
        onoffUserEmail: member?.email?.trim().toLowerCase() || null,
        onoffUserNumber: e164ish(log.numberIdRef),
        externalNumber,
        externalKey: phoneKey(externalNumber),
        direction: log.direction?.toLowerCase() === "inbound" ? "INBOUND" : "OUTBOUND",
        status: mapApiStatus(log.status, durationSec),
        startedAt,
        endedAt: parseOnoffDate(log.endedDate),
        durationSec,
    };
}

/** Only calls that can carry audio or a summary are worth one more request. */
export const needsDetails = (c: Pick<ImportedCallBase, "durationSec" | "status">) => (c.durationSec ?? 0) > 0 || c.status === "VMS";

export interface ImportedCallDetails {
    notes: string | null;
    tags: { tagName: string }[] | null;
    recordingId: string | null;
    voicemailId: string | null;
    summary: string | null;
    transcription: string | null;
    evaluationScore: number | null;
    evaluation: Record<string, unknown> | null;
}

const MAX_TEXT = 200_000;

/** /calls/:id/logs → summary (with action items), transcript lines, coaching score. */
export function mapCallDetails(d: OnoffApiCallDetails): ImportedCallDetails {
    const t = d.callTranscription ?? null;
    const actions = (t?.actionItems ?? []).map((a) => a.action?.trim()).filter((a): a is string => !!a);
    const summaryParts = [t?.summarization?.trim(), actions.length ? `Actions à suivre :\n${actions.map((a) => `- ${a}`).join("\n")}` : null].filter(Boolean);
    const lines = (t?.diarization ?? [])
        .filter((l) => l.text?.trim())
        .map((l) => {
            const who = l.speakerLabel?.trim() || (typeof l.speakerIndex === "number" ? `Interlocuteur ${l.speakerIndex + 1}` : "Interlocuteur");
            return `${l.startTime ? `[${l.startTime}] ` : ""}${who} : ${l.text!.trim()}`;
        });
    const ev = d.callEvaluation ?? null;
    const score = typeof ev?.totalScore === "number" && Number.isFinite(ev.totalScore) ? ev.totalScore : null;
    const tags = (d.tags ?? []).filter((x): x is string => typeof x === "string" && !!x.trim()).map((tagName) => ({ tagName }));
    return {
        notes: d.note?.trim() || null,
        tags: tags.length ? tags : null,
        recordingId: d.callRecordingId?.trim() || null,
        voicemailId: d.voicemailId?.trim() || null,
        summary: summaryParts.length ? summaryParts.join("\n\n").slice(0, MAX_TEXT) : null,
        transcription: lines.length ? lines.join("\n").slice(0, MAX_TEXT) : null,
        evaluationScore: score,
        evaluation: ev ? (ev as Record<string, unknown>) : null,
    };
}

/**
 * The same call may already be here from the webhook, under its webhook event id.
 * Same prospect, same line or member, started within 90 s → same call.
 */
export function isSameCall(
    a: { externalKey: string | null; startedAt: Date; onoffUserEmail: string | null; onoffUserNumber: string | null },
    b: { externalKey: string | null; startedAt: Date; onoffUserEmail: string | null; onoffUserNumber: string | null },
): boolean {
    if (!a.externalKey || a.externalKey !== b.externalKey) return false;
    if (Math.abs(a.startedAt.getTime() - b.startedAt.getTime()) > 90_000) return false;
    const sameEmail = !!a.onoffUserEmail && a.onoffUserEmail === b.onoffUserEmail;
    const sameLine = !!a.onoffUserNumber && phoneKey(a.onoffUserNumber) === phoneKey(b.onoffUserNumber);
    const unknownSide = !(a.onoffUserEmail || a.onoffUserNumber) || !(b.onoffUserEmail || b.onoffUserNumber);
    return sameEmail || sameLine || unknownSide;
}
