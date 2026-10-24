/**
 * One JSON-mode chat completion against OpenAI, with a timeout and errors a
 * person can act on. Used by Analyse IA and the weekly client bilan.
 *
 * The error code is stored in front of the raw message ("QUOTA: …") so the UI
 * can say « Crédits OpenAI épuisés » instead of a generic failure — in Sept–Oct
 * 2026 every run failed on an empty OpenAI balance and nobody could see why.
 */

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
export const DEFAULT_JSON_MODEL = "gpt-4o";

export type AiErrorCode =
    | "MISSING_KEY"
    | "QUOTA"
    | "AUTH"
    | "RATE_LIMIT"
    | "TIMEOUT"
    | "UNPARSABLE"
    | "EMPTY"
    | "NETWORK"
    | "UNKNOWN";

export class AiCallError extends Error {
    constructor(
        public code: AiErrorCode,
        message: string,
        public status = 502,
    ) {
        super(message);
        this.name = "AiCallError";
    }

    /** "CODE: message" — the stored form, parsed back by friendlyAiError. */
    toStored(): string {
        return `${this.code}: ${this.message}`;
    }
}

/** Models sometimes wrap JSON in fences or prose; recover the object. */
export function safeParseJsonFromModel(content: string): any {
    const trimmed = content.trim();
    try {
        return JSON.parse(trimmed);
    } catch {
        const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (fenced?.[1]) return JSON.parse(fenced[1].trim());
        const first = trimmed.indexOf("{");
        const last = trimmed.lastIndexOf("}");
        if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1));
        throw new Error("INVALID_JSON");
    }
}

export function classifyOpenAiFailure(status: number, code: string | undefined, message: string): AiErrorCode {
    const text = `${code ?? ""} ${message}`.toLowerCase();
    if (code === "insufficient_quota" || text.includes("credits remaining") || text.includes("exceeded your current quota")) {
        return "QUOTA";
    }
    if (status === 401 || code === "invalid_api_key" || text.includes("incorrect api key")) return "AUTH";
    if (status === 429) return "RATE_LIMIT";
    return "UNKNOWN";
}

export interface JsonCallOptions {
    system: string;
    user: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
}

export async function callJsonModel(
    options: JsonCallOptions,
): Promise<{ parsed: any; tokens: number | null; model: string }> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new AiCallError("MISSING_KEY", "OPENAI_API_KEY non configurée", 503);

    const model = options.model ?? DEFAULT_JSON_MODEL;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 120_000);

    let response: Response;
    try {
        response = await fetch(OPENAI_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
                model,
                messages: [
                    { role: "system", content: options.system },
                    { role: "user", content: options.user },
                ],
                temperature: options.temperature ?? 0.3,
                max_tokens: options.maxTokens ?? 4000,
                response_format: { type: "json_object" },
            }),
            signal: controller.signal,
        });
    } catch (err) {
        if ((err as Error)?.name === "AbortError") throw new AiCallError("TIMEOUT", "L'IA n'a pas répondu à temps", 504);
        throw new AiCallError("NETWORK", (err as Error)?.message || "Réseau indisponible");
    } finally {
        clearTimeout(timer);
    }

    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const message = body?.error?.message || response.statusText || `HTTP ${response.status}`;
        throw new AiCallError(classifyOpenAiFailure(response.status, body?.error?.code, message), `OpenAI API error: ${message}`, response.status);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) throw new AiCallError("EMPTY", "Réponse vide de l'IA");

    try {
        return { parsed: safeParseJsonFromModel(content), tokens: result.usage?.total_tokens ?? null, model };
    } catch {
        throw new AiCallError("UNPARSABLE", "Impossible de lire la réponse JSON de l'IA");
    }
}
