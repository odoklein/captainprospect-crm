/**
 * Pure limits and mapping of assistant folders (Captain AI v4): the folder
 * instructions token cap, starter questions, and the row → FolderCard shape.
 */

import type { FolderCard, FolderCounts, FolderKind } from "../api-contract";
import { estimateTokens } from "../context/tokens";

/** Folder instructions travel in every turn of the folder: kept short. */
export const INSTRUCTIONS_MAX_TOKENS = 600;
export const STARTER_QUESTIONS_MAX = 6;
export const STARTER_QUESTION_MAX_CHARS = 200;

/** Rough token count (chars / 3.3, rounded up), the same estimate as the context pack. */
export function instructionsTokens(text: string | null | undefined): number {
    return estimateTokens(text ?? "");
}

export type InstructionsCheck =
    | { ok: true; value: string | null; tokens: number }
    | { ok: false; tokens: number; reason: string };

/** Trims the instructions (empty = null) and refuses them above the cap. */
export function checkInstructions(raw: string | null | undefined, max = INSTRUCTIONS_MAX_TOKENS): InstructionsCheck {
    const value = raw?.trim() ? raw.trim() : null;
    const tokens = instructionsTokens(value);
    if (tokens > max) {
        return {
            ok: false,
            tokens,
            reason: `Instructions trop longues : environ ${tokens} tokens pour ${max} maximum. Raccourcis-les.`,
        };
    }
    return { ok: true, value, tokens };
}

/** Stored JSON → clean string list (non-empty, deduplicated, bounded). */
export function normalizeStarterQuestions(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of raw) {
        if (typeof item !== "string") continue;
        const q = item.replace(/\s+/g, " ").trim().slice(0, STARTER_QUESTION_MAX_CHARS);
        if (!q || seen.has(q.toLowerCase())) continue;
        seen.add(q.toLowerCase());
        out.push(q);
        if (out.length >= STARTER_QUESTIONS_MAX) break;
    }
    return out;
}

export interface FolderCardRow {
    id: string;
    kind: FolderKind;
    name: string;
    color: string | null;
    icon: string | null;
    clientId: string | null;
    lastActivityAt: Date | null;
}

export interface FolderStats {
    /** Readable conversations by folder id (GENERAL folders). */
    byFolder: Map<string, number>;
    /** Readable conversations by client id (CLIENT folders: a client's threads, filed or not). */
    byClient: Map<string, number>;
    memories: Map<string, number>;
    files: Map<string, number>;
    pins: Map<string, number>;
    /** Folder ids and client ids with an open finding or a pending proposal. */
    agentFolderIds: Set<string>;
    agentClientIds: Set<string>;
}

export const EMPTY_STATS: FolderStats = {
    byFolder: new Map(),
    byClient: new Map(),
    memories: new Map(),
    files: new Map(),
    pins: new Map(),
    agentFolderIds: new Set(),
    agentClientIds: new Set(),
};

export function toFolderCard(row: FolderCardRow, stats: FolderStats): FolderCard {
    const conversations =
        row.kind === "CLIENT" && row.clientId ? (stats.byClient.get(row.clientId) ?? 0) : (stats.byFolder.get(row.id) ?? 0);
    const counts: FolderCounts = {
        conversations,
        memories: stats.memories.get(row.id) ?? 0,
        files: stats.files.get(row.id) ?? 0,
        pins: stats.pins.get(row.id) ?? 0,
    };
    return {
        id: row.id,
        kind: row.kind,
        name: row.name,
        color: row.color,
        icon: row.icon,
        clientId: row.clientId,
        counts,
        lastActivityAt: row.lastActivityAt ? row.lastActivityAt.toISOString() : null,
        hasAgentActivity:
            stats.agentFolderIds.has(row.id) || (row.clientId !== null && stats.agentClientIds.has(row.clientId)),
    };
}
