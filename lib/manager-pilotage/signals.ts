// ============================================
// SALLE DE PILOTAGE — « À décider maintenant ». Each rule turns counts into
// at most a few signals, each with the one action that answers it. Sorted
// most severe first. Red (critical) is kept for what costs the client today:
// a meeting stuck in the SAS, a queue with nobody left to call.
//
//   T7  SAS        MEETING_BOOKED still PENDING · red after 4 office hours
//   T2  Silence    25 min without an action inside a planned block
//   T4  Refus      refus ÷ joints − agency ≥ +15 pts, ≥ 20 joints, 2 working days
//   T8  Stock      under 2 working days of callable contacts
//   T11 Closer     taux ≥ 1.5 × median, volume < 85 % of quota, ≥ 40 joints
//   —   Sans objectif  a running mission without targetMeetings
// ============================================

import { MIN_SAMPLE, formatPercent } from "@/lib/missions/pulse";
import { officeMinutesBetween } from "./calendar";
import { formatDays } from "./forecast";
import { hhmm, SILENCE_SIGNAL_MINUTES, type TeamMember } from "./team";
import type { CloserPoint } from "./patterns";

export type Severity = "critical" | "warning" | "info";
export type SignalKind = "sas" | "silence" | "refusal" | "stock" | "closer" | "no_target";

