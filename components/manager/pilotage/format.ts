// Number formats of the Salle de pilotage, French style (« 4,4 % », « 1 284 »).

export function pct(value: number | null | undefined, digits = 0): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return "—";
    return `${(value * 100).toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
}

/** One decimal under 10 %, none above: « 4,4 % », « 28 % ». */
export function rate(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return "—";
    return pct(value, value < 0.1 ? 1 : 0);
}

export function num(value: number, digits = 0): string {
    return value.toLocaleString("fr-FR", { maximumFractionDigits: digits });
}

/** Signed points: « +4 pts », « −3 pts ». */
export function points(delta: number): string {
    const p = Math.round(delta * 100);
    return `${p >= 0 ? "+" : "−"}${Math.abs(p)} pts`;
}

const dayMonthFr = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const longDayFr = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** "2026-11-02" → « 2 nov. » */
export function shortDay(key: string): string {
    return dayMonthFr.format(new Date(`${key}T00:00:00Z`));
}

/** "2026-11-27" → « Vendredi 27 novembre » */
export function longDay(key: string): string {
    const s = longDayFr.format(new Date(`${key}T00:00:00Z`));
    return s.charAt(0).toUpperCase() + s.slice(1);
}

export function hourLabel(hour: number): string {
    return `${hour}h`;
}

export function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] ?? "")).toUpperCase();
}
