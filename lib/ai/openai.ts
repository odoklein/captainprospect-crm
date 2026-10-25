/**
 * OpenAI API client with native tool calling support for low-cost models.
 * Defaults to `gpt-4o-mini` for lightning speed and minimal token expense.
 *
 * Every call takes an optional AbortSignal (turn cancelled, client gone,
 * deadline) and its own timeout. Errors are typed: `retryable` says whether
 * sending the same request again can help. There is no retry here — the agent
 * runtime owns the single retry layer.
 */

export const DEFAULT_LOW_COST_MODEL = "gpt-4o-mini";

export function getOpenAILowCostModel(): string {
    return process.env.OPENAI_ASSISTANT_MODEL || DEFAULT_LOW_COST_MODEL;
}

export interface OpenAIToolCall {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string;
    };
}

export interface OpenAIToolSpec {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}

export type OpenAIChatMessage =
    | { role: "system"; content: string }
    | { role: "user"; content: string }
    | {
          role: "assistant";
          content: string | null;
          tool_calls?: OpenAIToolCall[];
      }
    | {
          role: "tool";
          tool_call_id: string;
          content: string;
      };

export interface OpenAIChatOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    tools?: OpenAIToolSpec[];
    toolChoice?: "auto" | "none" | "required";
}

export interface OpenAIChatResponse {
    message: {
        role: "assistant";
        content: string | null;
        tool_calls?: OpenAIToolCall[];
    };
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    model: string;
}

/**
 * What went wrong, as far as the caller needs to know: whether to retry, and
 * what to tell the user. `retryable` is the only input the retry layer reads.
 */
export type OpenAIErrorKind =
    | "timeout"
    | "cancelled"
    | "rate_limited"
    | "auth"
    | "bad_request"
    | "server"
    | "network"
    | "empty";

export class OpenAIError extends Error {
    readonly kind: OpenAIErrorKind;
    readonly retryable: boolean;
    readonly retryAfterMs?: number;
    /** True once text was streamed to the caller: retrying would duplicate it. */
    partial = false;

    constructor(
        public readonly code: string,
        message: string,
        public readonly status: number = 500,
        public readonly userMessage: string = "Une erreur est survenue lors de l'appel à OpenAI.",
        options: { kind?: OpenAIErrorKind; retryable?: boolean; retryAfterMs?: number; cause?: unknown } = {}
    ) {
        super(message);
        this.name = "OpenAIError";
        this.kind = options.kind ?? (status >= 500 ? "server" : "bad_request");
        this.retryable =
            options.retryable ?? (this.kind === "server" || this.kind === "network" || this.kind === "rate_limited");
        this.retryAfterMs = options.retryAfterMs;
        if (options.cause !== undefined) this.cause = options.cause;
    }
}

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

