/**
 * Server-only builder for the client portal's "Rapport de la veille".
 *
 * Visibility follows the rest of the portal: portal-visible missions only, and
 * RDVs only once confirmed (SAS RDV). Days are the client's local days: the
 * browser sends its UTC offset and every bucket is computed with it (a fixed
 * offset — a DST switch inside the 7-day window shifts one boundary by an hour,
 * which is acceptable for a trend).
 */

import { prisma } from "@/lib/prisma";
import { portalVisibleMissionWhere } from "@/lib/portal-visibility";
import type {
    DailyHighlight,
    DailyInsight,
    DailyReport,
    DailyReportMeeting,
    DailyTotals,
    OutcomeKey,
} from "./daily-report-types";

const DAY_MS = 86_400_000;
const TREND_DAYS = 7;
const MAX_LOOKBACK_DAYS = 92;

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

const OUTCOME_LABELS: Record<OutcomeKey, string> = {
    meeting: "Rendez-vous",
    interested: "Intéressés",
    callback: "À rappeler",
    refusal: "Refus / hors cible",
    noReach: "Pas de réponse / barrage",
    dataIssue: "Coordonnées à corriger",
    other: "Autres (emails, suivis)",
};

const QUALIFIED_OUTCOMES = new Set<OutcomeKey>(["meeting", "interested", "callback"]);
const NOT_REACHED = new Set<OutcomeKey>(["noReach", "dataIssue"]);

// ─── Query parsing ────────────────────────────────────────────────────────────

