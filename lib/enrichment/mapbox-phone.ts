import {
    formatPhone,
    scoreCandidate,
    websiteHost,
    MIN_PHONE_CONFIDENCE,
    type CompanySearchInput,
    type PhoneSuggestion,
} from "./phone-match";

// ============================================
// Mapbox Search Box (forward search) phone lookup.
// Phone numbers live in properties.metadata.phone and are only present for POIs
// Mapbox has business data on — coverage is thinner than Google Places, especially
// for B2B offices, hence the Google fallback in ./company-phone.ts.
// ============================================

const MAPBOX_FORWARD_URL = "https://api.mapbox.com/search/searchbox/v1/forward";

type MapboxFeature = {
    properties?: {
        name?: string;
        full_address?: string;
        place_formatted?: string;
        mapbox_id?: string;
        metadata?: {
            phone?: string;
            website?: string;
        };
    };
};

type MapboxResponse = {
    features?: MapboxFeature[];
    message?: string;
};

export async function findCompanyPhoneViaMapbox(
    input: CompanySearchInput,
): Promise<PhoneSuggestion | null> {
    const accessToken = process.env.MAPBOX_ACCESS_TOKEN?.trim();
    if (!accessToken) {
        throw new Error("MAPBOX_ACCESS_TOKEN_MISSING");
    }

    const queryParts = [
        input.name.trim(),
        input.country?.trim(),
        websiteHost(input.website),
    ].filter(Boolean);

    const params = new URLSearchParams({
        q: queryParts.join(" "),
        access_token: accessToken,
        limit: "5",
        language: "fr",
        types: "poi",
    });
    // Mapbox expects an ISO 3166-1 alpha-2 code; company.country is free text from
    // CSV imports, so only pass it when it already looks like a country code.
    const country = input.country?.trim();
    if (country?.length === 2) {
        params.set("country", country.toLowerCase());
    }

    const response = await fetch(`${MAPBOX_FORWARD_URL}?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
    });

    const payload = (await response.json()) as MapboxResponse;
    if (!response.ok) {
        throw new Error(`MAPBOX_ERROR:${payload.message ?? response.status}`);
    }

    const candidates = (payload.features ?? [])
        .map((feature) => {
            const properties = feature.properties ?? {};
            const rawPhone = properties.metadata?.phone;
            const phone = rawPhone ? formatPhone(rawPhone, input.country) : null;
            const address = properties.full_address ?? properties.place_formatted ?? null;

            return {
                properties,
                address,
                phone,
                confidence: scoreCandidate(
                    {
                        name: properties.name,
                        address,
                        website: properties.metadata?.website,
                    },
                    input,
                ),
            };
        })
        .filter(
            (
                candidate,
            ): candidate is typeof candidate & { phone: string } =>
                Boolean(candidate.phone),
        )
        .sort((left, right) => right.confidence - left.confidence);

    const best = candidates[0];
    if (!best || best.confidence < MIN_PHONE_CONFIDENCE) return null;

    return {
        phone: best.phone,
        // Mapbox has no public place page, so the POI's own website is the only
        // thing a user can open to verify the number.
        sourceUrl: best.properties.metadata?.website ?? null,
        matchedCompanyName: best.properties.name?.trim() || input.name.trim(),
        matchedAddress: best.address?.trim() || null,
        confidence: best.confidence,
    };
}
