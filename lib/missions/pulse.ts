// « Pouls de la mission »: the three questions a manager asks of a running
// mission, answered from raw counts.
//   1. Are we on pace for the target?            → pace()
//   2. Where do prospects drop out?              → funnelSteps() + weakestStep()
//   3. What should I do right now?               → nextAction()
// Pure on purpose: the API ships counts, the page and the tests read the same rules.

export const DAY_MS = 86_400_000;

// ── Funnel ────────────────────────────────────────────────────────────────

/** Distinct prospects (contact, or company when called directly) at each stage. */
export interface FunnelCounts {
    /** Contacts sitting in the mission's active lists. */
    prospects: number;
    /** Reached at least once by an action. */
    called: number;
    /** Spoken to: any refusal, follow-up or meeting (lib/api-v1/glossary REACHED_CATEGORIES). */
    reached: number;
    /** Left a door open: a follow-up or a meeting. */
    interested: number;
    /** Booked a meeting. */
    meetings: number;
}

/** Agency-wide step rates over the same stages (other missions, last 90 days). Null when the sample is too small. */
export interface FunnelBenchmark {
    reach: number | null;
    interest: number | null;
    meeting: number | null;
}

export type StageKey = keyof FunnelCounts;

export interface FunnelStep {
    key: StageKey;
    label: string;
    count: number;
    /** Name of the rate that leads into this stage (« joignabilité »…). */
    rateLabel: string | null;
    /** Share of the previous stage that made it here. Null for the first stage or an empty previous stage. */
    rate: number | null;
    benchmark: number | null;
    /** rate − benchmark, in points of ratio (−0.08 = 8 points below). */
    gap: number | null;
}

const STAGES: { key: StageKey; label: string; rateLabel: string | null; bench?: keyof FunnelBenchmark }[] = [
    { key: "prospects", label: "Dans les bases", rateLabel: null },
    { key: "called", label: "Appelés", rateLabel: "Couverture" },
    { key: "reached", label: "Joints", rateLabel: "Joignabilité", bench: "reach" },
    { key: "interested", label: "Intéressés", rateLabel: "Intérêt", bench: "interest" },
    { key: "meetings", label: "RDV", rateLabel: "Transformation", bench: "meeting" },
];

/** Below this many prospects at the previous stage, a rate is noise: no verdict on it. */
export const MIN_SAMPLE = 20;

export function funnelSteps(counts: FunnelCounts, benchmark: FunnelBenchmark): FunnelStep[] {
    return STAGES.map((stage, index) => {
        const previous = index ? counts[STAGES[index - 1].key] : 0;
        const rate = index && previous > 0 ? counts[stage.key] / previous : null;
        const bench = stage.bench ? benchmark[stage.bench] : null;
        return {
            key: stage.key,
            label: stage.label,
            count: counts[stage.key],
            rateLabel: stage.rateLabel,
            rate,
            benchmark: bench,
            gap: rate !== null && bench !== null && previous >= MIN_SAMPLE ? rate - bench : null,
        };
    });
}

/** The step furthest below the agency average, relative to that average (a 5-point gap on 10 % hurts more than on 60 %). */
export function weakestStep(steps: FunnelStep[]): FunnelStep | null {
    let worst: FunnelStep | null = null;
    let worstScore = -0.15; // under 15 % below average is normal variation
    for (const step of steps) {
        if (step.gap === null || !step.benchmark) continue;
        const score = step.gap / step.benchmark;
        if (score < worstScore) { worst = step; worstScore = score; }
    }
    return worst;
}

// ── Pace ──────────────────────────────────────────────────────────────────

export type PaceVerdict = "no_target" | "not_started" | "early" | "ahead" | "on_track" | "behind" | "reached" | "ended";

export interface Pace {
    verdict: PaceVerdict;
    /** Share of the period elapsed, 0–1. */
    elapsed: number;
    /** Share of the target achieved, 0–1+ (null without target). */
    achieved: number | null;
    /** Meetings expected by today at a steady pace. */
    expected: number | null;
    /** meetings − expected, rounded. Negative: behind. */
    gap: number | null;
    /** Linear projection at the end of the period. */
    projected: number | null;
    /** Meetings per week needed from now on to reach the target. */
    neededPerWeek: number | null;
    dayIndex: number;
    totalDays: number;
    daysLeft: number;
}

export function pace(input: { target: number | null | undefined; meetings: number; startDate?: string | null; endDate?: string | null; now?: number }): Pace {
    const now = input.now ?? Date.now();
    const start = input.startDate ? Date.parse(input.startDate) : NaN;
    const end = input.endDate ? Date.parse(input.endDate) : NaN;
    const valid = Number.isFinite(start) && Number.isFinite(end) && end > start;
    const totalDays = valid ? Math.max(1, Math.round((end - start) / DAY_MS)) : 0;
    const dayIndex = valid ? Math.min(totalDays, Math.max(0, Math.floor((now - start) / DAY_MS) + 1)) : 0;
    const elapsed = valid ? Math.min(1, Math.max(0, (now - start) / (end - start))) : 0;
    const daysLeft = valid ? Math.max(0, Math.ceil((end - now) / DAY_MS)) : 0;
    const target = input.target && input.target > 0 ? input.target : null;
    const base = { elapsed, dayIndex, totalDays, daysLeft };

    if (!target) return { ...base, verdict: "no_target", achieved: null, expected: null, gap: null, projected: null, neededPerWeek: null };
    const achieved = input.meetings / target;
    const remaining = Math.max(0, target - input.meetings);
    const neededPerWeek = remaining && daysLeft ? (remaining / daysLeft) * 7 : remaining ? null : 0;
    if (!valid || now < start) return { ...base, verdict: "not_started", achieved, expected: 0, gap: null, projected: null, neededPerWeek };
    const expected = target * elapsed;
    const gap = Math.round(input.meetings - expected);
    const projected = elapsed >= 0.1 ? Math.round(input.meetings / elapsed) : null;
    const result = { ...base, achieved, expected, gap, projected, neededPerWeek };

    if (input.meetings >= target) return { ...result, verdict: "reached" };
    if (now >= end) return { ...result, verdict: "ended" };
    if (expected < 1 && elapsed < 0.15) return { ...result, verdict: "early" };
    const ratio = input.meetings / expected;
    if (ratio >= 1.15) return { ...result, verdict: "ahead" };
    // Within 15 % of the expected count: projecting to at least ~85 % of the target.
    if (ratio >= 0.85) return { ...result, verdict: "on_track" };
    return { ...result, verdict: "behind" };
}

