import { z } from "zod";

/**
 * Period presets in Paris time. Agents are bad at date arithmetic and do not
 * know today's date; "this_month" is resolved here, once, correctly (DST
 * included), instead of being guessed by the model.
 */
export const TIMEZONE = "Europe/Paris";

export const PERIODS = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "last_7_days",
  "last_30_days",
  "this_year",
] as const;
export type Period = (typeof PERIODS)[number];

export const zPeriod = z
  .enum(PERIODS)
  .describe("Period preset in Paris time (preferred over date_from/date_to): today, yesterday, this_week (Mon-), last_week, this_month, last_month, last_7_days, last_30_days, this_year");

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function civil(at: Date) {
  const p = Object.fromEntries(fmt.formatToParts(at).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** Paris UTC offset (ms) at an instant. */
function offsetMs(at: Date): number {
  const c = civil(at);
  return Date.UTC(c.y, c.m - 1, c.d, c.h, c.mi, c.s) - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant at which the Paris civil day (y, m, d) starts. Month/day overflow normalises. */
export function parisMidnight(y: number, m: number, d: number): Date {
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetMs(new Date(guess));
  t = guess - offsetMs(new Date(t)); // re-check across a DST switch
  return new Date(t);
}

export function periodRange(period: Period, now: Date = new Date()): { from: Date; to: Date; label: string } {
  const { y, m, d } = civil(now);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Monday = 0
  const end = (next: Date) => new Date(next.getTime() - 1);
  switch (period) {
    case "today": return { from: parisMidnight(y, m, d), to: now, label: "aujourd'hui" };
    case "yesterday": return { from: parisMidnight(y, m, d - 1), to: end(parisMidnight(y, m, d)), label: "hier" };
    case "this_week": return { from: parisMidnight(y, m, d - dow), to: now, label: "cette semaine (depuis lundi)" };
    case "last_week": return { from: parisMidnight(y, m, d - dow - 7), to: end(parisMidnight(y, m, d - dow)), label: "semaine dernière" };
    case "this_month": return { from: parisMidnight(y, m, 1), to: now, label: "ce mois-ci" };
    case "last_month": return { from: parisMidnight(y, m - 1, 1), to: end(parisMidnight(y, m, 1)), label: "mois dernier" };
    case "last_7_days": return { from: parisMidnight(y, m, d - 6), to: now, label: "7 derniers jours" };
    case "last_30_days": return { from: parisMidnight(y, m, d - 29), to: now, label: "30 derniers jours" };
    case "this_year": return { from: parisMidnight(y, 1, 1), to: now, label: "depuis le 1er janvier" };
  }
}

/** Resolves `period` into date_from / date_to unless the caller gave explicit dates. */
export function withPeriod<T extends { period?: Period; date_from?: string; date_to?: string }>(input: T): T {
  if (!input.period || input.date_from || input.date_to) return input;
  const { from, to } = periodRange(input.period);
  return { ...input, date_from: from.toISOString(), date_to: to.toISOString() };
}

export const parisNow = (now: Date = new Date()) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: TIMEZONE, dateStyle: "full", timeStyle: "short" }).format(now);
