/**
 * Model and endpoint catalog: what each model can do, what it costs, which
 * provider serves it and where that provider processes the data.
 *
 * Prices are USD list prices per million tokens. `verified` is the date the
 * figure was last checked against the provider's price page; null means
 * "copied from memory, verify before trusting a cost report".
 *
 * Residency is the GDPR lever. The CRM payloads carry prospects' personal
 * data, so a `raw_crm` call may only reach an endpoint whose residency is
 * allowed for that class. DeepSeek's official API is hosted in China: with the
 * stock URL it serves `public` workloads only. An EU host (OVHcloud AI
 * Endpoints, Azure AI Foundry in an EU region, …) is declared explicitly with
 * DEEPSEEK_BASE_URL + DEEPSEEK_RESIDENCY=eu; nothing is inferred from a hostname.
 */

import type { DataClass, ProviderId, Residency, Wire } from "./types";

export interface ModelPrice {
    inputPerM: number;
    cachedInputPerM: number;
    outputPerM: number;
    currency: "USD";
    verified: string | null;
}

export type ModelFamily = "gpt-5" | "gpt-4" | "o-series" | "deepseek" | "unknown";

export interface ModelSpec {
    /** Catalog id, what the rest of the code uses. */
    id: string;
    provider: ProviderId;
    family: ModelFamily;
    label: string;
    tools: boolean;
    /** Thinks before answering and takes a reasoning effort. */
    reasoning: boolean;
    /** Whether function tools are accepted together with a non-"none" effort, per wire. */
    reasoningWithTools: Record<Wire, boolean>;
    maxContext: number;
    maxOutput: number;
    /** When a custom temperature is accepted. */
    temperature: "always" | "effort-none-only" | "never";
    price: ModelPrice;
    /** False for an id outside the catalog, priced like the family default. */
    known: boolean;
}

const usd = (inputPerM: number, cachedInputPerM: number, outputPerM: number, verified: string | null): ModelPrice => ({
    inputPerM,
    cachedInputPerM,
    outputPerM,
    currency: "USD",
    verified,
});

const BOTH_WIRES = { "openai-chat": true, "openai-responses": true } as const;
const RESPONSES_ONLY = { "openai-chat": false, "openai-responses": true } as const;
const NO_WIRE = { "openai-chat": false, "openai-responses": false } as const;

/**
 * Order matters for prefix resolution: a longer, more specific id must come
 * before its prefix ("gpt-5.5" before "gpt-5", "gpt-4o-mini" before "gpt-4o").
 */
