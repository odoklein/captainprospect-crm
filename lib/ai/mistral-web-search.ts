/**
 * OpenAI Responses API with the built-in `web_search` tool (file kept under its historical
 * "mistral" name so callers stay unchanged; it reuses MistralError for the French messages).
 * `model` + `tools` are passed inline, nothing stored server-side (`store: false`).
 *
 * OpenAI does not return the retrieved page text, only the cited sources. The adapter below
 * re-shapes them into synthetic `tool.execution` entries (url, title, cited passage) so
 * collectPages() in lib/enrichment/company-ai-core.ts keeps working unchanged.
 *
 * Failure handling: a 403 / 404 on a model degrades to the next one; 429 / 5xx / network
 * errors get up to two patient retries.
 */

import { MistralError } from "./mistral";

const CONVERSATIONS_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4.1-mini";
const FALLBACK_MODELS = ["gpt-4o-mini"];
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

type OutputEntry = { type?: string; role?: string; content?: unknown; info?: { result: string } };

type Annotation = { type?: string; url?: string; title?: string; start_index?: number; end_index?: number };
type OpenAIOutputItem = {
    type?: string;
    content?: Array<{ type?: string; text?: string; annotations?: Annotation[] }>;
};

/** Final answer text plus synthetic `tool.execution` entries built from the cited sources. */
function adapt(output: OpenAIOutputItem[]): { text: string; outputs: OutputEntry[]; searchCount: number } {
    let text = "";
    const hits: Record<string, { url: string; title: string; description: null; snippets: string[] }> = {};
    let searchCount = 0;

    for (const item of output) {
        if (item.type === "web_search_call") searchCount += 1;
        if (item.type !== "message") continue;
        for (const chunk of item.content ?? []) {
            if (chunk.type !== "output_text") continue;
            const chunkText = String(chunk.text ?? "");
            text += chunkText;
            for (const note of chunk.annotations ?? []) {
                if (note.type !== "url_citation" || !note.url) continue;
                const from = Math.max(0, (note.start_index ?? 0) - 160);
                const passage = chunkText.slice(from, note.end_index ?? chunkText.length).trim();
                const hit = (hits[note.url] ??= { url: note.url, title: note.title ?? "", description: null, snippets: [] });
                if (passage) hit.snippets.push(passage);
            }
        }
    }

    // The API sometimes returns no url_citation annotations: fall back to the URLs written in the answer.
    if (Object.keys(hits).length === 0) {
        for (const match of text.matchAll(/https?:\/\/[^\s)\]>"']+/g)) {
            const url = match[0].replace(/[.,;]+$/, "");
            const from = Math.max(0, (match.index ?? 0) - 160);
            const hit = (hits[url] ??= { url, title: "", description: null, snippets: [] });
            hit.snippets.push(text.slice(from, (match.index ?? 0) + match[0].length).trim());
        }
    }

    const outputs: OutputEntry[] = [];
    for (let i = 0; i < searchCount; i++) outputs.push({ type: "tool.execution" });
    if (Object.keys(hits).length > 0) outputs.push({ type: "tool.execution", info: { result: JSON.stringify(hits) } });
    return { text, outputs, searchCount };
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
        const err = data?.error ?? data;
        return /model_not_found|does not have access|not supported|tier/i.test(`${err?.code ?? ""} ${err?.message ?? ""}`);
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
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new MistralError("OPENAI_API_KEY manquante", 401);

    const timeoutMs = params.timeoutMs ?? 30_000;
    const requested = params.model || process.env.OPENAI_WEB_MODEL || DEFAULT_MODEL;
    const models = [requested, ...FALLBACK_MODELS.filter((m) => m !== requested)];
    let lastError: MistralError | null = null;

    for (const model of models) {
        const body = {
            model,
            store: false,
            instructions: params.instructions,
            input: params.input,
            tools: [{ type: "web_search" }],
            temperature: 0.1,
            max_output_tokens: Math.max(16, params.maxTokens ?? 500),
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
            const json = (await response.json()) as { output?: OpenAIOutputItem[] };
            const { text, outputs, searchCount } = adapt(Array.isArray(json.output) ? json.output : []);
            return { text, outputs, searchCount, model };
        }

        const detail = (await response.clone().json().catch(() => ({}))) as { message?: string; error?: { message?: string } };
        lastError = new MistralError(detail?.error?.message || detail?.message || `OpenAI request failed (${response.status})`, response.status);
        if ((response.status === 403 || response.status === 404) && (await isTierRejection(response))) continue;
        throw lastError;
    }

    throw lastError ?? new MistralError("Aucun modèle OpenAI disponible", 403);
}
