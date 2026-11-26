// ============================================
// LIST STOCK — what is left to call in a prospect list, and for how long at
// the current pace. Pure: the list library (/manager/lists) and its detail
// pane read the same numbers.
//
// The health bar splits a list's contacts in three:
//   treated     reached at least once (ListHealthService's contactedContacts)
//   reachable   not treated yet, with a phone or an email (« joignables »)
//   dead        not treated and no way to reach them
// ============================================

export interface ListStockInput {
    /** Contacts in the list. */
    contacts: number;
    /** Contacts with a usable phone or email (completeness ACTIONABLE). */
    actionable: number;
    /** Contacts already worked (from the list's health). */
    treated: number;
    /** Actions logged on the list over the last 7 days. */
    actions7d: number;
}

export interface ListStock {
    treated: number;
    reachable: number;
    dead: number;
    /** Share of contacts treated, 0–100, or null for an empty list. */
    treatedPct: number | null;
    /** Days before the reachable contacts run out at the last 7 days' pace; null when nobody calls. */
    daysLeft: number | null;
}

export function listStock({ contacts, actionable, treated, actions7d }: ListStockInput): ListStock {
    const total = Math.max(0, contacts);
    const done = Math.min(total, Math.max(0, treated));
    // A treated contact was reachable: what is left to call is the actionable ones not treated yet.
    const reachable = Math.max(0, Math.min(total - done, Math.max(0, actionable) - done));
    const dead = Math.max(0, total - done - reachable);
    const perDay = actions7d / 7;
    return {
        treated: done,
        reachable,
        dead,
        treatedPct: total > 0 ? Math.round((done / total) * 100) : null,
        daysLeft: reachable === 0 ? 0 : perDay > 0 ? Math.ceil(reachable / perDay) : null,
    };
}

/** « ≈ 4 j », « ≈ 3 sem », « épuisée », « — » (nobody calls it). */
export function stockLabel(daysLeft: number | null): string {
    if (daysLeft === null) return "—";
    if (daysLeft === 0) return "Épuisée";
    if (daysLeft < 14) return `≈ ${daysLeft} j`;
    if (daysLeft < 70) return `≈ ${Math.round(daysLeft / 7)} sem`;
    return "> 2 mois";
}

/** Sum of the lists' stocks, for the page's numbers. */
export function totalStock(stocks: ListStock[]): { reachable: number; treated: number; contacts: number } {
    return stocks.reduce(
        (acc, s) => ({ reachable: acc.reachable + s.reachable, treated: acc.treated + s.treated, contacts: acc.contacts + s.treated + s.reachable + s.dead }),
        { reachable: 0, treated: 0, contacts: 0 },
    );
}
