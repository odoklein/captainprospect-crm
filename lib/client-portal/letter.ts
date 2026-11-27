// ============================================
// « La lettre de la semaine »: the client portal home (/client/portal), built
// for someone who logs in once a week. Impact, not activity.
//
// Two clocks, on purpose:
//   - a confirmed RDV is live: it is final the moment the manager confirms it;
//   - every other aggregate stops at the last Monday 06:00 (Paris) and says so,
//     so the numbers hold still between two visits.
//
// One dictionary: a RDV counts for the client only once confirmed at the SAS
// and not cancelled since (lib/meetings/clientVisibility); a call outcome is
// read through its status family (lib/workspace/status-family), with the
// category its status definition points at.
//
// Pure: the server half (letter.server.ts) loads rows, these rules count them,
// and the tests read the same rules.
// ============================================

import { DateTime } from "luxon";
import { isClientCountableMeeting } from "@/lib/meetings/clientVisibility";
import { isNoShowReportWindowOpen } from "@/lib/meetings/noShowWindow";
import { pace, type Pace } from "@/lib/missions/pulse";
import { isReached, statusFamily } from "@/lib/workspace/status-family";

export const LETTER_TZ = "Europe/Paris";
/** The weekly snapshot is taken on Monday at this hour, Paris time. */
export const SNAPSHOT_HOUR = 6;
/** The weekly chart never draws more bars than this (the most recent weeks). */
export const MAX_WEEKS = 16;

const paris = (at: Date) => DateTime.fromJSDate(at, { zone: LETTER_TZ }).setLocale("fr");

// ── Clock ─────────────────────────────────────────────────────────────────

/** The last Monday 06:00 (Paris) at or before `now`: where every non-live aggregate stops. */
export function snapshotCutoff(now: Date): Date {
    const local = paris(now);
    let monday = local.startOf("week").set({ hour: SNAPSHOT_HOUR });
    if (monday > local) monday = monday.minus({ weeks: 1 });
    return monday.toJSDate();
}

/** Monday 00:00 (Paris) of the week holding `at`. */
export function weekStartOf(at: Date): Date {
    return paris(at).startOf("week").toJSDate();
}

export interface LetterWeek {
    /** ISO week number. */
    number: number;
    /** Monday 00:00, Paris. */
    start: Date;
    /** The next Monday 00:00 (exclusive). */
    end: Date;
}

/** The week the letter is about: the full Monday–Sunday week that ended before the snapshot. */
export function letterWeek(cutoff: Date): LetterWeek {
    const end = paris(cutoff).startOf("week");
    const start = end.minus({ weeks: 1 });
    return { number: start.weekNumber, start: start.toJSDate(), end: end.toJSDate() };
}

/** The calendar month (Paris) holding `now`: [start, end). */
export function monthOf(now: Date): { start: Date; end: Date; label: string } {
    const start = paris(now).startOf("month");
    return { start: start.toJSDate(), end: start.plus({ months: 1 }).toJSDate(), label: start.toFormat("LLLL") };
}

// ── RDV ───────────────────────────────────────────────────────────────────

export interface MeetingFeedbackFacts {
    outcome: string;
    createdAt: Date;
    standByAt: Date | null;
    outOfScopeAt: Date | null;
}

/** A MEETING_BOOKED / MEETING_CANCELLED action, as the letter needs it. */
export interface LetterMeeting {
    id: string;
    /** Contact, or company when the RDV was booked on the company. */
    prospect: string | null;
    result: string;
    confirmationStatus: string;
    confirmedAt: Date | null;
    confirmationUpdatedAt: Date | null;
    createdAt: Date;
    /** Scheduled date of the RDV. */
    callbackDate: Date | null;
    feedback: MeetingFeedbackFacts | null;
}

/** Live rule, the only one: booked, confirmed at the SAS, not cancelled since. */
export function isConfirmedNow(m: LetterMeeting): boolean {
    return isClientCountableMeeting(m);
}

