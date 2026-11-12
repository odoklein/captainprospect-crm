/**
 * Five-field cron (minute hour day-of-month month day-of-week), evaluated in an
 * IANA timezone, for `AgentJob.schedule`.
 *
 * Supported per field: star, `n`, `a-b`, star-slash-step, `a-b/s`, lists `a,b,c`. Day of
 * week 0–7 (0 and 7 = Sunday). Classic cron semantics: when both day-of-month
 * and day-of-week are restricted, either one matching fires the job.
 *
 * Daylight saving: the search walks wall-clock minutes of the zone. A time that
 * does not exist on the spring-forward day (02:30 Paris on the last Sunday of
 * March) is skipped that day; a time that exists twice on the fall-back day
 * fires on its first occurrence only.
 */

import { DateTime } from "luxon";

export interface CronFields {
    minute: Set<number>;
    hour: Set<number>;
    dayOfMonth: Set<number>;
    month: Set<number>;
    dayOfWeek: Set<number>;
    /** True when the field was `*` (used for the dom/dow OR rule). */
    anyDayOfMonth: boolean;
    anyDayOfWeek: boolean;
}

const RANGES = {
    minute: [0, 59],
    hour: [0, 23],
    dayOfMonth: [1, 31],
    month: [1, 12],
    dayOfWeek: [0, 7],
} as const;

export class CronParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CronParseError";
    }
}

function parseField(raw: string, name: keyof typeof RANGES): { values: Set<number>; any: boolean } {
    const [min, max] = RANGES[name];
    const values = new Set<number>();
    let any = false;
    for (const part of raw.split(",")) {
        const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part.trim());
        if (!m) throw new CronParseError(`Champ ${name} invalide : « ${part} »`);
        const step = m[4] === undefined ? 1 : Number(m[4]);
        if (!Number.isInteger(step) || step < 1) throw new CronParseError(`Pas invalide dans ${name} : « ${part} »`);
        let lo: number;
        let hi: number;
        if (m[1] === "*") {
            lo = min;
            hi = max;
            if (step === 1) any = true;
        } else {
            lo = Number(m[2]);
            hi = m[3] === undefined ? (m[4] === undefined ? lo : max) : Number(m[3]);
        }
        if (lo < min || hi > max || lo > hi) throw new CronParseError(`Valeur hors limites dans ${name} : « ${part} »`);
        for (let v = lo; v <= hi; v += step) values.add(name === "dayOfWeek" && v === 7 ? 0 : v);
    }
    return { values, any };
}

export function parseCron(expression: string): CronFields {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) throw new CronParseError(`Expression cron à 5 champs attendue : « ${expression} »`);
    const minute = parseField(parts[0], "minute");
    const hour = parseField(parts[1], "hour");
    const dom = parseField(parts[2], "dayOfMonth");
    const month = parseField(parts[3], "month");
    const dow = parseField(parts[4], "dayOfWeek");
    return {
        minute: minute.values,
        hour: hour.values,
        dayOfMonth: dom.values,
        month: month.values,
        dayOfWeek: dow.values,
        anyDayOfMonth: dom.any,
        anyDayOfWeek: dow.any,
    };
}

export function isValidCron(expression: string): boolean {
    try {
        parseCron(expression);
        return true;
    } catch {
        return false;
    }
}

function dayMatches(fields: CronFields, dt: DateTime): boolean {
    if (!fields.month.has(dt.month)) return false;
    const domOk = fields.dayOfMonth.has(dt.day);
    const dowOk = fields.dayOfWeek.has(dt.weekday % 7); // luxon: 1 = Monday … 7 = Sunday
    if (fields.anyDayOfMonth && fields.anyDayOfWeek) return true;
    if (fields.anyDayOfMonth) return dowOk;
    if (fields.anyDayOfWeek) return domOk;
    return domOk || dowOk;
}

const WALL = "yyyy-LL-dd HH:mm";

/** Up to this far ahead; beyond it the expression is considered unreachable. */
const MAX_LOOKAHEAD_DAYS = 366 * 2;

/**
 * First instant strictly after `after` that matches, as a UTC Date, or null
 * when nothing matches within two years (e.g. "0 0 31 2 *").
 */
export function nextMatch(expression: string | CronFields, after: Date, timezone = "Europe/Paris"): Date | null {
    const fields = typeof expression === "string" ? parseCron(expression) : expression;
    let dt = DateTime.fromJSDate(after, { zone: timezone });
    if (!dt.isValid) throw new CronParseError(`Fuseau horaire invalide : « ${timezone} »`);
    dt = dt.plus({ minutes: 1 }).startOf("minute");
    const limit = dt.plus({ days: MAX_LOOKAHEAD_DAYS });

    while (dt < limit) {
        if (!dayMatches(fields, dt)) {
            dt = dt.plus({ days: 1 }).startOf("day");
            continue;
        }
        if (!fields.hour.has(dt.hour)) {
            dt = dt.plus({ hours: 1 }).startOf("hour");
            continue;
        }
        if (!fields.minute.has(dt.minute)) {
            dt = dt.plus({ minutes: 1 });
            continue;
        }
        // Fall-back day: the same wall-clock minute exists twice. This is the
        // second occurrence when one hour earlier reads the same on the clock.
        if (dt.minus({ hours: 1 }).toFormat(WALL) === dt.toFormat(WALL)) {
            dt = dt.plus({ minutes: 1 });
            continue;
        }
        return dt.toUTC().toJSDate();
    }
    return null;
}

/** Whether `at` (any instant inside that minute) matches the expression. */
export function matchesAt(expression: string | CronFields, at: Date, timezone = "Europe/Paris"): boolean {
    const fields = typeof expression === "string" ? parseCron(expression) : expression;
    const dt = DateTime.fromJSDate(at, { zone: timezone });
    return dayMatches(fields, dt) && fields.hour.has(dt.hour) && fields.minute.has(dt.minute);
}
