// ============================================
// BRAND WRITES — validate and persist BrandSettings. Server-only (Prisma).
//
// Shared by the manager "Identité" panel (/api/manager/brand) and the signed
// provisioning API (/api/instance/brand). Every write ends with
// invalidateBrand(), so the next request renders the new brand. Audit is the
// caller's job (it knows the actor): use diffBrandSettings() for before/after.
// ============================================

import { prisma } from "@/lib/prisma";
import { parseHex, toHex } from "./color";
import { defaultBrandSettings, isHexColor, mergeBrandSettings } from "./resolve";
import { BRAND_ROW_ID, invalidateBrand } from "./server";
import {
    BRAND_EDITABLE_FIELDS,
    isFontPreset,
    type BrandEditableField,
    type BrandSettingsInput,
    type BrandSettingsValues,
} from "./types";

// ── Validation ──────────────────────────────────────────────────────────────

const MAX_LENGTH: Partial<Record<BrandEditableField, number>> = {
    name: 80,
    productName: 120,
    tagline: 160,
    description: 300,
    companyName: 160,
    companyShortName: 40,
    senderName: 80,
};

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;
const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function httpUrl(v: string): string | null {
    try {
        const u = new URL(v);
        if (u.protocol !== "http:" && u.protocol !== "https:") return null;
        return v.replace(/\/+$/, "");
    } catch {
        return null;
    }
}

function validTimeZone(tz: string): boolean {
    try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
        return true;
    } catch {
        return false;
    }
}

function canonicalLocale(v: string): string | null {
    try {
        const [c] = Intl.getCanonicalLocales(v);
        return c ?? null;
    } catch {
        return null;
    }
}

function validCurrency(v: string): boolean {
    if (!/^[A-Z]{3}$/.test(v)) return false;
    try {
        new Intl.NumberFormat("en", { style: "currency", currency: v });
        return true;
    } catch {
        return false;
    }
}

/**
 * Checks a partial update. Only BRAND_EDITABLE_FIELDS are accepted (asset keys
 * and audit fields are server-owned); unknown keys are an error. Values come
 * back normalised: trimmed strings, upper-case #RRGGBB, URLs without the
 * trailing slash, lower-case domains, canonical locale.
 */
export function validateBrandInput(
    raw: unknown,
): { ok: true; value: BrandSettingsInput } | { ok: false; errors: Record<string, string> } {
    if (!isPlainObject(raw)) return { ok: false, errors: { _: "Corps JSON attendu (objet)" } };

    const errors: Record<string, string> = {};
    const value: Record<string, unknown> = {};
    const editable = new Set<string>(BRAND_EDITABLE_FIELDS);

    for (const key of Object.keys(raw)) {
        if (!editable.has(key)) errors[key] = "Champ inconnu ou non modifiable";
    }

    for (const field of BRAND_EDITABLE_FIELDS) {
        if (!(field in raw) || raw[field] === undefined) continue;
        const v = raw[field];

        switch (field) {
            case "emailDomains": {
                if (!Array.isArray(v)) {
                    errors[field] = "Liste de domaines attendue";
                    break;
                }
                const domains = Array.from(
                    new Set(v.map((d) => (typeof d === "string" ? d.trim().toLowerCase().replace(/^@/, "") : "")).filter(Boolean)),
                );
                if (domains.length === 0) errors[field] = "Au moins un domaine";
                else if (domains.length > 10) errors[field] = "10 domaines maximum";
                else if (domains.some((d) => !HOSTNAME_RE.test(d))) errors[field] = "Domaine invalide (ex. agence.fr)";
                else value[field] = domains;
                break;
            }
            case "neutralTint": {
                if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) errors[field] = "Nombre entre 0 et 1";
                else value[field] = v;
                break;
            }
            default: {
                if (typeof v !== "string") {
                    errors[field] = "Texte attendu";
                    break;
                }
                const s = v.trim();
                if (!s) {
                    errors[field] = "Obligatoire";
                    break;
                }
                const max = MAX_LENGTH[field];
                if (max && s.length > max) {
                    errors[field] = `${max} caractères maximum`;
                    break;
                }
                switch (field) {
                    case "primaryColor":
                    case "accentColor":
                        if (!isHexColor(s)) errors[field] = "Couleur hexadécimale attendue (#RRGGBB)";
                        else value[field] = toHex(parseHex(s));
                        break;
                    case "fontPreset":
                        if (!isFontPreset(s)) errors[field] = "Police inconnue";
                        else value[field] = s;
                        break;
                    case "appUrl":
                    case "website": {
                        const url = httpUrl(s);
                        if (!url) errors[field] = "URL http(s) attendue";
                        else value[field] = url;
                        break;
                    }
                    case "notificationsAddress":
                    case "supportAddress":
                        if (s.length > 254 || !EMAIL_RE.test(s)) errors[field] = "Adresse email invalide";
                        else value[field] = s;
                        break;
                    case "lang":
                        if (!/^[a-z]{2,3}$/i.test(s)) errors[field] = "Code langue ISO (ex. fr, en)";
                        else value[field] = s.toLowerCase();
                        break;
                    case "locale": {
                        const c = canonicalLocale(s);
                        if (!c) errors[field] = "Locale invalide (ex. fr-FR)";
                        else value[field] = c;
                        break;
                    }
                    case "currency": {
                        const c = s.toUpperCase();
                        if (!validCurrency(c)) errors[field] = "Code devise ISO à 3 lettres (ex. EUR)";
                        else value[field] = c;
                        break;
                    }
                    case "timeZone":
                        if (!validTimeZone(s)) errors[field] = "Fuseau horaire IANA invalide (ex. Europe/Paris)";
                        else value[field] = s;
                        break;
                    default:
                        if (/[\u0000-\u001f<>]/.test(s)) errors[field] = "Caractères interdits (< > ou retour à la ligne)";
                        else value[field] = s;
                }
            }
        }
    }

    if (Object.keys(errors).length) return { ok: false, errors };
    return { ok: true, value: value as BrandSettingsInput };
}

