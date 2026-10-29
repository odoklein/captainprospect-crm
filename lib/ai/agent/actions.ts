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

/**
 * The same compare-and-set for Captain Agent proposals (`AgentProposal`):
 * the "message id" is the proposal id, the card state maps onto the
 * proposal's own enum, and the claim is `state = PENDING` re-checked by
 * Postgres under the row lock. `decidedById` stamps who clicked.
 *
 *   executing → EXECUTING · cancelled → REJECTED · expired → EXPIRED
 *   confirmed → EXECUTED  · failed    → FAILED
 *
 * `save` never writes a secret: only `outcome` (the tool's message) is kept.
 */
const PROPOSAL_STATE: Record<ActionState, "PENDING" | "EXECUTING" | "REJECTED" | "EXECUTED" | "EXPIRED" | "FAILED"> = {
    pending: "PENDING",
    executing: "EXECUTING",
    cancelled: "REJECTED",
    expired: "EXPIRED",
    confirmed: "EXECUTED",
    failed: "FAILED",
};

export function createPrismaProposalStore(options: { decidedById?: string | null; actionLogId?: () => string | null } = {}): ActionStore {
    return {
        async claim(proposalId, next) {
            const at = next.settledAt ? new Date(next.settledAt) : new Date();
            const { count } = await prisma.agentProposal.updateMany({
                where: { id: proposalId, state: "PENDING" },
                data: {
                    state: PROPOSAL_STATE[next.state],
                    decidedAt: at,
                    ...(options.decidedById ? { decidedById: options.decidedById } : {}),
                    ...(next.outcome !== undefined ? { outcome: next.outcome.slice(0, 2000) } : {}),
                },
            });
            return count === 1;
        },
        async save(proposalId, next) {
            const at = next.settledAt ? new Date(next.settledAt) : new Date();
            const actionLogId = options.actionLogId?.() ?? null;
            await prisma.agentProposal.update({
                where: { id: proposalId },
                data: {
                    state: PROPOSAL_STATE[next.state],
                    outcome: next.outcome !== undefined ? next.outcome.slice(0, 2000) : undefined,
                    ...(next.state === "confirmed" ? { executedAt: at } : {}),
                    ...(actionLogId ? { actionLogId } : {}),
                },
                select: { id: true },
            });
        },
    };
}

/** Proposal store without an approver stamp (expiry sweeps, scripts). */
export const prismaProposalStore: ActionStore = createPrismaProposalStore();

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
