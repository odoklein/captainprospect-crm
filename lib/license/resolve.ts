// ============================================
// INSTANCE LICENSE (pure) — what this instance is allowed to do.
//
// The Console pushes the license through PUT /api/instance/license; it is one
// row (InstanceLicense). Nothing here touches the database, so it runs on the
// edge, in tests and in the Console (copy as-is).
//
// Defaults are permissive on purpose: no row, a missing table or a bad value
// means "active, unlimited, every feature on". That is today's Captain Prospect
// deployment, which must keep working untouched.
// ============================================

export const LICENSE_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
export type LicenseStatus = (typeof LICENSE_STATUSES)[number];

/**
 * Features a pack can switch off. A key missing from the license means enabled.
 *   callVault    call-vault transcripts and recordings (also needs VAULT_API_*), lib/call-vault-client
 *   aiAssistant  the manager assistant, /api/manager/assistant/* (middleware, lib/license/gates)
 *   whiteLabel   editing the brand, writes to /api/manager/brand (middleware, lib/license/gates)
 *   agent        Captain Agent (background worker, /api/manager/agent/*, worker/agent.ts)
 */
export const LICENSE_FEATURES = ["callVault", "aiAssistant", "whiteLabel", "agent"] as const;
export type LicenseFeature = (typeof LICENSE_FEATURES)[number];

export type LicenseValues = {
    status: LicenseStatus;
    plan: string | null;
    /** Staff seats (active, non-CLIENT users). null = unlimited. */
    seatLimit: number | null;
    features: Record<LicenseFeature, boolean>;
    aiMonthlyQuota: number | null;
    suspendedReason: string | null;
    updatedAt: string | null;
};

export const DEFAULT_LICENSE: LicenseValues = {
    status: "ACTIVE",
    plan: null,
    seatLimit: null,
    features: { callVault: true, aiAssistant: true, whiteLabel: true, agent: true },
    aiMonthlyQuota: null,
    suspendedReason: null,
    updatedAt: null,
};

/**
 * Roles that do not use a seat: the agency's own customers on the client portal (CLIENT) and
 * their salespeople with a portal account (COMMERCIAL, /commercial/portal). Seats are the
 * agency's staff, as the packs sell them (Odo, 2026-10-29).
 */
export const SEAT_FREE_ROLES = ["CLIENT", "COMMERCIAL"] as const;

function asStatus(v: unknown): LicenseStatus {
    return v === "SUSPENDED" ? "SUSPENDED" : "ACTIVE";
}

function asLimit(v: unknown): number | null {
    return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
}

function asText(v: unknown, max: number): string | null {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t ? t.slice(0, max) : null;
}

/** Stored row (any shape, possibly null) → complete, valid values. Never throws. */
export function mergeLicense(row: Record<string, unknown> | null | undefined): LicenseValues {
    if (!row) return { ...DEFAULT_LICENSE, features: { ...DEFAULT_LICENSE.features } };
    const stored = row.features && typeof row.features === "object" && !Array.isArray(row.features) ? (row.features as Record<string, unknown>) : {};
    const features = { ...DEFAULT_LICENSE.features };
    for (const key of LICENSE_FEATURES) {
        if (typeof stored[key] === "boolean") features[key] = stored[key] as boolean;
    }
    const updatedAt = row.updatedAt instanceof Date ? row.updatedAt.toISOString() : typeof row.updatedAt === "string" ? row.updatedAt : null;
    return {
        status: asStatus(row.status),
        plan: asText(row.plan, 60),
        seatLimit: asLimit(row.seatLimit),
        features,
        aiMonthlyQuota: asLimit(row.aiMonthlyQuota),
        suspendedReason: asText(row.suspendedReason, 300),
        updatedAt,
    };
}

export function isSuspended(license: LicenseValues): boolean {
    return license.status === "SUSPENDED";
}

export function isFeatureEnabled(license: LicenseValues, feature: LicenseFeature): boolean {
    return license.features[feature] !== false;
}

export type SeatCheck =
    | { ok: true; used: number; limit: number | null }
    | { ok: false; used: number; limit: number; message: string };

/** Can `adding` more staff seats be taken given `used` active ones? */
export function checkSeats(license: LicenseValues, used: number, adding = 1): SeatCheck {
    const limit = license.seatLimit;
    if (limit == null || adding <= 0) return { ok: true, used, limit };
    if (used + adding <= limit) return { ok: true, used, limit };
    return {
        ok: false,
        used,
        limit,
        message: `Limite de ${limit} utilisateur${limit > 1 ? "s" : ""} atteinte pour votre offre (${used} actif${used > 1 ? "s" : ""}). Désactivez un compte ou contactez-nous pour augmenter la limite.`,
    };
}

export function usesSeat(role: string): boolean {
    return !(SEAT_FREE_ROLES as readonly string[]).includes(role);
}

// ---------- input (PUT /api/instance/license) ----------

export type LicenseInput = Partial<{
    status: LicenseStatus;
    plan: string | null;
    seatLimit: number | null;
    features: Partial<Record<LicenseFeature, boolean>>;
    aiMonthlyQuota: number | null;
    suspendedReason: string | null;
}>;

export type LicenseValidation = { ok: true; value: LicenseInput } | { ok: false; errors: Record<string, string> };

/** Validate a partial update. Unknown keys are rejected so a typo cannot silently do nothing. */
export function validateLicenseInput(input: unknown): LicenseValidation {
    if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, errors: { _: "Un objet JSON est attendu" } };
    const src = input as Record<string, unknown>;
    const errors: Record<string, string> = {};
    const value: LicenseInput = {};
    const known = new Set(["status", "plan", "seatLimit", "features", "aiMonthlyQuota", "suspendedReason"]);
    for (const key of Object.keys(src)) if (!known.has(key)) errors[key] = "Champ inconnu";

    if ("status" in src) {
        if (src.status === "ACTIVE" || src.status === "SUSPENDED") value.status = src.status;
        else errors.status = "ACTIVE ou SUSPENDED";
    }
    for (const key of ["seatLimit", "aiMonthlyQuota"] as const) {
        if (!(key in src)) continue;
        const v = src[key];
        if (v === null || (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1_000_000)) value[key] = v as number | null;
        else errors[key] = "Entier positif ou null (illimité)";
    }
    for (const key of ["plan", "suspendedReason"] as const) {
        if (!(key in src)) continue;
        const v = src[key];
        if (v === null) value[key] = null;
        else if (typeof v === "string" && v.length <= 300) value[key] = v.trim() || null;
        else errors[key] = "Texte (300 caractères max) ou null";
    }
    if ("features" in src) {
        const f = src.features;
        if (!f || typeof f !== "object" || Array.isArray(f)) errors.features = "Un objet { fonctionnalité: booléen } est attendu";
        else {
            const out: Partial<Record<LicenseFeature, boolean>> = {};
            for (const [k, v] of Object.entries(f as Record<string, unknown>)) {
                if (!(LICENSE_FEATURES as readonly string[]).includes(k)) errors[`features.${k}`] = "Fonctionnalité inconnue";
                else if (typeof v !== "boolean") errors[`features.${k}`] = "Booléen attendu";
                else out[k as LicenseFeature] = v;
            }
            value.features = out;
        }
    }
    return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}
