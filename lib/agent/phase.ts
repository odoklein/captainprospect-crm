/**
 * One model phase of a run = one `runAgentTurn`, wrapped:
 *   - an AgentStep row (RUNNING → DONE/FAILED) with live `resultDigest`;
 *   - the plan's deadline clamped to what the run budget has left;
 *   - `onEvent` → heartbeat on the run + digest on the step;
 *   - the chat's evidence ledger, keyed on the AGENT thread, so a later turn
 *     of the same thread can cite what this one read;
 *   - `status: "action_proposed"` → an AgentProposal (PENDING, with the
 *     chat's TTL) and the phase returns. Nobody is there to click.
 */

import { randomUUID } from "node:crypto";
import { getActionTtlMs } from "@/lib/ai/agent/models";
import { runAgentTurn, type AgentTurnResult, type ChatTurn } from "@/lib/ai/agent/runtime";
import { EvidenceStoreUnavailable, prismaEvidenceStore, type EvidenceStore, type RunEndStatus } from "@/lib/ai/agent/evidence/store";
import type { StreamEvent } from "@/lib/ai/agent/protocol";
import type { AssistantContext } from "@/lib/ai/tools/types";
import { clampDeadline } from "./budget";
import { chatForTier } from "./providers";
import { heartbeat as queueHeartbeat } from "./queue";
import { createProposal, createStep, updateStep } from "./store";
import type { ClaimedRun, ModelTier, RunBudget, RunUsage } from "./types";

export const MAX_DIGEST_CHARS = 2000;
const HEARTBEAT_EVERY_MS = 10_000;

export interface PhaseInput {
    run: ClaimedRun;
    index: number;
    /** detect | plan | execute | synthesise | report */
    phase: string;
    title: string;
    tier: ModelTier;
    systemPrompt: string;
    history: ChatTurn[];
    ctx: AssistantContext;
    budget: RunBudget;
    usage: RunUsage;
    startedAt: Date;
    signal: AbortSignal;
    workerId: string;
    knownNames?: string[];
    now?: () => Date;
    /** Test seam: the chat function and evidence store to use instead of the real ones. */
    deps?: { chat?: ReturnType<typeof chatForTier>; store?: EvidenceStore | null };
}

export interface PhaseResult {
    stepId: string;
    result: AgentTurnResult;
    proposalId: string | null;
    /** What this phase added to the run's usage. */
    usage: Partial<RunUsage>;
    digest: string;
}

function runStatus(result: AgentTurnResult): RunEndStatus {
    if (result.status === "timeout") return "TIMEOUT";
    if (result.status === "cancelled") return "CANCELLED";
    if (result.status === "failed") return "FAILED";
    return "COMPLETED";
}

