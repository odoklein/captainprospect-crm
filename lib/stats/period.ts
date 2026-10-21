// Period presets and URL state of the Statistiques page. Pure: the clock is a
// parameter, so presets are unit-tested (npm run test:stats). Days are Paris days.

import { DateTime } from "luxon";
import { APP_TIMEZONE } from "./metrics";
import type { StatsFilters } from "./types";

export type PeriodPreset = "today" | "7d" | "30d" | "month" | "lastMonth" | "custom";

export const PRESET_OPTIONS: { value: PeriodPreset; label: string; long: string }[] = [
    { value: "today", label: "Aujourd'hui", long: "Aujourd'hui" },
    { value: "7d", label: "7 j", long: "7 derniers jours" },
    { value: "30d", label: "30 j", long: "30 derniers jours" },
    { value: "month", label: "Ce mois", long: "Mois en cours" },
    { value: "lastMonth", label: "Mois dernier", long: "Mois dernier" },
    { value: "custom", label: "Dates…", long: "Période personnalisée" },
];

export const DEFAULT_PRESET: PeriodPreset = "30d";

const FMT = "yyyy-MM-dd";
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parisToday(now: Date = new Date()): DateTime {
    return DateTime.fromJSDate(now, { zone: APP_TIMEZONE }).startOf("day");
}

/** Inclusive Paris days of a preset; "custom" is resolved by the caller. */
export function resolvePreset(preset: Exclude<PeriodPreset, "custom">, now: Date = new Date()): { start: string; end: string } {
    const today = parisToday(now);
    switch (preset) {
        case "today":
            return { start: today.toFormat(FMT), end: today.toFormat(FMT) };
        case "7d":
            return { start: today.minus({ days: 6 }).toFormat(FMT), end: today.toFormat(FMT) };
        case "30d":
            return { start: today.minus({ days: 29 }).toFormat(FMT), end: today.toFormat(FMT) };
        case "month":
            return { start: today.startOf("month").toFormat(FMT), end: today.toFormat(FMT) };
        case "lastMonth": {
            const prev = today.startOf("month").minus({ days: 1 });
            return { start: prev.startOf("month").toFormat(FMT), end: prev.toFormat(FMT) };
        }
    }
}

export type StatsTab = "apercu" | "equipe" | "cibles" | "journal" | "ia";
export const TABS: StatsTab[] = ["apercu", "equipe", "cibles", "journal", "ia"];

export interface StatsState extends Omit<StatsFilters, "start" | "end"> {
    preset: PeriodPreset;
    /** Only meaningful for preset "custom". */
    from: string;
    to: string;
    tab: StatsTab;
}

/** The days a state stands for, whatever its preset. */
export function stateRange(state: Pick<StatsState, "preset" | "from" | "to">, now: Date = new Date()): { start: string; end: string } {
    if (state.preset === "custom") {
        return state.from <= state.to ? { start: state.from, end: state.to } : { start: state.to, end: state.from };
    }
    return resolvePreset(state.preset, now);
}

const list = (v: string | null): string[] => (v ? v.split(",").filter(Boolean) : []);

/** Reads the page state from a query string; unknown or malformed values fall back to defaults. */
export function parseState(search: URLSearchParams, fallbackPreset: PeriodPreset = DEFAULT_PRESET, now: Date = new Date()): StatsState {
    const p = search.get("p") as PeriodPreset | null;
    const preset = p && PRESET_OPTIONS.some((o) => o.value === p) ? p : fallbackPreset;
    const today = parisToday(now).toFormat(FMT);
    const from = search.get("from");
    const to = search.get("to");
    const tab = search.get("tab") as StatsTab | null;
    const safe = (d: string | null) => (d && DAY_RE.test(d) ? d : today);
    const customOk = !!(from && DAY_RE.test(from) && to && DAY_RE.test(to));
    return {
        preset: preset === "custom" && !customOk ? fallbackPreset : preset,
        from: safe(from),
        to: safe(to),
        sdrIds: list(search.get("sdr")),
        missionIds: list(search.get("mission")),
        clientIds: list(search.get("client")),
        listIds: list(search.get("list")),
        tab: tab && TABS.includes(tab) ? tab : "apercu",
    };
}

/** Inverse of parseState; defaults are omitted so a fresh page keeps a clean URL. */
export function serializeState(state: StatsState): string {
    const q = new URLSearchParams();
    if (state.tab !== "apercu") q.set("tab", state.tab);
    if (state.preset !== DEFAULT_PRESET) q.set("p", state.preset);
    if (state.preset === "custom") {
        q.set("from", state.from);
        q.set("to", state.to);
    }
    if (state.sdrIds.length) q.set("sdr", state.sdrIds.join(","));
    if (state.missionIds.length) q.set("mission", state.missionIds.join(","));
    if (state.clientIds.length) q.set("client", state.clientIds.join(","));
    if (state.listIds.length) q.set("list", state.listIds.join(","));
    return q.toString();
}

type Scope = Pick<StatsFilters, "sdrIds" | "missionIds" | "clientIds" | "listIds">;

/** Scope parameters the analytics endpoints share. */
export function scopeParams(f: Scope): URLSearchParams {
    const p = new URLSearchParams();
    f.sdrIds.forEach((id) => p.append("sdrIds[]", id));
    f.missionIds.forEach((id) => p.append("missionIds[]", id));
    f.clientIds.forEach((id) => p.append("clientIds[]", id));
    f.listIds.forEach((id) => p.append("listIds[]", id));
    return p;
}

export function periodParams(range: { start: string; end: string }, f: Scope): URLSearchParams {
    const p = scopeParams(f);
    p.set("startDate", range.start);
    p.set("endDate", range.end);
    return p;
}