export const MODEL_CATALOG: ModelSpec[] = [
    {
        id: "gpt-5.5",
        provider: "openai",
        family: "gpt-5",
        label: "GPT-5.5",
        tools: true,
        reasoning: true,
        // On Chat Completions, GPT-5.4+ refuse function tools unless the effort is "none".
        reasoningWithTools: RESPONSES_ONLY,
        maxContext: 400_000,
        maxOutput: 128_000,
        temperature: "effort-none-only",
        price: usd(5.0, 0.5, 30.0, "2026-10-29"),
        known: true,
    },
    {
        id: "gpt-5.2",
        provider: "openai",
        family: "gpt-5",
        label: "GPT-5.2",
        tools: true,
        reasoning: true,
        reasoningWithTools: BOTH_WIRES,
        maxContext: 400_000,
        maxOutput: 128_000,
        temperature: "effort-none-only",
        price: usd(1.75, 0.175, 14.0, "2026-10-29"),
        known: true,
    },
    {
        id: "gpt-5-mini",
        provider: "openai",
        family: "gpt-5",
        label: "GPT-5 mini",
        tools: true,
        reasoning: true,
        reasoningWithTools: BOTH_WIRES,
        maxContext: 400_000,
        maxOutput: 128_000,
        temperature: "effort-none-only",
        price: usd(0.25, 0.025, 2.0, null),
        known: true,
    },
    {
        id: "gpt-5",
        provider: "openai",
        family: "gpt-5",
        label: "GPT-5",
        tools: true,
        reasoning: true,
        reasoningWithTools: BOTH_WIRES,
        maxContext: 400_000,
        maxOutput: 128_000,
        temperature: "effort-none-only",
        price: usd(1.25, 0.125, 10.0, null),
        known: true,
    },
    {
        id: "gpt-4.1-mini",
        provider: "openai",
        family: "gpt-4",
        label: "GPT-4.1 mini",
        tools: true,
        reasoning: false,
        reasoningWithTools: NO_WIRE,
        maxContext: 1_047_576,
        maxOutput: 32_768,
        temperature: "always",
        price: usd(0.2, 0.05, 0.8, null),
        known: true,
    },
    {
        id: "gpt-4.1",
        provider: "openai",
        family: "gpt-4",
        label: "GPT-4.1",
        tools: true,
        reasoning: false,
        reasoningWithTools: NO_WIRE,
        maxContext: 1_047_576,
        maxOutput: 32_768,
        temperature: "always",
        price: usd(2.0, 0.5, 8.0, null),
        known: true,
    },
    {
        id: "gpt-4o-mini",
        provider: "openai",
        family: "gpt-4",
        label: "GPT-4o mini",
        tools: true,
        reasoning: false,
        reasoningWithTools: NO_WIRE,
        maxContext: 128_000,
        maxOutput: 16_384,
        temperature: "always",
        price: usd(0.15, 0.075, 0.6, null),
        known: true,
    },
    {
        id: "gpt-4o",
        provider: "openai",
        family: "gpt-4",
        label: "GPT-4o",
        tools: true,
        reasoning: false,
        reasoningWithTools: NO_WIRE,
        maxContext: 128_000,
        maxOutput: 16_384,
        temperature: "always",
        price: usd(2.5, 1.25, 10.0, null),
        known: true,
    },
    {
        id: "o3-mini",
        provider: "openai",
        family: "o-series",
        label: "o3-mini",
        tools: true,
        reasoning: true,
        reasoningWithTools: BOTH_WIRES,
        maxContext: 200_000,
        maxOutput: 100_000,
        temperature: "never",
        price: usd(1.1, 0.55, 4.4, null),
        known: true,
    },
    {
        id: "deepseek-reasoner",
        provider: "deepseek",
        family: "deepseek",
        label: "DeepSeek Reasoner",
        tools: true,
        reasoning: true,
        reasoningWithTools: { "openai-chat": true, "openai-responses": false },
        maxContext: 128_000,
        maxOutput: 64_000,
        temperature: "never",
        price: usd(0.55, 0.14, 2.19, null),
        known: true,
    },
    {
        id: "deepseek-chat",
        provider: "deepseek",
        family: "deepseek",
        label: "DeepSeek Chat",
        tools: true,
        reasoning: false,
        reasoningWithTools: NO_WIRE,
        maxContext: 128_000,
        maxOutput: 8_000,
        temperature: "always",
        price: usd(0.27, 0.07, 1.1, null),
        known: true,
    },
];

const BY_ID = new Map(MODEL_CATALOG.map((m) => [m.id, m]));

/** Longest catalog id the given id starts with, so "gpt-5.5-2026-11-01" prices like "gpt-5.5". */
function prefixMatch(id: string): ModelSpec | undefined {
    const lower = id.toLowerCase();
    let best: ModelSpec | undefined;
    for (const spec of MODEL_CATALOG) {
        if (lower.startsWith(spec.id) && (!best || spec.id.length > best.id.length)) best = spec;
    }
    return best;
}

/**
 * The spec for a model id. Unknown ids get a family guess from their prefix
 * (gpt-5*, o*, deepseek*) so parameters are still right, and the cheapest
 * OpenAI price so a report never silently shows zero.
 */
export function resolveModel(id: string): ModelSpec {
    const trimmed = id.trim();
    const exact = BY_ID.get(trimmed.toLowerCase());
    if (exact) return exact;
    const prefix = prefixMatch(trimmed);
    if (prefix) return { ...prefix, id: trimmed, known: false };
    const lower = trimmed.toLowerCase();
    if (lower.startsWith("deepseek")) {
        return { ...BY_ID.get("deepseek-chat")!, id: trimmed, known: false };
    }
    if (/^o\d/.test(lower)) {
        return { ...BY_ID.get("o3-mini")!, id: trimmed, known: false };
    }
    if (lower.startsWith("gpt-5")) {
        return { ...BY_ID.get("gpt-5")!, id: trimmed, known: false };
    }
    return { ...BY_ID.get("gpt-4o-mini")!, id: trimmed, known: false, family: "unknown" };
}

