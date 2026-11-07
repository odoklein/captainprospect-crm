// ============================================
// BRAND RESOLVER — defaults (brand/brand.config.ts) + stored settings → Brand.
//
// Pure and isomorphic. Never throws: an invalid stored value (bad hex, unknown
// font preset, empty string) falls back to the config value for that field.
// ============================================

import { brandConfig } from "@/brand/brand.config";
import { runtimeAppUrl } from "@/lib/runtime-config/env";
import { neutralRamp, parseHex, rampFromSeed, readableOn } from "./color";
import {
    BRAND_ASSET_COLUMNS,
    BRAND_ASSET_DEFAULTS,
    BRAND_ASSET_SLOTS,
    isFontPreset,
    type Brand,
    type BrandAssetSlot,
    type BrandPalette,
    type BrandSettingsValues,
} from "./types";

/** The settings an empty BrandSettings table stands for. */
export function defaultBrandSettings(): BrandSettingsValues {
    const c = brandConfig;
    return {
        name: c.identity.name,
        productName: c.identity.productName,
        tagline: c.identity.tagline,
        description: c.identity.description,
        companyName: c.identity.companyName,
        companyShortName: c.identity.companyShortName,
        appUrl: c.web.appUrl,
        website: c.web.website,
        senderName: c.email.senderName,
        notificationsAddress: c.email.notificationsAddress,
        supportAddress: c.email.supportAddress,
        emailDomains: [...c.email.domains],
        lang: c.locale.lang,
        locale: c.locale.locale,
        currency: c.locale.currency,
        timeZone: c.locale.timeZone,
        primaryColor: c.colors.primary,
        accentColor: c.colors.accent,
        neutralTint: c.colors.neutralTint,
        fontPreset: "default",
        logoFullKey: null,
        logoFullInverseKey: null,
        logoMarkKey: null,
        logoMarkInverseKey: null,
        faviconKey: null,
        appleTouchIconKey: null,
        logoFullWidth: c.logos.fullWidth,
        logoFullHeight: c.logos.fullHeight,
        logoVersion: null,
        updatedAt: null,
        updatedBy: null,
    };
}

export function isHexColor(v: unknown): v is string {
    if (typeof v !== "string") return false;
    try {
        parseHex(v);
        return true;
    } catch {
        return false;
    }
}

function text(v: unknown, fallback: string): string {
    return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function positiveInt(v: unknown, fallback: number): number {
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : fallback;
}

/** Stored settings merged over the defaults, every field validated. */
export function mergeBrandSettings(row?: Partial<BrandSettingsValues> | null): BrandSettingsValues {
    const d = defaultBrandSettings();
    if (!row) return d;
    const domains = Array.isArray(row.emailDomains)
        ? row.emailDomains.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim())
        : null;
    const tint = typeof row.neutralTint === "number" && Number.isFinite(row.neutralTint) ? row.neutralTint : d.neutralTint;
    const key = (v: unknown) => (typeof v === "string" && v ? v : null);
    return {
        name: text(row.name, d.name),
        productName: text(row.productName, d.productName),
        tagline: text(row.tagline, d.tagline),
        description: text(row.description, d.description),
        companyName: text(row.companyName, d.companyName),
        companyShortName: text(row.companyShortName, d.companyShortName),
        appUrl: text(row.appUrl, d.appUrl),
        website: text(row.website, d.website),
        senderName: text(row.senderName, d.senderName),
        notificationsAddress: text(row.notificationsAddress, d.notificationsAddress),
        supportAddress: text(row.supportAddress, d.supportAddress),
        emailDomains: domains && domains.length ? domains : d.emailDomains,
        lang: text(row.lang, d.lang),
        locale: text(row.locale, d.locale),
        currency: text(row.currency, d.currency),
        timeZone: text(row.timeZone, d.timeZone),
        primaryColor: isHexColor(row.primaryColor) ? row.primaryColor : d.primaryColor,
        accentColor: isHexColor(row.accentColor) ? row.accentColor : d.accentColor,
        neutralTint: Math.min(1, Math.max(0, tint)),
        fontPreset: isFontPreset(row.fontPreset) ? row.fontPreset : d.fontPreset,
        logoFullKey: key(row.logoFullKey),
        logoFullInverseKey: key(row.logoFullInverseKey),
        logoMarkKey: key(row.logoMarkKey),
        logoMarkInverseKey: key(row.logoMarkInverseKey),
        faviconKey: key(row.faviconKey),
        appleTouchIconKey: key(row.appleTouchIconKey),
        logoFullWidth: positiveInt(row.logoFullWidth, d.logoFullWidth),
        logoFullHeight: positiveInt(row.logoFullHeight, d.logoFullHeight),
        logoVersion: key(row.logoVersion),
        updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : null,
        updatedBy: typeof row.updatedBy === "string" ? row.updatedBy : null,
    };
}

