// ============================================
// BRAND TYPES — shared by the default brand, the runtime resolver, the client
// provider and the settings/provisioning APIs. Client-safe: no imports from
// the app, no Node APIs.
// ============================================

import type { Ramp } from "./color";

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

// ── Fonts ───────────────────────────────────────────────────────────────────
// next/font downloads families at build time, so a DB value can only pick one
// of the families brand/fonts.ts already loads. Each preset maps the two
// runtime variables (--font-display-face / --font-body-face) onto those faces.

export const FONT_PRESETS = {
    default: { label: "Bricolage Grotesque + Geist", display: "--font-preset-default-display", body: "--font-preset-default-body" },
    inter: { label: "Inter", display: "--font-preset-inter", body: "--font-preset-inter" },
    manrope: { label: "Manrope", display: "--font-preset-manrope", body: "--font-preset-manrope" },
} as const;

export type FontPresetId = keyof typeof FONT_PRESETS;

export function isFontPreset(v: unknown): v is FontPresetId {
    return typeof v === "string" && Object.prototype.hasOwnProperty.call(FONT_PRESETS, v);
}

// ── Logo slots ──────────────────────────────────────────────────────────────

export const BRAND_ASSET_SLOTS = ["full", "fullInverse", "mark", "markInverse", "favicon", "appleTouchIcon"] as const;
export type BrandAssetSlot = (typeof BRAND_ASSET_SLOTS)[number];

export function isBrandAssetSlot(v: unknown): v is BrandAssetSlot {
    return typeof v === "string" && (BRAND_ASSET_SLOTS as readonly string[]).includes(v);
}

/** BrandSettings column holding each slot's MinIO object key. */
export const BRAND_ASSET_COLUMNS = {
    full: "logoFullKey",
    fullInverse: "logoFullInverseKey",
    mark: "logoMarkKey",
    markInverse: "logoMarkInverseKey",
    favicon: "faviconKey",
    appleTouchIcon: "appleTouchIconKey",
} as const satisfies Record<BrandAssetSlot, keyof BrandSettingsValues>;

/** Files in /public used when a slot has no upload. */
export const BRAND_ASSET_DEFAULTS: Record<BrandAssetSlot, string> = {
    full: "/brand/logo.png",
    fullInverse: "/brand/logo-inverse.png",
    mark: "/brand/mark.png",
    markInverse: "/brand/mark-inverse.png",
    favicon: "/brand/favicon.png",
    appleTouchIcon: "/brand/apple-touch-icon.png",
};

export const BRAND_ASSET_LABELS: Record<BrandAssetSlot, string> = {
    full: "Logo complet (fond clair)",
    fullInverse: "Logo complet (fond foncé)",
    mark: "Symbole (fond clair)",
    markInverse: "Symbole (fond foncé)",
    favicon: "Favicon",
    appleTouchIcon: "Icône iOS",
};

// ── Stored settings ─────────────────────────────────────────────────────────

/**
 * The BrandSettings row as plain JSON values (no Date), i.e. what the DB
 * stores and what the settings / provisioning APIs read and write.
 */
export type BrandSettingsValues = {
    name: string;
    productName: string;
    tagline: string;
    description: string;
    companyName: string;
    companyShortName: string;
    appUrl: string;
    website: string;
    senderName: string;
    notificationsAddress: string;
    supportAddress: string;
    emailDomains: string[];
    lang: string;
    locale: string;
    currency: string;
    timeZone: string;
    primaryColor: string;
    accentColor: string;
    neutralTint: number;
    fontPreset: string;
    logoFullKey: string | null;
    logoFullInverseKey: string | null;
    logoMarkKey: string | null;
    logoMarkInverseKey: string | null;
    faviconKey: string | null;
    appleTouchIconKey: string | null;
    logoFullWidth: number;
    logoFullHeight: number;
    logoVersion: string | null;
    /** ISO string. */
    updatedAt: string | null;
    updatedBy: string | null;
};

/** Fields an API caller may change (asset keys and audit fields are server-owned). */
export const BRAND_EDITABLE_FIELDS = [
    "name",
    "productName",
    "tagline",
    "description",
    "companyName",
    "companyShortName",
    "appUrl",
    "website",
    "senderName",
    "notificationsAddress",
    "supportAddress",
    "emailDomains",
    "lang",
    "locale",
    "currency",
    "timeZone",
    "primaryColor",
    "accentColor",
    "neutralTint",
    "fontPreset",
] as const;

export type BrandEditableField = (typeof BRAND_EDITABLE_FIELDS)[number];
export type BrandSettingsInput = Partial<Pick<BrandSettingsValues, BrandEditableField>>;

// ── Resolved brand ──────────────────────────────────────────────────────────

export type BrandLogos = {
    full: string;
    fullInverse: string;
    mark: string;
    markInverse: string;
    favicon: string;
    appleTouchIcon: string;
    /** Intrinsic size of `full` (keeps next/image from shifting layout). */
    fullWidth: number;
    fullHeight: number;
};

/**
 * Everything the UI, emails and PDFs need, fully resolved. Plain JSON, so the
 * root layout can hand it to client components through <BrandProvider>.
 */
export type Brand = {
    name: string;
    productName: string;
    tagline: string;
    description: string;
    companyName: string;
    companyShortName: string;
    web: { appUrl: string; website: string };
    email: {
        senderName: string;
        notificationsAddress: string;
        supportAddress: string;
        domains: readonly string[];
    };
    locale: { lang: string; locale: string; currency: string; timeZone: string };
    logos: BrandLogos;
    palette: BrandPalette;
    fontPreset: FontPresetId;
    /** Public app URL, no trailing slash. */
    appUrl: string;
    /** Host of the app URL, for display ("app.captainprospect.fr"). */
    appHost: string;
    /** Changes whenever the settings change (cache-buster for icons). */
    version: string;
};
