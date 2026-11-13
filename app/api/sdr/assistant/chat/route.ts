// ============================================
// POST /api/sdr/assistant/chat — one turn of the Assistant SDR panel
//
// The Assistant Projet's turn (app/api/manager/assistant/chat), narrowed to
// an SDR: same agent runtime, guard, evidence ledger, NDJSON protocol and
// conversation tables, but
//   - SDR roles only, on the user's own panel conversations;
//   - ctx.toolAllowlist = the four SDR tools (lib/ai/tools/definitions/sdr.ts),
//     all of them scoped to ctx.userId;
//   - the model is the configured provider (live) or, only with
//     SDR_ASSISTANT_DEMO=1 outside production, the scripted demo model.
//
// History is read from the database, not from the request. The turn is saved
// whatever its outcome, including when the browser stops the stream.
// ============================================

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { errorResponse, requireRole, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { buildAssistantContext } from "@/lib/ai/tools/context";
import { describePastTrace, type ToolTraceEntry } from "@/lib/ai/tools/loop";
import { SDR_TOOL_NAMES } from "@/lib/ai/tools/definitions/sdr";
import { getAssistantModelConfig, planTurn } from "@/lib/ai/agent/models";
import { providerChat, runAgentTurn, type AgentTurnResult, type ChatTurn } from "@/lib/ai/agent/runtime";
import { recordAiUsage } from "@/lib/ai/ledger";
import { EvidenceStoreUnavailable, prismaEvidenceStore, type RunEndStatus } from "@/lib/ai/agent/evidence/store";
import type { StreamEvent, TurnPayload } from "@/lib/ai/agent/protocol";
import { getBrand } from "@/lib/brand/server";
import { sdrSystemPrompt, sdrTurnContext } from "@/lib/sdr-assistant/prompt";
import { demoChat } from "@/lib/sdr-assistant/demo";
import {
    SDR_ASSISTANT_ROLES,
    UNAVAILABLE_REASON,
    ownConversation,
    sdrAssistantMode,
    titleFrom,
} from "@/lib/sdr-assistant/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Raw turns replayed to the model; older ones fall out (panel threads stay short). */
const HISTORY_TURNS = 12;

const ChatBody = z.object({
    conversationId: z.string().min(1).max(64),
    message: z.string().trim().min(1, "Message vide").max(4000),
    stream: z.boolean().optional(),
});

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
    const session = await requireRole(SDR_ASSISTANT_ROLES, request);
    const body = await validateRequest(request, ChatBody);

    const mode = sdrAssistantMode();
    if (mode === "unavailable") return errorResponse(UNAVAILABLE_REASON, 503);

    const conversation = await ownConversation(body.conversationId, session.user.id);
    const ctx = await buildAssistantContext({
        userId: session.user.id,
        conversationId: conversation.id,
        toolAllowlist: SDR_TOOL_NAMES,
    });

    const config = getAssistantModelConfig();
    const plan = planTurn(config, "standard");

    // One turn at a time per conversation (a double submit would run twice).
    const runId = randomUUID();
    let storeUsable = true;
    try {
        const started = await prismaEvidenceStore.startRun({
            id: runId,
            conversationId: conversation.id,
            userId: ctx.userId,
            clientId: null,
            missionId: null,
            model: mode === "demo" ? "demo-sdr" : plan.model,
            staleBefore: new Date(Date.now() - plan.deadlineMs - 60_000),
        });
        if (started === "busy") {
            return errorResponse("Une réponse est déjà en cours dans cette conversation. Attendez-la ou arrêtez-la.", 409);
        }
    } catch (error) {
        if (!(error instanceof EvidenceStoreUnavailable)) throw error;
        storeUsable = false;
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
            console.error("[sdr-assistant.chat] run not finalised", error);
        }
    };

    const persistTurn = async (result: AgentTurnResult): Promise<string | null> => {
        const trace = {
            entries: result.trace,
            usage: result.usage,
            depth: plan.depth,
            runId: result.runId,
            status: result.status,
            verification: result.verification,
            ...(result.error ? { error: result.error } : {}),
        };
        try {
            const [, answer] = await prisma.$transaction([
                prisma.assistantMessage.create({
                    data: { conversationId: conversation.id, role: "USER", content: body.message },
                    select: { id: true },
                }),
                prisma.assistantMessage.create({
                    data: {
                        conversationId: conversation.id,
                        role: "ASSISTANT",
                        content: result.answer || (result.proposedAction ? "Voici ce que je propose :" : result.error?.message ?? "—"),
                        trace: trace as unknown as Prisma.InputJsonValue,
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
            return answer.id;
        } catch (error) {
            console.error("[sdr-assistant.chat] turn not saved", error);
            return null;
        }
    };

    // Recent raw turns only. An executed or refused action travels with its
    // message, and the ids an earlier answer looked at travel too, so « reporte
    // celui-là » can find the callback it is about.
    const newestFirst = await prisma.assistantMessage.findMany({
        where: { conversationId: conversation.id, supersededAt: null },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: HISTORY_TURNS,
        select: { role: true, content: true, action: true, trace: true },
    });
    const history: ChatTurn[] = newestFirst
        .reverse()
        .map((m) => {
            const action = m.action as { state?: string; outcome?: string } | null;
            const suffix =
                action?.state === "confirmed"
                    ? `\n[Action exécutée] ${action.outcome ?? "OK"}`
                    : action?.state === "cancelled"
                      ? "\n[Action refusée par l'utilisateur]"
                      : "";
            const rawTrace = m.trace as { entries?: ToolTraceEntry[] } | null;
            const past = m.role === "ASSISTANT" ? describePastTrace(rawTrace?.entries) : "";
            return {
                role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
                content: `${m.content}${suffix}${past}`.trim() || "(vide)",
            };
        });
    history.push({ role: "user", content: body.message });

    const brand = await getBrand();
    const systemPrompt = sdrSystemPrompt(brand);
    const contextMessage = sdrTurnContext({ userName: ctx.userName, role: ctx.role, now: new Date(), demo: mode === "demo" });

    let result: AgentTurnResult | null = null;
    let messageId: string | null = null;

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
                knownNames: [ctx.userName, brand.name].filter(Boolean),
                contextMessage,
                toolNames: SDR_TOOL_NAMES,
            },
            mode === "demo"
                ? { chat: demoChat, store: storeUsable ? prismaEvidenceStore : null, surface: "sdr_assistant.chat" }
                : { chat: providerChat(), store: storeUsable ? prismaEvidenceStore : null, ledger: recordAiUsage, surface: "sdr_assistant.chat" },
        );
        messageId = await persistTurn(result);
        await finishRun(result, messageId);
        return toPayload(result, messageId);
    };

    if (!body.stream) {
        try {
            const payload = await runTurn(() => {}, request.signal);
            return NextResponse.json({ success: true, data: payload });
        } catch (error) {
            await finishRun(result, messageId);
            throw error;
        }
    }

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
                console.error("[sdr-assistant.chat] stream failed", error);
                await finishRun(null, null);
                send({ type: "error", error: { code: "internal", message: "L'assistant n'a pas pu répondre.", retryable: true } });
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
});
