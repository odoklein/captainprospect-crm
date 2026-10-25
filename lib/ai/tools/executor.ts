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
import { isEmptyPayload } from "@/lib/ai/agent/evidence/facts";
import type { EvidenceSession } from "@/lib/ai/agent/evidence/session";

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

export interface ExecuteOptions {
    /**
     * When attached, every read is recorded as evidence before its result is
     * returned, and an identical still-fresh read is served from the ledger.
     */
    evidence?: EvidenceSession | null;
}

export async function executeToolCall(
    call: ToolCallRequest,
    ctx: AssistantContext,
    options: ExecuteOptions = {},
): Promise<ToolExecutionResult> {
    const startedAt = Date.now();
    const tool = getTool(call.name);
    const evidence = tool?.risk === "read" ? options.evidence ?? null : null;
    let rawArgs: unknown = {};

    try {
        rawArgs = parseArguments(call.arguments);
        const args = authorizeToolCall(tool, call.name, rawArgs, ctx);

        if (evidence) {
            const hit = await evidence.reuse(tool!.name, evidence.hashArgs(tool!.name, args));
            if (hit) {
                return {
                    tool: call.name,
                    label: tool!.label,
                    ok: true,
                    data: hit.payload,
                    durationMs: Date.now() - startedAt,
                    cached: true,
                    evidence: hit.entry.label,
                };
            }
        }

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

        // Persisted before the model sees the result: an answer can only cite
        // evidence that already exists.
        const entry = evidence
            ? await evidence.record({
                  tool: tool!.name,
                  toolLabel: tool!.label,
                  args,
                  status: isEmptyPayload(data) ? "EMPTY" : "OK",
                  data,
              })
            : null;

        return {
            tool: call.name,
            label: tool!.label,
            ok: true,
            data,
            durationMs: Date.now() - startedAt,
            evidence: entry?.label,
        };
    } catch (error) {
        const payload = toErrorPayload(error);
        const entry = evidence
            ? await evidence.record({
                  tool: tool!.name,
                  toolLabel: tool!.label,
                  args: rawArgs,
                  status: "ERROR",
                  errorCode: payload.code,
              })
            : null;
        return {
            tool: call.name,
            label: tool?.label ?? call.name,
            ok: false,
            error: payload,
            durationMs: Date.now() - startedAt,
            evidence: entry?.label,
        };
    }
}

/** Serialise a result for the `tool` message sent back to the model. */
export function serializeToolResult(result: ToolExecutionResult): string {
    if (!result.ok) {
        return JSON.stringify({
            tool: result.tool,
            ...(result.evidence ? { source: result.evidence } : {}),
            error: result.error,
            _note:
                "Cet outil a échoué ou a été refusé. Explique la limite à l'utilisateur, n'invente pas de données.",
        });
    }
    return wrapToolPayload(result.tool, result.data, result.evidence);
}
