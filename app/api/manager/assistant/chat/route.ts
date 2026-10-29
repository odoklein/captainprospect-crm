// ============================================
// POST /api/manager/assistant/chat — one turn of the Assistant Projet
//
// Read and safe-write tools run server-side inside the loop; a proposed
// `confirm` action comes back as `pendingAction` and goes no further until
// /execute receives a click.
//
// History is read from the database, not from the request: the browser sends a
// message and a conversation id, never a transcript it could have edited.
//
// `stream: true` answers with NDJSON events (see lib/ai/agent/protocol.ts):
// text as it is written, tool progress, then one authoritative `final` (or
// `error`). Without it, the original JSON response. Either way the turn is
// saved — even when it fails, times out or the browser goes away — so a write
// that already happened is never missing from the conversation.
// ============================================

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
    errorResponse,
    requireRole,
    successResponse,
    validateRequest,
    withErrorHandler,
    NotFoundError,
} from "@/lib/api-utils";
import { buildAssistantContext } from "@/lib/ai/tools/context";
import {
    buildReasoningPrompt,
    buildToolUsagePrompt,
    buildTurnContextMessage,
    describePastTrace,
    type ChatTurn,
    type ToolTraceEntry,
} from "@/lib/ai/tools/loop";
import { getToolsForContext } from "@/lib/ai/tools/registry";
import { toolProfileFor } from "@/lib/ai/tools/profiles";
import { buildContextPack } from "@/lib/assistant/context/pack";
import { prismaContextDeps } from "@/lib/assistant/context/prisma";
import { optional } from "@/lib/assistant/store/missing";
import { maybeSummarize, maybeTitle } from "@/lib/assistant/summary/rolling";
import { getAssistantSystemPrompt } from "@/lib/assistant/projet/systemPrompt";
import { getBrand } from "@/lib/brand/server";
import { getAssistantModelConfig, planTurn } from "@/lib/ai/agent/models";
import { providerChat, runAgentTurn, type AgentTurnResult } from "@/lib/ai/agent/runtime";
import { isConfigured } from "@/lib/ai/providers";
import { recordAiUsage } from "@/lib/ai/ledger";
import {
    EvidenceStoreUnavailable,
    prismaEvidenceStore,
    purgeEvidence,
    type RunEndStatus,
} from "@/lib/ai/agent/evidence/store";
import { retentionDays } from "@/lib/ai/agent/evidence/policy";
import type { AssistantErrorCode, StreamEvent, TurnPayload } from "@/lib/ai/agent/protocol";

export const dynamic = "force-dynamic";
// Deep turns may run up to ASSISTANT_DEEP_TURN_DEADLINE_MS (180 s by default).
export const maxDuration = 300;

const ChatBody = z.object({
    conversationId: z.string().min(1),
    message: z.string().min(1).max(4000),
    /** "deep" = stronger model + bigger tool budget, chosen per message by the manager. */
    depth: z.enum(["standard", "deep"]).optional(),
    /** NDJSON event stream instead of one JSON response. */
    stream: z.boolean().optional(),
});

/** First user message becomes the thread title, so history is scannable. */
function titleFrom(message: string): string {
    const clean = message.trim().replace(/\s+/g, " ");
    return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}

const HTTP_STATUS: Record<AssistantErrorCode, number> = {
    timeout: 504,
    cancelled: 499,
    rate_limited: 429,
    provider_unavailable: 502,
    provider_auth: 502,
    busy: 409,
    not_configured: 503,
    internal: 500,
};

function runStatus(result: AgentTurnResult): RunEndStatus {
    if (result.status === "timeout") return "TIMEOUT";
    if (result.status === "cancelled") return "CANCELLED";
    if (result.status === "failed") return "FAILED";
    return "COMPLETED";
}

