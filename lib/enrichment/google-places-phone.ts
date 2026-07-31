import { createHash } from "crypto";
import {
    parsePhoneNumberFromString,
    type CountryCode,
} from "libphonenumber-js";

const GOOGLE_PLACES_TEXT_SEARCH_URL =
    "https://places.googleapis.com/v1/places:searchText";

type CompanySearchInput = {
    name: string;
    country?: string | null;
    website?: string | null;
};

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

export type GooglePhoneSuggestion = {
    phone: string;
    sourceUrl: string | null;
    matchedCompanyName: string;
    matchedAddress: string | null;
    confidence: number;
};

function normalizeText(value?: string | null): string {
    return (value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function websiteHost(value?: string | null): string {
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

function tokenSimilarity(left: string, right: string): number {
    const leftTokens = new Set(normalizeText(left).split(" ").filter(Boolean));
    const rightTokens = new Set(normalizeText(right).split(" ").filter(Boolean));
    if (!leftTokens.size || !rightTokens.size) return 0;

    const intersection = [...leftTokens].filter((token) =>
        rightTokens.has(token),
    ).length;
    return intersection / Math.max(leftTokens.size, rightTokens.size);
}

function formatPhone(phone: string, country?: string | null): string | null {
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

function scorePlace(place: GooglePlace, input: CompanySearchInput): number {
    const candidateName = place.displayName?.text ?? "";
    const nameSimilarity = tokenSimilarity(input.name, candidateName);
    let score = Math.round(nameSimilarity * 45);

    const inputHost = websiteHost(input.website);
    const candidateHost = websiteHost(place.websiteUri);
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
    const normalizedAddress = normalizeText(place.formattedAddress);
    if (normalizedCountry && normalizedAddress.includes(normalizedCountry)) {
        score += 10;
    }

    return Math.min(99, score);
}

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

export async function findCompanyPhoneViaGoogle(
    input: CompanySearchInput,
): Promise<GooglePhoneSuggestion | null> {
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
                confidence: scorePlace(place, input),
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
    if (!best || best.confidence < 55) return null;

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
