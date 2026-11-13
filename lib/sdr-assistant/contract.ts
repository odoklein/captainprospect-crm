// ============================================
// SDR ASSISTANT — wire contract between /api/sdr/assistant/* and the panel.
// Types and constants only: imported by client components.
// ============================================

import type { PendingActionPayload, TurnPayload } from "@/lib/ai/agent/protocol";

export const SDR_ASSISTANT_API = {
    conversations: "/api/sdr/assistant/conversations",
    conversation: (id: string) => `/api/sdr/assistant/conversations/${encodeURIComponent(id)}`,
    chat: "/api/sdr/assistant/chat",
    execute: "/api/sdr/assistant/execute",
} as const;

/**
 * live        — a provider key is configured: real model.
 * demo        — SDR_ASSISTANT_DEMO=1 outside production: scripted model, real data.
 * unavailable — neither: the panel says so and keeps history readable.
 */
export type SdrAssistantMode = "live" | "demo" | "unavailable";

export interface SdrConversationCard {
    id: string;
    title: string;
    lastMessageAt: string | null;
    messageCount: number;
}

export type SdrActionState = PendingActionPayload["state"] | "executing" | "confirmed" | "cancelled" | "failed" | "expired";

export interface SdrStoredAction extends Omit<PendingActionPayload, "state"> {
    state: SdrActionState;
    outcome?: string;
}

export interface SdrMessage {
    id: string;
    role: "USER" | "ASSISTANT";
    content: string;
    createdAt: string;
    action: SdrStoredAction | null;
    /** Turn status for assistant answers (cancelled, failed, partial…). */
    status?: TurnPayload["status"] | null;
    /** Names of the CRM lookups the answer used, for the « Sources » line. */
    sources?: string[];
}

export interface SdrConversationsResponse {
    mode: SdrAssistantMode;
    /** Shown when mode = unavailable. */
    unavailableReason: string | null;
    conversations: SdrConversationCard[];
}

export interface SdrThreadResponse {
    conversation: SdrConversationCard;
    messages: SdrMessage[];
}
