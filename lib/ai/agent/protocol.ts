/**
 * Wire contract between the chat route and the browser: the streamed events
 * and the final answer contract. Types only — imported by client components.
 *
 * The stream is NDJSON (one JSON object per line). `final` is authoritative:
 * the streamed `delta` text is a draft until it arrives, and a `reset` means
 * the draft was discarded (verification repair, or a new model round).
 */

export type TurnStatus =
    /** Answered; every checked claim traced to evidence (or there was nothing to check). */
    | "complete"
    /** Answered, but some claims could not be verified — they are marked in the text. */
    | "partial"
    /** The turn ended on a confirmation card. */
    | "action_proposed"
    | "cancelled"
    | "timeout"
    | "failed";

export type EvidenceStatus = "OK" | "EMPTY" | "ERROR";

export interface CitationRef {
    /** Label the model used, e.g. "E1". Never a database id. */
    label: string;
    /** Server-resolved id; null when the ledger could not persist it. */
    evidenceId: string | null;
    tool: string;
    toolLabel: string;
    status: EvidenceStatus;
    summary: string;
    retrievedAt: string;
}

export interface UnverifiedClaim {
    kind: "number" | "date" | "entity" | "citation";
    text: string;
    reason: string;
}

export interface VerificationReport {
    checked: number;
    verified: number;
    failed: number;
    repaired: boolean;
    /** No claim to check (no figure, date or name in the answer). */
    skipped: boolean;
}

export interface TraceStep {
    tool: string;
    label: string;
    ok: boolean;
    durationMs: number;
    errorCode?: string;
    cached?: boolean;
    evidence?: string;
    /**
     * What the tool was called with (ids, filters), compacted. Tool results are
     * not replayed between turns, these are: a follow-up can reopen the record.
     */
    args?: Record<string, unknown>;
}

export interface TurnUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costEur: number;
    model: string;
}

export interface PendingActionPayload {
    tool: string;
    args: Record<string, unknown>;
    card: {
        title: string;
        details: Array<{ label: string; value: string }>;
        warning: string | null;
        confirmLabel: string;
        danger: boolean;
    };
    state: "pending";
    proposedAt: string;
}

export interface TurnPayload {
    messageId: string | null;
    runId: string;
    answer: string;
    status: TurnStatus;
    pendingAction: PendingActionPayload | null;
    trace: TraceStep[];
    citations: CitationRef[];
    unverifiedClaims: UnverifiedClaim[];
    verification: VerificationReport;
    model: string;
    usage: TurnUsage;
}

export type AssistantErrorCode =
    | "timeout"
    | "cancelled"
    | "rate_limited"
    | "provider_unavailable"
    | "provider_auth"
    | "busy"
    | "not_configured"
    | "internal";

export interface AssistantErrorPayload {
    code: AssistantErrorCode;
    message: string;
    /** True when sending the same message again has a fair chance to work. */
    retryable: boolean;
}

export type StreamEvent =
    | { type: "start"; runId: string; model: string }
    | { type: "phase"; phase: "thinking" | "tools" | "writing" | "verifying" | "repairing" }
    | { type: "tool_start"; id: string; tool: string; label: string }
    | {
          type: "tool_end";
          id: string;
          tool: string;
          label: string;
          ok: boolean;
          durationMs: number;
          errorCode?: string;
          cached?: boolean;
          evidence?: string;
      }
    | { type: "delta"; text: string }
    | { type: "reset" }
    | { type: "retry"; attempt: number; delayMs: number }
    | { type: "final"; payload: TurnPayload }
    | { type: "error"; error: AssistantErrorPayload; payload?: TurnPayload };
