/**
 * Confirmation cards: who may settle one, once, and only while it is fresh.
 *
 * The card's state lives in `AssistantMessage.action` (JSON). Settling it is a
 * compare-and-set on `state = "pending"`: Postgres re-checks the condition
 * under the row lock, so of two concurrent clicks exactly one moves the card to
 * "executing" and runs the tool; the other gets a 409. The previous
 * read-then-write let both run (two emails sent).
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type ActionState = "pending" | "executing" | "confirmed" | "cancelled" | "failed" | "expired";

export interface StoredAction {
    tool: string;
    args: Record<string, unknown>;
    card?: unknown;
    state: ActionState;
    outcome?: string;
    proposedAt?: string;
    settledAt?: string;
}

export interface ActionStore {
    /** Atomically move `pending` → `next.state`. False when someone else got there first. */
    claim(messageId: string, next: StoredAction): Promise<boolean>;
    save(messageId: string, next: StoredAction): Promise<void>;
}

export const prismaActionStore: ActionStore = {
    async claim(messageId, next) {
        const { count } = await prisma.assistantMessage.updateMany({
            where: { id: messageId, action: { path: ["state"], equals: "pending" } },
            data: { action: next as unknown as Prisma.InputJsonValue },
        });
        return count === 1;
    },
    async save(messageId, next) {
        await prisma.assistantMessage.update({
            where: { id: messageId },
            data: { action: next as unknown as Prisma.InputJsonValue },
            select: { id: true },
        });
    },
};

/** Cards older than the TTL are refused: the data they described may have moved. */
export function isExpired(action: StoredAction, messageCreatedAt: Date, now: Date, ttlMs: number): boolean {
    const proposed = action.proposedAt ? Date.parse(action.proposedAt) : messageCreatedAt.getTime();
    return !Number.isFinite(proposed) || now.getTime() - proposed > ttlMs;
}

export type SettleResult =
    | { kind: "not_pending" }
    | { kind: "expired" }
    | { kind: "cancelled" }
    | { kind: "claimed" };

/**
 * First half of a decision: refuse stale or already-settled cards, record a
 * cancel, or claim the card for execution. The caller runs the tool only on
 * "claimed", then saves "confirmed" or "failed".
 */
export async function settlePendingAction(params: {
    store: ActionStore;
    messageId: string;
    stored: StoredAction;
    decision: "confirm" | "cancel";
    messageCreatedAt: Date;
    now: Date;
    ttlMs: number;
}): Promise<SettleResult> {
    const { store, messageId, stored, now } = params;
    if (stored.state !== "pending") return { kind: "not_pending" };

    if (params.decision === "confirm" && isExpired(stored, params.messageCreatedAt, now, params.ttlMs)) {
        const ok = await store.claim(messageId, { ...stored, state: "expired", settledAt: now.toISOString() });
        return ok ? { kind: "expired" } : { kind: "not_pending" };
    }

    const next: StoredAction =
        params.decision === "cancel"
            ? { ...stored, state: "cancelled", settledAt: now.toISOString() }
            : { ...stored, state: "executing", settledAt: now.toISOString() };
    const ok = await store.claim(messageId, next);
    if (!ok) return { kind: "not_pending" };
    return params.decision === "cancel" ? { kind: "cancelled" } : { kind: "claimed" };
}
