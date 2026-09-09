import { findCompanyPhoneViaMapbox } from "./mapbox-phone";
import { findCompanyPhoneViaGoogle } from "./google-places-phone";
import type { CompanySearchInput, PhoneSuggestion } from "./phone-match";

// ============================================
// Company phone lookup: Mapbox first, Google Places as fallback.
// Mapbox POI data rarely carries a phone for B2B offices, so a miss there is
// expected rather than exceptional — Google is queried whenever Mapbox returns
// nothing above the confidence gate, or is unavailable.
// ============================================

export type PhoneProvider = "MAPBOX" | "GOOGLE_PLACES";

export type ProviderPhoneResult = {
    suggestion: PhoneSuggestion | null;
    /** Which provider produced the suggestion, or was tried last when nothing was found. */
    provider: PhoneProvider;
};

/** True when no provider is configured at all — the caller reports this as "not configured". */
export class NoPhoneProviderConfiguredError extends Error {
    constructor() {
        super("NO_PHONE_PROVIDER_CONFIGURED");
        this.name = "NoPhoneProviderConfiguredError";
    }
}

export async function findCompanyPhone(
    input: CompanySearchInput,
): Promise<ProviderPhoneResult> {
    let mapboxConfigured = true;
    let googleConfigured = true;

    try {
        const suggestion = await findCompanyPhoneViaMapbox(input);
        if (suggestion) return { suggestion, provider: "MAPBOX" };
    } catch (error) {
        if (error instanceof Error && error.message === "MAPBOX_ACCESS_TOKEN_MISSING") {
            mapboxConfigured = false;
        } else {
            // A Mapbox outage must not block the lookup — fall through to Google.
            console.error("Mapbox phone lookup failed:", error);
        }
    }

    try {
        const suggestion = await findCompanyPhoneViaGoogle(input);
        if (suggestion) return { suggestion, provider: "GOOGLE_PLACES" };
    } catch (error) {
        if (
            error instanceof Error &&
            error.message === "GOOGLE_PLACES_API_KEY_MISSING"
        ) {
            googleConfigured = false;
        } else {
            console.error("Google Places phone lookup failed:", error);
            // Google is the last resort: if Mapbox also failed there is nothing to report.
            if (!mapboxConfigured) throw new NoPhoneProviderConfiguredError();
            throw error;
        }
    }

    if (!mapboxConfigured && !googleConfigured) {
        throw new NoPhoneProviderConfiguredError();
    }

    return { suggestion: null, provider: mapboxConfigured ? "MAPBOX" : "GOOGLE_PLACES" };
}
