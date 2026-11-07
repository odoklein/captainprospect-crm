/**
 * Deciding an agent proposal — the only path from "the agent wanted to" to
 * "it happened".
 *
 *   1. claim: compare-and-set PENDING → EXECUTING / REJECTED / EXPIRED through
 *      the chat's own `settlePendingAction` (lib/ai/agent/actions.ts) with the
 *      proposal store: of two clicks exactly one wins, the other reads
 *      "not_pending". Past `expiresAt` an approval answers "expired" (410).
 *   2. execute under the APPROVER's context: `buildAssistantContext` in chat
 *      mode (never background) on the run's scope, `authorizeToolCall`
 *      re-validates role, permissions, project and arguments now, then
 *      `tool.execute`. The proposal's stored args are the subject, the click
 *      is the authorisation.
 *   3. audit: AssistantActionLog (confirmed: true) → EXECUTED with its
 *      actionLogId, or FAILED with the error as outcome. A secret returned by
 *      the tool goes back to the caller once and is never stored.
 *   4. the run's actor is notified when someone else decided; when nothing is
 *      PENDING any more the run leaves WAITING_APPROVAL for DONE.
 *
 * Any active MANAGER may decide (the route enforces the role).
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { createPrismaProposalStore, settlePendingAction, type ActionStore, type StoredAction } from "@/lib/ai/agent/actions";
import { buildAssistantContext } from "@/lib/ai/tools/context";
import { authorizeToolCall } from "@/lib/ai/tools/guard";
import type { AnyToolDefinition, AssistantContext, WriteOutcome } from "@/lib/ai/tools/types";
import { createNotification } from "@/lib/notifications";
import { runLink } from "./notify";
import { withStore } from "./store";
import { resolveAgentTool } from "./tools/resolve";

export interface ProposalRun {
    id: string;
    actorId: string;
    status: string;
    clientId: string | null;
    missionId: string | null;
    folderId: string | null;
    conversationId: string | null;
}

export interface ProposalRow {
    id: string;
    runId: string;
    tool: string;
    args: unknown;
    card: unknown;
    risk: string;
    state: "PENDING" | "EXECUTING" | "APPROVED" | "REJECTED" | "EXECUTED" | "EXPIRED" | "FAILED";
    proposedAt: Date;
    expiresAt: Date;
    run: ProposalRun;
}

export type DecideKind = "not_found" | "not_pending" | "expired" | "rejected" | "executed" | "failed";

export interface DecideResult {
    kind: DecideKind;
    proposalId: string;
    /** reveal_password-like tools: shown once by the caller, never stored. */
    secret?: WriteOutcome["secret"];
    message?: string;
    error?: string;
}

export interface DecideDeps {
    load: (proposalId: string) => Promise<ProposalRow | null>;
    store: (params: { approverId: string; actionLogId: () => string | null }) => ActionStore;
    buildContext: (params: { userId: string; clientId: string | null; missionId: string | null; conversationId: string | null; folderId: string | null }) => Promise<AssistantContext>;
    resolveTool: (name: string) => AnyToolDefinition | undefined;
    logAction: (params: { ctx: AssistantContext; tool: string; args: unknown; outcome: string; ok: boolean }) => Promise<string | null>;
    notify: (params: { userId: string; title: string; message: string; type: "success" | "warning" | "error" | "info"; link: string }) => Promise<void>;
    settleRun: (runId: string) => Promise<void>;
    userName: (userId: string) => Promise<string>;
    now: () => Date;
}

const PROPOSAL_SELECT = {
    id: true,
    runId: true,
    tool: true,
    args: true,
    card: true,
    risk: true,
    state: true,
    proposedAt: true,
    expiresAt: true,
    run: { select: { id: true, actorId: true, status: true, clientId: true, missionId: true, folderId: true, conversationId: true } },
} as const;

/** WAITING_APPROVAL → DONE once no proposal of the run is PENDING or EXECUTING. */
export async function settleRunIfDecided(runId: string): Promise<void> {
    await withStore(() =>
        prisma.agentRun.updateMany({
            where: { id: runId, status: "WAITING_APPROVAL", proposals: { none: { state: { in: ["PENDING", "EXECUTING"] } } } },
            data: { status: "DONE" },
        }),
    );
}

