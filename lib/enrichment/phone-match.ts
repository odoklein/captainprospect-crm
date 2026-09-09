import { createHash } from "crypto";
import {
    parsePhoneNumberFromString,
    type CountryCode,
} from "libphonenumber-js";

// ============================================
// Shared matching logic for company phone enrichment.
// Both providers (Mapbox, Google Places) score candidates on the same 0-99 scale
// and use the same acceptance gate, so a suggestion means the same thing to the
// user whichever provider answered.
// ============================================

/** Below this score a candidate is discarded rather than shown to the user. */
export const MIN_PHONE_CONFIDENCE = 55;

export type CompanySearchInput = {
    name: string;
    country?: string | null;
    website?: string | null;
};

export type PhoneSuggestion = {
    phone: string;
    sourceUrl: string | null;
    matchedCompanyName: string;
    matchedAddress: string | null;
    confidence: number;
};

/** A provider-neutral view of one candidate returned by a search API. */
export type PhoneCandidateFields = {
    name?: string | null;
    address?: string | null;
    website?: string | null;
};

export function normalizeText(value?: string | null): string {
    return (value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

export function websiteHost(value?: string | null): string {
    if (!value?.trim()) return "";

    try {
        const url = new URL(
            /^https?:\/\//i.test(value) ? value : `https://${value}`,
        );
        return url.hostname.toLowerCase().replace(/^www\./, "");
    } catch {
        return value
            .toLowerCase()
            .replace(/^https?:\/\//, "")
            .replace(/^www\./, "")
            .split(/[/?#]/)[0];
    }
}

export function tokenSimilarity(left: string, right: string): number {
    const leftTokens = new Set(normalizeText(left).split(" ").filter(Boolean));
    const rightTokens = new Set(normalizeText(right).split(" ").filter(Boolean));
    if (!leftTokens.size || !rightTokens.size) return 0;

    const intersection = [...leftTokens].filter((token) =>
        rightTokens.has(token),
    ).length;
    return intersection / Math.max(leftTokens.size, rightTokens.size);
}

export function formatPhone(phone: string, country?: string | null): string | null {
    const parsed =
        parsePhoneNumberFromString(
            phone,
            country?.length === 2
                ? (country.toUpperCase() as CountryCode)
                : undefined,
        ) ??
        parsePhoneNumberFromString(phone);

    if (parsed?.isValid()) return parsed.formatInternational();

    const digits = phone.replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 15 ? phone.trim() : null;
}

/**
 * Score a candidate against the company we're looking for: name similarity is worth
 * up to 45, an exact website-host match 45 (35 for a subdomain relation), and the
 * country appearing in the address 10.
 */
export function scoreCandidate(
    candidate: PhoneCandidateFields,
    input: CompanySearchInput,
): number {
    const nameSimilarity = tokenSimilarity(input.name, candidate.name ?? "");
    let score = Math.round(nameSimilarity * 45);

    const inputHost = websiteHost(input.website);
    const candidateHost = websiteHost(candidate.website);
    if (inputHost && candidateHost) {
        if (inputHost === candidateHost) score += 45;
        else if (
            inputHost.endsWith(`.${candidateHost}`) ||
            candidateHost.endsWith(`.${inputHost}`)
        ) {
            score += 35;
        }
    }

    const normalizedCountry = normalizeText(input.country);
    const normalizedAddress = normalizeText(candidate.address);
    if (normalizedCountry && normalizedAddress.includes(normalizedCountry)) {
        score += 10;
    }

    return Math.min(99, score);
}

/**
 * Cache key for a lookup. Deliberately provider-agnostic: a company already looked
 * up through one provider should not be re-queried through the other.
 */
export function buildPhoneLookupHash(input: CompanySearchInput): string {
    return createHash("sha256")
        .update(
            JSON.stringify({
                name: normalizeText(input.name),
                country: normalizeText(input.country),
                website: websiteHost(input.website),
            }),
        )
        .digest("hex");
}