/** When the RDV became final for the client: its confirmation, or its booking for old rows confirmed without a timestamp. */
export function confirmedOn(m: LetterMeeting): Date | null {
    if (m.confirmedAt) return m.confirmedAt;
    if (m.confirmationStatus === "CONFIRMED") return m.confirmationUpdatedAt ?? m.createdAt;
    return null;
}

/**
 * The live rule as it stood at `cutoff`: confirmed before it, and either still
 * confirmed or changed only after it (a RDV cancelled on Wednesday still counted
 * in Monday's snapshot, and leaves it next Monday).
 */
export function wasConfirmedAt(m: LetterMeeting, cutoff: Date): boolean {
    if (m.result !== "MEETING_BOOKED" && m.result !== "MEETING_CANCELLED") return false;
    const on = confirmedOn(m);
    if (!on || on >= cutoff || m.createdAt >= cutoff) return false;
    if (isConfirmedNow(m)) return true;
    return !!m.confirmationUpdatedAt && m.confirmationUpdatedAt >= cutoff;
}

/** The feedback as it stood at the cutoff (one given later did not exist yet). */
function feedbackAt(m: LetterMeeting, cutoff: Date): MeetingFeedbackFacts | null {
    return m.feedback && m.feedback.createdAt < cutoff ? m.feedback : null;
}

/**
 * « RDV tenu », as of the cutoff, by the rule billing already applies
 * (lib/meetings/feedbackReminder, lib/meetings/noShowWindow): a confirmed RDV
 * whose feedback says it took place (any outcome but NO_SHOW), or whose date is
 * past and whose 48 h window to report a no-show closed without one. An absence
 * is never held, whether it was set aside (stand-by, hors scope) or not.
 */
export function isHeld(m: LetterMeeting, cutoff: Date): boolean {
    if (!wasConfirmedAt(m, cutoff)) return false;
    const f = feedbackAt(m, cutoff);
    if (f) return f.outcome !== "NO_SHOW";
    return !!m.callbackDate && m.callbackDate < cutoff && !isNoShowReportWindowOpen(m.callbackDate, cutoff.getTime());
}

/** Past at the cutoff, no feedback, and the no-show window still open: counted once it closes. */
export function isHeldPending(m: LetterMeeting, cutoff: Date): boolean {
    return wasConfirmedAt(m, cutoff) && !feedbackAt(m, cutoff) && !!m.callbackDate && m.callbackDate < cutoff
        && isNoShowReportWindowOpen(m.callbackDate, cutoff.getTime());
}

// ── Prospects: funnel, current status, refusal reasons ────────────────────

/** How a status code reads on one mission: its configured label and reporting category. */
export interface StatusMeaning {
    label: string | null;
    category: string | null;
}
export type StatusDictionary = (missionId: string, code: string) => StatusMeaning;

/** One prospect × one result code on one mission, before the cutoff (latest occurrence). */
export interface ProspectTouch {
    missionId: string;
    prospect: string;
    code: string;
    lastAt: Date;
}

export type Disposition = "rdv" | "interested" | "callback" | "refusal" | "offTarget" | "notReached";

export const DISPOSITIONS: { key: Disposition; label: string; definition: string }[] = [
    { key: "rdv", label: "RDV confirmé", definition: "Au moins un rendez-vous confirmé par votre manager de mission." },
    { key: "interested", label: "Intéressé, à suivre", definition: "Dernier échange positif (intérêt, projet à suivre, RDV en cours de validation)." },
    { key: "callback", label: "Rappel prévu", definition: "Le décideur a demandé à être rappelé ou à recevoir un email." },
    { key: "refusal", label: "Refus", definition: "Le décideur a été joint et a décliné." },
    { key: "offTarget", label: "Hors cible", definition: "Joint, mais pas le bon interlocuteur ou hors de votre cible." },
    { key: "notReached", label: "Pas encore joint", definition: "Appelé, sans encore avoir eu le décideur en ligne (pas de réponse, barrage, numéro invalide)." },
];

