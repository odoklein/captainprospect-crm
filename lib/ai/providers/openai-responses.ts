/**
 * The OpenAI Responses wire.
 *
 * Why it exists: on Chat Completions, GPT-5.4+ refuse function tools unless
 * the reasoning effort is "none". Responses accepts reasoning and tools
 * together, streams a reasoning summary the UI can show, takes a
 * `prompt_cache_key`, and reports cached and reasoning tokens.
 *
 * Nothing is stored server-side (`store: false`). Reasoning items come back
 * with `encrypted_content` and are replayed verbatim before the function
 * calls they produced, so the model keeps its chain of thought across tool
 * iterations without server state.
 *
 * Event names follow the 2026 Responses streaming contract; a terminal
 * `response.completed` / `response.incomplete` is required, anything else is
 * a truncated stream.
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
import { temperatureFor } from "./openai-chat";
import type { ChatCallRequest, ChatCallResponse, ChatMessage, Provider, ToolCall, Usage } from "./types";

const PROVIDER = "openai" as const;

/** Neutral messages → `instructions` + `input` items. */
export function toResponsesInput(messages: ChatMessage[]): { instructions: string | undefined; input: unknown[] } {
    const system: string[] = [];
    const input: unknown[] = [];
    for (const m of messages) {
        switch (m.role) {
            case "system":
                system.push(m.content);
                break;
            case "user":
                input.push({ role: "user", content: m.content });
                break;
            case "assistant": {
                for (const item of m.providerItems ?? []) input.push(item);
                if (m.content) input.push({ role: "assistant", content: m.content });
                for (const call of m.toolCalls ?? []) {
                    input.push({ type: "function_call", call_id: call.id, name: call.name, arguments: call.arguments });
                }
                break;
            }
            case "tool":
                input.push({ type: "function_call_output", call_id: m.toolCallId, output: m.content });
                break;
        }
    }
    return { instructions: system.length > 0 ? system.join("\n\n") : undefined, input };
}

export function buildResponsesBody(request: ChatCallRequest, spec: ModelSpec, env: Record<string, string | undefined> = process.env): Record<string, unknown> {
    const { instructions, input } = toResponsesInput(request.messages);
    const body: Record<string, unknown> = {
        model: endpointModelId(spec, env),
        input,
        stream: true,
        store: false,
        max_output_tokens: request.maxOutputTokens,
    };
    if (instructions) body.instructions = instructions;
    const temperature = temperatureFor(request, spec);
    if (temperature !== undefined) body.temperature = temperature;
    if (spec.reasoning) {
        const effort = spec.family === "o-series" && request.reasoningEffort === "none" ? "low" : request.reasoningEffort;
        const reasoning: Record<string, unknown> = { effort };
        if (effort !== "none" && request.reasoningSummary) reasoning.summary = "auto";
        body.reasoning = reasoning;
        if (effort !== "none") body.include = ["reasoning.encrypted_content"];
    }
    if (request.tools && request.tools.length > 0) {
        body.tools = request.tools.map((t) => ({
            type: "function",
            name: t.name,
            description: t.description,
            parameters: t.parameters,
            strict: false,
        }));
        body.tool_choice = request.toolChoice ?? "auto";
    }
    if (request.responseFormat === "json") body.text = { format: { type: "json_object" } };
    if (request.cacheKey) body.prompt_cache_key = request.cacheKey;
    return body;
}

interface RawResponseUsage {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
}

export function parseResponsesUsage(raw: RawResponseUsage | null | undefined): Usage | null {
    if (!raw) return null;
    const inputTokens = raw.input_tokens ?? 0;
    const outputTokens = raw.output_tokens ?? 0;
    return {
        inputTokens,
        cachedInputTokens: Math.min(raw.input_tokens_details?.cached_tokens ?? 0, inputTokens),
        outputTokens,
        reasoningTokens: Math.min(raw.output_tokens_details?.reasoning_tokens ?? 0, outputTokens),
        totalTokens: raw.total_tokens ?? inputTokens + outputTokens,
    };
}

interface StreamEvent {
    type?: string;
    delta?: string;
    output_index?: number;
    item?: { type?: string; id?: string; call_id?: string; name?: string; arguments?: string; [k: string]: unknown };
    arguments?: string;
    response?: {
        model?: string;
        status?: string;
        usage?: RawResponseUsage;
        error?: { code?: string; message?: string };
        incomplete_details?: { reason?: string };
    };
    code?: string;
    message?: string;
}

