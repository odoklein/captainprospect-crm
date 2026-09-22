import type { ExclusionScope, ExclusionSource, ExclusionTarget } from "@prisma/client";

export const EXCLUSION_TARGET_LABELS: Record<ExclusionTarget, string> = {
    COMPANY: "Toute la société",
    CONTACT: "Ce contact",
};

export const EXCLUSION_SCOPE_LABELS: Record<ExclusionScope, string> = {
    GLOBAL: "Toutes les missions",
    CLIENT: "Ce client",
    MISSION: "Cette mission",
};

/** Shown under the scope selector in the drawer, so an SDR picks knowingly. */
export const EXCLUSION_SCOPE_HINTS: Record<ExclusionScope, string> = {
    GLOBAL: "Plus jamais contacté, pour aucun client. Réservé aux demandes légales / RGPD.",
    CLIENT: "Retiré de toutes les missions de ce client, y compris les listes à venir.",
    MISSION: "Retiré de cette mission uniquement.",
};

export const EXCLUSION_SOURCE_LABELS: Record<ExclusionSource, string> = {
    SDR_ACTION: "Statut SDR",
    MANAGER: "Manager",
    CLIENT_PORTAL: "Demande client",
    IMPORT: "Import",
};

/** Durations offered in the UI. null = permanent. */
export const EXCLUSION_DURATIONS: Array<{ value: string; label: string; days: number | null }> = [
    { value: "permanent", label: "Définitif", days: null },
    { value: "3m", label: "3 mois", days: 90 },
    { value: "6m", label: "6 mois", days: 180 },
    { value: "12m", label: "12 mois", days: 365 },
];

export function resolveExpiry(durationValue: string, from: Date = new Date()): Date | null {
    const duration = EXCLUSION_DURATIONS.find((d) => d.value === durationValue);
    if (!duration?.days) return null;

    const expiry = new Date(from);
    expiry.setDate(expiry.getDate() + duration.days);
    return expiry;
}

/**
 * Reasons offered as one-click chips. Free text stays available — the reason is
 * what a manager reads six months later when deciding whether to lift the rule,
 * so it is required either way.
 */
export const EXCLUSION_REASON_PRESETS: string[] = [
    "Demande du client : ne plus contacter",
    "Refus catégorique de la société",
    "Interdiction d'appeler les lignes personnelles",
    "Hors cible",
    "Déjà client / géré par le siège",
    "Demande RGPD",
];

export const MAX_EXCLUSION_REASON_LENGTH = 500;
