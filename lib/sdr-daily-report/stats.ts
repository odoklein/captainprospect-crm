import { REACHABILITY_EXCLUSIVE } from "./options";

interface ReportAnswers {
    mainBlocker?: string | null;
    reachability?: string[] | null;
}

/** Most frequent "principal frein" among the reports, ignoring "no particular blocker". */
export function topBlocker(items: ReportAnswers[]): { code: string; count: number } | null {
    const counts = new Map<string, number>();
    for (const { mainBlocker } of items) {
        if (!mainBlocker || mainBlocker === "NONE") continue;
        counts.set(mainBlocker, (counts.get(mainBlocker) ?? 0) + 1);
    }
    let best: { code: string; count: number } | null = null;
    for (const [code, count] of counts) {
        if (!best || count > best.count) best = { code, count };
    }
    return best;
}

/**
 * Share (0-100) of structured reports that flag at least one reachability
 * difficulty. Reports without a reachability answer (legacy) don't count.
 */
export function difficultReachabilityShare(items: ReportAnswers[]): number | null {
    const answered = items.filter((item) => item.reachability?.length);
    if (answered.length === 0) return null;
    const difficult = answered.filter((item) =>
        item.reachability!.some((code) => code !== REACHABILITY_EXCLUSIVE),
    );
    return Math.round((difficult.length / answered.length) * 100);
}
