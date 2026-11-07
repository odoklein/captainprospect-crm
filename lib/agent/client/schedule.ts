/**
 * Schedule builder model: friendly presets ⇄ 5-field cron (minute hour
 * day-of-month month day-of-week), plus a French description and a validator
 * for the « avancé » raw field. Same field grammar as lib/agent/cron.ts (the
 * server re-validates); kept separate so the browser does not ship luxon.
 */

export type ScheduleKind = "daily" | "weekdays" | "weekly" | "monthly" | "hourly" | "custom";

export interface SchedulePreset {
    kind: ScheduleKind;
    /** "HH:MM", for daily / weekdays / weekly / monthly. */
    time: string;
    /** 0 = dimanche … 6 = samedi, for weekly. */
    weekdays: number[];
    /** 1–28, for monthly (29–31 would skip short months). */
    dayOfMonth: number;
    /** 1, 2, 3, 4, 6, 12 for hourly. */
    everyHours: number;
    /** Minute past the hour, for hourly. */
    minute: number;
    /** The raw expression, for custom. */
    cron: string;
}

export const WEEKDAY_LABELS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;
export const WEEKDAY_SHORT_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"] as const;
/** Display order: the French week starts on Monday. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const HOUR_STEPS = [1, 2, 3, 4, 6, 12] as const;

export const DEFAULT_PRESET: SchedulePreset = {
    kind: "weekdays",
    time: "08:00",
    weekdays: [1],
    dayOfMonth: 1,
    everyHours: 1,
    minute: 0,
    cron: "0 8 * * 1-5",
};

const pad2 = (n: number) => String(n).padStart(2, "0");

export function parseTime(time: string): { h: number; m: number } | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    if (!match) return null;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h > 23 || m > 59) return null;
    return { h, m };
}

export function formatTime(h: number, m: number): string {
    return `${pad2(h)}:${pad2(m)}`;
}

/** Sorted, de-duplicated, Monday-first. */
function normalizeWeekdays(days: readonly number[]): number[] {
    const set = new Set(days.map((d) => (d === 7 ? 0 : d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
    return WEEK_ORDER.filter((d) => set.has(d));
}

/** Cron for a preset; null when the preset is incomplete (no time, no weekday…). */
export function buildCron(p: SchedulePreset): string | null {
    if (p.kind === "custom") return validateCron(p.cron) ? null : p.cron.trim().split(/\s+/).join(" ");
    if (p.kind === "hourly") {
        if (!HOUR_STEPS.includes(p.everyHours as (typeof HOUR_STEPS)[number])) return null;
        if (!Number.isInteger(p.minute) || p.minute < 0 || p.minute > 59) return null;
        return `${p.minute} ${p.everyHours === 1 ? "*" : `*/${p.everyHours}`} * * *`;
    }
    const t = parseTime(p.time);
    if (!t) return null;
    switch (p.kind) {
        case "daily":
            return `${t.m} ${t.h} * * *`;
        case "weekdays":
            return `${t.m} ${t.h} * * 1-5`;
        case "weekly": {
            const days = normalizeWeekdays(p.weekdays);
            if (days.length === 0) return null;
            const sorted = [...days].sort((a, b) => a - b);
            return `${t.m} ${t.h} * * ${sorted.join(",")}`;
        }
        case "monthly":
            if (!Number.isInteger(p.dayOfMonth) || p.dayOfMonth < 1 || p.dayOfMonth > 28) return null;
            return `${t.m} ${t.h} ${p.dayOfMonth} * *`;
    }
}

/** Expands a day-of-week field made of single values and ranges ("1,3", "1-3", "0-6"); null if it uses steps or stars. */
function expandWeekdays(field: string): number[] | null {
    const out: number[] = [];
    for (const part of field.split(",")) {
        const range = /^(\d)(?:-(\d))?$/.exec(part);
        if (!range) return null;
        const lo = Number(range[1]);
        const hi = range[2] === undefined ? lo : Number(range[2]);
        if (lo > 7 || hi > 7 || lo > hi) return null;
        for (let d = lo; d <= hi; d++) out.push(d === 7 ? 0 : d);
    }
    return normalizeWeekdays(out);
}

const INT = /^\d{1,2}$/;

/**
 * Reads a cron back into the friendliest preset that produces it exactly.
 * Anything else is `custom`, carrying the expression.
 */
export function parseCronToPreset(expression: string | null | undefined): SchedulePreset {
    const cron = (expression ?? "").trim().split(/\s+/).join(" ");
    const custom: SchedulePreset = { ...DEFAULT_PRESET, kind: "custom", cron };
    if (!cron || validateCron(cron)) return custom;
    const [min, hour, dom, month, dow] = cron.split(" ");
    if (month !== "*") return custom;

    const hourly = /^\*(?:\/(\d{1,2}))?$/.exec(hour);
    if (hourly && INT.test(min) && dom === "*" && dow === "*") {
        const every = hourly[1] === undefined ? 1 : Number(hourly[1]);
        if (!HOUR_STEPS.includes(every as (typeof HOUR_STEPS)[number])) return custom;
        return { ...DEFAULT_PRESET, kind: "hourly", everyHours: every, minute: Number(min), cron };
    }

    if (!INT.test(min) || !INT.test(hour)) return custom;
    const time = formatTime(Number(hour), Number(min));
    const base = { ...DEFAULT_PRESET, time, cron };

    if (dom !== "*") {
        if (!INT.test(dom) || dow !== "*") return custom;
        const day = Number(dom);
        if (day < 1 || day > 28) return custom;
        return { ...base, kind: "monthly", dayOfMonth: day };
    }
    if (dow === "*") return { ...base, kind: "daily" };
    const days = expandWeekdays(dow);
    if (!days || days.length === 0) return custom;
    if (days.length === 7) return { ...base, kind: "daily" };
    if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return { ...base, kind: "weekdays" };
    return { ...base, kind: "weekly", weekdays: days };
}

function joinFr(items: string[]): string {
    if (items.length <= 1) return items.join("");
    return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

/** « Tous les jours à 08:00 », « Chaque lundi et jeudi à 08:00 », « Toutes les 2 heures »… */
export function describePreset(p: SchedulePreset): string {
    if (p.kind === "custom") return p.cron ? `Cron personnalisé : ${p.cron}` : "Aucune planification";
    if (p.kind === "hourly") {
        const base = p.everyHours === 1 ? "Toutes les heures" : `Toutes les ${p.everyHours} heures`;
        return p.minute === 0 ? base : `${base}, à la minute ${p.minute}`;
    }
    const at = `à ${p.time}`;
    switch (p.kind) {
        case "daily":
            return `Tous les jours ${at}`;
        case "weekdays":
            return `Jours ouvrés ${at}`;
        case "weekly": {
            const days = normalizeWeekdays(p.weekdays);
            if (days.length === 0) return "Choisis au moins un jour";
            return `Chaque ${joinFr(days.map((d) => WEEKDAY_LABELS[d]))} ${at}`;
        }
        case "monthly":
            return `Le ${p.dayOfMonth === 1 ? "1er" : p.dayOfMonth} de chaque mois ${at}`;
    }
}

export function describeCron(expression: string | null | undefined): string {
    if (!expression) return "Aucune planification";
    return describePreset(parseCronToPreset(expression));
}

const FIELDS: Array<{ name: string; min: number; max: number }> = [
    { name: "minute", min: 0, max: 59 },
    { name: "heure", min: 0, max: 23 },
    { name: "jour du mois", min: 1, max: 31 },
    { name: "mois", min: 1, max: 12 },
    { name: "jour de la semaine", min: 0, max: 7 },
];

/** null when valid, else a French error naming the faulty field. */
export function validateCron(expression: string): string | null {
    const parts = expression.trim().split(/\s+/).filter(Boolean);
    if (parts.length !== 5) return "Une expression cron a 5 champs : minute heure jour mois jour-de-semaine.";
    for (let i = 0; i < 5; i++) {
        const { name, min, max } = FIELDS[i];
        for (const part of parts[i].split(",")) {
            const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part);
            if (!m) return `Champ « ${name} » illisible : « ${part} ».`;
            if (m[4] !== undefined && Number(m[4]) < 1) return `Pas invalide dans « ${name} ».`;
            if (m[1] !== "*") {
                const lo = Number(m[2]);
                const hi = m[3] === undefined ? lo : Number(m[3]);
                if (lo < min || hi > max || lo > hi) return `Valeur hors limites dans « ${name} » (${min}–${max}).`;
            }
        }
    }
    return null;
}
