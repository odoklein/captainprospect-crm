/**
 * The Chat Completions wire, shared by OpenAI and every OpenAI-compatible
 * endpoint (DeepSeek). Always streams: deltas feed the UI, and `include_usage`
 * puts the token counts in the last chunk.
 *
 * Quirks capture the few places the compatible endpoints differ: the name of
 * the output cap, the cache-hit counter, and whether `reasoning_effort` and
 * `prompt_cache_key` are understood.
 */

import { ProviderError } from "./errors";
import {
    callSignal,
    errorFromResponse,
    jsonHeaders,
    readSse,
    toProviderError,
    truncatedStreamError,
} from "./http";
import { endpointModelId, resolveModel, type ModelSpec } from "./catalog";
import type { ChatCallRequest, ChatCallResponse, ChatMessage, FinishReason, Provider, ProviderId, ToolCall, Usage } from "./types";

export interface ChatWireQuirks {
    /** Shown in error messages: "OpenAI", "DeepSeek". */
    label: string;
    maxTokensField: "max_completion_tokens" | "max_tokens";
    /** Sends `prompt_cache_key` (OpenAI). Others cache on the prefix by themselves. */
    promptCacheKey: boolean;
    /** Sends `reasoning_effort` for reasoning models. */
    reasoningEffortParam: boolean;
    /** Where the cache-hit counter lives in `usage`. */
    cacheUsage: "openai" | "deepseek";
}

export const OPENAI_CHAT_QUIRKS: ChatWireQuirks = {
    label: "OpenAI",
    maxTokensField: "max_completion_tokens",
    promptCacheKey: true,
    reasoningEffortParam: true,
    cacheUsage: "openai",
};

export const DEEPSEEK_CHAT_QUIRKS: ChatWireQuirks = {
    label: "DeepSeek",
    maxTokensField: "max_tokens",
    promptCacheKey: false,
    reasoningEffortParam: false,
    cacheUsage: "deepseek",
};

/** Neutral messages → Chat Completions messages. */
export function toChatMessages(messages: ChatMessage[]): unknown[] {
    return messages.map((m) => {
        switch (m.role) {
            case "assistant":
                return {
                    role: "assistant",
                    content: m.content,
                    ...(m.toolCalls && m.toolCalls.length > 0
                        ? {
                              tool_calls: m.toolCalls.map((c) => ({
                                  id: c.id,
                                  type: "function",
                                  function: { name: c.name, arguments: c.arguments },
                              })),
                          }
                        : {}),
                };
            case "tool":
                return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
            default:
                return { role: m.role, content: m.content };
        }
    });
}

/** A custom temperature only where the model family accepts one. */
export function temperatureFor(request: Pick<ChatCallRequest, "temperature" | "reasoningEffort">, spec: ModelSpec): number | undefined {
    if (request.temperature === undefined) return undefined;
    if (spec.temperature === "always") return request.temperature;
    if (spec.temperature === "effort-none-only") return request.reasoningEffort === "none" ? request.temperature : undefined;
    return undefined;
}

export function buildChatBody(
    request: ChatCallRequest,
    spec: ModelSpec,
    quirks: ChatWireQuirks,
    env: NodeJS.ProcessEnv = process.env,
): Record<string, unknown> {
    const body: Record<string, unknown> = {
        model: endpointModelId(spec, env),
        messages: toChatMessages(request.messages),
        [quirks.maxTokensField]: request.maxOutputTokens,
        stream: true,
        stream_options: { include_usage: true },
    };
    const temperature = temperatureFor(request, spec);
    if (temperature !== undefined) body.temperature = temperature;
    if (quirks.reasoningEffortParam && spec.reasoning) {
        // o-series know no "none"; GPT-5 with "none" samples like a classic model.
        body.reasoning_effort = spec.family === "o-series" && request.reasoningEffort === "none" ? "low" : request.reasoningEffort;
    }
    if (request.tools && request.tools.length > 0) {
        body.tools = request.tools.map((t) => ({
            type: "function",
            function: { name: t.name, description: t.description, parameters: t.parameters },
        }));
        body.tool_choice = request.toolChoice ?? "auto";
    }
    if (request.responseFormat === "json") body.response_format = { type: "json_object" };
    if (quirks.promptCacheKey && request.cacheKey) body.prompt_cache_key = request.cacheKey;
    return body;
}

interface RawUsage {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
}

export function parseChatUsage(raw: RawUsage | null | undefined, quirks: ChatWireQuirks): Usage | null {
    if (!raw) return null;
    const inputTokens = raw.prompt_tokens ?? 0;
    const outputTokens = raw.completion_tokens ?? 0;
    const cachedInputTokens =
        quirks.cacheUsage === "deepseek"
            ? raw.prompt_cache_hit_tokens ?? raw.prompt_tokens_details?.cached_tokens ?? 0
            : raw.prompt_tokens_details?.cached_tokens ?? 0;
    return {
        inputTokens,
        cachedInputTokens: Math.min(cachedInputTokens, inputTokens),
        outputTokens,
        reasoningTokens: Math.min(raw.completion_tokens_details?.reasoning_tokens ?? 0, outputTokens),
        totalTokens: raw.total_tokens ?? inputTokens + outputTokens,
    };
}

