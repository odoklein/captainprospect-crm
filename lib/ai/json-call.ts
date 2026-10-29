/**
 * One JSON-mode completion through the provider layer, with a timeout and
 * errors a person can act on. Used by Analyse IA, the weekly client bilan and
 * the sales playbook generator.
 *
 * The error code is stored in front of the raw message ("QUOTA: …") so the UI
 * can say « Crédits OpenAI épuisés » instead of a generic failure — in Sept–Oct
 * 2026 every run failed on an empty OpenAI balance and nobody could see why.
 *
 * Every call is recorded in the AiUsage ledger under its `surface`.
 */

import { recordAiUsage } from "./ledger";
import { ProviderError } from "./providers/errors";
import { providerChatFn } from "./providers";
import type { DataClass } from "./providers/types";

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

function fromProviderError(error: ProviderError): AiCallError {
    switch (error.kind) {
        case "not_configured":
            return new AiCallError("MISSING_KEY", error.userMessage, 503);
        case "timeout":
            return new AiCallError("TIMEOUT", "L'IA n'a pas répondu à temps", 504);
        case "network":
            return new AiCallError("NETWORK", error.message || "Réseau indisponible");
        case "empty":
            return new AiCallError("EMPTY", "Réponse vide de l'IA");
        case "cancelled":
            return new AiCallError("TIMEOUT", "Appel annulé", 499);
        default:
            return new AiCallError(classifyOpenAiFailure(error.status, error.code, error.message), `${error.provider ?? "AI"} API error: ${error.message}`, error.status);
    }
}

export interface JsonCallOptions {
    system: string;
    user: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
    /** Ledger surface: "analyse_ia", "weekly_bilan", "sales_playbook", … */
    surface?: string;
    /** What the prompt contains; CRM rows by default, so only EU/US endpoints qualify. */
    dataClass?: DataClass;
    /** Attribution for the ledger. */
    userId?: string | null;
    clientId?: string | null;
    missionId?: string | null;
}

export async function callJsonModel(
    options: JsonCallOptions,
): Promise<{ parsed: any; tokens: number | null; model: string }> {
    const model = options.model ?? DEFAULT_JSON_MODEL;
    const dataClass = options.dataClass ?? "raw_crm";
    const chat = providerChatFn({ dataClass });
    const startedAt = Date.now();

    let text: string | null;
    let usage;
    let servedModel = model;
    try {
        const res = await chat({
            model,
            messages: [
                { role: "system", content: options.system },
                { role: "user", content: options.user },
            ],
            temperature: options.temperature ?? 0.3,
            maxOutputTokens: options.maxTokens ?? 4000,
            reasoningEffort: "none",
            responseFormat: "json",
            timeoutMs: options.timeoutMs ?? 120_000,
        });
        text = res.text;
        usage = res.usage;
        servedModel = res.model || model;
    } catch (err) {
        if (err instanceof ProviderError) throw fromProviderError(err);
        throw new AiCallError("UNKNOWN", (err as Error)?.message || "Erreur inconnue");
    }

    if (usage) {
        recordAiUsage({
            surface: options.surface ?? "json_call",
            model: servedModel,
            usage,
            latencyMs: Date.now() - startedAt,
            dataClass,
            userId: options.userId ?? null,
            clientId: options.clientId ?? null,
            missionId: options.missionId ?? null,
        });
    }

    if (!text) throw new AiCallError("EMPTY", "Réponse vide de l'IA");

    try {
        return { parsed: safeParseJsonFromModel(text), tokens: usage?.totalTokens ?? null, model: servedModel };
    } catch {
        throw new AiCallError("UNPARSABLE", "Impossible de lire la réponse JSON de l'IA");
    }
}
