/**
 * Factories for tool definitions.
 *
 * Every tool goes through one of these three, so the risk tier is never left
 * implicit and `grep defineConfirmTool lib/ai/tools/definitions` lists the
 * entire surface that can do something irreversible.
 */

import { z } from "zod";
import type { UserRole } from "@prisma/client";
import {
    AssistantContext,
    JsonSchemaObject,
    PendingActionCard,
    ToolDefinition,
    WriteOutcome,
} from "./types";

/** Manager-only, everywhere, for now. Widening is a per-tool decision. */
const DEFAULT_ROLES: UserRole[] = ["MANAGER"];

interface BaseSpec<TArgs> {
    name: string;
    label: string;
    description: string;
    parameters: JsonSchemaObject;
    schema: z.ZodType<TArgs>;
    allowedRoles?: UserRole[];
    requiredPermissions?: string[];
    /** Defaults to true — most tools are meaningless without a project. */
    requiresProject?: boolean;
}

/** No side effects. Runs automatically inside the loop. */
export function defineReadTool<TArgs, TResult>(
    spec: BaseSpec<TArgs> & {
        execute: (args: TArgs, ctx: AssistantContext) => Promise<TResult>;
    },
): ToolDefinition<TArgs, TResult> {
    return {
        ...spec,
        allowedRoles: spec.allowedRoles ?? DEFAULT_ROLES,
        requiresProject: spec.requiresProject ?? true,
        risk: "read",
    };
}

/**
 * Writes, but internal and undoable in one click — a task, a draft, a filing
 * change. Runs automatically, counts against the per-message budget, and lands
 * in the action log.
 *
 * The test for putting a tool here: if the model fires it by mistake, can the
 * manager undo it in under ten seconds, and did anything leave the CRM? If the
 * answer is no to either, it belongs in `defineConfirmTool`.
 */
export function defineSafeWriteTool<TArgs>(
    spec: BaseSpec<TArgs> & {
        execute: (args: TArgs, ctx: AssistantContext) => Promise<WriteOutcome>;
    },
): ToolDefinition<TArgs, WriteOutcome> {
    return {
        ...spec,
        allowedRoles: spec.allowedRoles ?? DEFAULT_ROLES,
        requiresProject: spec.requiresProject ?? true,
        risk: "safe_write",
    };
}

/**
 * Irreversible, outward-facing, or discloses a secret. Never runs from the
 * loop: `describe` builds the card, and only the confirm endpoint calls
 * `execute`.
 */
export function defineConfirmTool<TArgs>(
    spec: BaseSpec<TArgs> & {
        execute: (args: TArgs, ctx: AssistantContext) => Promise<WriteOutcome>;
        describe: (args: TArgs, ctx: AssistantContext) => Promise<PendingActionCard>;
    },
): ToolDefinition<TArgs, WriteOutcome> {
    return {
        ...spec,
        allowedRoles: spec.allowedRoles ?? DEFAULT_ROLES,
        requiresProject: spec.requiresProject ?? true,
        risk: "confirm",
    };
}

// ============================================
// Shared parameter fragments
// ============================================

export const NO_PARAMS: JsonSchemaObject = {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
};

export function params(
    properties: Record<string, unknown>,
    required: string[] = [],
): JsonSchemaObject {
    return { type: "object", properties, required, additionalProperties: false };
}

// ============================================
// Formatting
// ============================================

export function frDate(value: Date | null | undefined): string | null {
    if (!value) return null;
    return value.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export function frDateTime(value: Date | null | undefined): string | null {
    if (!value) return null;
    return value.toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

/** Percentage with one decimal, or null when the denominator is zero. */
export function rate(numerator: number, denominator: number): number | null {
    if (!denominator) return null;
    return Math.round((numerator / denominator) * 1000) / 10;
}
