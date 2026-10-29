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
import { truncateStructured } from "./truncate";
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
/** Longest string kept per argument in the action log (a create_pdf body can be 60k chars). */
const LOG_STRING_MAX = 500;

/**
 * The arguments as the audit trail keeps them: same shape, long strings cut.
 * The log answers "who did what to which record", not "what was written".
 */
export function compactLogArgs(value: unknown, depth = 0): unknown {
    if (typeof value === "string") return value.length > LOG_STRING_MAX ? `${value.slice(0, LOG_STRING_MAX)}… (${value.length} caractères)` : value;
    if (depth > 4 || value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.slice(0, 50).map((v) => compactLogArgs(v, depth + 1));
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, compactLogArgs(v, depth + 1)]));
}

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
                args: compactLogArgs(params.args ?? {}) as Prisma.InputJsonValue,
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
    const evidence = tool?.risk === "read" && !tool.noEvidence ? options.evidence ?? null : null;
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

/** Above this many serialised characters, a result is sliced before it reaches the model. */
const MODEL_RESULT_CAP_CHARS = 60_000;

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
    // Safety net for project tools, which cap nothing themselves: the evidence
    // ledger already holds the full payload, only the model's copy is cut.
    return wrapToolPayload(result.tool, truncateStructured(result.data, MODEL_RESULT_CAP_CHARS).value, result.evidence);
}