function toPayload(result: AgentTurnResult, messageId: string | null): TurnPayload {
    return {
        messageId,
        runId: result.runId,
        answer: result.answer,
        status: result.status,
        pendingAction: result.proposedAction,
        trace: result.trace,
        citations: result.citations,
        unverifiedClaims: result.unverifiedClaims,
        verification: result.verification,
        visuals: result.visuals,
        model: result.model,
        usage: result.usage,
    };
}

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const body = await validateRequest(request, ChatBody);

    if (!isConfigured("openai")) {
        return errorResponse(
            "L'assistant n'est pas configuré : OPENAI_API_KEY est absente côté serveur.",
            503,
        );
    }

    const conversation = await prisma.assistantConversation.findUnique({
        where: { id: body.conversationId },
        select: {
            id: true,
            clientId: true,
            missionId: true,
            createdById: true,
            messageCount: true,
            folderId: true,
            kind: true,
            summary: true,
            summaryUpToMessageId: true,
        },
    });
    if (!conversation || conversation.createdById !== session.user.id) {
        throw new NotFoundError("Conversation introuvable");
    }

    const ctx = await buildAssistantContext({
        userId: session.user.id,
        clientId: conversation.clientId,
        missionId: conversation.missionId,
        conversationId: conversation.id,
        folderId: conversation.folderId,
    });

    // Folder instructions are stable guidance; a missing folders table must not
    // fail the turn, so the read degrades to "no folder".
    const folder = conversation.folderId
        ? await optional<{ name: string; instructions: string | null } | null>(
              "chat.folder",
              () =>
                  prisma.assistantFolder.findUnique({
                      where: { id: conversation.folderId as string },
                      select: { name: true, instructions: true },
                  }),
              null,
          )
        : null;

    const depth = body.depth ?? "standard";
    const config = getAssistantModelConfig();
    const plan = planTurn(config, depth);
    void purgeEvidence(new Date(), retentionDays());

    // One turn at a time per conversation: a double submit would otherwise run
    // every safe write twice. Without the ledger tables the turn still runs,
    // unlocked and without persisted evidence.
    const runId = randomUUID();
    let storeUsable = true;
    try {
        const started = await prismaEvidenceStore.startRun({
            id: runId,
            conversationId: conversation.id,
            userId: ctx.userId,
            clientId: ctx.project?.clientId ?? null,
            missionId: ctx.project?.missionId ?? null,
            model: plan.model,
            staleBefore: new Date(Date.now() - plan.deadlineMs - 60_000),
        });
        if (started === "busy") {
            return errorResponse(
                "Une réponse est déjà en cours dans cette conversation. Attends-la ou arrête-la avant d'envoyer un nouveau message.",
                409,
            );
        }
    } catch (error) {
        if (!(error instanceof EvidenceStoreUnavailable)) throw error;
        storeUsable = false;
        console.warn("[assistant.chat] evidence ledger unavailable — migration applied?", (error.cause as Error)?.message);
    }

    let finished = false;
    const finishRun = async (result: AgentTurnResult | null, messageId: string | null) => {
        if (finished || !storeUsable) return;
        finished = true;
        try {
            await prismaEvidenceStore.finishRun(runId, {
                status: result ? runStatus(result) : "FAILED",
                model: result?.model ?? plan.model,
                fallbackUsed: result?.fallbackUsed ?? false,
                promptTokens: result?.usage.promptTokens ?? 0,
                completionTokens: result?.usage.completionTokens ?? 0,
                costEur: result?.usage.costEur ?? 0,
                latencyMs: result?.latencyMs ?? 0,
                firstTokenMs: result?.firstTokenMs ?? null,
                iterations: result?.iterations ?? 0,
                toolCalls: result?.toolCalls ?? 0,
                retries: result?.retries ?? 0,
                cachedInputTokens: result?.usage.cachedInputTokens ?? 0,
                reasoningTokens: result?.usage.reasoningTokens ?? 0,
                tier: plan.depth,
                provider: result?.usage.provider ?? null,
                errorCode: result?.error?.code ?? (result ? null : "internal"),
                verification: result?.verification ?? null,
                messageId,
            });
        } catch (error) {
            console.error("[assistant.chat] run not finalised", error);
        }
    };

    /** Saves the turn whatever its outcome: the transcript must match what happened. */
    const persistTurn = async (result: AgentTurnResult): Promise<string | null> => {
        const traceData = {
            entries: result.trace,
            // The model travels with the usage, or the cost summary prices a
            // deep turn as if it had run on the cheap model.
            usage: result.usage,
            depth,
            runId: result.runId,
            status: result.status,
            citations: result.citations,
            unverifiedClaims: result.unverifiedClaims,
            verification: result.verification,
            // Charts the answer draws: reopening the thread draws them again.
            visuals: result.visuals,
            ...(result.error ? { error: result.error } : {}),
        };
        try {
            const [, assistantMessage] = await prisma.$transaction([
                prisma.assistantMessage.create({
                    data: { conversationId: conversation.id, role: "USER", content: body.message },
                    select: { id: true },
                }),
                prisma.assistantMessage.create({
                    data: {
                        conversationId: conversation.id,
                        role: "ASSISTANT",
                        content: result.answer || (result.proposedAction ? "Voici l'action que je propose :" : "—"),
                        trace: traceData as unknown as Prisma.InputJsonValue,
                        action: (result.proposedAction ?? undefined) as unknown as Prisma.InputJsonValue,
                    },
                    select: { id: true },
                }),
                prisma.assistantConversation.update({
                    where: { id: conversation.id },
                    data: {
                        messageCount: { increment: 2 },
                        lastMessageAt: new Date(),
                        ...(conversation.messageCount === 0 ? { title: titleFrom(body.message) } : {}),
                    },
                    select: { id: true },
                }),
            ]);
            return assistantMessage.id;
        } catch (error) {
            console.error("[assistant.chat] turn not saved", error);
            return null;
        }
    };

    let result: AgentTurnResult | null = null;
    let messageId: string | null = null;
    try {
        // What the turn knows besides the raw history, within token budgets:
        // folder instructions, memory, rolling summary, file extracts. Stable
        // sections join the system prompt; volatile ones go in the turn context.
        const pack = await buildContextPack({
            ctx,
            conversation: {
                id: conversation.id,
                kind: conversation.kind,
                summary: conversation.summary,
                summaryUpToMessageId: conversation.summaryUpToMessageId,
                missionId: conversation.missionId,
            },
            question: body.message,
            folder: folder ? { name: folder.name, instructions: folder.instructions } : null,
            deps: prismaContextDeps,
        });

        // Only the recent raw turns travel: what fell out of the window is
        // folded into the rolling summary by the after() job below.
        const previous = await prisma.assistantMessage.findMany({
            where: { conversationId: conversation.id, supersededAt: null },
            orderBy: { createdAt: "desc" },
            take: pack.historyWindow,
            select: { role: true, content: true, action: true, trace: true },
        });

        const history: ChatTurn[] = previous
            .reverse()
            .map((m) => {
                // An executed action has to travel with its message, or the next turn
                // proposes the same account creation all over again.
                const action = m.action as { state?: string; outcome?: string } | null;
                const suffix =
                    action?.state === "confirmed"
                        ? `\n[Action exécutée] ${action.outcome ?? "OK"}`
                        : action?.state === "cancelled"
                            ? "\n[Action refusée par le manager]"
                            : "";
                // Which records the earlier turn looked at, with their ids, so a
                // follow-up ("et ses appels ?") can dig into the same record.
                const rawTrace = m.trace as { entries?: ToolTraceEntry[] } | ToolTraceEntry[] | null;
                const pastTools =
                    m.role === "ASSISTANT"
                        ? describePastTrace(Array.isArray(rawTrace) ? rawTrace : rawTrace?.entries)
                        : "";
                return {
                    role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
                    content: `${m.content}${suffix}${pastTools}`.trim() || "(vide)",
                };
            })
            .filter((m) => m.content.length > 0);

        history.push({ role: "user", content: body.message });

        const brand = await getBrand();
        // Byte-identical across turns (prompt caching): persona, tool rules and
        // the stable context sections only. The day, the user, the summary and
        // the fresh sources travel in the turn context message.
        const systemPrompt = [
            getAssistantSystemPrompt(ctx, brand),
            buildToolUsagePrompt(ctx, depth),
            buildReasoningPrompt(depth),
            ...pack.systemSections.map((section) => section.text),
        ].join("\n\n");
        const turnContext = buildTurnContextMessage({
            ctx,
            depth,
            sections: pack.volatileSections.map((section) => section.text),
        });
        // A profile narrows the advertised tool schemas to the groups the
        // question needs; load_tool_group widens it inside the turn.
        const accessible = getToolsForContext(ctx).map((tool) => tool.name);
        const profile = toolProfileFor({ ctx, depth, question: body.message, accessible });
        const knownNames = [ctx.userName, ctx.project?.clientName, ctx.project?.missionName, brand.name].filter(
            (n): n is string => !!n,
        );

        const runTurn = async (onEvent: (event: StreamEvent) => void, signal: AbortSignal) => {
            result = await runAgentTurn(
                {
                    systemPrompt,
                    history,
                    ctx,
                    config,
                    plan,
                    signal,
                    runId,
                    onEvent,
                    knownNames,
                    contextMessage: turnContext,
                    toolNames: profile.names,
                },
                { chat: providerChat(), store: storeUsable ? prismaEvidenceStore : null, ledger: recordAiUsage, surface: "assistant.chat" },
            );
            messageId = await persistTurn(result);
            await finishRun(result, messageId);
            return toPayload(result, messageId);
        };

        // Registered once, in the request scope: Next runs it after the response
        // (including a stream) is sent, and persistTurn has already completed by
        // then. Both jobs swallow their errors and never fail the turn.
        after(async () => {
            await maybeTitle(conversation.id);
            await maybeSummarize(conversation.id);
        });

        if (body.stream) {
            const encoder = new TextEncoder();
            const abort = new AbortController();
            request.signal.addEventListener("abort", () => abort.abort(), { once: true });

            const stream = new ReadableStream<Uint8Array>({
                async start(controller) {
                    let open = true;
                    const send = (event: StreamEvent) => {
                        if (!open) return;
                        try {
                            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
                        } catch {
                            open = false; // the browser left; the turn still finishes and is saved
                        }
                    };
                    try {
                        const payload = await runTurn(send, abort.signal);
                        const turn = result as AgentTurnResult | null;
                        if (turn?.error) send({ type: "error", error: turn.error, payload });
                        else send({ type: "final", payload });
                    } catch (error) {
                        console.error("[assistant.chat] stream failed", error);
                        await finishRun(null, null);
                        send({
                            type: "error",
                            error: { code: "internal", message: "L'assistant n'a pas pu répondre.", retryable: false },
                        });
                    } finally {
                        if (open) {
                            open = false;
                            try {
                                controller.close();
                            } catch {
                                // already closed by a cancel
                            }
                        }
                    }
                },
                cancel() {
                    abort.abort();
                },
            });

            return new NextResponse(stream, {
                headers: {
                    "Content-Type": "application/x-ndjson; charset=utf-8",
                    "Cache-Control": "no-cache, no-transform",
                    "X-Accel-Buffering": "no",
                },
            });
        }

        const payload = await runTurn(() => {}, request.signal);
        const turn = result as AgentTurnResult | null;
        if (turn?.error && turn.status !== "partial") {
            return errorResponse(turn.error.message, HTTP_STATUS[turn.error.code] ?? 502);
        }
        return successResponse(payload);
    } catch (error) {
        await finishRun(result, messageId);
        throw error;
    }
});