function retryAfterMs(response: Response): number | undefined {
    const ms = response.headers.get("retry-after-ms");
    if (ms && Number.isFinite(Number(ms))) return Number(ms);
    const header = response.headers.get("retry-after");
    if (!header) return undefined;
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return seconds * 1000;
    const date = Date.parse(header);
    return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

async function errorFromResponse(response: Response): Promise<OpenAIError> {
    const errorJson = await response.json().catch(() => ({}));
    const rawMessage =
        (errorJson as { error?: { message?: string; code?: string } })?.error?.message || response.statusText;
    const errCode = (errorJson as { error?: { code?: string } })?.error?.code || `HTTP_${response.status}`;

    if (response.status === 401 || response.status === 403) {
        return new OpenAIError("AUTH_ERROR", rawMessage, 401, "Clé API OpenAI invalide ou expirée.", {
            kind: "auth",
            retryable: false,
        });
    }
    if (response.status === 429) {
        // "insufficient_quota" is a billing state, not a burst: retrying cannot help.
        return new OpenAIError(
            "RATE_LIMITED",
            rawMessage,
            429,
            "Le quota OpenAI est dépassé ou la limite de requêtes par minute a été atteinte.",
            { kind: "rate_limited", retryable: errCode !== "insufficient_quota", retryAfterMs: retryAfterMs(response) }
        );
    }
    if (response.status === 408 || response.status === 409 || response.status >= 500) {
        return new OpenAIError(
            errCode,
            `OpenAI API error (${response.status}): ${rawMessage}`,
            response.status,
            "Le service d'intelligence artificielle est momentanément indisponible.",
            { kind: "server", retryable: true, retryAfterMs: retryAfterMs(response) }
        );
    }
    return new OpenAIError(
        errCode,
        `OpenAI API error (${response.status}): ${rawMessage}`,
        response.status,
        `Erreur OpenAI : ${rawMessage}`,
        { kind: "bad_request", retryable: false }
    );
}

/**
 * One signal for one HTTP call: the caller's (turn cancelled / deadline) plus
 * this call's own timer. `timedOut()` tells the two apart afterwards.
 */
function callSignal(caller: AbortSignal | undefined, timeoutMs: number | undefined) {
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = (ms: number | undefined) => {
        if (timer) clearTimeout(timer);
        if (!ms) return;
        timer = setTimeout(() => {
            timedOut = true;
            controller.abort(new Error("provider timeout"));
        }, ms);
    };
    arm(timeoutMs);
    const onAbort = () => controller.abort(caller?.reason);
    if (caller?.aborted) controller.abort(caller.reason);
    else caller?.addEventListener("abort", onAbort, { once: true });
    return {
        signal: controller.signal,
        timedOut: () => timedOut,
        /** Restart the clock — the idle timeout while a stream flows. */
        rearm: arm,
        dispose: () => {
            if (timer) clearTimeout(timer);
            caller?.removeEventListener("abort", onAbort);
        },
    };
}

function abortError(timedOut: boolean, caller: AbortSignal | undefined, cause: unknown): OpenAIError {
    if (timedOut) {
        return new OpenAIError(
            "TIMEOUT",
            "OpenAI request timed out",
            504,
            "Le service d'intelligence artificielle met trop de temps à répondre.",
            { kind: "timeout", retryable: true, cause }
        );
    }
    return new OpenAIError("CANCELLED", "Request cancelled", 499, "Requête annulée.", {
        kind: "cancelled",
        retryable: false,
        cause: caller?.reason ?? cause,
    });
}

function networkError(err: unknown): OpenAIError {
    return new OpenAIError(
        "NETWORK_ERROR",
        err instanceof Error ? err.message : "Network failure calling OpenAI",
        502,
        "Impossible de contacter le service d'intelligence artificielle. Vérifiez la connexion réseau.",
        { kind: "network", retryable: true, cause: err }
    );
}

interface ChatRequest {
    messages: OpenAIChatMessage[];
    tools?: OpenAIToolSpec[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    /** Caller cancellation (turn cancelled, deadline, client disconnect). */
    signal?: AbortSignal;
    /** Non-streaming: whole request. Streaming: time to the response headers. */
    timeoutMs?: number;
}

function requestBody(options: ChatRequest, model: string): Record<string, unknown> {
    const body: Record<string, unknown> = {
        model,
        messages: options.messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 1500,
    };
    if (options.tools && options.tools.length > 0) {
        body.tools = options.tools;
        body.tool_choice = "auto";
    }
    return body;
}

export async function openaiChat(apiKey: string, options: ChatRequest): Promise<OpenAIChatResponse> {
    const model = options.model ?? getOpenAILowCostModel();
    const call = callSignal(options.signal, options.timeoutMs);

    let data: {
        choices?: Array<{
            message?: {
                role?: string;
                content?: string | null;
                tool_calls?: OpenAIToolCall[];
            };
        }>;
        usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
        };
        model?: string;
    };

    try {
        const response = await fetch(OPENAI_CHAT_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey.trim()}`,
            },
            body: JSON.stringify(requestBody(options, model)),
            signal: call.signal,
        });
        if (!response.ok) throw await errorFromResponse(response);
        data = (await response.json()) as typeof data;
    } catch (err) {
        if (err instanceof OpenAIError) throw err;
        if (call.signal.aborted) throw abortError(call.timedOut(), options.signal, err);
        throw networkError(err);
    } finally {
        call.dispose();
    }

    const choice = data.choices?.[0];
    if (!choice || !choice.message) {
        throw new OpenAIError(
            "EMPTY_RESPONSE",
            "OpenAI returned no choices in response",
            502,
            "L'assistant n'a renvoyé aucune réponse.",
            { kind: "empty", retryable: true }
        );
    }

    return {
        message: {
            role: "assistant",
            content: choice.message.content ?? null,
            tool_calls: choice.message.tool_calls,
        },
        usage: data.usage
            ? {
                  promptTokens: data.usage.prompt_tokens ?? 0,
                  completionTokens: data.usage.completion_tokens ?? 0,
                  totalTokens: data.usage.total_tokens ?? 0,
              }
            : undefined,
        model: data.model ?? model,
    };
}

// ============================================
// STREAMING
// ============================================

interface StreamChunk {
    model?: string;
    choices?: Array<{
        delta?: {
            content?: string | null;
            tool_calls?: Array<{
                index: number;
                id?: string;
                type?: "function";
                function?: { name?: string; arguments?: string };
            }>;
        };
        finish_reason?: string | null;
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
}

/**
 * Parses a Chat Completions SSE body into the same response shape as
 * `openaiChat`. Exported for tests: it is the part a fake stream can exercise.
 */
export async function readChatStream(
    body: ReadableStream<Uint8Array>,
    fallbackModel: string,
    hooks: { onTextDelta?: (text: string) => void; onChunk?: () => void } = {}
): Promise<OpenAIChatResponse> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let model = fallbackModel;
    let usage: OpenAIChatResponse["usage"];
    let sawDone = false;
    const calls: Array<{ id: string; name: string; arguments: string }> = [];

    const handle = (line: string) => {
        if (!line.startsWith("data:")) return;
        const payload = line.slice(5).trim();
        if (!payload) return;
        if (payload === "[DONE]") {
            sawDone = true;
            return;
        }
        const chunk = JSON.parse(payload) as StreamChunk;
        if (chunk.model) model = chunk.model;
        if (chunk.usage) {
            usage = {
                promptTokens: chunk.usage.prompt_tokens ?? 0,
                completionTokens: chunk.usage.completion_tokens ?? 0,
                totalTokens: chunk.usage.total_tokens ?? 0,
            };
        }
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) return;
        if (delta.content) {
            content += delta.content;
            hooks.onTextDelta?.(delta.content);
        }
        for (const part of delta.tool_calls ?? []) {
            const slot = (calls[part.index] ??= { id: "", name: "", arguments: "" });
            if (part.id) slot.id = part.id;
            if (part.function?.name) slot.name += part.function.name;
            if (part.function?.arguments) slot.arguments += part.function.arguments;
        }
    };

    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        hooks.onChunk?.();
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline).replace(/\r$/, "");
            buffer = buffer.slice(newline + 1);
            handle(line);
        }
    }
    if (buffer.trim()) handle(buffer.trim());

    // A body that ends without [DONE] was cut mid-answer: never treat it as complete.
    if (!sawDone) {
        throw new OpenAIError("STREAM_TRUNCATED", "Stream ended before [DONE]", 502,
            "La réponse du service d'intelligence artificielle a été interrompue.", {
                kind: "network",
                retryable: true,
            });
    }

    const toolCalls: OpenAIToolCall[] = calls
        .filter((c) => c && c.name)
        .map((c, i) => ({ id: c.id || `call_${i}`, type: "function", function: { name: c.name, arguments: c.arguments } }));

    return {
        message: {
            role: "assistant",
            content: content || null,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        },
        usage,
        model,
    };
}

/**
 * Streaming variant of `openaiChat`. `timeoutMs` bounds the wait for the
 * response headers; after that, `idleTimeoutMs` bounds the silence between two
 * chunks, so a stalled stream ends instead of hanging the turn.
 */
export async function openaiChatStream(
    apiKey: string,
    options: ChatRequest & { idleTimeoutMs?: number; onTextDelta?: (text: string) => void }
): Promise<OpenAIChatResponse> {
    const model = options.model ?? getOpenAILowCostModel();
    const call = callSignal(options.signal, options.timeoutMs);
    let emitted = false;

    try {
        const response = await fetch(OPENAI_CHAT_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey.trim()}`,
            },
            body: JSON.stringify({
                ...requestBody(options, model),
                stream: true,
                stream_options: { include_usage: true },
            }),
            signal: call.signal,
        });
        if (!response.ok) throw await errorFromResponse(response);
        if (!response.body) throw networkError(new Error("empty response body"));

        call.rearm(options.idleTimeoutMs ?? options.timeoutMs);
        return await readChatStream(response.body, model, {
            onChunk: () => call.rearm(options.idleTimeoutMs ?? options.timeoutMs),
            onTextDelta: (text) => {
                emitted = true;
                options.onTextDelta?.(text);
            },
        });
    } catch (err) {
        let error: OpenAIError;
        if (err instanceof OpenAIError) error = err;
        else if (call.signal.aborted) error = abortError(call.timedOut(), options.signal, err);
        else error = networkError(err);
        error.partial = emitted;
        throw error;
    } finally {
        call.dispose();
    }
}

// Backwards compatibility for existing simple text completions
export interface OpenAIMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface OpenAIChatResult {
    text: string;
    usage?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
    };
    model?: string;
}

export async function openaiChatComplete(
    apiKey: string,
    messages: OpenAIMessage[],
    options: OpenAIChatOptions = {}
): Promise<OpenAIChatResult> {
    const res = await openaiChat(apiKey, {
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        model: options.model,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        tools: options.tools,
    });

    return {
        text: res.message.content || "",
        model: res.model,
        usage: res.usage,
    };
}