export function isReasoningModelId(id: string): boolean {
    return resolveModel(id).reasoning;
}

// -- endpoints and residency ---------------------------------------------------

export type ProviderKeyName = "OPENAI_API_KEY" | "DEEPSEEK_API_KEY";

export interface Endpoint {
    provider: ProviderId;
    label: string;
    baseUrl: string;
    residency: Residency;
    keyName: ProviderKeyName;
}

export const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
export const DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com";

function stripSlash(url: string): string {
    return url.replace(/\/+$/, "");
}

export function endpointFor(provider: ProviderId, env: NodeJS.ProcessEnv = process.env): Endpoint {
    if (provider === "deepseek") {
        const baseUrl = stripSlash(env.DEEPSEEK_BASE_URL?.trim() || DEEPSEEK_DEFAULT_BASE_URL);
        // Residency is declared, never inferred: the operator who points at an
        // EU host also states it. Anything else counts as the official (CN) API.
        const residency: Residency = env.DEEPSEEK_RESIDENCY?.trim().toLowerCase() === "eu" ? "eu" : "cn";
        return { provider, label: "DeepSeek", baseUrl, residency, keyName: "DEEPSEEK_API_KEY" };
    }
    const baseUrl = stripSlash(env.OPENAI_BASE_URL?.trim() || OPENAI_DEFAULT_BASE_URL);
    const residency: Residency = env.OPENAI_RESIDENCY?.trim().toLowerCase() === "eu" ? "eu" : "us";
    return { provider, label: "OpenAI", baseUrl, residency, keyName: "OPENAI_API_KEY" };
}

/**
 * Which residencies may see which data class. OpenAI (US, under the existing
 * DPA) is the status quo for CRM data; China is public-data only unless the
 * operator says otherwise with AI_ALLOW_CN_RAW_CRM=true.
 */
export function allowedResidencies(dataClass: DataClass, env: NodeJS.ProcessEnv = process.env): Residency[] {
    const allowCn = env.AI_ALLOW_CN_RAW_CRM?.trim().toLowerCase() === "true";
    switch (dataClass) {
        case "public":
            return ["eu", "us", "cn"];
        case "aggregated":
            return allowCn ? ["eu", "us", "cn"] : ["eu", "us"];
        case "raw_crm":
        default:
            return allowCn ? ["eu", "us", "cn"] : ["eu", "us"];
    }
}

export function residencyAllows(dataClass: DataClass, provider: ProviderId, env: NodeJS.ProcessEnv = process.env): boolean {
    return allowedResidencies(dataClass, env).includes(endpointFor(provider, env).residency);
}

/** The wire an OpenAI model is called through; DeepSeek only speaks Chat Completions. */
export function wireFor(spec: ModelSpec, env: NodeJS.ProcessEnv = process.env): Wire {
    if (spec.provider !== "openai") return "openai-chat";
    return env.ASSISTANT_WIRE?.trim().toLowerCase() === "responses" ? "openai-responses" : "openai-chat";
}

/**
 * The model name the endpoint expects. EU hosts name DeepSeek models their own
 * way ("DeepSeek-R1-Distill-Llama-70B" on OVHcloud, deployment names on Azure),
 * so the catalog id is mapped through env when set.
 */
export function endpointModelId(spec: ModelSpec, env: NodeJS.ProcessEnv = process.env): string {
    if (spec.provider === "deepseek") {
        if (spec.reasoning) return env.DEEPSEEK_MODEL_REASONER?.trim() || spec.id;
        return env.DEEPSEEK_MODEL_CHAT?.trim() || spec.id;
    }
    return spec.id;
}

export function priceFor(modelId: string): ModelPrice {
    return resolveModel(modelId).price;
}

/** Legacy shape kept for `lib/ai/usage.ts` and its tests. */
export const LEGACY_PRICING: Record<string, { inputPerMillion: number; outputPerMillion: number }> = Object.fromEntries(
    MODEL_CATALOG.filter((m) => m.provider === "openai").map((m) => [m.id, { inputPerMillion: m.price.inputPerM, outputPerMillion: m.price.outputPerM }]),
);
