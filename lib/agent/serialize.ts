/**
 * Prisma rows → the wire items of lib/assistant/api-contract.ts ("Agent").
 * Pure: names (clients, users, jobs) are resolved by the caller and passed in
 * maps, so a list costs a fixed number of queries.
 */

import type {
    AgentFindingItem,
    AgentJobItem,
    AgentProposalItem,
    AgentRunCard,
    AgentRunDetail,
    AgentRunStatus,
    AgentStepItem,
} from "@/lib/assistant/api-contract";
import { parseUsage } from "./budget";
import { parseCron } from "./cron";

// ── schedule labels ──────────────────────────────────────────────────────────

const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

function two(n: number): string {
    return String(n).padStart(2, "0");
}

function joinFr(items: string[]): string {
    if (items.length <= 1) return items.join("");
    return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

function sorted(set: Set<number>): number[] {
    return [...set].sort((a, b) => a - b);
}

/** Consecutive run of days (Monday-first order), e.g. [1..5]. */
function asRange(days: number[]): [number, number] | null {
    if (days.length < 3) return null;
    const order = days.map((d) => (d === 0 ? 7 : d)).sort((a, b) => a - b);
    for (let i = 1; i < order.length; i++) if (order[i] !== order[i - 1] + 1) return null;
    return [order[0] % 7, order[order.length - 1] % 7];
}

/**
 * French rendering of a five-field cron, or null for what it cannot say
 * simply (the raw expression is still shown by the UI).
 *   "0 8 * * 1"      → « Chaque lundi à 08:00 »
 *   "30 7 * * 1-5"   → « Du lundi au vendredi à 07:30 »
 *   "0 11,15 * * 1-5"→ « Du lundi au vendredi à 11:00 et 15:00 »
 *   "0 9 * * *"      → « Tous les jours à 09:00 »
 *   "0 14 1 * *"     → « Le 1 de chaque mois à 14:00 »
 *   "*\/15 * * * *"  → « Toutes les 15 minutes »
 */
export function scheduleLabel(expression: string | null | undefined): string | null {
    if (!expression) return null;
    const raw = expression.trim().split(/\s+/);
    if (raw.length !== 5) return null;
    let fields;
    try {
        fields = parseCron(expression);
    } catch {
        return null;
    }
    const [minRaw, hourRaw] = raw;

    const step = /^\*\/(\d+)$/.exec(minRaw);
    if (step && hourRaw === "*" && fields.anyDayOfMonth && fields.anyDayOfWeek && fields.month.size === 12) {
        return Number(step[1]) === 1 ? "Toutes les minutes" : `Toutes les ${Number(step[1])} minutes`;
    }
    if (minRaw === "0" && hourRaw === "*" && fields.anyDayOfMonth && fields.anyDayOfWeek && fields.month.size === 12) return "Toutes les heures";

    const minutes = sorted(fields.minute);
    const hours = sorted(fields.hour);
    if (minutes.length !== 1 || hours.length > 6 || fields.month.size !== 12) return null;
    const times = joinFr(hours.map((h) => `${two(h)}:${two(minutes[0])}`));

    if (fields.anyDayOfMonth && fields.anyDayOfWeek) return `Tous les jours à ${times}`;
    if (fields.anyDayOfMonth) {
        const days = sorted(fields.dayOfWeek);
        if (days.length === 7) return `Tous les jours à ${times}`;
        if (days.length === 1) return `Chaque ${DAYS[days[0]]} à ${times}`;
        const range = asRange(days);
        if (range) return `Du ${DAYS[range[0]]} au ${DAYS[range[1]]} à ${times}`;
        const mondayFirst = days.map((d) => (d === 0 ? 7 : d)).sort((a, b) => a - b).map((d) => DAYS[d % 7]);
        return `Le ${joinFr(mondayFirst)} à ${times}`;
    }
    if (fields.anyDayOfWeek) {
        const dom = sorted(fields.dayOfMonth);
        if (dom.length === 1) return `Le ${dom[0]} de chaque mois à ${times}`;
        if (dom.length <= 4) return `Les ${joinFr(dom.map(String))} de chaque mois à ${times}`;
    }
    return null;
}

// ── rows ─────────────────────────────────────────────────────────────────────

const iso = (d: Date | null | undefined): string | null => (d ? new Date(d).toISOString() : null);

function asRecord(v: unknown): Record<string, unknown> {
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export interface JobRow {
    id: string;
    kind: AgentJobItem["kind"];
    playbook: string;
    name: string;
    enabled: boolean;
    folderId: string | null;
    clientId: string | null;
    schedule: string | null;
    timezone: string;
    config: unknown;
    lastRunAt: Date | null;
    nextRunAt: Date | null;
    lastStatus: AgentRunStatus | null;
    failures: number;
}

export function toJobItem(row: JobRow, names: { playbookLabel: string | null; clientName: string | null }): AgentJobItem {
    return {
        id: row.id,
        kind: row.kind,
        playbook: row.playbook,
        playbookLabel: names.playbookLabel ?? row.playbook,
        name: row.name,
        enabled: row.enabled,
        folderId: row.folderId,
        clientId: row.clientId,
        clientName: names.clientName,
        schedule: row.schedule,
        scheduleLabel: scheduleLabel(row.schedule),
        timezone: row.timezone,
        config: asRecord(row.config),
        lastRunAt: iso(row.lastRunAt),
        nextRunAt: iso(row.nextRunAt),
        lastStatus: row.lastStatus,
        failures: row.failures,
    };
}

export interface RunRow {
    id: string;
    jobId: string | null;
    kind: AgentRunCard["kind"];
    playbook: string;
    trigger: AgentRunCard["trigger"];
    status: AgentRunStatus;
    goal: string | null;
    summary: string | null;
    folderId: string | null;
    clientId: string | null;
    conversationId: string | null;
    findingsCount: number;
    proposalsCount: number;
    usage: unknown;
    mode: string;
    error: string | null;
    actorId: string;
    cancelRequestedAt: Date | null;
    createdAt: Date;
    startedAt: Date | null;
    finishedAt: Date | null;
}

/**
 * A run that was asked to stop and then finished reads CANCELLED, whatever
 * status the executor wrote (it does not know about cancellation requests).
 */
export function effectiveRunStatus(row: Pick<RunRow, "status" | "cancelRequestedAt" | "finishedAt">): AgentRunStatus {
    if (row.cancelRequestedAt && row.finishedAt && (row.status === "DONE" || row.status === "FAILED")) return "CANCELLED";
    return row.status;
}

export function toRunCard(row: RunRow, names: { jobName: string | null; clientName: string | null; actorName: string | null; pendingProposals: number }): AgentRunCard {
    return {
        id: row.id,
        jobId: row.jobId,
        jobName: names.jobName,
        kind: row.kind,
        playbook: row.playbook,
        trigger: row.trigger,
        status: effectiveRunStatus(row),
        goal: row.goal,
        summary: row.summary,
        folderId: row.folderId,
        clientId: row.clientId,
        clientName: names.clientName,
        conversationId: row.conversationId,
        findingsCount: row.findingsCount,
        proposalsCount: row.proposalsCount,
        pendingProposals: names.pendingProposals,
        costEur: Math.round(parseUsage(row.usage).costEur * 10_000) / 10_000,
        mode: row.mode,
        error: row.error,
        actorName: names.actorName,
        createdAt: new Date(row.createdAt).toISOString(),
        startedAt: iso(row.startedAt),
        finishedAt: iso(row.finishedAt),
    };
}

export interface StepRow {
    id: string;
    index: number;
    phase: string;
    title: string;
    status: AgentStepItem["status"];
    tool: string | null;
    resultDigest: string | null;
    costEur: number;
    model: string | null;
    durationMs: number | null;
    error: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
}

export function toStepItem(row: StepRow): AgentStepItem {
    return {
        id: row.id,
        index: row.index,
        phase: row.phase,
        title: row.title,
        status: row.status,
        tool: row.tool,
        resultDigest: row.resultDigest,
        costEur: row.costEur,
        model: row.model,
        durationMs: row.durationMs,
        error: row.error,
        startedAt: iso(row.startedAt),
        finishedAt: iso(row.finishedAt),
    };
}

export interface ProposalItemRow {
    id: string;
    runId: string;
    tool: string;
    args: unknown;
    card: unknown;
    rationale: string | null;
    risk: string;
    state: AgentProposalItem["state"];
    proposedAt: Date;
    expiresAt: Date;
    decidedById: string | null;
    decidedAt: Date | null;
    executedAt: Date | null;
    outcome: string | null;
}

export function toProposalCard(raw: unknown, tool: string): AgentProposalItem["card"] {
    const c = asRecord(raw);
    const details = Array.isArray(c.details)
        ? c.details
              .map((d) => asRecord(d))
              .filter((d) => typeof d.label === "string")
              .map((d) => ({ label: String(d.label), value: d.value === null || d.value === undefined ? "" : String(d.value) }))
        : [];
    return {
        title: typeof c.title === "string" && c.title ? c.title : tool,
        details,
        warning: typeof c.warning === "string" ? c.warning : null,
        confirmLabel: typeof c.confirmLabel === "string" && c.confirmLabel ? c.confirmLabel : "Confirmer",
        danger: c.danger === true,
    };
}

export function toProposalItem(row: ProposalItemRow, decidedByName: string | null, now: Date = new Date()): AgentProposalItem {
    // A PENDING row past its expiry is expired, swept or not.
    const state = row.state === "PENDING" && row.expiresAt.getTime() <= now.getTime() ? "EXPIRED" : row.state;
    return {
        id: row.id,
        runId: row.runId,
        tool: row.tool,
        args: asRecord(row.args),
        card: toProposalCard(row.card, row.tool),
        rationale: row.rationale,
        risk: row.risk === "safe_write" ? "safe_write" : "confirm",
        state,
        proposedAt: row.proposedAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        decidedByName,
        decidedAt: iso(row.decidedAt),
        executedAt: iso(row.executedAt),
        outcome: row.outcome,
    };
}

export interface FindingItemRow {
    id: string;
    rule: string;
    severity: AgentFindingItem["severity"];
    kind: string;
    title: string;
    body: string;
    metrics: unknown;
    folderId: string | null;
    clientId: string | null;
    subjectUserId: string | null;
    state: AgentFindingItem["state"];
    firstSeenAt: Date;
    lastSeenAt: Date;
    seenCount: number;
    snoozedUntil: Date | null;
    runId: string | null;
}

export function toFindingItem(row: FindingItemRow, names: { clientName: string | null; subjectName: string | null; folderId?: string | null }): AgentFindingItem {
    const metrics = asRecord(row.metrics);
    return {
        id: row.id,
        rule: row.rule,
        severity: row.severity,
        kind: row.kind,
        title: row.title,
        body: row.body,
        metrics: Object.keys(metrics).length > 0 ? metrics : null,
        folderId: row.folderId ?? names.folderId ?? null,
        clientId: row.clientId,
        clientName: names.clientName,
        subjectUserId: row.subjectUserId,
        subjectName: names.subjectName,
        state: row.state,
        firstSeenAt: row.firstSeenAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        seenCount: row.seenCount,
        snoozedUntil: iso(row.snoozedUntil),
        runId: row.runId,
    };
}

/** The run's plan as the contract shows it (mission plans carry more; extra keys are kept). */
export function toPlan(raw: unknown): AgentRunDetail["plan"] {
    const r = asRecord(raw);
    if (!Array.isArray(r.steps)) return null;
    const steps = r.steps
        .map((s) => asRecord(s))
        .filter((s) => typeof s.title === "string")
        .map((s) => ({ title: String(s.title), ...(typeof s.intent === "string" ? { intent: s.intent } : {}), ...(typeof s.status === "string" ? { status: s.status } : {}) }));
    return { steps };
}

export function toBudget(raw: unknown): AgentRunDetail["budget"] {
    const r = asRecord(raw);
    const out: AgentRunDetail["budget"] = {};
    for (const key of ["maxToolCalls", "maxCostEur", "deadlineMs", "maxSafeWrites", "maxPhases"] as const) {
        if (typeof r[key] === "number") out[key] = r[key] as number;
    }
    return out;
}