const PACE_COPY: Record<PaceVerdict, string> = {
    no_target: "Sans objectif chiffré",
    not_started: "Pas encore commencée",
    early: "Trop tôt pour juger",
    ahead: "En avance",
    on_track: "Dans le rythme",
    behind: "En retard",
    reached: "Objectif atteint",
    ended: "Période terminée",
};
export const paceLabel = (verdict: PaceVerdict) => PACE_COPY[verdict];

// ── Next action ───────────────────────────────────────────────────────────

export type NextActionKind = "assign" | "lists" | "launch" | "resume" | "target" | "extend" | "funnel" | "none";

export interface NextAction {
    tone: "danger" | "warning" | "neutral" | "success";
    title: string;
    detail: string;
    kind: NextActionKind;
    /** Button text; absent when nothing needs doing. */
    action?: string;
}

const dateFr = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });

/** « 1er décembre », not « 1 décembre ». */
export function dayMonth(day: string | Date) {
    return dateFr.format(new Date(day)).replace(/^1 /, "1er ");
}

function plural(count: number, one: string, many: string) {
    return `${count} ${count > 1 ? many : one}`;
}

/** One thing to do, chosen by what costs the most if left alone. Shown once on the page, nowhere else. */
export function nextAction(input: {
    status: string;
    sdrCount: number;
    activeLists: number;
    readyLists: number;
    pace: Pace;
    endDate?: string | null;
    weakest?: FunnelStep | null;
}): NextAction {
    const { status, pace: p } = input;
    const running = status === "ACTIVE";
    if (running && !input.sdrCount) return { tone: "danger", kind: "assign", title: "Personne n’appelle sur cette mission", detail: "Elle est active mais aucun SDR n’y est affecté : les bases restent sans appels.", action: "Affecter un SDR" };
    if (running && !input.activeLists) return { tone: "danger", kind: "lists", title: "La file d’appels est vide", detail: "Aucune base active : les SDR n’ont personne à appeler.", action: "Ajouter une base" };
    if (running && input.readyLists < input.activeLists) {
        const missing = input.activeLists - input.readyLists;
        return { tone: "warning", kind: "launch", title: `${plural(missing, "base appelée", "bases appelées")} sans script complet`, detail: "Les SDR appellent sans ciblage, pitch ou script à jour sur ces bases.", action: "Compléter" };
    }
    if (status === "PAUSED") return { tone: "neutral", kind: "resume", title: "Mission en pause", detail: "Aucun appel n’est planifié tant qu’elle reste en pause.", action: "Reprendre" };
    if (p.verdict === "ended") return { tone: "warning", kind: "extend", title: "La période est terminée", detail: "La mission est toujours active : prolongez-la ou clôturez-la.", action: "Prolonger" };
    if (p.verdict === "no_target") return { tone: "neutral", kind: "target", title: "Fixez un objectif chiffré", detail: "Avec un nombre de RDV visés, la page indique si la mission tient le rythme.", action: "Définir l’objectif" };
    if (p.verdict === "behind" && p.gap !== null) {
        const perWeek = p.neededPerWeek !== null ? ` Il faut ${formatRate(p.neededPerWeek)} RDV par semaine jusqu’au ${input.endDate ? dayMonth(input.endDate) : "terme"}.` : "";
        return {
            tone: "warning",
            kind: "funnel",
            title: `En retard de ${plural(Math.abs(p.gap), "RDV", "RDV")} sur le rythme prévu`,
            detail: `${input.weakest ? `Le maillon faible : ${input.weakest.rateLabel?.toLowerCase()}.` : ""}${perWeek}`.trim(),
            action: input.weakest ? "Voir le maillon faible" : undefined,
        };
    }
    if (running && p.daysLeft > 0 && p.daysLeft <= 14 && p.verdict !== "reached") return { tone: "neutral", kind: "extend", title: `Se termine dans ${plural(p.daysLeft, "jour", "jours")}`, detail: "Décidez maintenant : prolonger, ou préparer le bilan.", action: "Prolonger" };
    if (input.weakest) return { tone: "neutral", kind: "funnel", title: `${input.weakest.rateLabel} sous la moyenne de l’agence`, detail: "Le rythme tient, mais ce passage perd plus de prospects que d’habitude.", action: "Voir le détail" };
    return { tone: "success", kind: "none", title: p.verdict === "reached" ? "Objectif atteint" : "Rien à corriger", detail: p.verdict === "reached" ? "Chaque RDV de plus est du bonus." : "La mission tient son rythme et sa configuration est complète." };
}

export function formatRate(value: number) {
    return value >= 10 ? String(Math.round(value)) : value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

export function formatPercent(value: number | null) {
    if (value === null) return "—";
    const pct = value * 100;
    return `${pct < 10 && pct > 0 ? pct.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : Math.round(pct)} %`;
}
