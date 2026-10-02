// Result families for the manager home's "Résultats des appels" donut.
//
// /api/stats returns a count per raw result code (~30 codes across missions); the
// old donut only knew six of them and printed the rest as raw codes. These are the
// same six categories, with every code folded into its family — the buckets of the
// client portal's daily report (lib/client/daily-report.ts, server-only), so a
// manager and a client read the same split.

export type OutcomeKey = "meeting" | "interested" | "callback" | "refusal" | "noReach" | "dataIssue" | "other";

const OUTCOME_OF: Record<string, OutcomeKey> = {
    MEETING_BOOKED: "meeting",
    INTERESTED: "interested",
    PROJET_A_SUIVRE: "interested",
    CALLBACK_REQUESTED: "callback",
    RAPPEL: "callback",
    RELANCE: "callback",
    NO_RESPONSE: "noReach",
    BARRAGE_STANDARD: "noReach",
    BARRAGE_SECRETAIRE: "noReach",
    NOT_INTERESTED: "refusal",
    REFUS: "refusal",
    REFUS_ARGU: "refusal",
    REFUS_CATEGORIQUE: "refusal",
    DISQUALIFIED: "refusal",
    HORS_CIBLE: "refusal",
    GERE_PAR_SIEGE: "refusal",
    BAD_CONTACT: "dataIssue",
    NUMERO_KO: "dataIssue",
    FAUX_NUMERO: "dataIssue",
    MAUVAIS_INTERLOCUTEUR: "dataIssue",
    INVALIDE: "dataIssue",
    DOUBLON: "dataIssue",
};

/** Fixed display order (best outcome first). Colours follow the family, never the rank. */
export const OUTCOME_ORDER: OutcomeKey[] = ["meeting", "interested", "callback", "refusal", "noReach", "dataIssue", "other"];

export const OUTCOME_META: Record<OutcomeKey, { label: string; color: string }> = {
    // Validated with the dataviz palette script in this order (adjacent CVD ≥ 8).
    // The two slates are deliberately recessive: "not reached" is context, not signal.
    meeting: { label: "RDV obtenu", color: "#10B981" },
    interested: { label: "Intéressé", color: "#6366F1" },
    callback: { label: "Rappel prévu", color: "#F59E0B" },
    refusal: { label: "Refus / hors cible", color: "#F43F5E" },
    noReach: { label: "Pas de réponse / barrage", color: "#CBD5E1" },
    dataIssue: { label: "Mauvais numéro / contact", color: "#64748B" },
    other: { label: "Autres (emails, suivis)", color: "#38BDF8" },
};

export function outcomeOf(result: string): OutcomeKey {
    return OUTCOME_OF[result] ?? "other";
}

// A type alias (not an interface) so it satisfies Recharts' index-signature data type.
export type OutcomeSlice = {
    key: OutcomeKey;
    label: string;
    color: string;
    count: number;
    /** Share of all results, 0–100, rounded. */
    pct: number;
};

/** Folds a per-result count map into ordered families; empty families are dropped. */
export function groupOutcomes(byResult: Record<string, number>): { slices: OutcomeSlice[]; total: number } {
    const sums = new Map<OutcomeKey, number>();
    let total = 0;
    for (const [result, n] of Object.entries(byResult)) {
        if (!n) continue;
        const key = outcomeOf(result);
        sums.set(key, (sums.get(key) ?? 0) + n);
        total += n;
    }
    const slices = OUTCOME_ORDER.filter((k) => (sums.get(k) ?? 0) > 0).map((key) => {
        const count = sums.get(key) ?? 0;
        return { key, ...OUTCOME_META[key], count, pct: total > 0 ? Math.round((count / total) * 100) : 0 };
    });
    return { slices, total };
}
