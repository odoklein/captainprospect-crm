export interface TraceEntry {
    tool: string;
    label: string;
    ok: boolean;
    durationMs: number;
    errorCode?: string;
}

export interface ActionCardData {
    title: string;
    details: Array<{ label: string; value: string }>;
    warning: string | null;
    confirmLabel: string;
    danger: boolean;
}

export interface StoredAction {
    tool: string;
    args: Record<string, unknown>;
    card: ActionCardData;
    state: "pending" | "confirmed" | "cancelled" | "failed";
    outcome?: string;
}

export interface AssistantMessageMeta {
    messageId?: string;
    trace?: TraceEntry[] | { entries?: TraceEntry[]; usage?: { promptTokens: number; completionTokens: number; totalTokens: number; costEur: number } };
    action?: StoredAction | null;
    secret?: {
        credentialId: string;
        password: string;
        expiresAt: number;
    } | null;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        costEur: number;
    };
    model?: string;
}

export interface MissionOption {
    id: string;
    name: string;
    status: string;
}

export interface ClientOption {
    id: string;
    name: string;
    missions: MissionOption[];
}

export interface ConversationSummary {
    id: string;
    title: string;
    summary: string | null;
    messageCount: number;
    lastMessageAt: string | null;
    updatedAt: string;
}
