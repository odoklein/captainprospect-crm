// ============================================
// SDR queue — how a row reads. Pure: no React, no libphonenumber (too heavy for
// the client), safe to unit-test. Used by the Appeler table and Mode Focus.
// ============================================

export type PhoneDisplay = {
    /** What the SDR reads: "06 12 34 56 78", "02 32 74 10 00", or the number as typed. */
    text: string;
    /** French 06 / 07 line. */
    mobile: boolean;
};

/**
 * One way to read every French number, whatever was imported:
 * "+33612345678", "0033 6 12…", "+33 (0)6…", "+330232741000" (a common import typo)
 * and "33612345678" all read "06 12 34 56 78". Foreign or odd numbers are kept as typed.
 */
export function displayPhone(raw: string | null | undefined): PhoneDisplay | null {
    const typed = (raw ?? "").trim();
    if (!typed) return null;
    let digits = typed.replace(/\(0\)/g, "").replace(/[^\d+]/g, "");
    if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
    if (/^33\d{9}$/.test(digits)) digits = `+${digits}`;

    let national: string | null = null;
    const intl = /^\+330?(\d{9})$/.exec(digits);
    if (intl) national = `0${intl[1]}`;
    else if (/^0\d{9}$/.test(digits)) national = digits;

    if (!national || national[1] === "0") return { text: typed, mobile: false };
    const text = national.replace(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4 $5");
    return { text, mobile: national[1] === "6" || national[1] === "7" };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): number {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole calendar days from `now` to `then` (negative in the past). */
export function dayDelta(then: Date, now: Date): number {
    return Math.round((startOfDay(then) - startOfDay(now)) / DAY_MS);
}

const TIME = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const SHORT_DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const WEEKDAY = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });

/** "aujourd'hui", "hier", "il y a 4 j", "12 oct." — when something happened. */
export function relativeDay(iso: string | null | undefined, now: Date = new Date()): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const delta = dayDelta(d, now);
    if (delta >= 0) return "aujourd'hui";
    if (delta === -1) return "hier";
    if (delta > -7) return `il y a ${-delta} j`;
    return SHORT_DATE.format(d);
}

export type NextStepTone = "overdue" | "today" | "soon" | "later";

export type NextStep = {
    /** "En retard · 2 j", "Aujourd'hui 14:30", "Demain 09:00", "Jeu. 09:00", "12 nov." */
    label: string;
    tone: NextStepTone;
    /** Full date and time, for the title attribute. */
    full: string;
};

/** A planned callback, read relative to now. */
export function nextStep(iso: string | null | undefined, now: Date = new Date()): NextStep | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const full = d.toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
    const delta = dayDelta(d, now);
    const time = TIME.format(d);
    if (d.getTime() < now.getTime()) {
        if (delta === 0) return { label: `En retard · ${time}`, tone: "overdue", full };
        return { label: `En retard · ${-delta} j`, tone: "overdue", full };
    }
    if (delta === 0) return { label: `Aujourd'hui ${time}`, tone: "today", full };
    if (delta === 1) return { label: `Demain ${time}`, tone: "soon", full };
    if (delta < 7) {
        const day = WEEKDAY.format(d).replace(/\.$/, "");
        return { label: `${day.charAt(0).toUpperCase()}${day.slice(1)}. ${time}`, tone: delta <= 3 ? "soon" : "later", full };
    }
    return { label: SHORT_DATE.format(d), tone: "later", full };
}

/** Two letters for an avatar: "Julie Martin" → "JM", "Acme" → "AC". */
export function rowInitials(first?: string | null, last?: string | null, fallback?: string | null): string {
    const f = first?.trim() ?? "";
    const l = last?.trim() ?? "";
    if (f || l) return `${f[0] ?? ""}${l[0] ?? ""}`.toUpperCase() || "?";
    const words = (fallback ?? "").trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
    return (words[0]?.slice(0, 2) ?? "?").toUpperCase();
}