/** Negative outcomes that say « wrong target » rather than « no ». */
const OFF_TARGET_CODES = new Set(["DISQUALIFIED", "BAD_CONTACT", "HORS_CIBLE", "MAUVAIS_INTERLOCUTEUR", "INVALIDE", "DOUBLON"]);
/** The negative reporting categories status-family knows; any other category leaves the decision to the code, as statusFamily() does. */
const NEGATIVE_BY_CATEGORY: Record<string, "refusal" | "offTarget"> = { REFUS: "refusal", ANNULATION: "refusal", DISQUALIFIE: "offTarget" };

/** Where one reached outcome puts a prospect (never « rdv »: that comes from a confirmed RDV only). */
export function dispositionOf(code: string, category: string | null): Exclude<Disposition, "rdv"> {
    if (!isReached(code, category)) return "notReached";
    const family = statusFamily(code, category);
    if (family === "positive") return "interested";
    if (family === "pending") return "callback";
    const byCategory = category ? NEGATIVE_BY_CATEGORY[category] : undefined;
    return byCategory ?? (OFF_TARGET_CODES.has(code) ? "offTarget" : "refusal");
}

export interface LetterFunnel {
    /** Contacts in the mission's active lists. */
    base: number;
    /** Prospects with at least one action. */
    called: number;
    /** Spoken to at least once (isReached). */
    reached: number;
    /** A positive outcome at least once, or a confirmed RDV. */
    interested: number;
    /** At least one confirmed RDV. */
    confirmed: number;
    /** At least one held RDV. */
    held: number;
}

export interface RefusalReason {
    label: string;
    count: number;
    share: number;
}

export interface ProspectSnapshot {
    funnel: LetterFunnel;
    dispositions: Record<Disposition, number>;
    refusals: { total: number; reasons: RefusalReason[] };
}

/** Beyond this many refusal reasons, the rest are folded into « Autres motifs ». */
export const MAX_REASONS = 5;

/**
 * Counts every contacted prospect once: the funnel (ever reached, ever
 * interested…) and their current status: a confirmed RDV first, else what
 * their latest reached outcome says, else « pas encore joint ». A prospect
 * reached once never goes back to « pas encore joint » after a later unanswered call.
 */
export function prospectSnapshot(input: {
    base: number;
    touches: ProspectTouch[];
    meetings: LetterMeeting[];
    cutoff: Date;
    dictionary: StatusDictionary;
}): ProspectSnapshot {
    const { touches, meetings, cutoff, dictionary } = input;
    const confirmed = new Set<string>();
    const held = new Set<string>();
    for (const m of meetings) {
        if (!m.prospect) continue;
        if (wasConfirmedAt(m, cutoff)) confirmed.add(m.prospect);
        if (isHeld(m, cutoff)) held.add(m.prospect);
    }

    const called = new Set<string>();
    const reached = new Set<string>();
    const interested = new Set<string>(confirmed);
    const latestReached = new Map<string, { at: Date; code: string; meaning: StatusMeaning }>();
    for (const t of touches) {
        if (t.lastAt >= cutoff) continue;
        called.add(t.prospect);
        const meaning = dictionary(t.missionId, t.code);
        if (!isReached(t.code, meaning.category)) continue;
        reached.add(t.prospect);
        if (statusFamily(t.code, meaning.category) === "positive") interested.add(t.prospect);
        const prev = latestReached.get(t.prospect);
        if (!prev || t.lastAt > prev.at) latestReached.set(t.prospect, { at: t.lastAt, code: t.code, meaning });
    }
    // A confirmed RDV is a conversation, whatever its status definition says.
    for (const p of confirmed) { called.add(p); reached.add(p); }

    const dispositions: Record<Disposition, number> = { rdv: 0, interested: 0, callback: 0, refusal: 0, offTarget: 0, notReached: 0 };
    const reasons = new Map<string, number>();
    for (const p of called) {
        if (confirmed.has(p)) { dispositions.rdv++; continue; }
        const last = latestReached.get(p);
        const d = last ? dispositionOf(last.code, last.meaning.category) : "notReached";
        dispositions[d]++;
        if (d === "refusal" && last) {
            const label = last.meaning.label || last.code;
            reasons.set(label, (reasons.get(label) ?? 0) + 1);
        }
    }

    return {
        funnel: {
            base: input.base,
            called: called.size,
            reached: reached.size,
            interested: interested.size,
            confirmed: confirmed.size,
            held: held.size,
        },
        dispositions,
        refusals: { total: dispositions.refusal, reasons: foldReasons(reasons, dispositions.refusal) },
    };
}

