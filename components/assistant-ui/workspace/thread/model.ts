/**
 * Pure logic of the Captain AI workspace: the persisted trace read back, the
 * optimistic thread edits a send makes, the cache merges, the live-turn
 * reducer fed by the NDJSON stream, list upserts and the small formatters.
 * No React, no fetch — covered by model.test.ts (`npx tsx --test`).
 */

import type {
    ConversationCard,
    FolderListResponse,
    Page,
    ThreadMessage,
    ThreadResponse,
    VirtualClientFolder,
} from "@/lib/assistant/api-contract";
import type { CitationRef, StreamEvent, TurnPayload, TurnUsage } from "@/lib/ai/agent/protocol";
import type { StoredVisual } from "@/lib/assistant/visuals/spec";
import type { LiveTurnState } from "../../LiveTurn";
import type { StoredAction, TraceEntry } from "../../types";

// ============================================
// Ids
// ============================================

const LOCAL_PREFIXES = ["local-", "stopped-", "a-", "tmp-"];

/** Ids minted in the browser (optimistic rows) — never sent to the server as a message id. */
export function isLocalId(id: string): boolean {
    return LOCAL_PREFIXES.some((p) => id.startsWith(p));
}

// ============================================
// Trace & action read back
// ============================================

export interface ParsedTrace {
    entries: TraceEntry[];
    usage: TurnUsage | null;
    citations: CitationRef[];
    visuals: StoredVisual[];
    status: string | null;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Tolerates every shape the chat route ever wrote: an array (old rows), an object, or nothing. */
export function parseTrace(trace: unknown): ParsedTrace {
    if (Array.isArray(trace)) {
        return { entries: trace as TraceEntry[], usage: null, citations: [], visuals: [], status: null };
    }
    if (!isObject(trace)) return { entries: [], usage: null, citations: [], visuals: [], status: null };
    const usage = isObject(trace.usage) && typeof trace.usage.costEur === "number" ? (trace.usage as unknown as TurnUsage) : null;
    return {
        entries: Array.isArray(trace.entries) ? (trace.entries as TraceEntry[]) : [],
        usage,
        citations: Array.isArray(trace.citations) ? (trace.citations as CitationRef[]) : [],
        visuals: Array.isArray(trace.visuals) ? (trace.visuals as StoredVisual[]) : [],
        status: typeof trace.status === "string" ? trace.status : null,
    };
}

export function parseAction(action: unknown): StoredAction | null {
    if (!isObject(action) || !isObject(action.card) || typeof action.state !== "string") return null;
    return action as unknown as StoredAction;
}

// ============================================
// Messages minted in the browser
// ============================================

export function localUserMessage(
    id: string,
    content: string,
    attachments: ThreadMessage["attachments"],
    now: string,
): ThreadMessage {
    return {
        id,
        role: "USER",
        content,
        createdAt: now,
        trace: null,
        action: null,
        attachments: attachments && attachments.length > 0 ? attachments : null,
        feedback: null,
    };
}

/** The `final` payload as the row the thread GET will later return. */
export function payloadToMessage(payload: TurnPayload, fallbackId: string, now: string): ThreadMessage {
    return {
        id: payload.messageId ?? fallbackId,
        role: "ASSISTANT",
        content: payload.answer,
        createdAt: now,
        trace: {
            entries: payload.trace,
            usage: payload.usage,
            citations: payload.citations,
            visuals: payload.visuals ?? [],
            status: payload.status,
        },
        action: payload.pendingAction ?? null,
        attachments: null,
        feedback: null,
    };
}

// ============================================
// Thread edits
// ============================================

export interface SendShape {
    regenerateMessageId?: string;
    editMessageId?: string;
}

/**
 * What the thread looks like the moment a message leaves: regenerate drops the
 * answer being replaced, edit drops the edited question and everything after
 * it, then the new question is appended (none on regenerate).
 */
export function applyOptimisticSend(thread: ThreadResponse, userMessage: ThreadMessage | null, shape: SendShape): ThreadResponse {
    let messages = thread.messages;
    const cutAt = shape.editMessageId ?? shape.regenerateMessageId;
    if (cutAt) {
        const index = messages.findIndex((m) => m.id === cutAt);
        if (index >= 0) messages = messages.slice(0, index);
    }
    if (userMessage) messages = [...messages, userMessage];
    return { ...thread, messages };
}

export function appendMessage(thread: ThreadResponse, message: ThreadMessage): ThreadResponse {
    if (thread.messages.some((m) => m.id === message.id)) {
        return { ...thread, messages: thread.messages.map((m) => (m.id === message.id ? message : m)) };
    }
    return { ...thread, messages: [...thread.messages, message] };
}

export function patchMessage(thread: ThreadResponse, messageId: string, patch: Partial<ThreadMessage>): ThreadResponse {
    return { ...thread, messages: thread.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)) };
}

/**
 * A fresh newest page replaces the cached one, minus browser-minted rows, but
 * the older pages already loaded stay above it (with their cursor), so a
 * background refresh never yanks history from under the reader.
 */
