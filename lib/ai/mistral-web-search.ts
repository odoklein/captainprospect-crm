/**
 * Mistral Conversations API with the built-in `web_search` tool.
 *
 * Web search is not available on /v1/chat/completions, so this is a separate
 * client from lib/ai/mistral.ts (it reuses MistralError for the user-facing
 * French messages). `model` + `tools` are passed inline — no pre-created agent,
 * nothing stored server-side (`store: false`).
 *
 * Failure handling mirrors the chat client: a 403 tier rejection degrades to the
 * next model; 429 / 5xx / network errors get up to two patient retries.
 */

import { MistralError } from "./mistral";

const CONVERSATIONS_URL = "https://api.mistral.ai/v1/conversations";
const DEFAULT_MODEL = "mistral-medium-latest";
const FALLBACK_MODELS = ["mistral-small-latest"];
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

export interface WebSearchRun {
    /** The assistant's final text (JSON fence included — the caller parses it). */
    text: string;
    /** Raw `outputs` entries; `tool.execution` ones carry the retrieved pages. */
    outputs: unknown[];
    searchCount: number;
    model: string;
}

type OutputEntry = { type?: string; role?: string; content?: unknown };

function finalText(outputs: OutputEntry[]): string {
    const message = [...outputs].reverse().find((o) => o.type === "message.output");
    const content = message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        return content
            .map((chunk) => (chunk && typeof chunk === "object" && (chunk as { type?: string }).type === "text" ? String((chunk as { text?: unknown }).text ?? "") : ""))
            .join("");
    }
    return "";
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function post(apiKey: string, body: Record<string, unknown>, timeoutMs: number): Promise<Response> {
    return fetch(CONVERSATIONS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
    });
}

async function isTierRejection(response: Response): Promise<boolean> {
    try {
        const data = await response.clone().json();
        return data?.type === "tier_not_allowed" || String(data?.code) === "1910" || /tier/i.test(String(data?.message ?? ""));
    } catch {
        return false;
    }
}

export async function runWebSearchConversation(params: {
    instructions: string;
    input: string;
    model?: string;
    maxTokens?: number;
    timeoutMs?: number;
}): Promise<WebSearchRun> {
    const apiKey = process.env.MISTRAL_API_KEY?.trim();
    if (!apiKey) throw new MistralError("MISTRAL_API_KEY manquante", 401);

    const timeoutMs = params.timeoutMs ?? 30_000;
    const requested = params.model || process.env.MISTRAL_WEB_MODEL || DEFAULT_MODEL;
    const models = [requested, ...FALLBACK_MODELS.filter((m) => m !== requested)];
    let lastError: MistralError | null = null;

    for (const model of models) {
        const body = {
            model,
            store: false,
            instructions: params.instructions,
            inputs: params.input,
            tools: [{ type: "web_search" }],
            completion_args: { temperature: 0.1, max_tokens: params.maxTokens ?? 500 },
        };

        // This account's web_search quota 429s on back-to-back calls, so a 429 gets a patient retry
        // (retry-after, else 2 s then 4 s) instead of the short backoff the chat client uses.
        let response: Response | null = null;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            const last = attempt === MAX_ATTEMPTS - 1;
            try {
                response = await post(apiKey, body, timeoutMs);
            } catch (error) {
                // Timeout or network failure: retry, then give up with an upstream error.
                if (last) throw new MistralError(error instanceof Error ? error.message : "Réseau indisponible", 504);
                await sleep(500);
                continue;
            }
            if (response.ok || !RETRYABLE.has(response.status) || last) break;
            const retryAfter = Number(response.headers.get("retry-after"));
            await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 6000) : 2000 * (attempt + 1));
        }
        if (!response) continue;

        if (response.ok) {
            const json = (await response.json()) as { outputs?: OutputEntry[] };
            const outputs = Array.isArray(json.outputs) ? json.outputs : [];
            return {
                text: finalText(outputs),
                outputs,
                searchCount: outputs.filter((o) => o.type === "tool.execution").length,
                model,
            };
        }

        const detail = (await response.clone().json().catch(() => ({}))) as { message?: string; error?: { message?: string } };
        lastError = new MistralError(detail?.error?.message || detail?.message || `Mistral request failed (${response.status})`, response.status);
        if (response.status === 403 && (await isTierRejection(response))) continue;
        throw lastError;
    }

    throw lastError ?? new MistralError("Aucun modèle Mistral disponible", 403);
}
