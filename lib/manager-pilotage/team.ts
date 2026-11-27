// ============================================
// SALLE DE PILOTAGE — « L'équipe en direct »: who is on the phone now.
//
//   en ligne     an action less than 15 min ago (LIVE_WINDOW_MS, lib/missions/board)
//   silencieux   inside a planned block, nothing logged for N min; a signal from 25 min
//   pause        lunch, or between two blocks
//   absent       an SdrAbsence today
//   hors planning  no block today, but acted
//
// Calls are compared with the prorated quota the SDR sees on their own pace
// strip (computeEffectiveTime + computePace, lib/sdr-pace/pace). Pure.
// ============================================

import { LIVE_WINDOW_MS } from "@/lib/missions/board";
import { computeEffectiveTime, computePace, LUNCH_BREAK, type Interval, type PaceStatus } from "@/lib/sdr-pace/pace";

export const LIVE_MINUTES = LIVE_WINDOW_MS / 60_000;
/** Grace added to the live window before silence becomes a signal. */
export const SILENCE_GRACE_MINUTES = 10;
export const SILENCE_SIGNAL_MINUTES = LIVE_MINUTES + SILENCE_GRACE_MINUTES;

export type TeamStatus = "online" | "silent" | "starting" | "break" | "before" | "done" | "absent" | "unplanned";

export interface TeamBlock {
    start: number;
    end: number;
    missionId: string;
    mission: string;
}

export interface TeamInput {
    id: string;
    name: string;
    nowMinute: number;
    /** Today's planned blocks (minutes since Paris midnight). */
    blocks: TeamBlock[];
    absent: boolean;
    /** Last action today, any channel; null if none. */
    lastActionMinute: number | null;
    /** Minute of each call today. */
    callMinutes: number[];
    meetings: number;
    quota: number;
    targetHours: number;
}

export interface TeamMember {
    id: string;
    name: string;
    status: TeamStatus;
    /** Minutes since the last sign of work, inside the current block. */
    silentMinutes: number | null;
    /** The block's mission: the current one, else the next, else the last. */
    mission: { id: string; name: string } | null;
    /** Minute the current (or next) block ends / starts, for the copy. */
    blockEnd: number | null;
    nextStart: number | null;
    calls: number;
    /** Calls the prorated quota expects by now; null when not planned. */
    expected: number | null;
    dayQuota: number | null;
    paceStatus: PaceStatus | null;
    meetings: number;
    lastActionMinute: number | null;
}

function merged(list: Interval[]): Interval[] {
    const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
    const out: Interval[] = [];
    for (const i of sorted) {
        const last = out[out.length - 1];
        if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
        else out.push({ ...i });
    }
    return out;
}

/** Calling intervals of the day: blocks merged, lunch cut out. */
export function callingIntervals(blocks: Interval[]): Interval[] {
    const out: Interval[] = [];
    for (const i of merged(blocks)) {
        if (LUNCH_BREAK.end <= i.start || LUNCH_BREAK.start >= i.end) {
            out.push(i);
            continue;
        }
        if (LUNCH_BREAK.start > i.start) out.push({ start: i.start, end: LUNCH_BREAK.start });
        if (LUNCH_BREAK.end < i.end) out.push({ start: LUNCH_BREAK.end, end: i.end });
    }
    return out;
}

export function teamMember(input: TeamInput): TeamMember {
    const { nowMinute, lastActionMinute } = input;
    const intervals = callingIntervals(input.blocks);
    const current = intervals.find((i) => nowMinute >= i.start && nowMinute < i.end) ?? null;
    const next = intervals.find((i) => i.start > nowMinute) ?? null;
    const blockAt = (minute: number) => input.blocks.find((b) => minute >= b.start && minute < b.end);
    const missionBlock = (current && blockAt(current.start)) || (next && blockAt(next.start)) || input.blocks[input.blocks.length - 1] || null;
    const mission = missionBlock ? { id: missionBlock.missionId, name: missionBlock.mission } : null;

    const planned = input.blocks.length > 0;
    let expected: number | null = null;
    let dayQuota: number | null = null;
    let paceStatus: PaceStatus | null = null;
    if (planned && !input.absent) {
        const time = computeEffectiveTime({ blocks: input.blocks.map(({ start, end }) => ({ start, end })), callMinutes: input.callMinutes, nowMinute });
        const p = computePace({ callsDone: input.callMinutes.length, dailyQuota: input.quota, targetHours: input.targetHours, time });
        expected = p.expected;
        dayQuota = p.dayQuota;
        paceStatus = p.status;
    }

    const live = lastActionMinute !== null && nowMinute - lastActionMinute < LIVE_MINUTES;
    let status: TeamStatus;
    let silentMinutes: number | null = null;
    if (input.absent) status = "absent";
    else if (live) status = "online";
    else if (!planned) status = lastActionMinute !== null ? "unplanned" : "before";
    else if (current) {
        const since = Math.max(current.start, lastActionMinute ?? -Infinity);
        silentMinutes = Math.floor(nowMinute - since);
        status = silentMinutes >= LIVE_MINUTES ? "silent" : "starting";
    } else if (next) status = intervals[0] && nowMinute < intervals[0].start ? "before" : "break";
    else status = "done";

    return {
        id: input.id,
        name: input.name,
        status,
        silentMinutes,
        mission,
        blockEnd: current ? current.end : null,
        nextStart: next ? next.start : null,
        calls: input.callMinutes.length,
        expected,
        dayQuota,
        paceStatus,
        meetings: input.meetings,
        lastActionMinute,
    };
}

const ORDER: Record<TeamStatus, number> = { silent: 0, starting: 1, online: 2, break: 3, before: 4, unplanned: 5, done: 6, absent: 7 };

/** Who needs a look first: the silent, then the longest silence, then by name. */
export function sortTeam(team: TeamMember[]): TeamMember[] {
    return [...team].sort(
        (a, b) => ORDER[a.status] - ORDER[b.status] || (b.silentMinutes ?? 0) - (a.silentMinutes ?? 0) || a.name.localeCompare(b.name, "fr"),
    );
}

export function hhmm(minute: number): string {
    const m = Math.max(0, Math.floor(minute));
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function statusLabel(m: Pick<TeamMember, "status" | "silentMinutes" | "nextStart">): string {
    switch (m.status) {
        case "online":
            return "En ligne";
        case "silent":
            return `Silencieux · ${m.silentMinutes} min`;
        case "starting":
            return "Début de créneau";
        case "break":
            return m.nextStart !== null ? `Pause · reprise ${hhmm(m.nextStart)}` : "Pause";
        case "before":
            return m.nextStart !== null ? `Créneau à ${hhmm(m.nextStart)}` : "Pas encore en ligne";
        case "done":
            return "Créneau terminé";
        case "absent":
            return "Absent";
        case "unplanned":
            return "Hors planning";
    }
}