export interface DailyReportQuery {
    day: string;
    today: string;
    /** Browser Date#getTimezoneOffset(): minutes to add to local time to get UTC. */
    tz: number;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDailyReportQuery(sp: URLSearchParams): DailyReportQuery | null {
    const day = sp.get("day") ?? "";
    const today = sp.get("today") ?? "";
    const tz = Number(sp.get("tz"));
    if (!DAY_RE.test(day) || !DAY_RE.test(today) || !Number.isInteger(tz) || Math.abs(tz) > 14 * 60) return null;
    const gap = (dayUtc(today) - dayUtc(day)) / DAY_MS;
    if (!Number.isFinite(gap) || gap < 1 || gap > MAX_LOOKBACK_DAYS) return null;
    return { day, today, tz };
}

// ─── Local-day helpers ────────────────────────────────────────────────────────

function dayUtc(day: string): number {
    const [y, m, d] = day.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
}
/** UTC instant of local midnight for `day`. */
function localStart(day: string, tz: number): Date {
    return new Date(dayUtc(day) + tz * 60_000);
}
function shiftDay(day: string, n: number): string {
    return new Date(dayUtc(day) + n * DAY_MS).toISOString().slice(0, 10);
}
function localDayOf(instant: Date, tz: number): string {
    return new Date(instant.getTime() - tz * 60_000).toISOString().slice(0, 10);
}
function isWeekend(day: string): boolean {
    const wd = new Date(dayUtc(day)).getUTCDay();
    return wd === 0 || wd === 6;
}
/** Last `n` working days ending on `day` (included even if it is a weekend). */
function workingDaysEndingOn(day: string, n: number): string[] {
    const out = [day];
    let cursor = day;
    while (out.length < n) {
        cursor = shiftDay(cursor, -1);
        if (!isWeekend(cursor)) out.unshift(cursor);
    }
    return out;
}
export function frenchDayLabel(day: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) {
    return new Date(dayUtc(day)).toLocaleDateString("fr-FR", { ...opts, timeZone: "UTC" });
}

function pct(part: number, whole: number): number | null {
    return whole > 0 ? Math.round((part / whole) * 100) : null;
}

// ─── Builder ──────────────────────────────────────────────────────────────────

interface Bucket {
    calls: number;
    conversations: number;
    meetings: number;
    qualified: Set<string>;
    prospects: Set<string>;
}
const emptyBucket = (): Bucket => ({ calls: 0, conversations: 0, meetings: 0, qualified: new Set(), prospects: new Set() });
const totalsOf = (b: Bucket): DailyTotals => ({
    calls: b.calls,
    conversations: b.conversations,
    meetings: b.meetings,
    qualified: b.qualified.size,
    prospects: b.prospects.size,
});

export async function buildDailyReport(clientId: string, q: DailyReportQuery): Promise<DailyReport> {
    const trendDays = workingDaysEndingOn(q.day, TREND_DAYS);
    const reportStart = localStart(q.day, q.tz);
    const reportEnd = localStart(shiftDay(q.day, 1), q.tz);
    const trendStart = localStart(trendDays[0], q.tz);
    const todayStart = localStart(q.today, q.tz);
    const todayEnd = localStart(shiftDay(q.today, 1), q.tz);
    const monthStartDay = `${q.day.slice(0, 7)}-01`;
    const monthStart = localStart(monthStartDay, q.tz);

    const missions = await prisma.mission.findMany({
        where: { clientId, AND: [portalVisibleMissionWhere()] },
        select: { id: true, name: true, isActive: true, objective: true },
    });
    const missionIds = missions.map((m) => m.id);
    const activeMissions = missions.filter((m) => m.isActive);

    // A numeric objective is a monthly RDV target; free-text objectives are ignored
    // rather than guessed (no invented target on the client's screen).
    const objectives = activeMissions
        .map((m) => parseInt(m.objective ?? "", 10))
        .filter((n) => Number.isFinite(n) && n > 0);
    const objective = objectives.length > 0 ? objectives.reduce((a, b) => a + b, 0) : null;

    const base: DailyReport = {
        day: q.day,
        previousDay: trendDays.length > 1 ? trendDays[trendDays.length - 2] : null,
        totals: { calls: 0, conversations: 0, qualified: 0, meetings: 0, prospects: 0 },
        previous: null,
        reachRate: null,
        sdrCount: 0,
        activeMissions: activeMissions.length,
        trend: trendDays.map((day) => ({ day, calls: 0, conversations: 0, qualified: 0, meetings: 0, prospects: 0 })),
        outcomes: [],
        month: { meetings: 0, objective, label: frenchDayLabel(q.day, { month: "long", year: "numeric" }) },
        meetingsBooked: [],
        todayMeetings: [],
        byCommercial: [],
        byMission: [],
        highlights: [],
    };
    if (missionIds.length === 0) return { ...base, highlights: buildHighlights(base) };

    const meetingSelect = {
        id: true,
        createdAt: true,
        callbackDate: true,
        meetingType: true,
        contact: { select: { firstName: true, lastName: true, title: true, company: { select: { name: true } } } },
        company: { select: { name: true } },
        campaign: { select: { mission: { select: { name: true } } } },
        interlocuteur: { select: { id: true, firstName: true, lastName: true } },
    } as const;
    const inMissions = { campaign: { missionId: { in: missionIds } } };
    const confirmedMeeting = { result: "MEETING_BOOKED" as const, confirmationStatus: "CONFIRMED" as const };

    const [actions, bookedRaw, todayRaw, monthMeetings] = await Promise.all([
        prisma.action.findMany({
            where: { ...inMissions, createdAt: { gte: trendStart, lt: reportEnd } },
            select: {
                createdAt: true,
                channel: true,
                result: true,
                confirmationStatus: true,
                contactId: true,
                companyId: true,
                sdrId: true,
                campaign: { select: { missionId: true } },
            },
        }),
        prisma.action.findMany({
            where: { ...inMissions, ...confirmedMeeting, createdAt: { gte: reportStart, lt: reportEnd } },
            select: meetingSelect,
            orderBy: { createdAt: "asc" },
        }),
        prisma.action.findMany({
            where: { ...inMissions, ...confirmedMeeting, callbackDate: { gte: todayStart, lt: todayEnd } },
            select: meetingSelect,
            orderBy: { callbackDate: "asc" },
        }),
        prisma.action.count({
            where: { ...inMissions, ...confirmedMeeting, createdAt: { gte: monthStart, lt: reportEnd } },
        }),
    ]);

    const buckets = new Map(trendDays.map((d) => [d, emptyBucket()]));
    const outcomeCounts = new Map<OutcomeKey, number>();
    const missionStats = new Map<string, { calls: number; meetings: number }>();
    const sdrs = new Set<string>();

    for (const a of actions) {
        const bucket = buckets.get(localDayOf(a.createdAt, q.tz));
        if (!bucket) continue; // weekend actions outside the working-day window
        const outcome = OUTCOME_OF[a.result] ?? "other";
        const prospect = a.contactId ?? (a.companyId ? `company:${a.companyId}` : null);
        const isCall = a.channel === "CALL";
        const isConfirmedMeeting = a.result === "MEETING_BOOKED" && a.confirmationStatus === "CONFIRMED";

        if (isCall) {
            bucket.calls++;
            if (!NOT_REACHED.has(outcome)) bucket.conversations++;
        }
        if (isConfirmedMeeting) bucket.meetings++;
        if (prospect) {
            bucket.prospects.add(prospect);
            if (QUALIFIED_OUTCOMES.has(outcome)) bucket.qualified.add(prospect);
        }

        if (bucket === buckets.get(q.day)) {
            sdrs.add(a.sdrId);
            outcomeCounts.set(outcome, (outcomeCounts.get(outcome) ?? 0) + 1);
            const missionId = a.campaign?.missionId;
            if (missionId) {
                const m = missionStats.get(missionId) ?? { calls: 0, meetings: 0 };
                if (isCall) m.calls++;
                if (isConfirmedMeeting) m.meetings++;
                missionStats.set(missionId, m);
            }
        }
    }

    const trend = trendDays.map((day) => ({ day, ...totalsOf(buckets.get(day)!) }));
    const totals = totalsOf(buckets.get(q.day)!);
    const previous = trend.length > 1 ? totalsOf(buckets.get(trendDays[trendDays.length - 2])!) : null;

    const toDto = (m: (typeof bookedRaw)[number]): DailyReportMeeting => ({
        id: m.id,
        bookedAt: m.createdAt.toISOString(),
        date: m.callbackDate?.toISOString() ?? null,
        meetingType: m.meetingType ?? null,
        company: m.contact?.company.name ?? m.company?.name ?? "Société",
        contact: m.contact ? [m.contact.firstName, m.contact.lastName].filter(Boolean).join(" ") || null : null,
        title: m.contact?.title ?? null,
        mission: m.campaign?.mission?.name ?? null,
        commercial: m.interlocuteur
            ? { id: m.interlocuteur.id, name: [m.interlocuteur.firstName, m.interlocuteur.lastName].filter(Boolean).join(" ") }
            : null,
    });
    // Both queries only return MEETING_BOOKED rows, so no cancelled-RDV filtering is needed.
    const meetingsBooked = bookedRaw.map(toDto);
    const todayMeetings = todayRaw.map(toDto);

    const commercials = new Map<string, { id: string; name: string; booked: number; today: number }>();
    const bump = (c: DailyReportMeeting["commercial"], field: "booked" | "today") => {
        const key = c?.id ?? "none";
        const entry = commercials.get(key) ?? { id: key, name: c?.name || "Non attribué", booked: 0, today: 0 };
        entry[field]++;
        commercials.set(key, entry);
    };
    meetingsBooked.forEach((m) => bump(m.commercial, "booked"));
    todayMeetings.forEach((m) => bump(m.commercial, "today"));

    const report: DailyReport = {
        ...base,
        totals,
        previous,
        reachRate: pct(totals.conversations, totals.calls),
        sdrCount: sdrs.size,
        trend,
        outcomes: (Object.keys(OUTCOME_LABELS) as OutcomeKey[])
            .map((key) => ({ key, label: OUTCOME_LABELS[key], count: outcomeCounts.get(key) ?? 0 }))
            .filter((o) => o.count > 0)
            .sort((a, b) => b.count - a.count),
        month: { ...base.month, meetings: monthMeetings },
        meetingsBooked,
        todayMeetings,
        byCommercial: [...commercials.values()].sort((a, b) => b.booked + b.today - (a.booked + a.today)),
        byMission: missions
            .map((m) => ({ id: m.id, name: m.name, ...(missionStats.get(m.id) ?? { calls: 0, meetings: 0 }) }))
            .filter((m) => m.calls > 0 || m.meetings > 0)
            .sort((a, b) => b.meetings - a.meetings || b.calls - a.calls),
    };
    return { ...report, highlights: buildHighlights(report) };
}

// ─── Deterministic analysis ───────────────────────────────────────────────────

function deltaPct(now: number, before: number): number | null {
    return before > 0 ? Math.round(((now - before) / before) * 100) : null;
}

export function buildHighlights(r: DailyReport): DailyHighlight[] {
    const out: DailyHighlight[] = [];
    const prevLabel = r.previousDay ? frenchDayLabel(r.previousDay, { weekday: "long" }) : null;

    if (r.totals.calls === 0 && r.totals.meetings === 0) {
        out.push({ tone: "neutral", text: "Pas d'activité d'appel enregistrée ce jour-là." });
    }

    const activeDays = r.trend.filter((p) => p.calls > 0 || p.meetings > 0).length;
    const bestMeetings = Math.max(...r.trend.map((p) => p.meetings));
    if (r.totals.meetings > 0 && r.totals.meetings === bestMeetings && activeDays > 2) {
        out.push({ tone: "positive", text: `Meilleure journée de la semaine : ${r.totals.meetings} RDV confirmé${r.totals.meetings > 1 ? "s" : ""}.` });
    }

    const callDelta = r.previous ? deltaPct(r.totals.calls, r.previous.calls) : null;
    if (callDelta !== null && prevLabel && Math.abs(callDelta) >= 20) {
        out.push(
            callDelta > 0
                ? { tone: "positive", text: `Volume d'appels en hausse de ${callDelta} % par rapport à ${prevLabel}.` }
                : { tone: "neutral", text: `Volume d'appels en retrait de ${Math.abs(callDelta)} % par rapport à ${prevLabel}.` }
        );
    }

    if (r.reachRate !== null && r.totals.calls >= 10) {
        out.push({
            tone: r.reachRate >= 30 ? "positive" : "neutral",
            text: `Taux de décroché de ${r.reachRate} % (${r.totals.conversations} conversations sur ${r.totals.calls} appels).`,
        });
    }

    if (r.month.objective) {
        const p = pct(r.month.meetings, r.month.objective) ?? 0;
        out.push({
            tone: p >= 100 ? "positive" : "neutral",
            text: `Objectif du mois : ${r.month.meetings}/${r.month.objective} RDV (${p} %).`,
        });
    }

    const dataIssues = r.outcomes.find((o) => o.key === "dataIssue")?.count ?? 0;
    if (dataIssues >= 5) {
        out.push({ tone: "attention", text: `${dataIssues} coordonnées à corriger repérées par l'équipe.` });
    }

    if (r.todayMeetings.length > 0) {
        out.push({ tone: "positive", text: `${r.todayMeetings.length} RDV à l'agenda aujourd'hui.` });
    }
    return out.slice(0, 5);
}

/** Plain-language summary without AI — also the fallback when AI is unavailable. */
export function buildRuleInsight(r: DailyReport): DailyInsight {
    const t = r.totals;
    const s = (n: number) => (n > 1 ? "s" : "");
    const headline =
        t.meetings > 0
            ? `${t.meetings} nouveau${t.meetings > 1 ? "x" : ""} RDV confirmé${s(t.meetings)}`
            : t.calls > 0
                ? `${t.calls} appel${s(t.calls)} passé${s(t.calls)}`
                : "Journée sans activité d'appel";

    const parts: string[] = [];
    if (t.calls > 0) parts.push(`${t.calls} appel${s(t.calls)} dont ${t.conversations} conversation${s(t.conversations)}`);
    if (t.qualified > 0) parts.push(`${t.qualified} prospect${s(t.qualified)} qualifié${s(t.qualified)}`);
    if (t.meetings > 0) parts.push(`${t.meetings} RDV confirmé${s(t.meetings)}`);
    const summary = parts.length > 0
        ? `L'équipe a réalisé ${parts.join(", ")} sur ${r.activeMissions} mission${s(r.activeMissions)} active${s(r.activeMissions)}.`
        : "Aucune action n'a été enregistrée sur vos missions ce jour-là.";

    const recommendation =
        r.todayMeetings.length > 0
            ? `Préparez vos ${r.todayMeetings.length} RDV du jour : les fiches prospects sont dans « Rendez-vous ».`
            : t.qualified > t.meetings
                ? `${t.qualified - t.meetings} prospect${s(t.qualified - t.meetings)} intéressé${s(t.qualified - t.meetings)} à suivre : consultez l'historique d'appels.`
                : "Consultez le rapport complet pour le détail par mission.";

    return { source: "rules", headline, summary, recommendation };
}