function trim(text: string, max = MAX_DIGEST_CHARS): string {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export async function runPhase(input: PhaseInput): Promise<PhaseResult> {
    const now = input.now ?? (() => new Date());
    const startedAt = now();
    const stepId = await createStep({ runId: input.run.id, index: input.index, phase: input.phase, title: input.title, now: startedAt });

    const provider = input.deps?.chat ?? chatForTier(input.tier);
    const plan = {
        ...provider.plan,
        deadlineMs: clampDeadline(provider.plan.deadlineMs, input.budget, input.startedAt, startedAt),
        toolCalls: Math.max(0, Math.min(provider.plan.toolCalls, input.budget.maxToolCalls - input.usage.toolCalls)),
    };

    // Evidence ledger on the AGENT thread (the chat's own store), when the thread exists.
    const turnRunId = randomUUID();
    let store: EvidenceStore | null = input.deps?.store !== undefined ? input.deps.store : input.run.conversationId ? prismaEvidenceStore : null;
    if (store && input.run.conversationId) {
        try {
            const started = await store.startRun({
                id: turnRunId,
                conversationId: input.run.conversationId,
                userId: input.ctx.userId,
                clientId: input.ctx.project?.clientId ?? null,
                missionId: input.ctx.project?.missionId ?? null,
                model: plan.model,
                staleBefore: new Date(startedAt.getTime() - plan.deadlineMs - 60_000),
            });
            if (started === "busy") store = null; // a chat turn holds the thread: run unlocked, evidence in memory only
        } catch (error) {
            if (!(error instanceof EvidenceStoreUnavailable)) throw error;
            store = null;
        }
    }

    const lines: string[] = [];
    let lastBeat = Date.now();
    let digestDirty = false;
    const digestNow = () => trim(lines.join("\n"));
    const beat = () => {
        lastBeat = Date.now();
        void queueHeartbeat(input.run.id, input.workerId, now()).catch(() => undefined);
        if (digestDirty) {
            digestDirty = false;
            void updateStep(stepId, { resultDigest: digestNow() }).catch(() => undefined);
        }
    };
    const onEvent = (event: StreamEvent) => {
        if (event.type === "tool_end") {
            lines.push(`${event.label} ${event.ok ? "✓" : `✗ ${event.errorCode ?? ""}`.trim()}${event.evidence ? ` [${event.evidence}]` : ""} ${event.durationMs} ms`);
            digestDirty = true;
        } else if (event.type === "retry") {
            lines.push(`nouvelle tentative ${event.attempt} dans ${event.delayMs} ms`);
            digestDirty = true;
        }
        if (Date.now() - lastBeat >= HEARTBEAT_EVERY_MS) beat();
    };

    let result: AgentTurnResult;
    try {
        result = await runAgentTurn(
            {
                systemPrompt: input.systemPrompt,
                history: input.history,
                ctx: input.ctx,
                config: provider.config,
                plan,
                signal: input.signal,
                runId: turnRunId,
                onEvent,
                knownNames: input.knownNames,
            },
            { chat: provider.chat, store, now },
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await updateStep(stepId, { status: "FAILED", error: message.slice(0, 1000), resultDigest: digestNow(), finishedAt: now(), durationMs: Date.now() - startedAt.getTime() }).catch(() => undefined);
        throw error;
    }

    if (store) {
        try {
            await store.finishRun(turnRunId, {
                status: runStatus(result),
                model: result.model,
                fallbackUsed: result.fallbackUsed,
                promptTokens: result.usage.promptTokens,
                completionTokens: result.usage.completionTokens,
                costEur: result.usage.costEur,
                latencyMs: result.latencyMs,
                firstTokenMs: result.firstTokenMs,
                iterations: result.iterations,
                toolCalls: result.toolCalls,
                retries: result.retries,
                errorCode: result.error?.code ?? null,
                verification: result.verification,
                messageId: null,
            });
        } catch (error) {
            console.warn("[agent.phase] evidence run not finalised", error instanceof Error ? error.message : error);
        }
    }

    let proposalId: string | null = null;
    if (result.status === "action_proposed" && result.proposedAction) {
        proposalId = await createProposal({
            runId: input.run.id,
            tool: result.proposedAction.tool,
            args: result.proposedAction.args,
            card: result.proposedAction.card,
            rationale: result.answer || null,
            risk: "confirm",
            expiresAt: new Date(now().getTime() + getActionTtlMs()),
        });
        lines.push(`proposition enregistrée : ${result.proposedAction.tool}`);
    }

    const ok = result.status === "complete" || result.status === "partial" || result.status === "action_proposed";
    if (result.answer) lines.push("", trim(result.answer, 600));
    const digest = digestNow();
    await updateStep(stepId, {
        status: ok ? "DONE" : "FAILED",
        assistantRunId: store ? turnRunId : null,
        resultDigest: digest,
        evidenceLabels: result.citations.map((c) => c.label),
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        costEur: result.usage.costEur,
        model: result.model,
        durationMs: result.latencyMs,
        error: ok ? null : (result.error?.message ?? result.status).slice(0, 1000),
        finishedAt: now(),
    });

    return {
        stepId,
        result,
        proposalId,
        usage: {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            costEur: result.usage.costEur,
            toolCalls: result.toolCalls,
            phases: 1,
        },
        digest,
    };
}
