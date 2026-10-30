/**
 * Executes one claimed run end to end: playbook lookup, config, context,
 * heartbeat, the playbook itself, then the final status. Shared by the worker
 * (`worker/agent.ts`), lite mode (`/api/cron/agent-tick`) and the CLI.
 *
 * Final status: FAILED on an error, WAITING_APPROVAL when a proposal is
 * pending, DONE otherwise. A drain (signal aborted while running) requeues
 * the run with its checkpoint instead of failing it.
 */

import type { AgentRunStatus } from "@prisma/client";
import { getLicense } from "@/lib/license/server";
import { isFeatureEnabled, isSuspended } from "@/lib/license/resolve";
import { resolveBudget } from "./budget";
import { buildRunContext } from "./context";
import { getPlaybook } from "./playbooks/registry";
import { heartbeat } from "./queue";
import { AgentStoreUnavailable, agentEnabled, countPendingProposals, finishRun, getJob, recordJobOutcome, requeueRun } from "./store";
import type { BaseJobConfig, ClaimedRun, PlaybookOutcome, PlaybookRunContext, RunBudget, RunMode } from "./types";

export type Logger = (event: string, data?: Record<string, unknown>) => void;

export const jsonLog: Logger = (event, data = {}) => {
    console.log(JSON.stringify({ at: new Date().toISOString(), event, ...data }));
};

export interface ExecuteOptions {
    workerId: string;
    mode: RunMode;
    signal: AbortSignal;
    log?: Logger;
    /** Lite mode: a hard cap on the run's deadline (the HTTP request must end). */
    deadlineMs?: number;
    heartbeatMs?: number;
    now?: () => Date;
}

export interface ExecuteResult {
    status: AgentRunStatus;
    outcome: PlaybookOutcome | null;
    error: string | null;
}

/** Whether the agent may run at all right now (kill switch + licence). */
export async function agentAllowed(): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (!(await agentEnabled())) return { ok: false, reason: "agent.enabled = false (interrupteur SystemConfig)" };
    const license = await getLicense();
    if (isSuspended(license)) return { ok: false, reason: "instance suspendue (licence)" };
    if (!isFeatureEnabled(license, "agent")) return { ok: false, reason: "fonctionnalité « agent » désactivée par la licence" };
    return { ok: true };
}

export async function executeRun(run: ClaimedRun, options: ExecuteOptions): Promise<ExecuteResult> {
    const log = options.log ?? jsonLog;
    const now = options.now ?? (() => new Date());
    const startedAt = run.startedAt ?? now();
    run.startedAt = startedAt;
    run.mode = options.mode;

    const abort = new AbortController();
    const onOuterAbort = () => abort.abort(options.signal.reason ?? new Error("drain"));
    if (options.signal.aborted) onOuterAbort();
    else options.signal.addEventListener("abort", onOuterAbort, { once: true });

    // Heartbeat: if the run was reaped or cancelled under us, stop.
    const beat = setInterval(() => {
        void heartbeat(run.id, options.workerId, now())
            .then((alive) => {
                if (!alive && !abort.signal.aborted) {
                    log("agent.lost", { runId: run.id, reason: "heartbeat refused (reaped or cancelled)" });
                    abort.abort(new Error("lost"));
                }
            })
            .catch(() => undefined);
    }, options.heartbeatMs ?? 15_000);

    let outcome: PlaybookOutcome | null = null;
    let error: string | null = null;
    let status: AgentRunStatus = "FAILED";

    try {
        const playbook = getPlaybook(run.playbook);
        if (!playbook) throw new Error(`Playbook inconnu : ${run.playbook}`);

        const job = run.jobId ? await getJob(run.jobId) : null;
        const parsed = playbook.configSchema.safeParse(job?.config ?? {});
        const config: BaseJobConfig = parsed.success ? parsed.data : {};
        if (!parsed.success) log("agent.config.invalid", { runId: run.id, issues: parsed.error.issues.map((i) => i.message).slice(0, 5) });
        config.jobName = job?.name ?? playbook.label;

        let budget: RunBudget = resolveBudget(run.kind, { ...playbook.budget, ...run.budget, ...config.budget });
        if (options.deadlineMs) budget = { ...budget, deadlineMs: Math.min(budget.deadlineMs, options.deadlineMs) };
        run.budget = budget;

        const ctx = await buildRunContext(run, { budget, toolAllowlist: playbook.toolAllowlist, dryRun: config.dryRun });

        const pctx: PlaybookRunContext = { run, config, budget, ctx, now, signal: abort.signal, mode: options.mode, workerId: options.workerId, log };
        log("agent.start", { runId: run.id, playbook: run.playbook, mode: options.mode, actorId: run.actorId, attempt: run.attempts });
        outcome = await playbook.run(pctx);

        if (abort.signal.aborted && options.signal.aborted) {
            status = "QUEUED";
        } else if (outcome.error) {
            status = "FAILED";
            error = outcome.error;
        } else {
            const pending = await countPendingProposals(run.id);
            status = pending > 0 ? "WAITING_APPROVAL" : "DONE";
        }
    } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        status = options.signal.aborted ? "QUEUED" : "FAILED";
        if (!(err instanceof AgentStoreUnavailable)) log("agent.error", { runId: run.id, error });
    } finally {
        clearInterval(beat);
        options.signal.removeEventListener("abort", onOuterAbort);
    }

    const finishedAt = now();
    try {
        if (status === "QUEUED") {
            await requeueRun(run.id, { phase: "interrupted", at: finishedAt.toISOString(), ...(outcome ? { summary: outcome.summary } : {}) }, "Arrêt du worker pendant l'exécution : relancé.", finishedAt);
        } else {
            await finishRun(
                run.id,
                {
                    status,
                    summary: outcome?.summary ?? null,
                    error,
                    usage: outcome?.usage ?? run.usage,
                    findingsCount: outcome?.findingsCount ?? 0,
                    proposalsCount: outcome?.proposalsCount ?? 0,
                    stepsCount: run.usage.phases,
                },
                finishedAt,
            );
            if (run.jobId) await recordJobOutcome(run.jobId, status, finishedAt).catch(() => undefined);
        }
    } catch (err) {
        log("agent.finish.failed", { runId: run.id, error: err instanceof Error ? err.message : String(err) });
    }

    log("agent.finish", {
        runId: run.id,
        playbook: run.playbook,
        status,
        costEur: outcome?.usage.costEur ?? 0,
        findings: outcome?.findingsCount ?? 0,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        ...(error ? { error } : {}),
    });
    return { status, outcome, error };
}
