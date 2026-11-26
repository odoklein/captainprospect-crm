// ============================================
// MISSION BOARD — the rail of /manager/prospection: every running mission with
// the one verdict a manager needs (is it behind? is anyone on it?), sorted so
// the mission that needs them is on top. Pure; the numbers come from
// GET /api/manager/missions/pulse.
// ============================================

import { nextAction, pace, type NextAction, type Pace } from "./pulse";

export interface MissionPulseSdr {
    id: string;
    name: string;
    /** Last action of this SDR on the mission today, ISO; null if none today. */
    lastActionAt: string | null;
}

export interface MissionPulseRow {
    id: string;
    name: string;
    client: { id: string; name: string } | null;
    channels: string[];
    status: string;
    targetMeetings: number | null;
    startDate: string | null;
    endDate: string | null;
    /** Meetings booked over the whole mission. */
    meetings: number;
    /** Today (Paris), on the requested channel. */
    today: { actions: number; reached: number; meetings: number };
    sdrs: MissionPulseSdr[];
    activeLists: number;
    readyLists: number;
}

export type VerdictTone = "danger" | "warning" | "neutral" | "good";

export interface BoardEntry {
    row: MissionPulseRow;
    pace: Pace;
    next: NextAction;
    verdict: { label: string; tone: VerdictTone };
    /** Lower comes first. */
    rank: number;
}

/** An SDR acted on the mission within this window: shown as « on it now ». */
export const LIVE_WINDOW_MS = 15 * 60_000;

export function isLive(sdr: MissionPulseSdr, now = Date.now()): boolean {
    return sdr.lastActionAt !== null && now - Date.parse(sdr.lastActionAt) <= LIVE_WINDOW_MS;
}

export function boardEntry(row: MissionPulseRow, now = Date.now()): BoardEntry {
    const p = pace({ target: row.targetMeetings, meetings: row.meetings, startDate: row.startDate, endDate: row.endDate, now });
    const next = nextAction({ status: row.status, sdrCount: row.sdrs.length, activeLists: row.activeLists, readyLists: row.readyLists, pace: p, endDate: row.endDate });
    const running = row.status === "ACTIVE";

    let verdict: BoardEntry["verdict"];
    let rank: number;
    if (running && row.sdrs.length === 0) [verdict, rank] = [{ label: "Personne dessus", tone: "danger" }, 0];
    else if (running && row.activeLists === 0) [verdict, rank] = [{ label: "File vide", tone: "danger" }, 0];
    else if (row.status === "PAUSED") [verdict, rank] = [{ label: "En pause", tone: "neutral" }, 6];
    else if (p.verdict === "behind") [verdict, rank] = [{ label: "En retard", tone: "warning" }, 1];
    else if (p.verdict === "ended") [verdict, rank] = [{ label: "Période terminée", tone: "warning" }, 2];
    else if (p.verdict === "ahead") [verdict, rank] = [{ label: "En avance", tone: "good" }, 4];
    else if (p.verdict === "reached") [verdict, rank] = [{ label: "Objectif atteint", tone: "good" }, 5];
    else if (p.verdict === "on_track") [verdict, rank] = [{ label: "Dans le rythme", tone: "neutral" }, 3];
    else if (p.verdict === "no_target") [verdict, rank] = [{ label: "Sans objectif", tone: "neutral" }, 3];
    else if (p.verdict === "not_started") [verdict, rank] = [{ label: "Pas commencée", tone: "neutral" }, 3];
    else [verdict, rank] = [{ label: "Trop tôt pour juger", tone: "neutral" }, 3];

    return { row, pace: p, next, verdict, rank };
}

/** Most urgent first; within a rank, the busiest today, then by name. */
export function sortBoard(entries: BoardEntry[]): BoardEntry[] {
    return [...entries].sort(
        (a, b) => a.rank - b.rank || b.row.today.actions - a.row.today.actions || a.row.name.localeCompare(b.row.name, "fr"),
    );
}