interface StreamChunk {
    model?: string;
    choices?: Array<{
        delta?: {
            content?: string | null;
            reasoning_content?: string | null;
            tool_calls?: Array<{
                index: number;
                id?: string;
                type?: "function";
                function?: { name?: string; arguments?: string };
            }>;
        };
        finish_reason?: string | null;
    }>;
    usage?: RawUsage | null;
}

function finishFrom(reason: string | null | undefined, hasCalls: boolean): FinishReason {
    if (hasCalls) return "tool_calls";
    switch (reason) {
        case "stop":
            return "stop";
        case "tool_calls":
            return "tool_calls";
        case "length":
            return "length";
        default:
            return reason ? "unknown" : "stop";
    }
}

/**
 * Parses a Chat Completions SSE body into a neutral response. Exported for
 * tests: it is the part a fake stream can exercise.
 */
export async function readChatStream(
    body: ReadableStream<Uint8Array>,
    fallbackModel: string,
    provider: ProviderId,
    quirks: ChatWireQuirks,
    hooks: { onTextDelta?: (text: string) => void; onReasoningDelta?: (text: string) => void; onChunk?: () => void } = {},
): Promise<ChatCallResponse> {
    let content = "";
    let model = fallbackModel;
    let usage: Usage | null = null;
    let finishReason: string | null | undefined;
    let sawDone = false;
    const calls: Array<{ id: string; name: string; arguments: string }> = [];

    await readSse(body, {
        onChunk: hooks.onChunk,
        onData: (payload) => {
            if (payload === "[DONE]") {
                sawDone = true;
                return;
            }
            const chunk = JSON.parse(payload) as StreamChunk;
            if (chunk.model) model = chunk.model;
            if (chunk.usage) usage = parseChatUsage(chunk.usage, quirks);
            const choice = chunk.choices?.[0];
            if (!choice) return;
            if (choice.finish_reason) finishReason = choice.finish_reason;
            const delta = choice.delta;
            if (!delta) return;
            if (delta.reasoning_content) hooks.onReasoningDelta?.(delta.reasoning_content);
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
        },
    });

    // A body that ends without [DONE] was cut mid-answer: never treat it as complete.
    if (!sawDone) throw truncatedStreamError(provider);

    const toolCalls: ToolCall[] = calls
        .filter((c) => c && c.name)
        .map((c, i) => ({ id: c.id || `call_${i}`, name: c.name, arguments: c.arguments }));

    return {
        text: content || null,
        toolCalls,
        usage,
        model,
        provider,
        finish: finishFrom(finishReason, toolCalls.length > 0),
    };
}

export function createChatCompletionsProvider(options: {
    id: ProviderId;
    baseUrl: string;
    apiKey: string;
    quirks: ChatWireQuirks;
    env?: NodeJS.ProcessEnv;
}): Provider {
    const { id, baseUrl, apiKey, quirks } = options;
    const env = options.env ?? process.env;
    const url = `${baseUrl}/chat/completions`;
    return {
        id,
        wire: "openai-chat",
        baseUrl,
        async call(request) {
            const spec = resolveModel(request.model);
            if (spec.provider !== id) {
                throw new ProviderError("WRONG_PROVIDER", `${request.model} is not served by ${id}`, 500, "Modèle mal routé.", {
                    kind: "bad_request",
                    retryable: false,
                    provider: id,
                });
            }
            const call = callSignal(request.signal, request.timeoutMs);
            let emitted = false;
            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: jsonHeaders(apiKey),
                    body: JSON.stringify(buildChatBody(request, spec, quirks, env)),
                    signal: call.signal,
                });
                if (!response.ok) throw await errorFromResponse(response, id, quirks.label);
                if (!response.body) throw new ProviderError("EMPTY_BODY", "empty response body", 502, "Réponse vide du fournisseur d'IA.", { kind: "network", provider: id });

                const idle = request.idleTimeoutMs ?? request.timeoutMs;
                call.rearm(idle);
                return await readChatStream(response.body, request.model, id, quirks, {
                    onChunk: () => call.rearm(idle),
                    onReasoningDelta: request.onReasoningDelta,
                    onTextDelta: (text) => {
                        emitted = true;
                        request.onTextDelta?.(text);
                    },
                });
            } catch (err) {
                const error = toProviderError(err, call, request.signal, id);
                error.partial = emitted;
                throw error;
            } finally {
                call.dispose();
            }
        },
    };
}