// ── Persistence ─────────────────────────────────────────────────────────────

/** Prisma "table does not exist": the BrandSettings migration has not run on this database. */
export function isBrandTableMissing(err: unknown): boolean {
    const code = (err as { code?: string } | null)?.code;
    return code === "P2021" || /BrandSettings.*does not exist/i.test(String((err as Error)?.message ?? ""));
}

export const BRAND_TABLE_MISSING_MESSAGE =
    "La table BrandSettings n'existe pas encore : appliquez la migration 20261025120000_add_brand_settings.";

/** Fresh read of the stored settings merged over the defaults (no cache). Throws on DB errors. */
export async function readBrandSettings(): Promise<BrandSettingsValues> {
    const row = await prisma.brandSettings.findUnique({ where: { id: BRAND_ROW_ID } });
    if (!row) return mergeBrandSettings(null);
    return mergeBrandSettings({ ...row, updatedAt: row.updatedAt.toISOString() });
}

/** Cache-buster for logo URLs (base36 timestamp). */
export function newBrandVersion(): string {
    return Date.now().toString(36);
}

/** Upsert raw columns on the single row, then drop the cached brand. */
export async function writeBrandColumns(data: Record<string, unknown>, updatedBy: string): Promise<void> {
    await prisma.brandSettings.upsert({
        where: { id: BRAND_ROW_ID },
        create: { id: BRAND_ROW_ID, ...data, updatedBy },
        update: { ...data, updatedBy },
    });
    invalidateBrand();
}

export async function updateBrandSettings(
    input: BrandSettingsInput,
    updatedBy: string,
): Promise<{ before: BrandSettingsValues; after: BrandSettingsValues }> {
    const before = await readBrandSettings();
    const data: Record<string, unknown> = {};
    for (const field of BRAND_EDITABLE_FIELDS) {
        if (input[field] !== undefined) data[field] = input[field];
    }
    await writeBrandColumns(data, updatedBy);
    return { before, after: await readBrandSettings() };
}

/**
 * Every editable field back to brand/brand.config.ts, logo slots cleared (the
 * /public defaults show again). MinIO objects are kept: a reset is undoable by
 * re-uploading, and nothing references the old keys any more.
 */
export async function resetBrandSettings(
    updatedBy: string,
): Promise<{ before: BrandSettingsValues; after: BrandSettingsValues }> {
    const before = await readBrandSettings();
    const d = defaultBrandSettings();
    const data: Record<string, unknown> = {};
    for (const field of BRAND_EDITABLE_FIELDS) data[field] = d[field];
    Object.assign(data, {
        logoFullKey: null,
        logoFullInverseKey: null,
        logoMarkKey: null,
        logoMarkInverseKey: null,
        faviconKey: null,
        appleTouchIconKey: null,
        logoFullWidth: d.logoFullWidth,
        logoFullHeight: d.logoFullHeight,
        logoVersion: newBrandVersion(),
    });
    await writeBrandColumns(data, updatedBy);
    return { before, after: await readBrandSettings() };
}

/** Only the fields that changed, for the audit log. updatedAt/updatedBy/logoVersion are ignored. */
export function diffBrandSettings(
    before: BrandSettingsValues,
    after: BrandSettingsValues,
): { changed: string[]; before: Record<string, unknown>; after: Record<string, unknown> } {
    const skip = new Set(["updatedAt", "updatedBy", "logoVersion"]);
    const out = { changed: [] as string[], before: {} as Record<string, unknown>, after: {} as Record<string, unknown> };
    for (const key of Object.keys(after) as (keyof BrandSettingsValues)[]) {
        if (skip.has(key)) continue;
        if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
        out.changed.push(key);
        out.before[key] = before[key];
        out.after[key] = after[key];
    }
    return out;
}