/** Parses a Responses SSE body into a neutral response. Exported for tests. */
export async function readResponsesStream(
    body: ReadableStream<Uint8Array>,
    fallbackModel: string,
    hooks: { onTextDelta?: (text: string) => void; onReasoningDelta?: (text: string) => void; onChunk?: () => void } = {},
): Promise<ChatCallResponse> {
    let text = "";
    let model = fallbackModel;
    let usage: Usage | null = null;
    let terminal: "completed" | "incomplete" | null = null;
    const slots = new Map<number, { id: string; name: string; arguments: string }>();
    const providerItems: unknown[] = [];

    await readSse(body, {
        onChunk: hooks.onChunk,
        onData: (payload) => {
            if (payload === "[DONE]") return;
            const event = JSON.parse(payload) as StreamEvent;
            switch (event.type) {
                case "response.output_text.delta":
                    if (event.delta) {
                        text += event.delta;
                        hooks.onTextDelta?.(event.delta);
                    }
                    return;
                case "response.reasoning_summary_text.delta":
                    if (event.delta) hooks.onReasoningDelta?.(event.delta);
                    return;
                case "response.output_item.added": {
                    const item = event.item;
                    if (item?.type === "function_call" && event.output_index !== undefined) {
                        slots.set(event.output_index, { id: item.call_id ?? "", name: item.name ?? "", arguments: item.arguments ?? "" });
                    }
                    return;
                }
                case "response.function_call_arguments.delta": {
                    if (event.output_index === undefined) return;
                    const slot = slots.get(event.output_index) ?? { id: "", name: "", arguments: "" };
                    slot.arguments += event.delta ?? "";
                    slots.set(event.output_index, slot);
                    return;
                }
                case "response.function_call_arguments.done": {
                    if (event.output_index === undefined) return;
                    const slot = slots.get(event.output_index) ?? { id: "", name: "", arguments: "" };
                    if (typeof event.arguments === "string") slot.arguments = event.arguments;
                    slots.set(event.output_index, slot);
                    return;
                }
                case "response.output_item.done": {
                    const item = event.item;
                    if (!item) return;
                    if (item.type === "reasoning") providerItems.push(item);
                    if (item.type === "function_call" && event.output_index !== undefined) {
                        const slot = slots.get(event.output_index) ?? { id: "", name: "", arguments: "" };
                        if (item.call_id) slot.id = item.call_id;
                        if (item.name) slot.name = item.name;
                        if (typeof item.arguments === "string" && item.arguments) slot.arguments = item.arguments;
                        slots.set(event.output_index, slot);
                    }
                    return;
                }
                case "response.completed":
                case "response.incomplete": {
                    terminal = event.type === "response.completed" ? "completed" : "incomplete";
                    if (event.response?.model) model = event.response.model;
                    usage = parseResponsesUsage(event.response?.usage);
                    return;
                }
                case "response.failed": {
                    const err = event.response?.error;
                    throw new ProviderError(err?.code ?? "RESPONSE_FAILED", err?.message ?? "response failed", 502,
                        "Le service d'intelligence artificielle n'a pas pu terminer la réponse.", {
                            kind: "server",
                            retryable: true,
                            provider: PROVIDER,
                        });
                }
                case "error":
                    throw new ProviderError(event.code ?? "STREAM_ERROR", event.message ?? "stream error", 400,
                        `Erreur OpenAI : ${event.message ?? "requête refusée"}`, {
                            kind: "bad_request",
                            retryable: false,
                            provider: PROVIDER,
                        });
                default:
                    return;
            }
        },
    });

    if (!terminal) throw truncatedStreamError(PROVIDER);

    const toolCalls: ToolCall[] = [...slots.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, c], i) => ({ id: c.id || `call_${i}`, name: c.name, arguments: c.arguments }))
        .filter((c) => c.name);

    return {
        text: text || null,
        toolCalls,
        ...(providerItems.length > 0 ? { providerItems } : {}),
        usage,
        model,
        provider: PROVIDER,
        finish: terminal === "incomplete" ? "incomplete" : toolCalls.length > 0 ? "tool_calls" : "stop",
    };
}

export function createResponsesProvider(options: { baseUrl: string; apiKey: string; env?: Record<string, string | undefined> }): Provider {
    const { baseUrl, apiKey } = options;
    const env = options.env ?? process.env;
    const url = `${baseUrl}/responses`;
    return {
        id: PROVIDER,
        wire: "openai-responses",
        baseUrl,
        async call(request) {
            const spec = resolveModel(request.model);
            if (spec.provider !== PROVIDER) {
                throw new ProviderError("WRONG_PROVIDER", `${request.model} is not served by OpenAI`, 500, "Modèle mal routé.", {
                    kind: "bad_request",
                    retryable: false,
                    provider: PROVIDER,
                });
            }
            const call = callSignal(request.signal, request.timeoutMs);
            let emitted = false;
            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: jsonHeaders(apiKey),
                    body: JSON.stringify(buildResponsesBody(request, spec, env)),
                    signal: call.signal,
                });
                if (!response.ok) throw await errorFromResponse(response, PROVIDER, "OpenAI");
                if (!response.body) throw new ProviderError("EMPTY_BODY", "empty response body", 502, "Réponse vide du fournisseur d'IA.", { kind: "network", provider: PROVIDER });

                const idle = request.idleTimeoutMs ?? request.timeoutMs;
                call.rearm(idle);
                return await readResponsesStream(response.body, request.model, {
                    onChunk: () => call.rearm(idle),
                    onReasoningDelta: request.onReasoningDelta,
                    onTextDelta: (text) => {
                        emitted = true;
                        request.onTextDelta?.(text);
                    },
                });
            } catch (err) {
                const error = toProviderError(err, call, request.signal, PROVIDER);
                error.partial = emitted;
                throw error;
            } finally {
                call.dispose();
            }
        },
    };
}
