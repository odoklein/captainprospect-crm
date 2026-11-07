/**
 * Pure validation and mapping of folder pins (the "Tableau", Captain AI v4).
 * A pin stores a StoredVisual (lib/assistant/visuals/spec.ts) as the chat drew
 * it, plus the read that fed it so "Actualiser" can redraw it.
 */

import type { PinItem } from "../api-contract";
import { parseVisualSpec, type StoredVisual } from "../visuals/spec";

export const PIN_TITLE_MAX = 120;

export type PinSource = { tool: string; args: Record<string, unknown>; label: string };

export function parsePinSource(raw: unknown): PinSource | null {
    if (!raw || typeof raw !== "object") return null;
    const s = raw as Record<string, unknown>;
    if (typeof s.tool !== "string" || !/^[a-z0-9_]{1,64}$/i.test(s.tool)) return null;
    const args = s.args && typeof s.args === "object" && !Array.isArray(s.args) ? (s.args as Record<string, unknown>) : {};
    return { tool: s.tool, args, label: typeof s.label === "string" ? s.label : s.tool };
}

export type ParseStoredVisual = { ok: true; visual: StoredVisual } | { ok: false; error: string };

/** Checks a StoredVisual coming from the browser: the spec is re-validated, extras are dropped. */
export function parseStoredVisual(input: unknown, newId: () => string): ParseStoredVisual {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return { ok: false, error: "Visuel manquant." };
    }
    const raw = input as Record<string, unknown>;
    const spec = parseVisualSpec(raw.spec);
    if (!spec.ok) return { ok: false, error: spec.error };
    const unverified = Array.isArray(raw.unverified)
        ? raw.unverified.filter((n): n is number => typeof n === "number" && Number.isFinite(n)).slice(0, 50)
        : undefined;
    return {
        ok: true,
        visual: {
            id: typeof raw.id === "string" && raw.id.length > 0 && raw.id.length <= 64 ? raw.id : newId(),
            spec: spec.spec,
            ...(unverified && unverified.length ? { unverified } : {}),
            source: parsePinSource(raw.source),
            question: typeof raw.question === "string" && raw.question.trim() ? raw.question.trim().slice(0, 2000) : null,
        },
    };
}

export function pinTitle(explicit: string | null | undefined, visual: StoredVisual): string {
    const value = explicit?.replace(/\s+/g, " ").trim() || visual.spec.title;
    return value.slice(0, PIN_TITLE_MAX);
}

export interface PinRow {
    id: string;
    folderId: string;
    title: string;
    visual: unknown;
    question: string | null;
    conversationId: string | null;
    messageId: string | null;
    position: number;
    refreshedAt: Date | null;
    refreshError: string | null;
    createdAt: Date;
}

export function toPinItem(row: PinRow): PinItem {
    return {
        id: row.id,
        folderId: row.folderId,
        title: row.title,
        visual: row.visual,
        question: row.question,
        conversationId: row.conversationId,
        messageId: row.messageId,
        position: row.position,
        refreshedAt: row.refreshedAt ? row.refreshedAt.toISOString() : null,
        refreshError: row.refreshError,
        createdAt: row.createdAt.toISOString(),
    };
}

/** The French instruction of a pin refresh turn. */
export function refreshInstruction(source: PinSource, visual: StoredVisual): string {
    return [
        "## Actualisation d'un visuel épinglé",
        `Redessine ce visuel avec les données à jour : rappelle ${source.tool} avec ces arguments (période recalée à aujourd'hui), puis show_visual avec le même kind et le même title. N'écris qu'une phrase.`,
        `Arguments d'origine : ${JSON.stringify(source.args).slice(0, 4000)}`,
        `Visuel attendu : kind « ${visual.spec.kind} », title « ${visual.spec.title} ».`,
    ].join("\n");
}
