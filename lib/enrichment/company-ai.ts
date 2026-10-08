/**
 * AI company enrichment: one Mistral web search for every missing field, run in
 * parallel with the existing Google Places / Mapbox phone lookup. Each source can
 * fail on its own; only when both fail does the caller get an error.
 */

import { MistralError, mistralChat } from "@/lib/ai/mistral";
import { runWebSearchConversation } from "@/lib/ai/mistral-web-search";
import { findCompanyPhone } from "./company-phone";
import {
    ENRICHMENT_INSTRUCTIONS,
    buildEnrichmentInput,
    buildSuggestions,
    collectPages,
    parseModelJson,
    reconcilePhone,
    type RawAiAnswer,
} from "./company-ai-core";
import { ENRICHABLE_FIELDS, type EnrichableField, type EnrichmentSuggestion } from "./company-fields";

export interface CompanyAiInput {
    name: string;
    website: string | null;
    country: string | null;
    requested: EnrichableField[];
    knownIndustries: string[];
    emailDomains: string[];
}

export interface CompanyAiResult {
    suggestions: EnrichmentSuggestion[];
    sources: Array<{ url: string; title: string }>;
    searchCount: number;
    durationMs: number;
}

/** The model occasionally answers in prose; one cheap pass turns it back into JSON. */
async function repairToJson(text: string, requested: EnrichableField[]): Promise<RawAiAnswer | null> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return null;
    try {
        const result = await mistralChat(apiKey, {
            model: "gpt-4o-mini",
            temperature: 0,
            maxTokens: 250,
            messages: [
                {
                    role: "system",
                    content: `Extrais de ce texte un objet JSON avec exactement les clés ${requested.join(", ")}. Valeur null si absente du texte. Réponds uniquement avec le JSON.`,
                },
                { role: "user", content: text.slice(0, 3000) },
            ],
        });
        return parseModelJson(result.message.content ?? "");
    } catch {
        return null;
    }
}

async function askModel(input: CompanyAiInput) {
    const ctx = { ...input, emailDomains: input.emailDomains };
    const run = await runWebSearchConversation({
        instructions: ENRICHMENT_INSTRUCTIONS,
        input: buildEnrichmentInput(ctx),
    });
    const pages = collectPages(run.outputs);
    const raw = parseModelJson(run.text) ?? (run.text.trim() ? await repairToJson(run.text, input.requested) : null);
    return { suggestions: raw ? buildSuggestions(raw, input, pages) : [], searchCount: run.searchCount };
}

async function placesPhone(input: CompanyAiInput) {
    try {
        const { suggestion, provider } = await findCompanyPhone({
            name: input.name,
            country: input.country,
            website: input.website,
        });
        if (!suggestion) return null;
        return {
            phone: suggestion.phone,
            confidence: suggestion.confidence,
            sourceUrl: suggestion.sourceUrl,
            sourceLabel: provider === "MAPBOX" ? "Mapbox" : "Google Places",
        };
    } catch (error) {
        // Not configured or unavailable: the web search still stands on its own.
        console.error("[company-ai] places phone lookup failed:", error);
        return null;
    }
}

export async function enrichCompanyViaAi(input: CompanyAiInput): Promise<CompanyAiResult> {
    const startedAt = Date.now();
    const wantsPhone = input.requested.includes("phone");

    const [ai, places] = await Promise.allSettled([askModel(input), wantsPhone ? placesPhone(input) : Promise.resolve(null)]);
    const placesResult = places.status === "fulfilled" ? places.value : null;

    if (ai.status === "rejected" && !placesResult) {
        throw ai.reason instanceof Error ? ai.reason : new MistralError("Recherche IA indisponible", 502);
    }
    if (ai.status === "rejected") console.error("[company-ai] web search failed, keeping places phone only:", ai.reason);

    const fromAi = ai.status === "fulfilled" ? ai.value : { suggestions: [], searchCount: 0 };

    const phone = wantsPhone
        ? reconcilePhone(fromAi.suggestions.find((s) => s.field === "phone") ?? null, placesResult)
        : null;
    const suggestions = [...(phone ? [phone] : []), ...fromAi.suggestions.filter((s) => s.field !== "phone")].sort(
        (a, b) => ENRICHABLE_FIELDS.indexOf(a.field) - ENRICHABLE_FIELDS.indexOf(b.field),
    );

    const sources = [...new Map(suggestions.filter((s) => s.sourceUrl).map((s) => [s.sourceUrl as string, { url: s.sourceUrl as string, title: s.sourceLabel ?? s.sourceUrl as string }])).values()];

    return { suggestions, sources, searchCount: fromAi.searchCount, durationMs: Date.now() - startedAt };
}
