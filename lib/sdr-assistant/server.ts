// ============================================
// SDR ASSISTANT — route helpers (server-only): mode, ownership, row mapping.
// ============================================

import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/api-utils";
import { isAssistantConfigured } from "@/lib/ai/providers";
import type { UserRole } from "@prisma/client";
import { isSdrAssistantDemo } from "./demo";
import type { SdrAssistantMode, SdrConversationCard, SdrMessage, SdrStoredAction } from "./contract";

export const SDR_ASSISTANT_ROLES: UserRole[] = ["SDR", "BUSINESS_DEVELOPER", "BOOKER"];

export function sdrAssistantMode(): SdrAssistantMode {
    // A configured provider always wins: the demo never hides a working model.
    if (isAssistantConfigured()) return "live";
    if (isSdrAssistantDemo()) return "demo";
    return "unavailable";
}

export const UNAVAILABLE_REASON =
    "L'assistant n'est pas encore activé sur cette instance : un manager doit ajouter une clé OpenAI ou DeepSeek (Paramètres → Intégrations).";

/** The conversation, if it belongs to this user — otherwise the same 404 as a missing one. */
export async function ownConversation(id: string, userId: string) {
    const row = await prisma.assistantConversation.findFirst({
        where: { id, createdById: userId, clientId: null, folderId: null, kind: "CHAT" },
        select: { id: true, title: true, lastMessageAt: true, messageCount: true, createdAt: true },
    });
    if (!row) throw new NotFoundError("Conversation introuvable");
    return row;
}

export function toCard(row: { id: string; title: string; lastMessageAt: Date | null; messageCount: number }): SdrConversationCard {
    return {
        id: row.id,
        title: row.title,
        lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
        messageCount: row.messageCount,
    };
}

export function toMessage(row: {
    id: string;
    role: string;
    content: string;
    createdAt: Date;
    action: unknown;
    trace: unknown;
}): SdrMessage {
    const trace = row.trace as { status?: SdrMessage["status"]; entries?: Array<{ label?: string; ok?: boolean }> } | null;
    const sources = [...new Set((trace?.entries ?? []).filter((e) => e.ok && e.label).map((e) => e.label as string))];
    return {
        id: row.id,
        role: row.role === "USER" ? "USER" : "ASSISTANT",
        content: row.content,
        createdAt: row.createdAt.toISOString(),
        action: (row.action as SdrStoredAction | null) ?? null,
        status: trace?.status ?? null,
        sources,
    };
}

/** First question becomes the title, so the history list is scannable. */
export function titleFrom(message: string): string {
    const clean = message.replace(/\[demo:[a-z]+\]/gi, "").trim().replace(/\s+/g, " ");
    return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean || "Nouvelle conversation";
}
