/**
 * The authorization guard — the single choke point between the model's intent
 * and the CRM's data.
 *
 * Every check is pure: it reads the pre-resolved context and the tool
 * definition, and returns allow/deny. No I/O, so it cannot be made to fail open
 * by a slow or unreachable database, and it is testable without Postgres.
 */

import { z } from "zod";
import {
    AssistantContext,
    AnyToolDefinition,
    ToolAuthorizationError,
    ToolDefinition,
    ToolNotFoundError,
    ToolValidationError,
} from "./types";

export interface AccessDecision {
    allowed: boolean;
    reason?: string;
    code?: string;
}

/**
 * Role, permission, account state, project binding and write budget.
 * Order matters: cheapest and most fundamental denial first.
 */
export function checkToolAccess(
    tool: AnyToolDefinition,
    ctx: AssistantContext,
): AccessDecision {
    if (!ctx.isActive) {
        return { allowed: false, code: "inactive_account", reason: "Compte désactivé." };
    }

    if (!tool.allowedRoles.includes(ctx.role)) {
        return {
            allowed: false,
            code: "role_denied",
            reason: `Le rôle ${ctx.role} n'a pas accès à cet outil.`,
        };
    }

    const missing = (tool.requiredPermissions ?? []).filter(
        (code) => !ctx.permissions.includes(code),
    );
    if (missing.length > 0) {
        return {
            allowed: false,
            code: "permission_denied",
            reason: `Permission(s) manquante(s) : ${missing.join(", ")}.`,
        };
    }

    if (tool.requiresProject && !ctx.project) {
        return {
            allowed: false,
            code: "no_project",
            reason: "Aucun projet sélectionné. Demande à l'utilisateur de choisir un client et une mission.",
        };
    }

    // One user message must not become a burst of writes through the loop.
    if (tool.risk === "safe_write" && ctx.autoWriteBudget <= 0) {
        return {
            allowed: false,
            code: "write_budget_exhausted",
            reason: "Limite d'actions automatiques atteinte pour cette demande.",
        };
    }

    return { allowed: true };
}

/**
 * Parse tool arguments against the server-side schema.
 * The model's JSON is untrusted input like any other request body.
 */
export function parseToolArguments<TArgs>(
    tool: ToolDefinition<TArgs, unknown>,
    rawArgs: unknown,
): TArgs {
    const result = tool.schema.safeParse(rawArgs ?? {});
    if (!result.success) {
        const detail = result.error.issues
            .map((issue: z.ZodIssue) => `${issue.path.join(".") || "(racine)"} : ${issue.message}`)
            .join(", ");
        throw new ToolValidationError(`Arguments invalides pour ${tool.name} — ${detail}`);
    }
    return result.data;
}

/**
 * Full pre-execution gate: existence, access, argument validation.
 * Throws on denial so a caller cannot forget to check a boolean.
 */
export function authorizeToolCall<TArgs>(
    tool: ToolDefinition<TArgs, unknown> | undefined,
    name: string,
    rawArgs: unknown,
    ctx: AssistantContext,
): TArgs {
    if (!tool) throw new ToolNotFoundError(name);

    const decision = checkToolAccess(tool, ctx);
    if (!decision.allowed) {
        throw new ToolAuthorizationError(
            decision.reason ?? "Accès refusé.",
            decision.code ?? "forbidden",
        );
    }

    return parseToolArguments(tool, rawArgs);
}

/** Tools this context may see at all — used to build the model's tool list. */
export function listAccessibleTools(
    tools: AnyToolDefinition[],
    ctx: AssistantContext,
): AnyToolDefinition[] {
    return tools.filter((tool) => checkToolAccess(tool, ctx).allowed);
}
