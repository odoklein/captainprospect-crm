/**
 * Shared (client + server) model of the AI company enrichment: which fields can
 * be enriched, when a company sheet counts as incomplete, the suggestion shape
 * stored on a lookup, and the pure rule for writing an accepted suggestion back
 * onto the company. No network, no DB, no node-only imports — the drawer imports
 * this too.
 */

import { hasUsablePhone } from "@/lib/phone-utils";

export const ENRICHABLE_FIELDS = ["phone", "industry", "country", "city", "linkedin", "website"] as const;
export type EnrichableField = (typeof ENRICHABLE_FIELDS)[number];

export const FIELD_LABELS: Record<EnrichableField, string> = {
    phone: "Téléphone",
    industry: "Secteur",
    country: "Pays",
    city: "Ville",
    linkedin: "LinkedIn",
    website: "Site web",
};

/**
 * Missing any of these makes the sheet "incomplete" and shows the panel. City and
 * website have no reason to nag on their own — they are asked for along the way
 * and offered when found.
 */
export const TRIGGER_FIELDS: readonly EnrichableField[] = ["phone", "industry", "country", "linkedin"];

export type SuggestionStatus = "PENDING" | "APPLIED" | "REJECTED";

/** How well the value is backed by what the web search actually returned. */
export type SuggestionTrust = "own_site" | "multi_source" | "third_party" | "inferred";

export interface EnrichmentSuggestion {
    field: EnrichableField;
    value: string;
    /** 0–99, same scale as the phone enrichment (below MIN_SUGGESTION_CONFIDENCE it is never shown). */
    confidence: number;
    trust: SuggestionTrust;
    sourceUrl: string | null;
    sourceLabel: string | null;
    /** Short excerpt of the page where the value was seen. */
    evidence: string | null;
    status: SuggestionStatus;
    reviewedById?: string | null;
    reviewedAt?: string | null;
}

export const MIN_SUGGESTION_CONFIDENCE = 55;

export interface CompanyAiLookupPayload {
    found: boolean;
    lookupId?: string;
    suggestions: EnrichmentSuggestion[];
    sources: Array<{ url: string; title: string }>;
    cached: boolean;
    searchedAt: string | null;
}

export interface CompanyForGaps {
    phone?: string | null;
    industry?: string | null;
    country?: string | null;
    website?: string | null;
    customData?: unknown;
}

// A company LinkedIn / city kept in customData by a CSV import ("company.<key>").
// Deliberately strict so "contact_linkedin" is not mistaken for the company page.
export const LINKEDIN_KEY = /^(company[ _-]?)?linkedin([ _-]?(url|page|link))?$/i;
export const CITY_KEY = /^(city|ville)$/i;

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function readCustomText(customData: unknown, keyPattern: RegExp): string | null {
    for (const [key, value] of Object.entries(asRecord(customData))) {
        if (keyPattern.test(key) && typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
}

export function additionalPhonesOf(customData: unknown): string[] {
    const value = asRecord(customData).additionalPhones;
    if (!Array.isArray(value)) return [];
    return value.filter((p): p is string => typeof p === "string" && p.trim().length > 0);
}

/** Every enrichable field this company has no usable value for. */
export function missingCompanyFields(company: CompanyForGaps): EnrichableField[] {
    const missing: EnrichableField[] = [];
    if (!hasUsablePhone(company.phone, additionalPhonesOf(company.customData))) missing.push("phone");
    if (!company.industry?.trim()) missing.push("industry");
    if (!company.country?.trim()) missing.push("country");
    if (!company.website?.trim()) missing.push("website");
    if (!readCustomText(company.customData, CITY_KEY)) missing.push("city");
    if (!readCustomText(company.customData, LINKEDIN_KEY)) missing.push("linkedin");
    return missing;
}

/** The subset that decides whether the panel is shown at all. */
export function triggerGaps(company: CompanyForGaps): EnrichableField[] {
    return missingCompanyFields(company).filter((f) => TRIGGER_FIELDS.includes(f));
}

/**
 * What to write on the company for an accepted suggestion. Column-backed fields
 * map straight onto the column; LinkedIn and city live in customData (merged, never
 * replaced), reusing an existing matching key when the import already created one.
 */
export function companyPatchFor(
    company: { customData?: unknown },
    field: EnrichableField,
    value: string,
): { column?: Partial<Record<"phone" | "industry" | "country" | "website", string>>; customData?: Record<string, unknown> } {
    if (field === "phone" || field === "industry" || field === "country" || field === "website") {
        return { column: { [field]: value } };
    }

    const existing = asRecord(company.customData);
    const pattern = field === "linkedin" ? LINKEDIN_KEY : CITY_KEY;
    const existingKey = Object.keys(existing).find((key) => pattern.test(key));
    return { customData: { ...existing, [existingKey ?? field]: value } };
}
