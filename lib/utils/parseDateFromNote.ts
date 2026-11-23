import { DateTime } from 'luxon';

/**
 * Parse callback date from SDR note
 * Supports formats:
 * - "Rappeler le 30/01/2026"
 * - "Rappel 30-01-2026"
 * - "30/01/2026"
 * - "30.01.2026"
 * - "2026-01-30"
 * - "Rappeler lundi" (future: days of week)
 * - "Rappeler demain"
 */

const NOTE_TIMEZONE = 'Europe/Paris';
const DEFAULT_HOUR = 9;

/** A match is ignored when the words just before it negate it ("pas demain", "sauf lundi"). */
function isNegated(text: string, index: number): boolean {
    const before = text.slice(Math.max(0, index - 12), index);
    return /(?:\bpas|\bsauf|\bni|\bnot|\bexcept)\s+(?:le\s+|ce\s+|this\s+)?$/.test(before);
}

/** Optional "à 14h" / "14h30" / "14:30" right after a date. */
function timeAfter(text: string, from: number): { hour: number; minute: number } | null {
    const m = text.slice(from, from + 14).match(/^\s*(?:à|a|vers|at)?\s*(\d{1,2})\s*(?:h|:)\s*(\d{2})?/);
    if (!m) return null;
    const hour = parseInt(m[1], 10);
    const minute = m[2] ? parseInt(m[2], 10) : 0;
    if (hour > 23 || minute > 59) return null;
    return { hour, minute };
}

function atParis(year: number, month: number, day: number, time: { hour: number; minute: number } | null): DateTime | null {
    const dt = DateTime.fromObject(
        { year, month, day, hour: time?.hour ?? DEFAULT_HOUR, minute: time?.minute ?? 0 },
        { zone: NOTE_TIMEZONE },
    );
    // Rejects 31/02 and friends instead of rolling over to March.
    return dt.isValid && dt.day === day && dt.month === month ? dt : null;
}

/**
 * Parse a callback date from an SDR note, in Europe/Paris (the server runs on UTC).
 * Supports "30/01/2027", "30-01-2027", "30.01.2027", "2027-01-30", "30/01" (next
 * occurrence), "demain", "après-demain", "dans 3 jours", "dans 2 semaines" and
 * weekdays ("lundi"). An optional time ("à 14h30") is honoured, else 09:00.
 * Negated mentions ("pas demain, rappeler lundi") are skipped; among the rest the
 * first mention wins. Dates in the past are ignored.
 */
export function parseDateFromNote(note: string | null | undefined, now: Date = new Date()): Date | null {
    if (!note || !note.trim()) {
        return null;
    }

    const text = note.toLowerCase();
    const today = DateTime.fromJSDate(now).setZone(NOTE_TIMEZONE);
    const candidates: Array<{ index: number; date: DateTime }> = [];
    const push = (index: number, date: DateTime | null) => {
        if (date && date.toMillis() > now.getTime() && !isNegated(text, index)) candidates.push({ index, date });
    };

    for (const m of text.matchAll(/\b(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\b/g)) {
        push(m.index!, atParis(+m[1], +m[2], +m[3], timeAfter(text, m.index! + m[0].length)));
    }
    // 4-digit year with / . -, 2-digit year only with "/" — never inside a phone
    // number such as 06.12.34.56.78.
    for (const m of text.matchAll(/(?<![\d.\/-])(?:(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})|(\d{1,2})\/(\d{1,2})\/(\d{2}))(?![\d.\/-]*\d)/g)) {
        if (m[4]) {
            push(m.index!, atParis(2000 + +m[6], +m[5], +m[4], timeAfter(text, m.index! + m[0].length)));
            continue;
        }
        push(m.index!, atParis(+m[3], +m[2], +m[1], timeAfter(text, m.index! + m[0].length)));
    }
    // "le 30/01" without a year: the next 30/01 to come.
    for (const m of text.matchAll(/(?<![\d.\/-])(\d{1,2})\/(\d{1,2})(?![\d.\/-]*\d)/g)) {
        const time = timeAfter(text, m.index! + m[0].length);
        let date = atParis(today.year, +m[2], +m[1], time);
        if (date && date.toMillis() <= now.getTime()) date = atParis(today.year + 1, +m[2], +m[1], time);
        push(m.index!, date);
    }

    const relative = (index: number, days: number, length: number) => {
        const d = today.plus({ days });
        push(index, atParis(d.year, d.month, d.day, timeAfter(text, index + length)));
    };
    for (const m of text.matchAll(/apr[eè]s[- ]demain|day after tomorrow/g)) relative(m.index!, 2, m[0].length);
    for (const m of text.matchAll(/(?<!apr[eè]s[- ])\bdemain\b|\btomorrow\b/g)) relative(m.index!, 1, m[0].length);
    for (const m of text.matchAll(/dans (\d+) jours?|in (\d+) days?/g)) relative(m.index!, parseInt(m[1] || m[2], 10), m[0].length);
    for (const m of text.matchAll(/dans (\d+) semaines?|in (\d+) weeks?/g)) relative(m.index!, 7 * parseInt(m[1] || m[2], 10), m[0].length);

    const daysOfWeek: Record<string, number> = {
        lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 7,
        monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7,
    };
    for (const m of text.matchAll(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g)) {
        let daysUntil = daysOfWeek[m[1]] - today.weekday;
        if (daysUntil <= 0) daysUntil += 7;
        relative(m.index!, daysUntil, m[0].length);
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.index - b.index);
    return candidates[0].date.toJSDate();
}

/** Next working day (Mon–Fri) at 09:00 Europe/Paris: the default when no date is given. */
export function defaultCallbackDate(now: Date = new Date()): Date {
    let d = DateTime.fromJSDate(now).setZone(NOTE_TIMEZONE).plus({ days: 1 });
    while (d.weekday > 5) d = d.plus({ days: 1 });
    return d.set({ hour: DEFAULT_HOUR, minute: 0, second: 0, millisecond: 0 }).toJSDate();
}

/** "23/11/2026 09:00" in Europe/Paris, whatever the server timezone. */
export function formatParisDateTime(date: Date): string {
    return DateTime.fromJSDate(date).setZone(NOTE_TIMEZONE).toFormat('dd/MM/yyyy HH:mm');
}

/**
 * Format callback date for display (date only)
 */
export function formatCallbackDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const callbackDay = new Date(d);
    callbackDay.setHours(0, 0, 0, 0);

    if (callbackDay.getTime() === today.getTime()) {
        return "Aujourd'hui";
    } else if (callbackDay.getTime() === tomorrow.getTime()) {
        return "Demain";
    } else {
        return d.toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
        });
    }
}

/**
 * Format callback date and time for display.
 * callbackDate is stored in UTC; this converts to user's local timezone.
 */
export function formatCallbackDateTime(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString('fr-FR', {
        dateStyle: 'short',
        timeStyle: 'short',
        hour12: false,
    });
}