export interface Signal {
    id: string;
    kind: SignalKind;
    /** Rule id in the blueprint (T7…), shown as the badge. */
    rule: string;
    severity: Severity;
    title: string;
    detail: string;
    action: { label: string; href: string };
    /** Within a severity, bigger first. */
    weight: number;
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

export function sortSignals(signals: Signal[]): Signal[] {
    return [...signals].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.weight - a.weight || a.title.localeCompare(b.title, "fr"));
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** 108 → « 1 h 48 », 35 → « 35 min ». */
export function formatDuration(minutes: number): string {
    const m = Math.max(0, Math.round(minutes));
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${h} h ${String(rest).padStart(2, "0")}` : `${h} h`;
}

// ── T7 SAS ────────────────────────────────────────────────────────────────

export const SAS_SLA_OFFICE_MINUTES = 4 * 60;

export interface PendingMeeting {
    id: string;
    createdAt: string;
    /** Company or contact. */
    label: string;
    sdr: string | null;
}

export function sasSignal(pending: PendingMeeting[], now: Date, holidays: ReadonlySet<string>): Signal | null {
    if (!pending.length) return null;
    const aged = pending
        .map((p) => ({ ...p, age: officeMinutesBetween(new Date(p.createdAt), now, holidays) }))
        .sort((a, b) => b.age - a.age);
    const oldest = aged[0];
    const late = aged.filter((p) => p.age > SAS_SLA_OFFICE_MINUTES).length;
    const who = [oldest.label, oldest.sdr].filter(Boolean).join(", ");
    return {
        id: "sas",
        kind: "sas",
        rule: "T7",
        severity: late ? "critical" : "warning",
        title: `${plural(pending.length, "RDV attend", "RDV attendent")} la confirmation SAS`,
        detail:
            `Le plus ancien depuis ${formatDuration(oldest.age)} ouvrées${who ? ` (${who})` : ""}.` +
            (late ? ` ${plural(late, "dépasse", "dépassent")} 4 h ouvrées.` : "") +
            " Le client ne les voit pas avant.",
        action: { label: "Confirmer", href: "/manager/rdv" },
        weight: oldest.age,
    };
}

// ── T2 Silence ────────────────────────────────────────────────────────────

export function silenceSignals(team: TeamMember[]): Signal[] {
    return team
        .filter((m) => m.status === "silent" && (m.silentMinutes ?? 0) >= SILENCE_SIGNAL_MINUTES)
        .map((m) => ({
            id: `silence:${m.id}`,
            kind: "silence" as const,
            rule: "T2",
            severity: "warning" as const,
            title: `${m.name} silencieux depuis ${formatDuration(m.silentMinutes ?? 0)}`,
            detail: `${m.mission ? `Bloc ${m.mission.name}` : "Bloc"} planifié${m.blockEnd !== null ? ` jusqu’à ${hhmm(m.blockEnd)}` : ""}, aucune action enregistrée.`,
            action: { label: "Écrire", href: "/manager/comms" },
            weight: m.silentMinutes ?? 0,
        }));
}

// ── T4 Refusal spike ──────────────────────────────────────────────────────

export const REFUSAL_SPIKE_POINTS = 0.15;

export interface MissionRefusals {
    missionId: string;
    name: string;
    reached: number;
    refusals: number;
}

export function refusalSignals(rows: MissionRefusals[], benchmark: number | null): Signal[] {
    if (benchmark === null) return [];
    const out: Signal[] = [];
    for (const r of rows) {
        if (r.reached < MIN_SAMPLE) continue;
        const share = r.refusals / r.reached;
        const gap = share - benchmark;
        if (gap < REFUSAL_SPIKE_POINTS) continue;
        out.push({
            id: `refusal:${r.missionId}`,
            kind: "refusal",
            rule: "T4",
            severity: "warning",
            title: `${r.name} : refus à ${formatPercent(share)} des joints`,
            detail: `+${Math.round(gap * 100)} pts au-dessus de l’agence (${formatPercent(benchmark)}) sur les 2 derniers jours ouvrés, ${r.reached} joints.`,
            action: { label: "Revoir le pitch", href: `/manager/prospection?mission=${encodeURIComponent(r.missionId)}` },
            weight: gap * 100,
        });
    }
    return out;
}

// ── T8 Stock ──────────────────────────────────────────────────────────────

export const STOCK_ALERT_WORKING_DAYS = 2;

export interface MissionStock {
    missionId: string;
    name: string;
    /** Callable contacts left in the active lists (listStock().reachable, summed). */
    reachable: number;
    /** Actions on those lists over the last 7 days. */
    actions7d: number;
}

/**
 * Working days of stock at the last 7 days' pace. Seven calendar days hold
 * five working days, so the pace per working day is actions7d ÷ 5. Null:
 * nobody calls these lists.
 */
export function stockWorkingDays(s: Pick<MissionStock, "reachable" | "actions7d">): number | null {
    if (s.reachable === 0) return 0;
    return s.actions7d > 0 ? s.reachable / (s.actions7d / 5) : null;
}

export function stockSignals(rows: MissionStock[]): Signal[] {
    const out: Signal[] = [];
    for (const r of rows) {
        const days = stockWorkingDays(r);
        if (days === null || days >= STOCK_ALERT_WORKING_DAYS) continue;
        if (days === 0 && r.actions7d === 0) continue; // an empty, untouched list is not a running queue
        const perDay = Math.round(r.actions7d / 5);
        out.push({
            id: `stock:${r.missionId}`,
            kind: "stock",
            rule: "T8",
            severity: days === 0 ? "critical" : "warning",
            title: days === 0 ? `${r.name} : plus personne à appeler` : `${r.name} : file vide dans ${formatDays(days)} jour${days >= 2 ? "s" : ""} ouvré${days >= 2 ? "s" : ""}`,
            detail:
                days === 0
                    ? `Les listes actives sont épuisées, ${perDay} appels par jour ouvré la semaine dernière.`
                    : `${r.reachable.toLocaleString("fr-FR")} contacts joignables à ${perDay} appels par jour ouvré.`,
            action: { label: "Ouvrir Listes", href: "/manager/lists" },
            weight: STOCK_ALERT_WORKING_DAYS - days,
        });
    }
    return out;
}

// ── T11 Under-used closer ─────────────────────────────────────────────────

export function closerSignals(points: CloserPoint[], quota: number, median: number | null): Signal[] {
    return points
        .filter((p) => p.underUsed)
        .map((p) => ({
            id: `closer:${p.id}`,
            kind: "closer" as const,
            rule: "T11",
            severity: "info" as const,
            title: `${p.name} : ${formatPercent(p.rate)} de RDV à ${Math.round(p.perDay)} appels/j`,
            detail:
                `${median ? `${(p.rate! / median).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} × la médiane de l’équipe, ` : ""}` +
                `${Math.round((p.perDay / quota) * 100)} % du quota. ≈ ${p.onTable.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} RDV par semaine en jeu.`,
            action: { label: "Planifier", href: "/manager/planning" },
            weight: p.onTable,
        }));
}

// ── Missions without a target ─────────────────────────────────────────────

export interface UntargetedMission {
    id: string;
    name: string;
    meetings: number;
}

export function noTargetSignal(missions: UntargetedMission[]): Signal | null {
    if (!missions.length) return null;
    const names = missions.slice(0, 3).map((m) => m.name).join(", ") + (missions.length > 3 ? `, +${missions.length - 3}` : "");
    const meetings = missions.reduce((s, m) => s + m.meetings, 0);
    return {
        id: "no_target",
        kind: "no_target",
        rule: "Sans objectif",
        severity: "info",
        title: `${plural(missions.length, "mission active sans objectif", "missions actives sans objectif")}`,
        detail: `${names}. ${plural(meetings, "RDV pris", "RDV pris")} ce mois, hors atterrissage : sans cible, pas de rythme à juger.`,
        action: { label: "Définir l’objectif", href: missions.length === 1 ? `/manager/missions/${encodeURIComponent(missions[0].id)}` : "/manager/missions" },
        weight: missions.length,
    };
}