function foldReasons(counts: Map<string, number>, total: number): RefusalReason[] {
    if (!total) return [];
    const sorted = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"));
    const head = sorted.length > MAX_REASONS ? sorted.slice(0, MAX_REASONS - 1) : sorted;
    const rest = sorted.slice(head.length).reduce((sum, [, n]) => sum + n, 0);
    const rows = head.map(([label, count]) => ({ label, count, share: count / total }));
    if (rest) rows.push({ label: "Autres motifs", count: rest, share: rest / total });
    return rows;
}

export interface FunnelStep {
    key: keyof LetterFunnel;
    label: string;
    count: number;
    /** Share of the previous step; null for the first one or an empty previous step. */
    rate: number | null;
    definition: string;
}

const FUNNEL_STEPS: { key: keyof LetterFunnel; label: string; definition: string }[] = [
    { key: "base", label: "Dans votre cible", definition: "Décideurs présents dans les bases actives de la mission." },
    { key: "called", label: "Appelés", definition: "Décideurs appelés au moins une fois." },
    { key: "reached", label: "Joints", definition: "Décideurs eus en ligne au moins une fois : tout résultat sauf pas de réponse, barrage ou numéro invalide." },
    { key: "interested", label: "Intéressés", definition: "Décideurs qui ont montré de l’intérêt au moins une fois, ou ont un RDV confirmé." },
    { key: "confirmed", label: "RDV confirmés", definition: "Décideurs avec au moins un RDV confirmé par votre manager de mission." },
    { key: "held", label: "RDV tenus", definition: "Décideurs dont le RDV a eu lieu : un retour le dit, ou le délai de 48 h pour signaler une absence est passé sans signalement (même règle que la facturation)." },
];

export function funnelSteps(f: LetterFunnel): FunnelStep[] {
    return FUNNEL_STEPS.map((step, i) => {
        const previous = i ? f[FUNNEL_STEPS[i - 1].key] : 0;
        return { ...step, count: f[step.key], rate: i && previous > 0 ? f[step.key] / previous : null };
    });
}

// ── Weeks ─────────────────────────────────────────────────────────────────

export interface WeekBar {
    /** Monday 00:00, Paris, ISO. */
    start: string;
    count: number;
    current: boolean;
}

/** Confirmed RDV per Paris week, from the week of `from` to the current week (the most recent MAX_WEEKS). */
export function weeklyConfirmed(confirmedDates: Date[], from: Date, now: Date, maxWeeks = MAX_WEEKS): WeekBar[] {
    const current = paris(weekStartOf(now));
    let first = paris(weekStartOf(from < now ? from : now));
    const floor = current.minus({ weeks: maxWeeks - 1 });
    if (first < floor) first = floor;
    const bars: WeekBar[] = [];
    const index = new Map<number, WeekBar>();
    for (let w = first; w <= current; w = w.plus({ weeks: 1 })) {
        const bar = { start: w.toISO() as string, count: 0, current: +w === +current };
        bars.push(bar);
        index.set(+w, bar);
    }
    for (const d of confirmedDates) {
        const bar = index.get(+paris(weekStartOf(d)));
        if (bar) bar.count++;
    }
    return bars;
}

