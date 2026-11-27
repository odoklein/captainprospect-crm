// ============================================
// SALLE DE PILOTAGE — the one dictionary, applied to counts.
//
//   Appel     an action on the CALL channel
//   Joint     isReached(code, category): any family but « noreach »
//   Refus     family « negative » through the reporting category REFUS
//             (built-in codes when a status has no category)
//   Positif   family « positive »: RDV, intéressé, projet à suivre
//   RDV pris  MEETING_BOOKED, whatever its SAS state
//   Taux de RDV = RDV pris ÷ joints (never ÷ every action)
//
// The category is ActionStatusDefinition.resultCategoryCode (GLOBAL scope),
// read the way /api/manager/missions/pulse reads it.
// ============================================

import { isReached, statusFamily } from "@/lib/workspace/status-family";

/** Codes that are a refusal when no reporting category says otherwise. */
export const REFUSAL_CODES: ReadonlySet<string> = new Set(["NOT_INTERESTED", "REFUS", "REFUS_ARGU", "REFUS_CATEGORIQUE"]);

/**
 * The reporting categories statusFamily() reads (its BY_CATEGORY table). A
 * status filed under any other code (« OTHER », « DISQUALIFIED »…) is decided
 * by its own code instead, the same fallback statusFamily() applies.
 */
const REPORTING_CATEGORIES: ReadonlySet<string> = new Set([
    "RDV_PRIS", "INTERESSE", "PROJET_A_SUIVRE", "RAPPEL", "EMAIL", "REFUS", "DISQUALIFIE", "ANNULATION", "PAS_DE_REPONSE", "BARRAGE", "LINKEDIN",
]);

export function isRefusal(code: string, category?: string | null): boolean {
    if (statusFamily(code, category) !== "negative") return false;
    return category && REPORTING_CATEGORIES.has(category) ? category === "REFUS" : REFUSAL_CODES.has(code);
}

export function isPositive(code: string, category?: string | null): boolean {
    return statusFamily(code, category) === "positive";
}

export const isMeeting = (code: string) => code === "MEETING_BOOKED";

/** Outcome counts of a set of calls. */
export interface Tally {
    calls: number;
    reached: number;
    positive: number;
    meetings: number;
    refusals: number;
}

export const emptyTally = (): Tally => ({ calls: 0, reached: 0, positive: 0, meetings: 0, refusals: 0 });

/** Adds `count` calls with this result to `into` (mutates, returns it). */
export function addCalls(into: Tally, code: string, category: string | null | undefined, count: number): Tally {
    into.calls += count;
    if (isReached(code, category)) into.reached += count;
    if (isPositive(code, category)) into.positive += count;
    if (isMeeting(code)) into.meetings += count;
    if (isRefusal(code, category)) into.refusals += count;
    return into;
}

export function sumTallies(list: Iterable<Tally>): Tally {
    const out = emptyTally();
    for (const t of list) {
        out.calls += t.calls;
        out.reached += t.reached;
        out.positive += t.positive;
        out.meetings += t.meetings;
        out.refusals += t.refusals;
    }
    return out;
}

/** part ÷ whole, null on an empty whole. */
export const ratio = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null);
