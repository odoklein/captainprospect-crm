// Formatting + link helpers shared by the Email Hub pages I own
// (Vue d'ensemble, Envoyés, Analytics). French, Europe/Paris.

const TZ = "Europe/Paris";

export const formatInt = (n: number | null | undefined) => (n ?? 0).toLocaleString("fr-FR");

/** 12.3 → "12,3 %"; null → "—". */
export const formatPercent = (n: number | null | undefined) =>
    n === null || n === undefined ? "—" : `${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;

const dayKey = (d: Date) => d.toLocaleDateString("fr-CA", { timeZone: TZ });

/** "14:32" today, "hier 14:32", "12 oct." this year, "12 oct. 2025" otherwise. */
export function formatWhen(iso: string | null | undefined): string {
    if (!iso) return "—";
    const d = new Date(iso);
    const now = new Date();
    const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
    if (dayKey(d) === dayKey(now)) return time;
    if (dayKey(d) === dayKey(new Date(now.getTime() - 86_400_000))) return `hier ${time}`;
    const sameYear = d.toLocaleDateString("fr-FR", { year: "numeric", timeZone: TZ }) === now.toLocaleDateString("fr-FR", { year: "numeric", timeZone: TZ });
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: TZ });
}

/** "12 oct. 2026, 14:32". */
export function formatDateTime(iso: string | null | undefined): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

/** "il y a 5 min", "il y a 3 h", "il y a 2 j" — for sync freshness. */
export function formatAgo(iso: string | null | undefined): string {
    if (!iso) return "jamais";
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
    if (min < 1) return "à l'instant";
    if (min < 60) return `il y a ${min} min`;
    const h = Math.round(min / 60);
    if (h < 48) return `il y a ${h} h`;
    return `il y a ${Math.round(h / 24)} j`;
}

/** Minutes → "45 min", "3 h 20", "2 j 4 h". */
export function formatDuration(minutes: number | null | undefined): string {
    if (minutes === null || minutes === undefined) return "—";
    if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
    const h = Math.floor(minutes / 60);
    if (h < 24) {
        const m = Math.round(minutes - h * 60);
        return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
    }
    const d = Math.floor(h / 24);
    const rh = h - d * 24;
    return rh ? `${d} j ${rh} h` : `${d} j`;
}

/** yyyy-MM-dd → "12 oct.". */
export function formatDayLabel(day: string): string {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
}

export interface ContactLinkable {
    id: string;
    companyId?: string | null;
    listId?: string | null;
}

/** Where a contact opens: the manager's list drawer, or the SDR contact page. */
export function contactHref(c: ContactLinkable | null | undefined, scope: "manager" | "sdr" = "manager"): string | null {
    if (!c) return null;
    if (scope === "sdr") return `/sdr/contacts/${c.id}`;
    if (c.listId && c.companyId) return `/manager/lists/${c.listId}?contactId=${c.id}&companyId=${c.companyId}`;
    return null;
}

export const inboxThreadHref = (threadId: string, scope: "manager" | "sdr" = "manager") =>
    `/${scope === "manager" ? "manager" : "sdr"}/emails/inbox?thread=${threadId}`;

export const PROVIDER_LABEL: Record<string, string> = {
    GMAIL: "Gmail",
    OUTLOOK: "Outlook",
    CUSTOM: "IMAP",
    REACHINBOX: "ReachInbox",
};