// ── Monthly target and pace ───────────────────────────────────────────────

export interface MissionPeriod {
    startDate: Date;
    endDate: Date;
    targetMeetings: number | null;
}

/**
 * The month's share of the missions' targets: each target is spread evenly over
 * its mission period, so a 3-month mission aiming at 72 RDV asks for 24 in a
 * full month inside it. Null when no mission has a target.
 */
export function monthTarget(missions: MissionPeriod[], month: { start: Date; end: Date }): number | null {
    let total = 0;
    let any = false;
    for (const m of missions) {
        if (!m.targetMeetings || m.targetMeetings <= 0) continue;
        const span = m.endDate.getTime() - m.startDate.getTime();
        if (span <= 0) continue;
        const overlap = Math.min(m.endDate.getTime(), month.end.getTime()) - Math.max(m.startDate.getTime(), month.start.getTime());
        if (overlap <= 0) continue;
        any = true;
        total += (m.targetMeetings * overlap) / span;
    }
    return any ? Math.max(1, Math.round(total)) : null;
}

/** pace() over the part of the month the missions run, against the month's share of their targets. */
export function monthPace(missions: MissionPeriod[], meetings: number, now: Date): { target: number | null; pace: Pace } {
    const month = monthOf(now);
    const target = monthTarget(missions, month);
    const starts = missions.map((m) => m.startDate.getTime());
    const ends = missions.map((m) => m.endDate.getTime());
    const from = Math.max(month.start.getTime(), starts.length ? Math.min(...starts) : month.start.getTime());
    const to = Math.min(month.end.getTime(), ends.length ? Math.max(...ends) : month.end.getTime());
    return {
        target,
        pace: pace({ target, meetings, startDate: new Date(from).toISOString(), endDate: new Date(to).toISOString(), now: now.getTime() }),
    };
}

// ── ROI ───────────────────────────────────────────────────────────────────

export interface Assumptions {
    /** Euros HT. */
    avgDealValue: number | null;
    /** 0–1. */
    meetingToOppRate: number | null;
}

/** What the client was invoiced (HT, credit notes deducted) and the months those invoices cover. */
export interface InvoicedCost {
    amountHt: number;
    from: Date;
    /** Exclusive. */
    to: Date;
}

const BOUND_SLACK_MS = 6 * 3_600_000;

export interface InvoiceFacts {
    documentType: string;
    status: string;
    totalHt: number;
    issueDate: Date;
    validatedAt: Date | null;
    cancelledAt: Date | null;
    periodStart: Date | null;
    periodEnd: Date | null;
}

/**
 * What the client was invoiced for the months since `since`, as known at the
 * cutoff: invoices validated (or sent, paid) before it, credit notes
 * deducted, drafts ignored, an invoice cancelled after the cutoff still
 * counted until the next snapshot. An invoice covers its period, or its issue
 * month when it has none. Null when nothing was invoiced: the cost is unknown.
 */
export function invoicedCost(invoices: InvoiceFacts[], opts: { since: Date; cutoff: Date }): InvoicedCost | null {
    let amount = 0;
    let from: Date | null = null;
    let to: Date | null = null;
    for (const inv of invoices) {
        if (inv.status === "DRAFT") continue;
        if (inv.status === "CANCELLED" && !(inv.cancelledAt && inv.cancelledAt >= opts.cutoff)) continue;
        if ((inv.validatedAt ?? inv.issueDate) >= opts.cutoff) continue;
        // Periods are month bounds computed in the server's timezone (date-fns startOfMonth /
        // endOfMonth): nudged by a few hours so a UTC-computed bound lands in its own Paris month.
        const start = paris(new Date((inv.periodStart ?? inv.issueDate).getTime() + BOUND_SLACK_MS)).startOf("month").toJSDate();
        const end = paris(new Date((inv.periodEnd ?? inv.issueDate).getTime() - (inv.periodEnd ? BOUND_SLACK_MS : 0))).startOf("month").plus({ months: 1 }).toJSDate();
        if (end <= opts.since) continue;
        if (inv.documentType === "CREDIT_NOTE") { amount -= Math.abs(inv.totalHt); continue; }
        amount += inv.totalHt;
        if (!from || start < from) from = start;
        if (!to || end > to) to = end;
    }
    if (!from || !to || amount <= 0) return null;
    return { amountHt: Math.round(amount * 100) / 100, from, to };
}

