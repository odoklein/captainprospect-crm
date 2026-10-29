/**
 * Provider-neutral chat contract.
 *
 * The agent runtime, the JSON helper and the background agent all speak this
 * shape. Each wire (OpenAI Chat Completions, OpenAI Responses, DeepSeek's
 * OpenAI-compatible endpoint) translates it to and from its own JSON, so the
 * runtime never sees `tool_calls[].function` or `function_call_output`.
 *
 * Usage carries four counters on purpose: cached input is billed at a fraction
 * of the price and reasoning tokens are billed as output. Without them the
 * ledger overstates the cost and nobody can see whether prompt caching works.
 */

export type ProviderId = "openai" | "deepseek";

export type Wire = "openai-chat" | "openai-responses";

/** Where an endpoint processes the data. Drives the GDPR routing policy. */
export type Residency = "eu" | "us" | "cn";

/**
 * What a call may contain. `raw_crm` = prospect names, phones, notes and
 * transcripts (every assistant turn). `aggregated` = counts and rates only.
 * `public` = company names and public web pages.
 */
export type DataClass = "raw_crm" | "aggregated" | "public";

export type ReasoningEffort = "none" | "low" | "medium" | "high";

export type ToolChoice = "auto" | "none" | "required";

export interface ToolCall {
    id: string;
    name: string;
    /** Raw JSON string, exactly as the model wrote it. */
    arguments: string;
}

export interface ToolSpec {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}

export type ChatMessage =
    | { role: "system"; content: string }
    | { role: "user"; content: string }
    | {
          role: "assistant";
          content: string | null;
          toolCalls?: ToolCall[];
          /**
           * Opaque items the wire must replay before the tool calls (Responses
           * API reasoning items with encrypted content). Never read, never
           * persisted beyond the turn.
           */
          providerItems?: unknown[];
      }
    | { role: "tool"; toolCallId: string; name?: string; content: string };

export interface Usage {
    inputTokens: number;
    /** Part of `inputTokens` served from the provider's prompt cache. */
    cachedInputTokens: number;
    outputTokens: number;
    /** Part of `outputTokens` spent on hidden reasoning. */
    reasoningTokens: number;
    totalTokens: number;
}

export const EMPTY_USAGE: Usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 };

export function addUsage(a: Usage, b: Usage | null | undefined): Usage {
    if (!b) return a;
    return {
        inputTokens: a.inputTokens + b.inputTokens,
        cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
        outputTokens: a.outputTokens + b.outputTokens,
        reasoningTokens: a.reasoningTokens + b.reasoningTokens,
        totalTokens: a.totalTokens + b.totalTokens,
    };
}

export type FinishReason = "stop" | "tool_calls" | "length" | "incomplete" | "unknown";

export interface ChatCallRequest {
    /** Catalog id ("gpt-5.5", "deepseek-chat"); the wire maps it to the endpoint's name. */
    model: string;
    messages: ChatMessage[];
    tools?: ToolSpec[];
    /** Defaults to "auto" when tools are sent. "none" keeps the tool prefix cacheable on the last round. */
    toolChoice?: ToolChoice;
    temperature?: number;
    maxOutputTokens: number;
    reasoningEffort: ReasoningEffort;
    /** Ask for a reasoning summary stream (Responses API only). */
    reasoningSummary?: boolean;
    responseFormat?: "text" | "json";
    /** Stable key for prompt caching (OpenAI `prompt_cache_key`); the conversation id. */
    cacheKey?: string;
    /** Caller cancellation (turn cancelled, deadline, client disconnect). */
    signal?: AbortSignal;
    /** Time to the response headers. */
    timeoutMs: number;
    /** Max silence between two stream chunks; defaults to `timeoutMs`. */
    idleTimeoutMs?: number;
    onTextDelta?: (text: string) => void;
    onReasoningDelta?: (text: string) => void;
}

export interface ChatCallResponse {
    text: string | null;
    toolCalls: ToolCall[];
    /** See ChatMessage.providerItems. */
    providerItems?: unknown[];
    usage: Usage | null;
    /** The model name the endpoint reports. */
    model: string;
    provider: ProviderId;
    finish: FinishReason;
}

export interface Provider {
    readonly id: ProviderId;
    readonly wire: Wire;
    readonly baseUrl: string;
    call(request: ChatCallRequest): Promise<ChatCallResponse>;
}

export type ChatFn = (request: ChatCallRequest) => Promise<ChatCallResponse>;
