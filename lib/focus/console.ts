// ============================================
// FOCUS CONSOLE — pure helpers for the Mission Control band of the Focus mode:
// the day rail (every call of the day placed at its time, the planned blocks,
// now), live pace from today's calls, the « Ensuite » preview of the queue and
// the unqualified-call gate. No I/O, unit-tested (npm run test:focus).
// ============================================

import { DateTime } from "luxon";
import { statusForBehind, type PaceStatus } from "@/lib/sdr-pace/pace";
import { statusFamily, type StatusFamily } from "@/lib/workspace/status-family";
import { FOCUS_TZ } from "./focus";

/** How loud a call reads on the rail. A meeting outranks the « positive » family. */
export type RailTone = "meeting" | Exclude<StatusFamily, "alert">;

export interface RailAction {
    /** ISO instant the action was logged. */
    at: string;
    result: string;
    /** Reporting category of the status, when the config has one. */
    category?: string | null;
}

export interface RailBlock {
    /** "HH:mm", Paris. */
    startTime: string;
    endTime: string;
}

export interface RailTick {
    /** Position on the rail, 0–100. */
    left: number;
    /** Bar height, 0–1 of the rail. */
    height: number;
    tone: RailTone;
}

export interface DayRail {
    startMinute: number;
    endMinute: number;
    ticks: RailTick[];
    /** Planned blocks as bands, 0–100. */
    blocks: { left: number; width: number }[];
    /** Hour marks, 0–100. */
    hours: { label: string; left: number }[];
    /** Where now sits, 0–100, or null outside the rail. */
    now: number | null;
}

const HEIGHT: Record<RailTone, number> = { meeting: 1, positive: 0.72, pending: 0.54, negative: 0.38, noreach: 0.18 };
const DEFAULT_START = 9 * 60;
const DEFAULT_END = 18 * 60;

export function railTone(result: string, category?: string | null): RailTone {
    if (result === "MEETING_BOOKED") return "meeting";
    const family = statusFamily(result, category);
    return family === "alert" ? "negative" : family;
}

function hhmm(value: string): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!m) return null;
    const minutes = Number(m[1]) * 60 + Number(m[2]);
    return minutes >= 0 && minutes <= 24 * 60 ? minutes : null;
}

function parisMinute(instant: Date): number {
    const d = DateTime.fromJSDate(instant, { zone: FOCUS_TZ });
    return d.hour * 60 + d.minute + d.second / 60;
}

function sameParisDay(a: Date, b: Date): boolean {
    return DateTime.fromJSDate(a, { zone: FOCUS_TZ }).toISODate() === DateTime.fromJSDate(b, { zone: FOCUS_TZ }).toISODate();
}

/**
 * The rail spans the planned blocks (09:00–18:00 without planning), widened to
 * any call logged outside them, on whole hours. Actions from another day are ignored.
 */
export function buildDayRail(actions: RailAction[], blocks: RailBlock[], now: Date = new Date()): DayRail {
    const intervals = blocks
        .map((b) => [hhmm(b.startTime), hhmm(b.endTime)] as const)
        .filter((x): x is readonly [number, number] => x[0] !== null && x[1] !== null && x[1] > x[0]);
    const calls = actions
        .map((a) => ({ a, when: new Date(a.at) }))
        .filter(({ when }) => !Number.isNaN(when.getTime()) && sameParisDay(when, now))
        .map(({ a, when }) => ({ minute: parisMinute(when), tone: railTone(a.result, a.category) }));

    let start = intervals.length ? Math.min(...intervals.map((i) => i[0])) : DEFAULT_START;
    let end = intervals.length ? Math.max(...intervals.map((i) => i[1])) : DEFAULT_END;
    for (const c of calls) {
        start = Math.min(start, c.minute);
        end = Math.max(end, c.minute);
    }
    start = Math.floor(start / 60) * 60;
    end = Math.max(start + 60, Math.ceil(end / 60) * 60);
    const span = end - start;
    const pos = (minute: number) => Math.min(100, Math.max(0, ((minute - start) / span) * 100));

    const ticks = calls
        .sort((x, y) => x.minute - y.minute)
        .map((c) => ({ left: pos(c.minute), height: HEIGHT[c.tone], tone: c.tone }));

    const step = span > 10 * 60 ? 120 : 60;
    const hours: DayRail["hours"] = [];
    for (let m = start; m <= end; m += step) hours.push({ label: `${String(Math.floor(m / 60)).padStart(2, "0")}:00`, left: pos(m) });

    const nowMinute = parisMinute(now);
    return {
        startMinute: start,
        endMinute: end,
        ticks,
        blocks: intervals.map(([s, e]) => ({ left: pos(s), width: pos(e) - pos(s) })),
        hours,
        now: nowMinute >= start && nowMinute <= end ? pos(nowMinute) : null,
    };
}

export interface LivePace {
    calls: number;
    expected: number;
    /** calls − expected: > 0 ahead. */
    lead: number;
    status: PaceStatus;
}

/**
 * The pace number moves with each call logged here, not on the next 60 s poll:
 * calls = the larger of the server's count and today's calls on screen, against
 * the server's expected figure (which only moves with time).
 */
export function livePace(serverCalls: number, expected: number, callsToday: number): LivePace {
    const calls = Math.max(serverCalls, callsToday);
    const lead = calls - expected;
    return { calls, expected, lead, status: statusForBehind(Math.max(0, -lead)) };
}

export interface QueueRowLike {
    contact: { id: string } | null;
    company: { id: string };
    hasContactInfo?: boolean;
}

export function rowKey(row: QueueRowLike): string {
    return `${row.contact?.id ?? ""}|${row.company.id}`;
}

/**
 * « Ensuite »: the rows the queue serves after the prospect on screen, in its own
 * order, without the ones handled or skipped in this session, nor the rows the
 * single-lead flow cannot call (no phone).
 */
export function upNext<T extends QueueRowLike>(rows: T[], currentKey: string | null, handled: ReadonlySet<string>, count = 5): T[] {
    const out: T[] = [];
    for (const row of rows) {
        if (row.hasContactInfo === false) continue;
        const key = rowKey(row);
        if (key === currentKey || handled.has(key)) continue;
        out.push(row);
        if (out.length >= count) break;
    }
    return out;
}

export interface UnqualifiedLike {
    id: string;
    at: string;
    company: { id: string } | null;
}

/**
 * The call the SDR should qualify first: the oldest one that can be qualified
 * (it names a company), other than the call of the prospect on screen, which
 * the outcome panel is about to qualify anyway.
 */
export function gateCall<T extends UnqualifiedLike>(rows: T[], ownCallId: string | null): T | null {
    const open = rows.filter((r) => r.company && r.id !== ownCallId);
    if (!open.length) return null;
    return open.reduce((oldest, r) => (Date.parse(r.at) < Date.parse(oldest.at) ? r : oldest));
}

/** Previous / next mission in the list, wrapping; null when there is nothing to switch to. */
export function cycleMission(ids: string[], current: string | null, step: 1 | -1): string | null {
    if (ids.length < 2) return null;
    const i = current ? ids.indexOf(current) : -1;
    if (i < 0) return ids[0];
    return ids[(i + step + ids.length) % ids.length];
}
