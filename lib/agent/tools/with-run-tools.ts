/**
 * Run-scoped tools: tools that only make sense inside one agent run
 * (`get_report_dataset`, `propose_action`, `record_finding`).
 *
 * They are plain registry tools guarded by a synthetic permission,
 * `AGENT_RUN_PERMISSION`, that no user ever holds in the database. The chat's
 * context therefore never lists them (`listAccessibleTools` filters on
 * permissions) and the guard refuses them if a model names one anyway.
 * `withRunTools(ctx, scope)` adds that permission to the run's context and
 * binds the run's scope (run id, dataset, proposal and finding sinks) to the
 * context object itself, through a WeakMap: a tool's `execute(args, ctx)`
 * finds its run without any global state, and two concurrent runs in the same
 * worker never see each other's scope.
 *
 * Nothing here imports the tool registry: the registry imports the tools,
 * and the tools import this file.
 */

import type { AssistantContext, AnyToolDefinition, PendingActionCard } from "@/lib/ai/tools/types";
import { ToolAuthorizationError } from "@/lib/ai/tools/types";
import type { AgentSeverity } from "../types";

/** Held by no user: only `withRunTools` puts it on a context. */
export const AGENT_RUN_PERMISSION = "agent.run_scope";

export interface ProposalInput {
    tool: string;
    args: Record<string, unknown>;
    card: PendingActionCard;
    rationale: string | null;
    risk: "confirm" | "safe_write";
}

export interface FindingInput {
    key: string;
    severity: AgentSeverity;
    kind: string;
    title: string;
    body: string;
    metrics: Record<string, number | string | null> | null;
    clientId: string | null;
    missionId: string | null;
    subjectUserId: string | null;
}

export interface RunToolScope {
    runId: string;
    clientId: string | null;
    missionId: string | null;
    /** Resolves a tool by name (registry first, then the agent-local tools). */
    resolveTool: (name: string) => AnyToolDefinition | undefined;
    /** Inserts a PENDING AgentProposal; returns its id and its rank in the run (1-based). */
    createProposal: (input: ProposalInput) => Promise<{ id: string; number: number }>;
    /** Upserts an AgentFinding by key; returns its id and whether it is new. */
    recordFinding: (input: FindingInput) => Promise<{ id: string; created: boolean }>;
    /** REPORT runs: the collected dataset `get_report_dataset` returns. */
    dataset?: unknown;
}

const SCOPES = new WeakMap<AssistantContext, RunToolScope>();

/**
 * Binds the run's scope to this context and grants the run-scope permission.
 * Mutates and returns the same object so the executor's budget decrements
 * (`ctx.autoWriteBudget -= 1`) stay visible to the run.
 */
export function withRunTools(ctx: AssistantContext, scope: RunToolScope): AssistantContext {
    if (!ctx.permissions.includes(AGENT_RUN_PERMISSION)) ctx.permissions = [...ctx.permissions, AGENT_RUN_PERMISSION];
    SCOPES.set(ctx, scope);
    return ctx;
}

/** A narrowed copy of a run context (another allowlist) that keeps the run's scope. */
export function deriveRunContext(ctx: AssistantContext, patch: Partial<AssistantContext>): AssistantContext {
    const copy: AssistantContext = { ...ctx, ...patch };
    const scope = SCOPES.get(ctx);
    if (scope) SCOPES.set(copy, scope);
    return copy;
}

export function findRunScope(ctx: AssistantContext): RunToolScope | null {
    return SCOPES.get(ctx) ?? null;
}

/** The run's scope, or a refusal the model can read. */
export function getRunScope(ctx: AssistantContext): RunToolScope {
    const scope = SCOPES.get(ctx);
    if (!scope) {
        throw new ToolAuthorizationError("Cet outil n'existe que dans une tâche de l'agent.", "not_in_agent_run");
    }
    return scope;
}
