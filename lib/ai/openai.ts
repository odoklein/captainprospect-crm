/**
 * OpenAI compatibility surface. The client itself lives in lib/ai/providers:
 * this module keeps the names older code imports (`OpenAIError`, the low-cost
 * model helper, `openaiChatComplete`) and routes them through the provider
 * layer, so one place owns HTTP, streaming, caching and token accounting.
 */

import { ProviderError } from "./providers/errors";
import { providerChatFn } from "./providers";
import type { ChatMessage, ToolSpec, Usage } from "./providers/types";

export const DEFAULT_LOW_COST_MODEL = "gpt-4o-mini";

export function getOpenAILowCostModel(): string {
    return process.env.OPENAI_ASSISTANT_MODEL || DEFAULT_LOW_COST_MODEL;
}

/** Same class as ProviderError: `instanceof OpenAIError` keeps working everywhere. */
export { ProviderError as OpenAIError };
export type { ProviderErrorKind as OpenAIErrorKind } from "./providers/errors";

/** GPT-5 and o-series: they think before answering and take `reasoning_effort`. */
export function isReasoningModel(model: string): boolean {
    return /^(gpt-5|o\d)/i.test(model.trim());
}

// -- simple text completions (summaries, titles, one-shot helpers) ------------

export interface OpenAIMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface OpenAIChatOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    tools?: ToolSpec[];
    toolChoice?: "auto" | "none" | "required";
    signal?: AbortSignal;
    timeoutMs?: number;
}

export interface OpenAIChatResult {
    text: string;
    usage?: Usage;
    model?: string;
}

/**
 * One non-tool completion. `apiKey` overrides the stored key when given; an
 * empty string means "use the agency's key".
 */
export async function openaiChatComplete(
    apiKey: string,
    messages: OpenAIMessage[],
    options: OpenAIChatOptions = {},
): Promise<OpenAIChatResult> {
    const chat = providerChatFn(apiKey ? { apiKey } : {});
    const res = await chat({
        model: options.model ?? getOpenAILowCostModel(),
        messages: messages.map((m): ChatMessage => ({ role: m.role, content: m.content })),
        tools: options.tools,
        toolChoice: options.toolChoice,
        temperature: options.temperature ?? 0.3,
        maxOutputTokens: options.maxTokens ?? 1500,
        reasoningEffort: "none",
        signal: options.signal,
        timeoutMs: options.timeoutMs ?? 60_000,
    });
    if (!res.text && res.toolCalls.length === 0) {
        throw new ProviderError("EMPTY_RESPONSE", "OpenAI returned no content", 502, "L'assistant n'a renvoyé aucune réponse.", {
            kind: "empty",
            retryable: true,
            provider: "openai",
        });
    }
    return { text: res.text ?? "", model: res.model, usage: res.usage ?? undefined };
}