export function mergeThreadRefresh(current: ThreadResponse | undefined, fresh: ThreadResponse): ThreadResponse {
    if (!current || fresh.olderCursor === null) return fresh;
    const freshIds = new Set(fresh.messages.map((m) => m.id));
    if (!current.messages.some((m) => freshIds.has(m.id))) return fresh;
    const kept: ThreadMessage[] = [];
    for (const m of current.messages) {
        if (freshIds.has(m.id)) break;
        if (!isLocalId(m.id)) kept.push(m);
    }
    if (kept.length === 0) return fresh;
    return { ...fresh, messages: [...kept, ...fresh.messages], olderCursor: current.olderCursor };
}

/** An older page loaded above the current messages. */
export function prependOlder(current: ThreadResponse, older: ThreadResponse): ThreadResponse {
    const ids = new Set(current.messages.map((m) => m.id));
    return {
        ...current,
        messages: [...older.messages.filter((m) => !ids.has(m.id)), ...current.messages],
        olderCursor: older.olderCursor,
    };
}

export function lastOfRole(messages: ThreadMessage[], role: ThreadMessage["role"]): ThreadMessage | null {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === role) return messages[i];
    return null;
}

// ============================================
// Live turn (NDJSON stream)
// ============================================

export const EMPTY_LIVE: LiveTurnState = { phase: "connecting", steps: [], draft: "", visuals: [], reasoning: "" };

export function liveReducer(state: LiveTurnState, event: StreamEvent): LiveTurnState {
    switch (event.type) {
        case "phase":
            return { ...state, phase: event.phase };
        case "retry":
            return { ...state, phase: "retrying" };
        case "tool_start":
            return {
                ...state,
                phase: "tools",
                steps: [...state.steps, { id: event.id, tool: event.tool, label: event.label, state: "running" }],
            };
        case "tool_end":
            return {
                ...state,
                steps: state.steps.map((step) =>
                    step.id === event.id
                        ? { ...step, state: event.ok ? "ok" : "error", durationMs: event.durationMs, cached: event.cached }
                        : step,
                ),
            };
        case "visual":
            return {
                ...state,
                visuals: state.visuals.some((v) => v.id === event.visual.id)
                    ? state.visuals.map((v) => (v.id === event.visual.id ? event.visual : v))
                    : [...state.visuals, event.visual],
            };
        case "delta":
            return { ...state, phase: "writing", draft: state.draft + event.text };
        case "reasoning":
            return { ...state, reasoning: (state.reasoning ?? "") + event.text };
        case "reset":
            return { ...state, draft: "", reasoning: "" };
        default:
            return state;
    }
}

// ============================================
// Conversation lists (SWR caches)
// ============================================

/** Does the list behind this URL hold the conversation? `null` = it only updates rows it already has (search). */
export function listAccepts(key: string, card: ConversationCard): boolean | null {
    const q = key.indexOf("?");
    const params = new URLSearchParams(q >= 0 ? key.slice(q + 1) : "");
    if (params.get("q")) return null;
    const folderId = params.get("folderId");
    if (folderId) return card.folderId === folderId;
    if (params.get("scope") === "agency") return !card.folderId && !card.clientId;
    if (params.get("pinned") === "1") return card.pinnedAt !== null;
    return true;
}

export function isConversationPage(data: unknown): data is Page<ConversationCard> {
    return isObject(data) && Array.isArray(data.items);
}

/**
 * Upsert into one cached list: a row that stopped belonging leaves, a known
 * row is merged (and moved to the top when `toFront`), a new row that belongs
 * enters at the top.
 */
export function upsertInPage(
    page: Page<ConversationCard>,
    key: string,
    card: ConversationCard,
    toFront: boolean,
): Page<ConversationCard> {
    const accepts = listAccepts(key, card);
    const index = page.items.findIndex((c) => c.id === card.id);
    if (index >= 0) {
        if (accepts === false) return { ...page, items: page.items.filter((c) => c.id !== card.id) };
        const merged = { ...page.items[index], ...card };
        if (!toFront) return { ...page, items: page.items.map((c, i) => (i === index ? merged : c)) };
        return { ...page, items: [merged, ...page.items.filter((c) => c.id !== card.id)] };
    }
    if (accepts !== true) return page;
    return { ...page, items: [card, ...page.items] };
}

export function removeFromPage(page: Page<ConversationCard>, id: string): Page<ConversationCard> {
    return page.items.some((c) => c.id === id) ? { ...page, items: page.items.filter((c) => c.id !== id) } : page;
}

export function isConversationPages(data: unknown): data is Array<Page<ConversationCard>> {
    return Array.isArray(data) && data.every(isConversationPage);
}

