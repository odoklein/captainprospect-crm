import type {
    SupportConversationDetailDTO,
    SupportConversationSummaryDTO,
    SupportMessageDTO,
    CreateSupportConversationInput,
    CreateSupportMessageInput,
} from "./types";

class SupportApiError extends Error {
    constructor(
        message: string,
        public status?: number,
        public code?: string,
    ) {
        super(message);
        this.name = "SupportApiError";
    }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
    try {
        const res = await fetch(url, {
            ...init,
            headers: {
                "Content-Type": "application/json",
                ...init?.headers,
            },
        });

        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.success) {
            const errorMsg = json?.error || `Erreur serveur (${res.status})`;
            throw new SupportApiError(errorMsg, res.status, json?.code);
        }

        return json.data as T;
    } catch (err: unknown) {
        if (err instanceof SupportApiError) {
            throw err;
        }
        console.error(`[SupportAPI] Request failed: ${url}`, err);
        throw new SupportApiError(
            err instanceof Error ? err.message : "Erreur de connexion au service de support",
        );
    }
}

export interface SendMessagePayload extends CreateSupportMessageInput {
    conversationId: string;
}

export interface UpcomingMeetingDTO {
    id: string;
    label: string;
    date: string;
}

export const supportApi = {
    /** Fetch conversation details by ID, or primary conversation if omitted. */
    async getConversation(id?: string | null): Promise<SupportConversationDetailDTO | null> {
        const url = id ? `/api/support/conversation?id=${encodeURIComponent(id)}` : "/api/support/conversation";
        return request<SupportConversationDetailDTO>(url);
    },

    /** List all accessible conversations for current user. */
    async listConversations(): Promise<SupportConversationSummaryDTO[]> {
        return request<SupportConversationSummaryDTO[]>("/api/support/conversations");
    },

    /** Create a new dedicated support request. */
    async createConversation(input: CreateSupportConversationInput): Promise<SupportConversationDetailDTO> {
        return request<SupportConversationDetailDTO>("/api/support/conversations", {
            method: "POST",
            body: JSON.stringify(input),
        });
    },

    /** Post a new message to an existing conversation. */
    async sendMessage(payload: SendMessagePayload): Promise<SupportMessageDTO> {
        return request<SupportMessageDTO>("/api/support/conversation/messages", {
            method: "POST",
            body: JSON.stringify(payload),
        });
    },

    /** Mark a conversation as read. */
    async markRead(conversationId?: string): Promise<void> {
        await request<void>("/api/support/conversation/read", {
            method: "POST",
            body: JSON.stringify({ conversationId }),
        }).catch((err) => {
            console.warn("[SupportAPI] Failed to mark read:", err);
        });
    },

    /** Reopen a resolved conversation. */
    async reopenConversation(conversationId?: string): Promise<void> {
        await request<void>("/api/support/conversation/reopen", {
            method: "POST",
            body: JSON.stringify({ conversationId }),
        });
    },

    /** Update email notifications preference on reply. */
    async updateEmailNotification(enabled: boolean, conversationId?: string): Promise<void> {
        await request<void>("/api/support/conversation/email-notification", {
            method: "POST",
            body: JSON.stringify({ enabled, conversationId }),
        });
    },

    /** Fetch upcoming meetings for context mentions. */
    async getUpcomingMeetings(): Promise<UpcomingMeetingDTO[]> {
        try {
            const data = await request<{ meetings: UpcomingMeetingDTO[] }>("/api/support/upcoming-meetings");
            return data.meetings ?? [];
        } catch (err) {
            console.warn("[SupportAPI] Could not load upcoming meetings:", err);
            return [];
        }
    },
};
