// Display helpers of the Statistiques page (fr-FR).

export function formatDuration(seconds: number): string {
    if (!seconds || seconds <= 0) return "0 min";
    if (seconds < 60) return `${Math.round(seconds)} s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    if (h === 0) return `${m} min`;
    return `${h} h ${String(m === 60 ? 0 : m).padStart(2, "0")}`.replace(/^(\d+) h 00$/, "$1 h");
}

/** 12,5 % — or an em dash when the rate is unknown. */
export function formatRate(rate: number | null, digits = 1): string {
    if (rate === null) return "—";
    return `${rate.toLocaleString("fr-FR", { maximumFractionDigits: digits })} %`;
}

export const formatInt = (n: number): string => n.toLocaleString("fr-FR");

/** "21 sept." / "21 sept. 2026" from a yyyy-MM-dd day. */
export function formatDay(day: string, withYear = false): string {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("fr-FR", {
        day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC",
    });
}

/** "21 sept. – 21 oct. 2026", or a single day. */
export function formatRangeLabel(start: string, end: string): string {
    if (start === end) return formatDay(start, true);
    const sameYear = start.slice(0, 4) === end.slice(0, 4);
    return `${formatDay(start, !sameYear)} – ${formatDay(end, true)}`;
}
