/**
 * Executes one tool call: guard, run, scrub, wrap.
 *
 * Failures are returned, not thrown. A denied or invalid call goes back to the
 * model as a structured error so it can explain the limit or try a different
 * tool, while the caller still gets an audit line.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
    AssistantContext,
    ToolAuthorizationError,
    ToolExecutionResult,
    ToolNotFoundError,
    ToolValidationError,
} from "./types";
import { authorizeToolCall } from "./guard";
import { getTool } from "./registry";
import { wrapToolPayload } from "./redact";

/** Hard cap on tool calls per assistant request. */
export const MAX_TOOL_CALLS_PER_REQUEST = 8;

export interface ToolCallRequest {
    id?: string;
    name: string;
    /** Raw JSON string from the model, or an already-parsed object. */
    arguments: string | Record<string, unknown>;
}

function parseArguments(raw: string | Record<string, unknown>): unknown {
    if (typeof raw !== "string") return raw ?? {};
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
        return JSON.parse(trimmed);
    } catch {
        throw new ToolValidationError("Les arguments ne sont pas un JSON valide.");
    }
}

function toErrorPayload(error: unknown): { code: string; message: string } {
    if (
        error instanceof ToolAuthorizationError ||
        error instanceof ToolValidationError ||
        error instanceof ToolNotFoundError
    ) {
        return { code: error.code, message: error.message };
    }
    // Internal failures must not leak stack traces or SQL to the model.
    console.error("[assistant.tool] execution failed:", error);
    return { code: "tool_failed", message: "L'outil n'a pas pu s'exécuter." };
}

/**
 * Records a write to the action log.
 *
 * Every `safe_write` and every confirmed `confirm` action lands here, so the
 * question "what did the assistant actually do on this project?" has one
 * answer, regardless of which path executed it.
 */
export async function logAssistantAction(params: {
    ctx: AssistantContext;
    tool: string;
    args: unknown;
    outcome: string;
    confirmed: boolean;
    ok: boolean;
}): Promise<void> {
    try {
        await prisma.assistantActionLog.create({
            data: {
                tool: params.tool,
                // Arguments are ids and flags, never secrets — the vault's own
                // audit trail covers what happened to the credential itself.
                args: (params.args ?? {}) as Prisma.InputJsonValue,
                outcome: params.outcome.slice(0, 1000),
                confirmed: params.confirmed,
                ok: params.ok,
                actorId: params.ctx.userId,
                clientId: params.ctx.project?.clientId ?? null,
                missionId: params.ctx.project?.missionId ?? null,
                conversationId: params.ctx.conversationId ?? null,
            },
        });
    } catch (error) {
        console.error("[assistant.action-log] write failed", params.tool, error);
    }
}

export async function executeToolCall(
    call: ToolCallRequest,
    ctx: AssistantContext,
): Promise<ToolExecutionResult> {
    const startedAt = Date.now();
    const tool = getTool(call.name);

    try {
        const args = authorizeToolCall(tool, call.name, parseArguments(call.arguments), ctx);
        const data = await tool!.execute(args, ctx);

        // Spend the budget only on success: a failed write left no trace, so the
        // model is allowed one genuine attempt.
        if (tool!.risk === "safe_write") {
            ctx.autoWriteBudget -= 1;
            await logAssistantAction({
                ctx,
                tool: tool!.name,
                args,
                outcome: typeof data === "object" && data !== null && "message" in data
                    ? String((data as { message: unknown }).message)
                    : "OK",
                confirmed: false,
                ok: true,
            });
        }

        return {
            tool: call.name,
            label: tool!.label,
            ok: true,
            data,
            durationMs: Date.now() - startedAt,
        };
    } catch (error) {
        return {
            tool: call.name,
            label: tool?.label ?? call.name,
            ok: false,
            error: toErrorPayload(error),
            durationMs: Date.now() - startedAt,
        };
    }
}

/** Serialise a result for the `tool` message sent back to the model. */
export function serializeToolResult(result: ToolExecutionResult): string {
    if (!result.ok) {
        return JSON.stringify({
            tool: result.tool,
            error: result.error,
            _note:
                "Cet outil a échoué ou a été refusé. Explique la limite à l'utilisateur, n'invente pas de données.",
        });
    }
    return wrapToolPayload(result.tool, result.data);
}