/** Marks PENDING proposals past their expiry EXPIRED and settles their runs. Cheap; called by the overview. */
export async function expireStaleProposals(now = new Date()): Promise<number> {
    const stale = await withStore(() => prisma.agentProposal.findMany({ where: { state: "PENDING", expiresAt: { lt: now } }, select: { id: true, runId: true }, take: 200 }));
    if (stale.length === 0) return 0;
    const { count } = await withStore(() =>
        prisma.agentProposal.updateMany({ where: { id: { in: stale.map((s) => s.id) }, state: "PENDING" }, data: { state: "EXPIRED", decidedAt: now, outcome: "Expirée sans décision." } }),
    );
    for (const runId of new Set(stale.map((s) => s.runId))) await settleRunIfDecided(runId).catch(() => undefined);
    return count;
}

export const prismaDecideDeps: DecideDeps = {
    load: (id) => withStore(() => prisma.agentProposal.findUnique({ where: { id }, select: PROPOSAL_SELECT })) as Promise<ProposalRow | null>,
    store: ({ approverId, actionLogId }) => createPrismaProposalStore({ decidedById: approverId, actionLogId }),
    buildContext: (p) => buildAssistantContext({ userId: p.userId, clientId: p.clientId, missionId: p.missionId, conversationId: p.conversationId, folderId: p.folderId }),
    resolveTool: resolveAgentTool,
    logAction: async ({ ctx, tool, args, outcome, ok }) => {
        try {
            const row = await prisma.assistantActionLog.create({
                data: {
                    tool,
                    // Ids and flags only — never a secret (the tool's message is the outcome).
                    args: (args ?? {}) as Prisma.InputJsonValue,
                    outcome: outcome.slice(0, 1000),
                    confirmed: true,
                    ok,
                    actorId: ctx.userId,
                    clientId: ctx.project?.clientId ?? null,
                    missionId: ctx.project?.missionId ?? null,
                    conversationId: ctx.conversationId ?? null,
                },
                select: { id: true },
            });
            return row.id;
        } catch (error) {
            console.error("[agent.proposals] action log write failed", tool, error);
            return null;
        }
    },
    notify: async (p) => {
        await createNotification(p);
    },
    settleRun: settleRunIfDecided,
    userName: async (id) => (await prisma.user.findUnique({ where: { id }, select: { name: true } }))?.name ?? "un manager",
    now: () => new Date(),
};

function cardTitle(card: unknown, fallback: string): string {
    const t = card && typeof card === "object" ? (card as { title?: unknown }).title : null;
    return typeof t === "string" && t.trim() ? t : fallback;
}

export function cardIsDanger(card: unknown): boolean {
    return !!(card && typeof card === "object" && (card as { danger?: unknown }).danger === true);
}

async function notifyActor(deps: DecideDeps, row: ProposalRow, approverId: string, verb: string, type: "success" | "warning" | "error" | "info", detail: string) {
    if (row.run.actorId === approverId) return;
    try {
        const name = await deps.userName(approverId);
        await deps.notify({
            userId: row.run.actorId,
            title: `[Agent] ${cardTitle(row.card, row.tool)} : ${verb} par ${name}`.slice(0, 120),
            message: detail.slice(0, 300),
            type,
            link: runLink(row.runId),
        });
    } catch (error) {
        console.warn("[agent.proposals] actor not notified", error instanceof Error ? error.message : error);
    }
}

