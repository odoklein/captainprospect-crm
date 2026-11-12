/**
 * The hand-over from a streamed answer to the saved one, as pure logic.
 *
 * Why it exists: when an answer finished, the live block unmounted and a
 * brand-new saved message mounted (enter animation, markdown re-rendered, the
 * tool steps above the text gone), which read as the whole answer being
 * rewritten from the top. Now one component renders both states under one
 * stable React key:
 *
 * - Render keys. A send mints a turn key; the live block is keyed by it and
 *   the saved answer's id is bound to it, so React updates in place. Rows the
 *   browser minted (`local-…`, `stopped-…`, `a-…`) hand their key to the
 *   server rows that replace them on the merge refresh (`carryRenderKeys`).
 * - Enter animation. Only for a message loaded from history, once; never for
 *   one streamed in this session.
 * - Markdown blocks. The answer renders block by block; when the final text
 *   equals the streamed draft nothing changes, when the server rewrote a block
 *   (verification repair) only that block cross-fades (`blockChange`).
 *
 * No React here — covered by handover.test.ts.
 */

import type { ThreadMessage } from "@/lib/assistant/api-contract";
import { isLocalId } from "./model";

// ============================================
// Render keys
// ============================================

export type KeyLookup = (messageId: string) => string;

/**
 * After a merge refresh, the server rows that replaced browser-minted ones,
 * paired with the render key those had. Pairs in order, by role; a question
 * must also keep its text (so a message from another tab never steals a key).
 */
export function carryRenderKeys(
    prev: readonly ThreadMessage[],
    next: readonly ThreadMessage[],
    keyOf: KeyLookup,
): Array<[messageId: string, key: string]> {
    const nextIds = new Set(next.map((m) => m.id));
    const prevIds = new Set(prev.map((m) => m.id));
    const gone = prev.filter((m) => isLocalId(m.id) && !nextIds.has(m.id));
    if (gone.length === 0) return [];
    const fresh = next.filter((m) => !prevIds.has(m.id));
    const pairs: Array<[string, string]> = [];
    let from = 0;
    for (const old of gone) {
        for (let i = from; i < fresh.length; i++) {
            const candidate = fresh[i];
            if (candidate.role !== old.role) continue;
            if (old.role === "USER" && candidate.content.trim() !== old.content.trim()) continue;
            pairs.push([candidate.id, keyOf(old.id)]);
            from = i + 1;
            break;
        }
    }
    return pairs;
}

/**
 * Whether the live block still has to be drawn: once the settled answer is in
 * the thread, the thread's row (same key) draws it instead.
 */
export function liveItemVisible(settledId: string | null, messages: readonly ThreadMessage[]): boolean {
    return settledId === null || !messages.some((m) => m.id === settledId);
}

/**
 * Session registry: message id → render key, the keys that were streamed, and
 * the ones that already played their enter animation. Ids are cuids (or
 * browser-minted and unique), so one registry serves every thread.
 */
export class RenderKeys {
    private readonly keys = new Map<string, string>();
    private readonly streamed = new Set<string>();
    private readonly entered = new Set<string>();

    keyOf = (messageId: string): string => this.keys.get(messageId) ?? messageId;

    bind(messageId: string, key: string): void {
        if (messageId !== key) this.keys.set(messageId, key);
    }

    /** Carries keys from browser rows to the server rows of a merge refresh. */
    carry(prev: readonly ThreadMessage[], next: readonly ThreadMessage[]): void {
        for (const [id, key] of carryRenderKeys(prev, next, this.keyOf)) this.keys.set(id, key);
    }

    markStreamed(key: string): void {
        this.streamed.add(key);
    }

    /** True once per key, and never for a message streamed in this session. */
    shouldEnter(key: string): boolean {
        return !this.streamed.has(key) && !this.entered.has(key);
    }

    markEntered(key: string): void {
        this.entered.add(key);
    }
}

export const renderKeys = new RenderKeys();

let turnCounter = 0;

/** A fresh key for the turn a send starts. */
export function nextTurnKey(now: number = Date.now()): string {
    turnCounter += 1;
    return `turn-${now.toString(36)}-${turnCounter}`;
}

// ============================================
// Markdown blocks
// ============================================

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const LIST_ITEM = /^\s{0,3}(?:[-*+]|\d{1,9}[.)])\s/;
const CONTINUATION = /^(?: {2,}|\t)/;

/**
 * Cuts markdown into top-level blocks at blank lines, without ever cutting a
 * fenced code block, a list (loose items stay together) or an indented
 * continuation. Each block renders on its own, so a streamed answer only
 * re-renders its last block, and a repaired block can fade alone.
 */
export function splitMarkdownBlocks(markdown: string): string[] {
    const blocks: string[] = [];
    let current: string[] = [];
    let fence: string | null = null;
    let blankPending = false;

    for (const line of markdown.split("\n")) {
        if (fence) {
            current.push(line);
            const close = FENCE.exec(line);
            if (close && close[1][0] === fence[0] && close[1].length >= fence.length && line.trim() === close[1]) fence = null;
            continue;
        }
        if (line.trim() === "") {
            if (current.length > 0) blankPending = true;
            continue;
        }
        if (blankPending) {
            const continues = CONTINUATION.test(line) || (LIST_ITEM.test(line) && LIST_ITEM.test(current[0]));
            if (continues) current.push("");
            else {
                blocks.push(current.join("\n"));
                current = [];
            }
            blankPending = false;
        }
        const open = FENCE.exec(line);
        if (open) fence = open[1];
        current.push(line);
    }
    if (current.length > 0) blocks.push(current.join("\n"));
    return blocks;
}

export type BlockChange = "same" | "grow" | "replace";

/**
 * How a block's text moved: unchanged, grown by streaming (or cut back to a
 * prefix when a visual was placed inside it), or rewritten — the one case
 * that cross-fades.
 */
export function blockChange(before: string, after: string): BlockChange {
    if (before === after) return "same";
    const a = before.trimEnd();
    const b = after.trimEnd();
    if (a === b) return "same";
    if (b.startsWith(a) || a.startsWith(b)) return "grow";
    return "replace";
}

/** Indexes of the final blocks that differ from the streamed draft's (rewritten, not grown). */
export function changedBlocks(draft: string, final: string): number[] {
    const before = splitMarkdownBlocks(draft);
    const after = splitMarkdownBlocks(final);
    const changed: number[] = [];
    after.forEach((block, i) => {
        if (i < before.length && blockChange(before[i], block) === "replace") changed.push(i);
    });
    return changed;
}
