/**
 * "Retour journée SDR" — the structured end-of-day report.
 *
 * What is stored in the database is the stable CODE of each answer; the French
 * label lives here only, so rewording a choice never orphans historical rows.
 * This file is imported by the SDR form, the API validation and the manager
 * views, so it must stay free of server-only imports.
 */

// ============================================
// 1. Joignabilité aujourd'hui (plusieurs réponses)
// ============================================

export const REACHABILITY_VALUES = [
    "NRP",
    "VOICEMAIL",
    "SWITCHBOARD",
    "LANDLINES",
    "GOOD",
] as const;
export type Reachability = (typeof REACHABILITY_VALUES)[number];

export const REACHABILITY_LABELS: Record<Reachability, string> = {
    NRP: "Beaucoup de NRP / non-décrochés",
    VOICEMAIL: "Beaucoup de répondeurs",
    SWITCHBOARD: "Beaucoup de standards / attente",
    LANDLINES: "Peu de lignes directes / beaucoup de fixes",
    GOOD: "Bonne joignabilité globale",
};

/** "Bonne joignabilité" contradicts every difficulty, so it can't be combined. */
export const REACHABILITY_EXCLUSIVE: Reachability = "GOOD";

// ============================================
// 2. Retours prospects les plus fréquents (plusieurs réponses)
// ============================================

export const PROSPECT_RETURN_VALUES = [
    "NO_NEED",
    "ALREADY_EQUIPPED",
    "NOT_INTERESTED",
    "CALL_BACK_LATER",
    "INFO_BY_EMAIL",
    "GOOD_INTEREST",
] as const;
export type ProspectReturn = (typeof PROSPECT_RETURN_VALUES)[number];

export const PROSPECT_RETURN_LABELS: Record<ProspectReturn, string> = {
    NO_NEED: "Pas de besoin actuellement",
    ALREADY_EQUIPPED: "Déjà équipé / déjà un prestataire",
    NOT_INTERESTED: "Pas intéressé",
    CALL_BACK_LATER: "À rappeler plus tard",
    INFO_BY_EMAIL: "Demande d’informations par mail",
    GOOD_INTEREST: "Bon intérêt / échanges intéressants",
};

// ============================================
// 3. Ressenti sur le discours (plusieurs réponses)
// ============================================

export const PITCH_FEELING_VALUES = [
    "PITCH_WORKS",
    "OFFER_UNDERSTOOD",
    "HOOK_HARD",
    "OFFER_HARD_TO_EXPLAIN",
    "OBJECTIONS_HARD",
    "PITCH_TO_ADJUST",
] as const;
export type PitchFeeling = (typeof PITCH_FEELING_VALUES)[number];

export const PITCH_FEELING_LABELS: Record<PitchFeeling, string> = {
    PITCH_WORKS: "Le pitch fonctionne bien",
    OFFER_UNDERSTOOD: "L’offre est bien comprise",
    HOOK_HARD: "Accroche difficile",
    OFFER_HARD_TO_EXPLAIN: "Offre difficile à expliquer",
    OBJECTIONS_HARD: "Objections difficiles à traiter",
    PITCH_TO_ADJUST: "Pitch à ajuster",
};

// ============================================
// 4. Principal frein de la journée (une seule réponse)
// ============================================

export const MAIN_BLOCKER_VALUES = [
    "REACHABILITY",
    "DATA_QUALITY",
    "TARGETING",
    "NO_NEED",
    "PITCH_OFFER",
    "NONE",
] as const;
export type MainBlocker = (typeof MAIN_BLOCKER_VALUES)[number];

export const MAIN_BLOCKER_LABELS: Record<MainBlocker, string> = {
    REACHABILITY: "Joignabilité",
    DATA_QUALITY: "Base / qualité des numéros",
    TARGETING: "Ciblage",
    NO_NEED: "Manque de besoin",
    PITCH_OFFER: "Pitch / offre",
    NONE: "Aucun frein particulier",
};

// ============================================
// Form layout (single source for the SDR form)
// ============================================

export type DailyReportQuestionKey =
    | "reachability"
    | "prospectReturns"
    | "pitchFeeling"
    | "mainBlocker";

export interface DailyReportQuestion {
    key: DailyReportQuestionKey;
    title: string;
    hint: string;
    mode: "multi" | "single";
    options: ReadonlyArray<{ value: string; label: string }>;
}

function toOptions<V extends string>(values: readonly V[], labels: Record<V, string>) {
    return values.map((value) => ({ value, label: labels[value] }));
}

export const DAILY_REPORT_QUESTIONS: ReadonlyArray<DailyReportQuestion> = [
    {
        key: "reachability",
        title: "Joignabilité aujourd’hui",
        hint: "Plusieurs réponses possibles",
        mode: "multi",
        options: toOptions(REACHABILITY_VALUES, REACHABILITY_LABELS),
    },
    {
        key: "prospectReturns",
        title: "Retours prospects les plus fréquents",
        hint: "Plusieurs réponses possibles",
        mode: "multi",
        options: toOptions(PROSPECT_RETURN_VALUES, PROSPECT_RETURN_LABELS),
    },
    {
        key: "pitchFeeling",
        title: "Ressenti sur le discours",
        hint: "Plusieurs réponses possibles",
        mode: "multi",
        options: toOptions(PITCH_FEELING_VALUES, PITCH_FEELING_LABELS),
    },
    {
        key: "mainBlocker",
        title: "Principal frein de la journée",
        hint: "Une seule réponse",
        mode: "single",
        options: toOptions(MAIN_BLOCKER_VALUES, MAIN_BLOCKER_LABELS),
    },
];

export const FIELD_COMMENT_MAX_LENGTH = 500;

/** Answers that are good news — the manager views tint them green. */
export const POSITIVE_CODES: ReadonlySet<string> = new Set<string>([
    "GOOD",
    "GOOD_INTEREST",
    "PITCH_WORKS",
    "OFFER_UNDERSTOOD",
    "NONE",
]);

// ============================================
// Label lookups tolerant of codes retired later
// ============================================

export function labelOf<V extends string>(
    labels: Record<V, string>,
    value: string,
): string {
    return (labels as Record<string, string>)[value] ?? value;
}
