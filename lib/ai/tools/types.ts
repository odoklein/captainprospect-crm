/**
 * Authorization and scope foundation for the Assistant Projet.
 *
 * Core principle: the model NEVER touches Prisma. It can only name a tool from
 * the registry; the guard decides whether that tool may run, and the tool
 * resolves its own data through a query scoped to the bound project.
 */

import { z } from "zod";
import type { UserRole } from "@prisma/client";

// ============================================
// RISK TIERS
// ============================================

/**
 * What a tool costs if the model gets it wrong. This is the axis the whole
 * system is organised around, so it is a declared property, not a judgement
 * call made inside the loop.
 *
 *   read        — no side effect. Runs automatically.
 *   safe_write  — writes, but internal and reversible in one click (a task, a
 *                 draft, a filing change). Runs automatically, budgeted, logged.
 *   confirm     — irreversible, outward-facing, or discloses a secret. NEVER
 *                 runs from the loop: it returns a card and waits for a human.
 */
export type ToolRisk = "read" | "safe_write" | "confirm";

// ============================================
// REQUEST SCOPE
// ============================================

/** The project the exchange is bound to. `missionId: null` = client-wide. */
export interface ProjectBinding {
    clientId: string;
    clientName: string;
    missionId: string | null;
    missionName: string | null;
}

/**
 * The complete authorization envelope for one assistant request, built once by
 * `buildAssistantContext()` and handed to every tool.
 *
 * Scope invariant: a project-scoped tool derives its `where` clause from
 * `project`, never from its own arguments. An argument naming another client is
 * ignored or refused — which is what makes "un projet à la fois" a property of
 * the system rather than a promise in the prompt.
 */
export interface AssistantContext {
    userId: string;
    userName: string;
    role: UserRole;
    isActive: boolean;
    permissions: string[];

    /** The bound project. Null only while the manager has not picked one yet. */
    project: ProjectBinding | null;

    /** Resolution timestamp, surfaced to the model so it can date its answer. */
    resolvedAt: Date;

    /**
     * Automatic writes still allowed this turn. Decremented by the executor
     * after each successful `safe_write`. `confirm` tools never touch it — they
     * are spent by a human click, not by the loop.
     */
    autoWriteBudget: number;

    /** The conversation this request belongs to. Stamped on anything created. */
    conversationId: string | null;
}

// ============================================
// TOOLS
// ============================================

/** JSON Schema fragment advertised to Mistral's function-calling API. */
export interface JsonSchemaObject {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
}

export interface ToolDefinition<TArgs = unknown, TResult = unknown> {
    /** snake_case name the model calls. Unique across the registry. */
    name: string;
    /** Shown to the model. Say what it returns AND when to reach for it. */
    description: string;
    /** Wire contract for the model. */
    parameters: JsonSchemaObject;
    /** Server-side contract. The model's JSON is untrusted input. */
    schema: z.ZodType<TArgs>;
    /** Roles allowed to invoke this tool at all. */
    allowedRoles: UserRole[];
    /** Permission codes required on top of the role check. */
    requiredPermissions?: string[];
    /** See ToolRisk. Decides whether the loop may run this itself. */
    risk: ToolRisk;
    /** True when the tool cannot work without a bound project. */
    requiresProject: boolean;
    /** Short French label for the tool trace in the UI. */
    label: string;

    /** Must never query Prisma without applying scope from `ctx`. */
    execute: (args: TArgs, ctx: AssistantContext) => Promise<TResult>;

    /**
     * `confirm` tools only: describes the pending action for the card, resolved
     * from the database rather than echoed from the model's arguments.
     */
    describe?: (args: TArgs, ctx: AssistantContext) => Promise<PendingActionCard>;
}

/**
 * `execute` is contravariant in its argument, so a heterogeneous registry
 * cannot be typed with `unknown` — the per-tool zod schema is what narrows the
 * arguments before `execute` ever runs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyToolDefinition = ToolDefinition<any, any>;

// ============================================
// CONFIRMATION CARDS
// ============================================

export interface PendingActionCard {
    title: string;
    details: Array<{ label: string; value: string }>;
    /** Extra line for the irreversible ones. */
    warning: string | null;
    confirmLabel: string;
    danger: boolean;
}

// ============================================
// RESULTS
// ============================================

export interface ToolExecutionResult {
    tool: string;
    label: string;
    ok: boolean;
    /** Scrubbed payload, safe to hand back to the model. */
    data?: unknown;
    error?: { code: string; message: string };
    durationMs: number;
}

/**
 * What a write hands back to the UI.
 *
 * `secret` is the one field that never enters the model's context: it travels
 * server → card and is displayed once.
 */
export interface WriteOutcome {
    message: string;
    secret?: { label: string; login: string; password: string } | null;
    /** Tells the UI to refetch the project panels. */
    refresh?: boolean;
    /** An artifact this action produced or consumed. */
    artifactId?: string | null;
}

// ============================================
// ERRORS
// ============================================

export class ToolAuthorizationError extends Error {
    readonly code: string;
    constructor(message: string, code = "forbidden") {
        super(message);
        this.name = "ToolAuthorizationError";
        this.code = code;
    }
}

export class ToolValidationError extends Error {
    readonly code = "invalid_arguments";
    constructor(message: string) {
        super(message);
        this.name = "ToolValidationError";
    }
}

export class ToolNotFoundError extends Error {
    readonly code = "unknown_tool";
    constructor(name: string) {
        super(`Outil inconnu : ${name}`);
        this.name = "ToolNotFoundError";
    }
}
