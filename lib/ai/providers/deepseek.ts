/**
 * DeepSeek through its OpenAI-compatible Chat Completions endpoint.
 *
 * The base URL is configuration on purpose: the official api.deepseek.com is
 * hosted in China and only ever sees `public` workloads, while an EU host of
 * the same models (declared with DEEPSEEK_BASE_URL + DEEPSEEK_RESIDENCY=eu)
 * may take CRM data. See catalog.ts for the residency rules.
 */

import { DEEPSEEK_CHAT_QUIRKS, createChatCompletionsProvider } from "./openai-chat";
import type { Provider } from "./types";

export function createDeepSeekProvider(options: { apiKey: string; baseUrl: string; env?: Record<string, string | undefined> }): Provider {
    return createChatCompletionsProvider({
        id: "deepseek",
        baseUrl: options.baseUrl,
        apiKey: options.apiKey,
        quirks: DEEPSEEK_CHAT_QUIRKS,
        env: options.env,
    });
}
