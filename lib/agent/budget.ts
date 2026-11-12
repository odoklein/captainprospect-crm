/**
 * Run budgets: pure checks on cost, elapsed time and phase count.
 *
 * The worker calls `checkBudget` before every phase and `remainingMs` to clamp
 * the next model turn's deadline, so a run can never outlive its budget by
 * more than one bounded turn.
 */

import type { AgentJobKind, RunBudget, RunUsage } from "./types";

/** Defaults per kind; a job's `config.budget` overrides field by field. */
export const DEFAULT_BUDGETS: Record<AgentJobKind, RunBudget> = {
    WATCH: { maxToolCalls: 10, maxCostEur: 0.5, deadlineMs: 240_000, maxSafeWrites: 0, maxPhases: 2 },
    REPORT: { maxToolCalls: 40, maxCostEur: 3, deadlineMs: 900_000, maxSafeWrites: 2, maxPhases: 4 },
    MISSION: { maxToolCalls: 80, maxCostEur: 3, deadlineMs: 900_000, maxSafeWrites: 3, maxPhases: 8 },
    DIGEST: { maxToolCalls: 5, maxCostEur: 0.3, deadlineMs: 180_000, maxSafeWrites: 0, maxPhases: 1 },
};

/** Hard ceilings whatever the config says (a typo must not buy an hour or 100 €). */
const CEILINGS: RunBudget = { maxToolCalls: 200, maxCostEur: 20, deadlineMs: 3_600_000, maxSafeWrites: 10, maxPhases: 20 };

function clampInt(value: unknown, fallback: number, max: number): number {
    const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
    return Math.min(max, Math.max(0, n));
}

function clampNum(value: unknown, fallback: number, max: number): number {
    const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
    return Math.min(max, Math.max(0, n));
}

export function resolveBudget(kind: AgentJobKind, override?: Partial<RunBudget> | null): RunBudget {
    const base = DEFAULT_BUDGETS[kind];
    const o = override ?? {};
    return {
        maxToolCalls: clampInt(o.maxToolCalls, base.maxToolCalls, CEILINGS.maxToolCalls),
        maxCostEur: clampNum(o.maxCostEur, base.maxCostEur, CEILINGS.maxCostEur),
        deadlineMs: clampInt(o.deadlineMs, base.deadlineMs, CEILINGS.deadlineMs),
        maxSafeWrites: clampInt(o.maxSafeWrites, base.maxSafeWrites, CEILINGS.maxSafeWrites),
        maxPhases: clampInt(o.maxPhases, base.maxPhases, CEILINGS.maxPhases),
    };
}

/** Reads a stored `AgentRun.budget` JSON defensively. */
export function parseBudget(raw: unknown, kind: AgentJobKind): RunBudget {
    return resolveBudget(kind, raw && typeof raw === "object" ? (raw as Partial<RunBudget>) : null);
}

export function parseUsage(raw: unknown): RunUsage {
    const r = (raw && typeof raw === "object" ? raw : {}) as Partial<RunUsage>;
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    return { promptTokens: n(r.promptTokens), completionTokens: n(r.completionTokens), costEur: n(r.costEur), toolCalls: n(r.toolCalls), phases: n(r.phases) };
}

export type BudgetStop = "cost" | "deadline" | "phases" | "tool_calls";

export interface BudgetCheck {
    ok: boolean;
    stop: BudgetStop | null;
    /** French, for `AgentRun.error` / the timeline. */
    reason: string | null;
    remainingMs: number;
    remainingCostEur: number;
    remainingPhases: number;
}

export function remainingMs(budget: RunBudget, startedAt: Date, now: Date): number {
    return Math.max(0, budget.deadlineMs - (now.getTime() - startedAt.getTime()));
}

/**
 * Can one more phase start? Checked in this order: deadline (a dead run must
 * stop whatever it spent), cost, phases, tool calls.
 */
export function checkBudget(budget: RunBudget, usage: RunUsage, startedAt: Date, now: Date): BudgetCheck {
    const left = remainingMs(budget, startedAt, now);
    const base = {
        remainingMs: left,
        remainingCostEur: Math.max(0, budget.maxCostEur - usage.costEur),
        remainingPhases: Math.max(0, budget.maxPhases - usage.phases),
    };
    if (left <= 0) {
        return { ...base, ok: false, stop: "deadline", reason: `Délai de ${Math.round(budget.deadlineMs / 1000)} s dépassé.` };
    }
    if (usage.costEur >= budget.maxCostEur) {
        return { ...base, ok: false, stop: "cost", reason: `Budget de ${budget.maxCostEur.toFixed(2)} € atteint (${usage.costEur.toFixed(2)} € dépensés).` };
    }
    if (usage.phases >= budget.maxPhases) {
        return { ...base, ok: false, stop: "phases", reason: `Nombre maximal de phases atteint (${budget.maxPhases}).` };
    }
    if (usage.toolCalls >= budget.maxToolCalls) {
        return { ...base, ok: false, stop: "tool_calls", reason: `Nombre maximal d'appels d'outils atteint (${budget.maxToolCalls}).` };
    }
    return { ...base, ok: true, stop: null, reason: null };
}

/** The deadline the next model turn may use: its own plan, clamped to what the run has left. */
export function clampDeadline(planDeadlineMs: number, budget: RunBudget, startedAt: Date, now: Date, floorMs = 10_000): number {
    const left = remainingMs(budget, startedAt, now);
    return Math.max(floorMs, Math.min(planDeadlineMs, left));
}

export function addUsage(a: RunUsage, b: Partial<RunUsage>): RunUsage {
    const round6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
    return {
        promptTokens: a.promptTokens + (b.promptTokens ?? 0),
        completionTokens: a.completionTokens + (b.completionTokens ?? 0),
        costEur: round6(a.costEur + (b.costEur ?? 0)),
        toolCalls: a.toolCalls + (b.toolCalls ?? 0),
        phases: a.phases + (b.phases ?? 0),
    };
}
