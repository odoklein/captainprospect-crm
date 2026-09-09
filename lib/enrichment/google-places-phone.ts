import {
    formatPhone,
    scoreCandidate,
    websiteHost,
    MIN_PHONE_CONFIDENCE,
    type CompanySearchInput,
    type PhoneSuggestion,
} from "./phone-match";

const GOOGLE_PLACES_TEXT_SEARCH_URL =
    "https://places.googleapis.com/v1/places:searchText";

type GooglePlace = {
    displayName?: { text?: string };
    formattedAddress?: string;
    internationalPhoneNumber?: string;
    nationalPhoneNumber?: string;
    googleMapsUri?: string;
    websiteUri?: string;
};

type GooglePlacesResponse = {
    places?: GooglePlace[];
    error?: { message?: string };
};

export async function findCompanyPhoneViaGoogle(
    input: CompanySearchInput,
): Promise<PhoneSuggestion | null> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
    if (!apiKey) {
        throw new Error("GOOGLE_PLACES_API_KEY_MISSING");
    }

    const queryParts = [
        input.name.trim(),
        input.country?.trim(),
        websiteHost(input.website),
    ].filter(Boolean);

    const response = await fetch(GOOGLE_PLACES_TEXT_SEARCH_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": [
                "places.displayName",
                "places.formattedAddress",
                "places.internationalPhoneNumber",
                "places.nationalPhoneNumber",
                "places.googleMapsUri",
                "places.websiteUri",
            ].join(","),
        },
        body: JSON.stringify({
            textQuery: queryParts.join(" "),
            languageCode: "fr",
            pageSize: 5,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
    });

    const payload = (await response.json()) as GooglePlacesResponse;
    if (!response.ok) {
        throw new Error(
            `GOOGLE_PLACES_ERROR:${payload.error?.message ?? response.status}`,
        );
    }

    const candidates = (payload.places ?? [])
        .map((place) => {
            const rawPhone =
                place.internationalPhoneNumber ?? place.nationalPhoneNumber;
            const phone = rawPhone
                ? formatPhone(rawPhone, input.country)
                : null;

            return {
                place,
                phone,
                confidence: scoreCandidate(
                    {
                        name: place.displayName?.text,
                        address: place.formattedAddress,
                        website: place.websiteUri,
                    },
                    input,
                ),
            };
        })
        .filter(
            (
                candidate,
            ): candidate is {
                place: GooglePlace;
                phone: string;
                confidence: number;
            } => Boolean(candidate.phone),
        )
        .sort((left, right) => right.confidence - left.confidence);

    const best = candidates[0];
    if (!best || best.confidence < MIN_PHONE_CONFIDENCE) return null;

    return {
        phone: best.phone,
        sourceUrl:
            best.place.googleMapsUri ??
            `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                [
                    best.place.displayName?.text,
                    best.place.formattedAddress,
                ]
                    .filter(Boolean)
                    .join(" "),
            )}`,
        matchedCompanyName:
            best.place.displayName?.text?.trim() || input.name.trim(),
        matchedAddress: best.place.formattedAddress?.trim() || null,
        confidence: best.confidence,
    };
}