export function hasAssumptions(a: Assumptions): boolean {
    return a.avgDealValue !== null && a.avgDealValue > 0 && a.meetingToOppRate !== null && a.meetingToOppRate > 0;
}

/** Held RDV × opportunity rate × average deal value. Null until both assumptions are set. */
export function pipelineOf(held: number, a: Assumptions): number | null {
    if (!hasAssumptions(a)) return null;
    return Math.round(held * (a.meetingToOppRate as number) * (a.avgDealValue as number));
}

export interface Roi {
    /** Held RDV since the start, as of the snapshot. */
    held: number;
    /** Pipeline of every held RDV. Null without assumptions. */
    pipeline: number | null;
    /** Null when nothing was invoiced yet. */
    invested: InvoicedCost | null;
    /** Held RDV whose date falls in the invoiced months: what the multiple compares with the invoices. */
    heldInvoiced: number;
    pipelineInvoiced: number | null;
    /** pipelineInvoiced ÷ invested; null when either is missing. */
    multiple: number | null;
    /** Invoiced ÷ RDV confirmed in the invoiced months. */
    costPerRdv: number | null;
    confirmedInvoiced: number;
}

/**
 * Compares like with like: the invoices cover some months, so the multiple
 * only counts the held RDV of those months. RDV held after the last invoiced
 * month are in `pipeline`, not in the multiple.
 */
export function roi(input: {
    meetings: LetterMeeting[];
    cutoff: Date;
    assumptions: Assumptions;
    invested: InvoicedCost | null;
}): Roi {
    const { meetings, cutoff, assumptions, invested } = input;
    const inCover = (d: Date | null) => !!invested && !!d && d >= invested.from && d < invested.to;
    let held = 0;
    let heldInvoiced = 0;
    let confirmedInvoiced = 0;
    for (const m of meetings) {
        if (isHeld(m, cutoff)) {
            held++;
            if (inCover(m.callbackDate ?? m.createdAt)) heldInvoiced++;
        }
        if (wasConfirmedAt(m, cutoff) && inCover(confirmedOn(m))) confirmedInvoiced++;
    }
    const pipeline = pipelineOf(held, assumptions);
    const pipelineInvoiced = invested ? pipelineOf(heldInvoiced, assumptions) : null;
    const paid = invested && invested.amountHt > 0 ? invested.amountHt : null;
    return {
        held,
        pipeline,
        invested,
        heldInvoiced,
        pipelineInvoiced,
        multiple: paid && pipelineInvoiced !== null ? pipelineInvoiced / paid : null,
        costPerRdv: paid && confirmedInvoiced ? paid / confirmedInvoiced : null,
        confirmedInvoiced,
    };
}

// ── Payload of GET /api/client/letter ─────────────────────────────────────

export interface LetterUpcomingMeeting {
    id: string;
    /** ISO; null when the date is still to be set. */
    date: string | null;
    person: string;
    title: string | null;
    company: string;
    /** « Visio », « Sur site », « Téléphone »; null when not set. */
    format: string | null;
    hasFiche: boolean;
    missionName: string;
}

