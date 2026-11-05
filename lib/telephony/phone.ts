// ============================================
// TELEPHONY — dial number validation. Pure: safe to import anywhere.
//
// Every number the softphone dials goes through here first, server-side.
// It is the toll-fraud gate: a stolen session must not be able to dial
// premium-rate or far-away numbers on the agency's Twilio account.
// ============================================

// core + explicit "max" metadata: getType() (premium-rate detection) needs the
// full metadata, and the libphonenumber-js/max entry point fails to load its JSON under tsx.
import { parsePhoneNumberFromString as parseWithMetadata, type CountryCode, type MetadataJson } from "libphonenumber-js/core";
import maxMetadata from "libphonenumber-js/metadata.max.json";

const parsePhoneNumberFromString = (text: string, country: CountryCode) =>
    parseWithMetadata(text, country, maxMetadata as unknown as MetadataJson);

/** Countries a prospect may be dialled in when TWILIO_ALLOWED_COUNTRIES is unset. */
export const DEFAULT_ALLOWED_COUNTRIES: readonly CountryCode[] = ["FR", "BE", "CH", "LU", "MC"];

/** Number types never dialled, whatever the country. */
const BLOCKED_TYPES = new Set(["PREMIUM_RATE", "SHARED_COST", "UAN", "VOICEMAIL", "PAGER"]);

export type DialCheck =
    | { ok: true; e164: string; country: CountryCode | null }
    | { ok: false; reason: "invalid" | "country" | "premium"; message: string };

export function parseAllowedCountries(raw: string | undefined | null): CountryCode[] {
    const list = (raw ?? "")
        .split(/[,\s]+/)
        .map((c) => c.trim().toUpperCase())
        .filter((c) => /^[A-Z]{2}$/.test(c)) as CountryCode[];
    return list.length > 0 ? list : [...DEFAULT_ALLOWED_COUNTRIES];
}

/**
 * Normalises a number as typed in the CRM ("06 12 34 56 78", "+33 6…", "0033 6…")
 * to E.164 and checks it may be dialled.
 */
export function checkDialNumber(
    raw: string,
    opts: { defaultCountry?: CountryCode; allowedCountries?: readonly CountryCode[] } = {},
): DialCheck {
    const defaultCountry = opts.defaultCountry ?? "FR";
    const allowed = opts.allowedCountries ?? DEFAULT_ALLOWED_COUNTRIES;

    let text = (raw ?? "").trim();
    if (text.startsWith("00")) text = `+${text.slice(2)}`;
    // Keep digits and a leading +; drop separators, "(0)" and extensions.
    text = text.replace(/\(0\)/g, "").split(/[;,]|ext|poste/i)[0] ?? "";

    const parsed = parsePhoneNumberFromString(text, defaultCountry);
    if (!parsed || !parsed.isValid()) {
        return { ok: false, reason: "invalid", message: "Numéro de téléphone invalide" };
    }

    const country = parsed.country ?? null;
    if (!country || !allowed.includes(country)) {
        return {
            ok: false,
            reason: "country",
            message: country
                ? `Les appels vers ce pays (${country}) ne sont pas autorisés`
                : "Destination non autorisée",
        };
    }

    const type = parsed.getType();
    if (type && BLOCKED_TYPES.has(type)) {
        return { ok: false, reason: "premium", message: "Les numéros surtaxés ne peuvent pas être appelés" };
    }

    return { ok: true, e164: parsed.number, country };
}

/** A caller id must be a plain E.164 number (it is shown to the prospect). */
export function isE164(value: string | null | undefined): value is string {
    return typeof value === "string" && /^\+[1-9]\d{6,14}$/.test(value.trim());
}
