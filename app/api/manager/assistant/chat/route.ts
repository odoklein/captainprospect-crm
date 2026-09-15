// ============================================
// POST /api/manager/assistant/chat — one turn of the Assistant Projet
//
// Read and safe-write tools run server-side inside the loop; a proposed
// `confirm` action comes back as `pendingAction` and goes no further until
// /execute receives a click.
//
// History is read from the database, not from the request: the browser sends a
// message and a conversation id, never a transcript it could have edited.
// ============================================

import { NextRequest } from "next/server";
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
import { MistralError } from "@/lib/ai/mistral";
import { buildAssistantContext } from "@/lib/ai/tools/context";
import { buildToolUsagePrompt, runAssistantTurn, type ChatTurn } from "@/lib/ai/tools/loop";
import { getAssistantSystemPrompt } from "@/lib/assistant/projet/systemPrompt";

const ChatBody = z.object({
    conversationId: z.string().min(1),
    message: z.string().min(1).max(4000),
});

/** First user message becomes the thread title, so history is scannable. */
function titleFrom(message: string): string {
    const clean = message.trim().replace(/\s+/g, " ");
    return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const body = await validateRequest(request, ChatBody);

    if (!process.env.MISTRAL_API_KEY) {
        return errorResponse(
            "L'assistant n'est pas configuré : MISTRAL_API_KEY est absente côté serveur.",
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
    });

    // Only the last 20 turns travel to the model: older ones carry stale ids
    // more often than useful context.
    const previous = await prisma.assistantMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { role: true, content: true, action: true },
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
            return {
                role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
                content: `${m.content}${suffix}`.trim() || "(vide)",
            };
        })
        .filter((m) => m.content.length > 0);

    history.push({ role: "user", content: body.message });

    const systemPrompt = [
        getAssistantSystemPrompt(ctx),
        buildToolUsagePrompt(ctx),
    ].join("\n\n");

    let turn;
    try {
        turn = await runAssistantTurn({
            systemPrompt,
            history,
            ctx,
            apiKey: process.env.MISTRAL_API_KEY,
        });
    } catch (error) {
        if (error instanceof MistralError) {
            console.error("[assistant.chat] mistral", error.code, error.message);
            return errorResponse(error.userMessage, error.status === 429 ? 429 : 502);
        }
        console.error("[assistant.chat] turn failed", error);
        return errorResponse(
            error instanceof Error ? error.message : "L'assistant n'a pas pu répondre",
            502,
        );
    }

    const action = turn.proposedAction
        ? {
            tool: turn.proposedAction.tool,
            args: turn.proposedAction.args,
            card: turn.proposedAction.card,
            state: "pending" as const,
        }
        : null;

    const [, assistantMessage] = await prisma.$transaction([
        prisma.assistantMessage.create({
            data: { conversationId: conversation.id, role: "USER", content: body.message },
        }),
        prisma.assistantMessage.create({
            data: {
                conversationId: conversation.id,
                role: "ASSISTANT",
                content: turn.answer || (action ? "Voici l'action que je propose :" : "—"),
                trace: (turn.trace.length > 0 ? turn.trace : undefined) as unknown as Prisma.InputJsonValue,
                action: (action ?? undefined) as unknown as Prisma.InputJsonValue,
            },
            select: { id: true, content: true, createdAt: true },
        }),
        prisma.assistantConversation.update({
            where: { id: conversation.id },
            data: {
                messageCount: { increment: 2 },
                lastMessageAt: new Date(),
                ...(conversation.messageCount === 0 ? { title: titleFrom(body.message) } : {}),
            },
        }),
    ]);

    return successResponse({
        messageId: assistantMessage.id,
        answer: assistantMessage.content,
        pendingAction: action,
        trace: turn.trace,
        model: turn.model,
        usage: turn.usage,
    });
});