export interface ClientLetter {
    /** False when the client has no running, portal-visible mission. */
    hasMission: boolean;
    generatedAt: string;
    cutoff: string;
    cutoffLabel: string;
    week: { number: number; start: string; end: string; rangeLabel: string; confirmed: number };
    headline: { title: string; detail: string | null };
    missions: { id: string; name: string; status: string }[];
    sdrCount: number;
    since: string | null;
    sinceLabel: string | null;
    month: {
        label: string;
        confirmed: number;
        target: number | null;
        pace: Pace;
    };
    funnel: FunnelStep[];
    dispositions: { key: Disposition; label: string; definition: string; count: number }[];
    refusals: { total: number; reasons: RefusalReason[] };
    weeks: WeekBar[];
    roi: Omit<Roi, "invested"> & {
        /** Invoiced HT; null when nothing was invoiced. */
        invested: number | null;
        /** « octobre à novembre »: the months the invoices cover. */
        investedLabel: string | null;
        /** Held RDV outside the invoiced months: in the pipeline, not in the multiple. */
        heldOutsideInvoices: number;
    };
    assumptions: Assumptions & { updatedAt: string | null; onboardingDealValue: string | null };
    upcoming: LetterUpcomingMeeting[];
    upcomingTotal: number;
    /** Past RDV still inside their 48 h no-show window at the cutoff: not counted as held yet. */
    heldPending: number;
}

// ── Words ─────────────────────────────────────────────────────────────────

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

/**
 * The letter's headline, from the week's confirmed RDV and the weeks before it.
 * Only comparisons the numbers support: « best week » needs at least three
 * finished weeks behind it.
 */
export function letterHeadline(input: { count: number; previous: number | null; earlier: number[] }): { title: string; detail: string | null } {
    const { count, previous, earlier } = input;
    const title = count
        ? `${count} ${plural(count, "rendez-vous confirmé", "rendez-vous confirmés")} cette semaine.`
        : "Aucun rendez-vous confirmé cette semaine.";
    let detail: string | null = null;
    if (count > 0 && earlier.length >= 3 && earlier.every((n) => n < count)) detail = "Votre meilleure semaine depuis le lancement.";
    else if (previous !== null) {
        const diff = count - previous;
        if (diff > 0) detail = `${diff} de plus que la semaine précédente (${previous}).`;
        else if (diff < 0) detail = `${-diff} de moins que la semaine précédente (${previous}).`;
        else if (count > 0) detail = "Autant que la semaine précédente.";
    }
    return { title, detail };
}

/** « du 16 au 22 novembre », « du 30 novembre au 6 décembre ». */
export function weekRangeLabel(week: { start: Date; end: Date }): string {
    const a = paris(week.start);
    const b = paris(week.end).minus({ days: 1 });
    const day = (d: DateTime) => (d.day === 1 ? "1er" : String(d.day));
    if (a.month === b.month) return `du ${day(a)} au ${day(b)} ${b.toFormat("LLLL")}`;
    return `du ${day(a)} ${a.toFormat("LLLL")} au ${day(b)} ${b.toFormat("LLLL")}`;
}

/** « octobre à novembre », « novembre » for the months [from, to). */
export function monthsLabel(from: Date, to: Date): string {
    const a = paris(from);
    const b = paris(to).minus({ days: 1 });
    const name = (d: DateTime) => d.toFormat(d.year === a.year && d.year === b.year ? "LLLL" : "LLLL yyyy");
    return a.hasSame(b, "month") ? name(a) : `${name(a)} à ${name(b)}`;
}

/** « lundi 23 novembre, 06:00 ». */
export function cutoffLabel(cutoff: Date): string {
    return paris(cutoff).toFormat("cccc d LLLL, HH:mm").replace(/ 1 /, " 1er ");
}

/** « 5 oct. » style short date, Paris. */
export function shortDate(at: Date): string {
    return paris(at).toFormat("d LLL").replace(/^1 /, "1er ");
}

/** « 273 600 € », with non-breaking spaces so an amount never wraps. */
export const formatEuros = (n: number) =>
    `${Math.round(n).toLocaleString("fr-FR").replace(/ /g, " ")} €`;

/** « ×14,3 », « ×0,8 ». */
export const formatMultiple = (n: number) => `×${n.toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: n < 10 ? 1 : 0 })}`;
