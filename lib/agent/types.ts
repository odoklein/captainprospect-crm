/**
 * Captain Agent — shared types of the background worker.
 *
 * A run executes one playbook (code-defined) on behalf of a manager (the
 * `actorId`) inside a budget. WATCH playbooks detect with SQL and only use the
 * model to write; REPORT and MISSION playbooks (later PRs) chain model phases.
 * Nothing here touches Prisma: these are the shapes the store, the queue, the
 * phases and the playbooks agree on.
 */

import type { AgentJobKind, AgentRunStatus, AgentSeverity, AgentTrigger } from "@prisma/client";
import type { AssistantContext } from "@/lib/ai/tools/types";

export type { AgentJobKind, AgentRunStatus, AgentSeverity, AgentTrigger };

/** How a run may spend: stored on `AgentRun.budget`, checked before each phase. */
export interface RunBudget {
    maxToolCalls: number;
    maxCostEur: number;
    deadlineMs: number;
    /** `autoWriteBudget` of the run's context: 0 turns every write into a proposal. */
    maxSafeWrites: number;
    maxPhases: number;
}

/** What a run has spent so far: stored on `AgentRun.usage`. */
export interface RunUsage {
    promptTokens: number;
    completionTokens: number;
    costEur: number;
    toolCalls: number;
    phases: number;
}

export const EMPTY_USAGE: RunUsage = { promptTokens: 0, completionTokens: 0, costEur: 0, toolCalls: 0, phases: 0 };

/** "worker" = the second service; "lite" = inside the web process (agent-tick). */
export type RunMode = "worker" | "lite";

/** Model strength a phase asks for; mapped to a plan by lib/agent/providers. */
export type ModelTier = "standard" | "deep" | "gather";

/** The row the queue hands to the executor (a subset of AgentRun). */
export interface ClaimedRun {
    id: string;
    jobId: string | null;
    kind: AgentJobKind;
    playbook: string;
    trigger: AgentTrigger;
    status: AgentRunStatus;
    folderId: string | null;
    clientId: string | null;
    missionId: string | null;
    actorId: string;
    conversationId: string | null;
    goal: string | null;
    budget: RunBudget;
    usage: RunUsage;
    mode: RunMode;
    attempts: number;
    maxAttempts: number;
    checkpoint: Record<string, unknown> | null;
    startedAt: Date | null;
    createdAt: Date;
}

/** Configuration common to every job (each playbook adds its own keys). */
export interface BaseJobConfig {
    /** Writes become proposals, notifications are skipped, nothing leaves the run. */
    dryRun?: boolean;
    /** "immediate": notify managers of every new finding; default: CRITICAL only (the rest waits for the digest). */
    notify?: "immediate" | "digest";
    budget?: Partial<RunBudget>;
    [key: string]: unknown;
}

/** What a watch rule noticed, before it becomes (or refreshes) an AgentFinding. */
export interface DetectedFinding {
    /** Local part of the dedupe key, stable while the condition persists (an id, or id + day). */
    key: string;
    severity: AgentSeverity;
    /** Short machine kind, e.g. "client_at_risk", "sdr_under_pace". */
    kind: string;
    title: string;
    /** French, plain text, what a manager reads in the inbox. */
    body: string;
    metrics?: Record<string, number | string | null>;
    clientId?: string | null;
    missionId?: string | null;
    subjectUserId?: string | null;
    /** Proposal seeds: tools a later PR may offer to run. */
    suggested?: Array<{ tool: string; args: Record<string, unknown>; rationale: string }>;
}

/** What `upsertFindings` did with a detector's output. */
export interface FindingEvents<TRow = FindingRow> {
    created: TRow[];
    escalated: TRow[];
    reopened: TRow[];
    resolved: TRow[];
}

/** The subset of AgentFinding the lifecycle and the digest read. */
export interface FindingRow {
    id: string;
    rule: string;
    dedupeKey: string;
    severity: AgentSeverity;
    kind: string;
    title: string;
    body: string;
    metrics: Record<string, unknown> | null;
    clientId: string | null;
    missionId: string | null;
    subjectUserId: string | null;
    state: "OPEN" | "ACKED" | "SNOOZED" | "RESOLVED";
    firstSeenAt: Date;
    lastSeenAt: Date;
    seenCount: number;
    snoozedUntil: Date | null;
    notifiedAt: Date | null;
}

export interface PlaybookRunContext {
    run: ClaimedRun;
    /** The job's config, already parsed by the playbook's schema (defaults applied). */
    config: BaseJobConfig;
    budget: RunBudget;
    /** Trusted, built once per run: actor permissions, scope, allowlist, background mode. */
    ctx: AssistantContext;
    now: () => Date;
    signal: AbortSignal;
    /** Mode of this execution (lite runs are short and skip nothing that matters). */
    mode: RunMode;
    /** Holder of the run's lock: heartbeats are refused under any other id. */
    workerId: string;
    /** Structured progress line (JSON log + heartbeat). */
    log: (event: string, data?: Record<string, unknown>) => void;
}

export interface PlaybookOutcome {
    /** French, 1–3 sentences, stored on the run and shown in the timeline. */
    summary: string;
    findingsCount: number;
    proposalsCount: number;
    usage: RunUsage;
    /** Set when the playbook could not finish inside its budget: the run is marked FAILED with this text. */
    error?: string | null;
}
