// ============================================
// BRAND — resolved brand for app, server, emails and PDFs.
//
// import { brand } from "@/lib/brand";
//   brand.name            "Captain Prospect"
//   brand.appUrl          env NEXT_PUBLIC_APP_URL → NEXTAUTH_URL → config
//   brand.palette.primary[600]  hex, same value the CSS token carries
//
// Edit brand/brand.config.ts, not this file.
// ============================================

import { brandConfig } from "@/brand/brand.config";
import { neutralRamp, rampFromSeed, readableOn, type Ramp } from "./color";

export type BrandPalette = {
    primary: Ramp;
    accent: Ramp;
    neutral: Ramp;
    /** The seeds themselves (they sit somewhere inside their ramp). */
    primarySeed: string;
    accentSeed: string;
    /** Text colour that reads on each seed. */
    onPrimary: string;
    onAccent: string;
};

function buildPalette(): BrandPalette {
    const { primary, accent, neutralTint } = brandConfig.colors;
    return {
        primary: rampFromSeed(primary),
        accent: rampFromSeed(accent),
        neutral: neutralRamp(primary, neutralTint),
        primarySeed: primary.toUpperCase(),
        accentSeed: accent.toUpperCase(),
        onPrimary: readableOn(primary),
        onAccent: readableOn(accent),
    };
}

function resolveAppUrl(): string {
    const fromEnv = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
    return (fromEnv || brandConfig.web.appUrl).replace(/\/+$/, "");
}

const palette = buildPalette();

export const brand = {
    ...brandConfig.identity,
    web: brandConfig.web,
    email: brandConfig.email,
    locale: brandConfig.locale,
    logos: brandConfig.logos,
    palette,
    /** Public app URL, no trailing slash. */
    get appUrl(): string {
        return resolveAppUrl();
    },
    /** Host of the app URL, for display ("app.captainprospect.fr"). */
    get appHost(): string {
        try {
            return new URL(resolveAppUrl()).host;
        } catch {
            return resolveAppUrl();
        }
    },
} as const;

/** Absolute URL inside the app: brandUrl("/client/portal") → "https://app…/client/portal". */
export function brandUrl(path = "/"): string {
    return `${brand.appUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

/** `"Captain Prospect" <notifications@…>` — the From header of automatic emails. */
export function brandSender(address: string = brand.email.notificationsAddress): string {
    return `${brand.email.senderName} <${address}>`;
}

/** `-//Captain Prospect CRM//RDV//FR` — iCalendar PRODID. */
export function brandIcsProdId(kind = "RDV"): string {
    return `-//${brand.productName}//${kind}//${brand.locale.lang.toUpperCase()}`;
}

/** `<page> · Captain Prospect` — consistent document titles. */
export function brandTitle(page?: string): string {
    return page ? `${page} | ${brand.name}` : brand.productName;
}

export { brandConfig };
export type { Ramp } from "./color";