/** Same as upsertInPage over an infinite list (useSWRInfinite pages): new and moved rows go to the first page. */
export function upsertInPages(
    pages: Array<Page<ConversationCard>>,
    key: string,
    card: ConversationCard,
    toFront: boolean,
): Array<Page<ConversationCard>> {
    if (pages.length === 0) return pages;
    const accepts = listAccepts(key, card);
    const at = pages.findIndex((p) => p.items.some((c) => c.id === card.id));
    if (at >= 0) {
        const existing = pages[at].items.find((c) => c.id === card.id) as ConversationCard;
        if (accepts === false) return pages.map((p, i) => (i === at ? removeFromPage(p, card.id) : p));
        const merged = { ...existing, ...card };
        if (!toFront) return pages.map((p, i) => (i === at ? { ...p, items: p.items.map((c) => (c.id === card.id ? merged : c)) } : p));
        const without = pages.map((p, i) => (i === at ? removeFromPage(p, card.id) : p));
        return without.map((p, i) => (i === 0 ? { ...p, items: [merged, ...p.items] } : p));
    }
    if (accepts !== true) return pages;
    return pages.map((p, i) => (i === 0 ? { ...p, items: [card, ...p.items] } : p));
}

export function removeFromPages(pages: Array<Page<ConversationCard>>, id: string): Array<Page<ConversationCard>> {
    const at = pages.findIndex((p) => p.items.some((c) => c.id === id));
    return at < 0 ? pages : pages.map((p, i) => (i === at ? removeFromPage(p, id) : p));
}

/** The rail's « Épinglés » follow pinnedAt. */
export function syncPinned(folders: FolderListResponse, card: ConversationCard | null, removedId?: string): FolderListResponse {
    const id = card?.id ?? removedId;
    if (!id) return folders;
    const rest = folders.pinnedConversations.filter((c) => c.id !== id);
    if (!card || card.pinnedAt === null) {
        return rest.length === folders.pinnedConversations.length ? folders : { ...folders, pinnedConversations: rest };
    }
    const existing = folders.pinnedConversations.find((c) => c.id === id);
    if (existing) {
        return { ...folders, pinnedConversations: folders.pinnedConversations.map((c) => (c.id === id ? { ...c, ...card } : c)) };
    }
    return { ...folders, pinnedConversations: [card, ...rest] };
}

// ============================================
// Rail
// ============================================

/** Case- and accent-insensitive, so "creer" finds « créer ». */
export function normalizeSearch(text: string): string {
    return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export type ClientSort = "alpha" | "recent";

export function sortClients(clients: VirtualClientFolder[], mode: ClientSort): VirtualClientFolder[] {
    const alpha = (a: VirtualClientFolder, b: VirtualClientFolder) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
    const copy = [...clients];
    if (mode === "alpha") return copy.sort(alpha);
    return copy.sort((a, b) => {
        const ta = a.folder?.lastActivityAt ? Date.parse(a.folder.lastActivityAt) : -Infinity;
        const tb = b.folder?.lastActivityAt ? Date.parse(b.folder.lastActivityAt) : -Infinity;
        if (ta !== tb) return tb > ta ? 1 : -1;
        return alpha(a, b);
    });
}

// ============================================
// Formatting
// ============================================

const NBSP = " ";

/** « 0,04 € », « 0,0042 € » under a cent, « 12,30 € ». */
export function formatEuros(cost: number): string {
    if (!Number.isFinite(cost) || cost <= 0) return `0,00${NBSP}€`;
    const digits = cost < 0.01 ? 4 : 2;
    const [int, dec] = cost.toFixed(digits).split(".");
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return `${grouped},${dec}${NBSP}€`;
}

/** « 0,04 € · 38 % en cache · gpt-5.5 » — null when the turn carries no usage. */
export function formatCostLine(usage: TurnUsage | null): string | null {
    if (!usage) return null;
    const parts = [formatEuros(usage.costEur)];
    if (usage.promptTokens > 0 && usage.cachedInputTokens && usage.cachedInputTokens > 0) {
        const pct = Math.round((usage.cachedInputTokens / usage.promptTokens) * 100);
        parts.push(`${pct}${NBSP}% en cache`);
    }
    if (usage.model) parts.push(usage.model);
    return parts.join(" · ");
}

/** "10:24" today, "12 oct. · 10:24" before. */
export function formatMessageTime(iso: string, now: Date = new Date()): string {
    const date = new Date(iso);
    const time = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    if (date.toDateString() === now.toDateString()) return time;
    return `${date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} · ${time}`;
}

/** The last ~140 chars of a reasoning summary, on one line. */
export function reasoningTail(text: string | undefined, max = 140): string {
    if (!text) return "";
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length <= max ? flat : `…${flat.slice(flat.length - max).trimStart()}`;
}

/** First ~140 chars of an answer, as the conversation preview. */
export function previewOf(content: string): string {
    const flat = content.replace(/:::\s*suivi[\s\S]*$/i, "").replace(/\[\[visuel\s+\d+\]\]/g, "").replace(/[#*_`>]/g, "").replace(/\s+/g, " ").trim();
    return flat.length <= 140 ? flat : `${flat.slice(0, 139)}…`;
}