export function buildPalette(primary: string, accent: string, neutralTint: number): BrandPalette {
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

/**
 * Public URL of the app. The container env wins (NEXTAUTH_URL drives auth
 * cookies and OAuth callbacks, so links must agree with it); the stored value
 * is only used when the env is unset. Read at runtime (lib/runtime-config/env):
 * a literal process.env.NEXT_PUBLIC_* would be frozen at build.
 */
export function resolveAppUrl(stored: string): string {
    return (runtimeAppUrl() || stored).replace(/\/+$/, "");
}

function hostOf(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return url;
    }
}

/** URL a slot is served from: the uploaded file, or the /public default. */
export function brandAssetUrl(slot: BrandAssetSlot, s: BrandSettingsValues): string {
    const key = s[BRAND_ASSET_COLUMNS[slot]];
    if (!key) return BRAND_ASSET_DEFAULTS[slot];
    return `/api/brand/assets/${slot}?v=${encodeURIComponent(s.logoVersion || "1")}`;
}

/** Defaults + stored settings → the Brand every surface renders. */
export function resolveBrand(row?: Partial<BrandSettingsValues> | null): Brand {
    const s = mergeBrandSettings(row);
    const logos = Object.fromEntries(BRAND_ASSET_SLOTS.map((slot) => [slot, brandAssetUrl(slot, s)])) as Record<
        BrandAssetSlot,
        string
    >;
    const appUrl = resolveAppUrl(s.appUrl);
    return {
        name: s.name,
        productName: s.productName,
        tagline: s.tagline,
        description: s.description,
        companyName: s.companyName,
        companyShortName: s.companyShortName,
        web: { appUrl: s.appUrl, website: s.website },
        email: {
            senderName: s.senderName,
            notificationsAddress: s.notificationsAddress,
            supportAddress: s.supportAddress,
            domains: s.emailDomains,
        },
        locale: { lang: s.lang, locale: s.locale, currency: s.currency, timeZone: s.timeZone },
        logos: { ...logos, fullWidth: s.logoFullWidth, fullHeight: s.logoFullHeight },
        palette: buildPalette(s.primaryColor, s.accentColor, s.neutralTint),
        fontPreset: isFontPreset(s.fontPreset) ? s.fontPreset : "default",
        appUrl,
        appHost: hostOf(appUrl),
        version: s.logoVersion || s.updatedAt || "0",
    };
}

// ── Helpers bound to a brand ────────────────────────────────────────────────

/** Absolute URL inside the app: brandUrlOf(b, "/client/portal") → "https://app…/client/portal". */
export function brandUrlOf(b: Brand, path = "/"): string {
    return `${b.appUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

/** `"Captain Prospect" <notifications@…>` — the From header of automatic emails. */
export function brandSenderOf(b: Brand, address: string = b.email.notificationsAddress): string {
    return `${b.email.senderName} <${address}>`;
}

/** `-//Captain Prospect CRM//RDV//FR` — iCalendar PRODID. */
export function brandIcsProdIdOf(b: Brand, kind = "RDV"): string {
    return `-//${b.productName}//${kind}//${b.locale.lang.toUpperCase()}`;
}

/** `<page> | Captain Prospect` — consistent document titles. */
export function brandTitleOf(b: Brand, page?: string): string {
    return page ? `${page} | ${b.name}` : b.productName;
}