export async function decideProposal(
    params: { proposalId: string; decision: "approve" | "reject"; approver: string },
    deps: DecideDeps = prismaDecideDeps,
): Promise<DecideResult> {
    const row = await deps.load(params.proposalId);
    if (!row) return { kind: "not_found", proposalId: params.proposalId };

    const now = deps.now();
    const stored: StoredAction = {
        tool: row.tool,
        args: (row.args && typeof row.args === "object" ? row.args : {}) as Record<string, unknown>,
        card: row.card,
        state: row.state === "PENDING" ? "pending" : "executing",
        proposedAt: row.proposedAt.toISOString(),
    };
    let actionLogId: string | null = null;
    const store = deps.store({ approverId: params.approver, actionLogId: () => actionLogId });

    const settled = await settlePendingAction({
        store,
        messageId: row.id,
        stored,
        decision: params.decision === "approve" ? "confirm" : "cancel",
        messageCreatedAt: row.proposedAt,
        now,
        ttlMs: Math.max(0, row.expiresAt.getTime() - row.proposedAt.getTime()),
    });

    if (settled.kind === "not_pending") return { kind: "not_pending", proposalId: row.id };
    if (settled.kind === "expired") {
        await deps.settleRun(row.runId).catch(() => undefined);
        return { kind: "expired", proposalId: row.id };
    }
    if (settled.kind === "cancelled") {
        await notifyActor(deps, row, params.approver, "refusée", "info", "La proposition a été refusée : rien n'a été exécuté.");
        await deps.settleRun(row.runId).catch(() => undefined);
        return { kind: "rejected", proposalId: row.id };
    }

    // Claimed: this call alone executes. Identity, permissions and project are resolved now.
    const fail = async (detail: string, ctx: AssistantContext | null): Promise<DecideResult> => {
        if (ctx) actionLogId = await deps.logAction({ ctx, tool: row.tool, args: stored.args, outcome: detail, ok: false });
        await store.save(row.id, { ...stored, state: "failed", outcome: detail, settledAt: deps.now().toISOString() });
        await notifyActor(deps, row, params.approver, "en échec", "error", detail);
        await deps.settleRun(row.runId).catch(() => undefined);
        return { kind: "failed", proposalId: row.id, error: detail };
    };

    const tool = deps.resolveTool(row.tool);
    const expectedRisk = row.risk === "safe_write" ? "safe_write" : "confirm";
    if (!tool || tool.risk !== expectedRisk) return fail("Action non autorisée : outil inconnu ou de nature différente de la proposition.", null);

    let ctx: AssistantContext;
    try {
        ctx = await deps.buildContext({ userId: params.approver, clientId: row.run.clientId, missionId: row.run.missionId, conversationId: row.run.conversationId, folderId: row.run.folderId });
    } catch (error) {
        return fail(error instanceof Error ? error.message : "Contexte introuvable", null);
    }
    if (ctx.mode === "background") ctx = { ...ctx, mode: "chat" }; // a click is a chat-mode decision, always

    let outcome: WriteOutcome;
    try {
        const args = authorizeToolCall(tool, tool.name, stored.args, ctx);
        outcome = (await tool.execute(args, ctx)) as WriteOutcome;
    } catch (error) {
        return fail(error instanceof Error ? error.message : "L'action a échoué", ctx);
    }

    const message = typeof outcome?.message === "string" ? outcome.message : "Action exécutée.";
    actionLogId = await deps.logAction({ ctx, tool: tool.name, args: stored.args, outcome: message, ok: true });
    await store.save(row.id, { ...stored, state: "confirmed", outcome: message, settledAt: deps.now().toISOString() });
    await notifyActor(deps, row, params.approver, "approuvée", "success", message);
    await deps.settleRun(row.runId).catch(() => undefined);
    return { kind: "executed", proposalId: row.id, message, secret: outcome?.secret ?? null };
}

export interface BatchItemResult {
    id: string;
    result: DecideResult | null;
    /** Set when the batch stopped before this item. */
    skipped?: string;
}

/**
 * Sequential, in the given order. A failure on a `danger` card stops the
 * batch: the remaining items stay PENDING for a look.
 */
export async function decideBatch(
    params: { ids: string[]; decision: "approve" | "reject"; approver: string },
    deps: DecideDeps = prismaDecideDeps,
): Promise<BatchItemResult[]> {
    const out: BatchItemResult[] = [];
    let stopped: string | null = null;
    for (const id of [...new Set(params.ids)]) {
        if (stopped) {
            out.push({ id, result: null, skipped: stopped });
            continue;
        }
        const row = await deps.load(id);
        const result = await decideProposal({ proposalId: id, decision: params.decision, approver: params.approver }, deps);
        out.push({ id, result });
        if (result.kind === "failed" && row && cardIsDanger(row.card)) {
            stopped = "Lot interrompu : une action sensible a échoué juste avant.";
        }
    }
    return out;
}
