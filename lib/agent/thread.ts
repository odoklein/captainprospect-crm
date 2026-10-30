/**
 * The AGENT thread: one AssistantConversation per job and ISO week, titled
 * "[Agent] <job> — semaine NN", owned by the run's actor. Every digest and
 * report the agent writes is appended there, so a manager reads the agent in
 * the same place as the chat.
 *
 * Track B adds `kind` and `folderId` to conversations; they are set only when
 * the generated client knows them, so this works before and after.
 */

import { DateTime } from "luxon";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ClaimedRun } from "./types";

const APP_TIMEZONE = "Europe/Paris";

export function agentThreadTitle(jobName: string, now: Date): string {
    const week = DateTime.fromJSDate(now, { zone: APP_TIMEZONE }).weekNumber;
    return `[Agent] ${jobName} — semaine ${String(week).padStart(2, "0")}`;
}

let conversationFields: Set<string> | null = null;

/** Whether the generated client has this column on AssistantConversation. */
export function conversationHasField(name: string): boolean {
    if (!conversationFields) {
        try {
            const model = Prisma.dmmf.datamodel.models.find((m) => m.name === "AssistantConversation");
            conversationFields = new Set((model?.fields ?? []).map((f) => f.name));
        } catch {
            conversationFields = new Set();
        }
    }
    return conversationFields.has(name);
}

/** Finds or creates this week's thread for the job. Returns null when conversations cannot be written. */
export async function ensureAgentThread(params: {
    run: ClaimedRun;
    jobName: string;
    clientId: string | null;
    missionId: string | null;
    now: Date;
}): Promise<string | null> {
    const title = agentThreadTitle(params.jobName, params.now);
    try {
        const existing = await prisma.assistantConversation.findFirst({
            where: { title, createdById: params.run.actorId, clientId: params.clientId },
            select: { id: true },
            orderBy: { createdAt: "desc" },
        });
        if (existing) return existing.id;

        const extra: Record<string, unknown> = {};
        if (conversationHasField("kind")) extra.kind = "AGENT";
        if (conversationHasField("folderId") && params.run.folderId) extra.folderId = params.run.folderId;

        const created = await prisma.assistantConversation.create({
            data: {
                title,
                createdById: params.run.actorId,
                clientId: params.clientId,
                missionId: params.clientId ? params.missionId : null,
                ...(extra as object),
            } as Prisma.AssistantConversationUncheckedCreateInput,
            select: { id: true },
        });
        return created.id;
    } catch (error) {
        console.warn("[agent.thread] conversation not available", error instanceof Error ? error.message : error);
        return null;
    }
}

/** Appends one exchange (what the agent was asked, what it wrote) to the thread. */
export async function appendAgentExchange(params: {
    conversationId: string;
    userText: string;
    assistantText: string;
    trace: unknown;
    now: Date;
}): Promise<string | null> {
    try {
        const [, message] = await prisma.$transaction([
            prisma.assistantMessage.create({
                data: { conversationId: params.conversationId, role: "USER", content: params.userText },
                select: { id: true },
            }),
            prisma.assistantMessage.create({
                data: {
                    conversationId: params.conversationId,
                    role: "ASSISTANT",
                    content: params.assistantText || "—",
                    trace: (params.trace ?? Prisma.DbNull) as Prisma.InputJsonValue,
                },
                select: { id: true },
            }),
            prisma.assistantConversation.update({
                where: { id: params.conversationId },
                data: { messageCount: { increment: 2 }, lastMessageAt: params.now },
                select: { id: true },
            }),
        ]);
        return message.id;
    } catch (error) {
        console.error("[agent.thread] exchange not saved", error);
        return null;
    }
}
