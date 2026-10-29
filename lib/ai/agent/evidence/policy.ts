/**
 * Evidence retention and reuse policy.
 *
 * Two clocks per record:
 *  - `expiresAt` — how long the result counts as fresh. Inside that window a
 *    follow-up reuses it instead of querying again, and a citation of it is
 *    current. Short, because the CRM moves all day.
 *  - retention — how long the summary and facts stay at all (90 days, the
 *    platform's log retention), after which the row is deleted.
 *
 * The scrubbed payload itself is kept only inside the freshness window, and
 * never for tools whose output is free text or vault metadata: those are
 * re-queried rather than copied into a second table.
 */

import { createHash } from "node:crypto";

const DEFAULT_TTL_S = 300;

const TTL_S: Record<string, number> = {
    get_mission_metrics: 600,
    get_agency_metrics: 600,
    get_agency_overview: 600,
    list_clients_needing_attention: 600,
    get_campaign_status: 600,
    get_meeting_feedback: 600,
    list_meetings: 300,
};

/** Results whose payload is never copied into the ledger. */
const NO_PAYLOAD = new Set([
    "list_credentials",
    "list_access_activity",
    "propose_email_addresses",
    "read_draft",
    "read_project_document",
    "get_call_recap",
    "get_playbook",
    "search_help",
]);

/**
 * Above this size a payload is summarised but not cached. Sized so that a
 * result compacted away mid-turn (lib/ai/agent/compaction.ts) can still be
 * served in full when the model asks for it again: the compaction hint
 * promises the detail without a new query, so the cache must hold payloads
 * as large as the tool truncation ceiling lets through.
 */
export const MAX_CACHED_PAYLOAD_BYTES = 64_000;

export function evidenceTtlMs(tool: string): number {
    return (TTL_S[tool] ?? DEFAULT_TTL_S) * 1000;
}

export function mayCachePayload(tool: string): boolean {
    return !NO_PAYLOAD.has(tool);
}

export function retentionDays(env: NodeJS.ProcessEnv = process.env): number {
    const raw = Number(env.ASSISTANT_EVIDENCE_RETENTION_DAYS);
    return Number.isFinite(raw) && raw >= 1 && raw <= 365 ? Math.round(raw) : 90;
}

/** Stable JSON: object keys sorted, so equal arguments hash equally. */
export function canonicalJson(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/**
 * Identity of a retrieval: tool + validated arguments + the trusted scope.
 * The scope is part of the hash so a result can never be reused under a
 * different project, even if the arguments are identical.
 */
export function evidenceArgsHash(
    tool: string,
    args: unknown,
    scope: { clientId: string | null; missionId: string | null },
): string {
    return createHash("sha256")
        .update(`${tool}\u0000${canonicalJson(args)}\u0000${scope.clientId ?? "-"}\u0000${scope.missionId ?? "-"}`)
        .digest("hex");
}

export function digest(payload: unknown): string {
    return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}
