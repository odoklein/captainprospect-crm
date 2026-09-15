/**
 * Mistral AI client — chat completions with function calling.
 *
 * Handles the two failures this account actually hits:
 *  · `tier_not_allowed` — degrade to the next model and remember the rejection,
 *    so later requests skip the wasted round-trip (which was itself burning the
 *    rate-limit budget).
 *  · 429 / 5xx — retry with `Retry-After`-aware exponential backoff.
 */

export const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";

/** Reasoning tier. Anything that has to choose between tools uses Large. */
export const MISTRAL_LARGE_MODEL = "mistral-large-latest";

export function getMistralLargeModel(): string {
    return process.env.MISTRAL_LARGE_MODEL || MISTRAL_LARGE_MODEL;
}

/** Models this tier rejected, learned at runtime and not retried. */
const tierBlockedModels = new Set<string>();

const FALLBACK_MODELS = ["mistral-medium-latest", "mistral-small-latest"];
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 700;
const MAX_BACKOFF_MS = 3000;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelay(response: Response, attempt: number): number {
    const header = response.headers.get("retry-after");
    if (header) {
        const seconds = Number(header);
        if (Number.isFinite(seconds) && seconds >= 0) {
            return Math.min(seconds * 1000, MAX_BACKOFF_MS);
        }
    }
    return Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS) + Math.random() * 200;
}

async function isTierRejection(response: Response): Promise<boolean> {
    try {
        const data = await response.clone().json();
        return (
            data?.type === "tier_not_allowed" ||
            String(data?.code) === "1910" ||
            /tier/i.test(String(data?.message ?? ""))
        );
    } catch {
        return false;
    }
}

async function postOnce(apiKey: string, body: Record<string, unknown>): Promise<Response> {
    return fetch(MISTRAL_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
    });
}

async function postWithRetry(apiKey: string, body: Record<string, unknown>): Promise<Response> {
    let response = await postOnce(apiKey, body);

    for (let attempt = 0; attempt < MAX_ATTEMPTS - 1; attempt++) {
        if (response.ok || !RETRYABLE_STATUSES.has(response.status)) return response;
        const delay = backoffDelay(response, attempt);
        console.warn(
            `[mistral] ${response.status} on "${body.model}" — retry ${attempt + 1} in ${Math.round(delay)}ms`,
        );
        await sleep(delay);
        response = await postOnce(apiKey, body);
    }
    return response;
}

async function mistralFetch(
    apiKey: string,
    payload: Record<string, unknown>,
): Promise<Response> {
    const requested = (payload.model as string) || getMistralLargeModel();
    const chain = [requested, ...FALLBACK_MODELS.filter((m) => m !== requested)];
    const candidates = chain.filter((m) => !tierBlockedModels.has(m));
    const models = candidates.length > 0 ? candidates : ["mistral-small-latest"];

    let lastResponse: Response | null = null;

    for (const model of models) {
        const response = await postWithRetry(apiKey, { ...payload, model });
        if (response.ok) return response;

        if (response.status === 403 && (await isTierRejection(response))) {
            tierBlockedModels.add(model);
            console.warn(`[mistral] "${model}" unavailable on this tier — degrading.`);
            lastResponse = response;
            continue;
        }
        return response;
    }

    return lastResponse as Response;
}

/** A failed call, carrying enough detail to pick a status code and a French message. */
export class MistralError extends Error {
    readonly status: number;
    readonly code:
        | "rate_limited"
        | "unauthorized"
        | "tier_not_allowed"
        | "upstream"
        | "unknown";

    constructor(message: string, status: number) {
        super(message);
        this.name = "MistralError";
        this.status = status;
        this.code =
            status === 429
                ? "rate_limited"
                : status === 401
                    ? "unauthorized"
                    : status === 403
                        ? "tier_not_allowed"
                        : status >= 500
                            ? "upstream"
                            : "unknown";
    }

    get userMessage(): string {
        switch (this.code) {
            case "rate_limited":
                return "L'assistant est momentanément saturé (limite du fournisseur IA). Réessaie dans quelques secondes.";
            case "unauthorized":
                return "La clé API Mistral est invalide ou absente.";
            case "tier_not_allowed":
                return "Le modèle Mistral configuré n'est pas disponible sur cet abonnement.";
            case "upstream":
                return "Le fournisseur IA est indisponible. Réessaie dans un instant.";
            default:
                return "L'assistant n'a pas pu répondre. Réessaie.";
        }
    }
}

export interface MistralToolCall {
    id?: string;
    type?: string;
    function: { name: string; arguments: string };
}

export interface MistralToolMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string | null;
    tool_calls?: MistralToolCall[];
    tool_call_id?: string;
    name?: string;
}

export interface MistralToolSpec {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}

export interface MistralChatResult {
    message: { role: string; content: string | null; tool_calls?: MistralToolCall[] };
    finishReason?: string;
    model?: string;
    usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
}

/** One round-trip, with optional tools. Throws MistralError on a non-2xx. */
export async function mistralChat(
    apiKey: string,
    params: {
        messages: MistralToolMessage[];
        tools?: MistralToolSpec[];
        toolChoice?: "auto" | "none" | "any";
        model?: string;
        temperature?: number;
        maxTokens?: number;
    },
): Promise<MistralChatResult> {
    const payload: Record<string, unknown> = {
        model: params.model || getMistralLargeModel(),
        messages: params.messages,
        temperature: params.temperature ?? 0.25,
        max_tokens: params.maxTokens ?? 1400,
    };

    if (params.tools && params.tools.length > 0) {
        payload.tools = params.tools;
        payload.tool_choice = params.toolChoice ?? "auto";
    }

    const response = await mistralFetch(apiKey, payload);

    if (!response.ok) {
        const error = (await response.json().catch(() => ({}))) as {
            message?: string;
            error?: { message?: string };
        };
        throw new MistralError(
            error?.error?.message || error?.message || `Mistral request failed (${response.status})`,
            response.status,
        );
    }

    const result = (await response.json()) as {
        model?: string;
        choices?: Array<{
            finish_reason?: string;
            message?: { role?: string; content?: string | null; tool_calls?: MistralToolCall[] };
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const choice = result.choices?.[0];
    if (!choice?.message) throw new Error("Mistral returned an empty choice");

    return {
        message: {
            role: choice.message.role ?? "assistant",
            content: choice.message.content ?? null,
            tool_calls: choice.message.tool_calls,
        },
        finishReason: choice.finish_reason,
        model: result.model,
        usage: result.usage
            ? {
                promptTokens: result.usage.prompt_tokens,
                completionTokens: result.usage.completion_tokens,
                totalTokens: result.usage.total_tokens,
            }
            : undefined,
    };
}
