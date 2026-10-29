/**
 * Entry point: a chat function that routes each request to the provider and
 * wire that serve its model, with the agency's keys from the integration store.
 *
 *   const chat = providerChatFn({ dataClass: "raw_crm" });
 *   await chat({ model: "gpt-5.5", messages, ... });
 *
 * The data class is a guard, not a router: when the model's endpoint may not
 * see that class of data the call is refused, never silently redirected.
 */

import { integrationKey } from "@/lib/integrations/keys";
import {
    endpointFor,
    residencyAllows,
    resolveModel,
    wireFor,
    type Endpoint,
    type ModelSpec,
} from "./catalog";
import { ProviderError } from "./errors";
import { createDeepSeekProvider } from "./deepseek";
import { OPENAI_CHAT_QUIRKS, createChatCompletionsProvider } from "./openai-chat";
import { createResponsesProvider } from "./openai-responses";
import type { ChatFn, DataClass, Provider, ProviderId, Wire } from "./types";

export type { ChatCallRequest, ChatCallResponse, ChatFn, ChatMessage, DataClass, ProviderId, ReasoningEffort, ToolCall, ToolSpec, Usage, Wire } from "./types";
export { EMPTY_USAGE, addUsage } from "./types";
export { ProviderError, isProviderError } from "./errors";
export { MODEL_CATALOG, endpointFor, priceFor, residencyAllows, resolveModel, wireFor } from "./catalog";
export type { Endpoint, ModelSpec } from "./catalog";

const cache = new Map<string, Provider>();

/** A key identifier that is stable per key but never stores the key itself. */
function keyFingerprint(apiKey: string): string {
    let h = 0;
    for (let i = 0; i < apiKey.length; i++) h = (h * 31 + apiKey.charCodeAt(i)) | 0;
    return `${apiKey.length}:${h.toString(16)}`;
}

function notConfigured(endpoint: Endpoint): ProviderError {
    return new ProviderError(
        "NOT_CONFIGURED",
        `${endpoint.keyName} is not configured`,
        503,
        `L'assistant n'est pas configuré : la clé ${endpoint.label} (${endpoint.keyName}) est absente.`,
        { kind: "not_configured", retryable: false, provider: endpoint.provider },
    );
}

export function isConfigured(provider: ProviderId): boolean {
    return !!integrationKey(endpointFor(provider).keyName);
}

function build(provider: ProviderId, wire: Wire, endpoint: Endpoint, apiKey: string): Provider {
    if (provider === "deepseek") return createDeepSeekProvider({ apiKey, baseUrl: endpoint.baseUrl });
    if (wire === "openai-responses") return createResponsesProvider({ apiKey, baseUrl: endpoint.baseUrl });
    return createChatCompletionsProvider({ id: "openai", apiKey, baseUrl: endpoint.baseUrl, quirks: OPENAI_CHAT_QUIRKS });
}

/**
 * The provider for a model spec. Cached per (provider, wire, endpoint, key)
 * so a key rotation or a base-URL change takes effect on the next call.
 */
export function getProvider(spec: ModelSpec, options: { apiKey?: string; wire?: Wire } = {}): Provider {
    const endpoint = endpointFor(spec.provider);
    const apiKey = options.apiKey ?? integrationKey(endpoint.keyName);
    if (!apiKey) throw notConfigured(endpoint);
    const wire = options.wire ?? wireFor(spec);
    const cacheKey = `${spec.provider}|${wire}|${endpoint.baseUrl}|${keyFingerprint(apiKey)}`;
    let provider = cache.get(cacheKey);
    if (!provider) {
        provider = build(spec.provider, wire, endpoint, apiKey);
        cache.set(cacheKey, provider);
    }
    return provider;
}

export function assertEligible(spec: ModelSpec, dataClass: DataClass | undefined): void {
    if (!dataClass || residencyAllows(dataClass, spec.provider)) return;
    const endpoint = endpointFor(spec.provider);
    throw new ProviderError(
        "NO_ELIGIBLE_MODEL",
        `${spec.id} on ${endpoint.baseUrl} (${endpoint.residency}) may not process ${dataClass} data`,
        503,
        `Le modèle ${spec.label} n'est pas autorisé pour ces données (hébergement ${endpoint.residency.toUpperCase()}).`,
        { kind: "not_configured", retryable: false, provider: spec.provider },
    );
}

/**
 * The chat function the runtime and the JSON helper use. `dataClass` refuses
 * a model whose endpoint may not see that data; `apiKey` overrides the store
 * (scripts, evals) and only applies to the model's own provider.
 */
export function providerChatFn(options: { dataClass?: DataClass; apiKey?: string; wire?: Wire } = {}): ChatFn {
    return async (request) => {
        const spec = resolveModel(request.model);
        assertEligible(spec, options.dataClass);
        return getProvider(spec, { apiKey: options.apiKey, wire: options.wire }).call(request);
    };
}
