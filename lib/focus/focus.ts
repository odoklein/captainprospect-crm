// ============================================
// FOCUS MODE — pure helpers (callback presets, disposition hotkeys, session
// counters). No I/O: safe on the client, unit-tested.
// ============================================

import { DateTime } from "luxon";

export const FOCUS_TZ = "Europe/Paris";

export interface CallbackPreset {
    id: string;
    label: string;
    /** ISO instant. */
    at: string;
}

function nextWorkingDay(d: DateTime): DateTime {
    let n = d.plus({ days: 1 });
    while (n.weekday > 5) n = n.plus({ days: 1 });
    return n;
}

function at(d: DateTime, hour: number, minute = 0): DateTime {
    return d.set({ hour, minute, second: 0, millisecond: 0 });
}

/**
 * One-click callback times, in Paris time, always in the future and on
 * working days: « Dans 2 h », « Ce soir 17:30 », « Demain 9:00 »,
 * « Demain 14:00 », « Dans une semaine ».
 */
export function callbackPresets(now: Date = new Date()): CallbackPreset[] {
    const local = DateTime.fromJSDate(now, { zone: FOCUS_TZ });
    const out: CallbackPreset[] = [];

    // Rounded up to the next quarter hour.
    const in2h = local.plus({ hours: 2 }).set({ second: 0, millisecond: 0 });
    const rounded = in2h.plus({ minutes: (15 - (in2h.minute % 15)) % 15 });
    if (rounded.hour < 19 && rounded.weekday <= 5) out.push({ id: "in2h", label: `Dans 2 h (${rounded.toFormat("HH:mm")})`, at: rounded.toISO()! });

    const evening = at(local, 17, 30);
    if (local.weekday <= 5 && local < evening.minus({ hours: 1 })) out.push({ id: "evening", label: "Ce soir 17:30", at: evening.toISO()! });

    const nextDay = nextWorkingDay(local);
    const dayLabel = nextDay.diff(local.startOf("day"), "days").days < 2 ? "Demain" : nextDay.setLocale("fr").toFormat("cccc");
    const cap = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);
    out.push({ id: "next9", label: `${cap} 9:00`, at: at(nextDay, 9).toISO()! });
    out.push({ id: "next14", label: `${cap} 14:00`, at: at(nextDay, 14).toISO()! });

    let week = at(local.plus({ weeks: 1 }), 9);
    while (week.weekday > 5) week = week.plus({ days: 1 });
    out.push({ id: "week", label: `Dans une semaine (${week.setLocale("fr").toFormat("ccc d")})`, at: week.toISO()! });

    return out;
}

/** "2026-11-07T14:30" (datetime-local, Paris) → ISO instant; null if invalid or past. */
export function parseLocalCallback(value: string, now: Date = new Date()): string | null {
    const d = DateTime.fromISO(value, { zone: FOCUS_TZ });
    if (!d.isValid || d.toJSDate() <= now) return null;
    return d.toISO();
}

export interface DispositionLike {
    code: string;
    sortOrder: number;
}

/** Statuses in the order shown, the first nine bound to keys 1–9. */
export function dispositionKeys<T extends DispositionLike>(statuses: T[]): { status: T; key: string | null }[] {
    return [...statuses]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((status, i) => ({ status, key: i < 9 ? String(i + 1) : null }));
}

export interface SessionStats {
    dials: number;
    connected: number;
    saved: number;
    meetings: number;
    skipped: number;
}

export const EMPTY_STATS: SessionStats = { dials: 0, connected: 0, saved: 0, meetings: 0, skipped: 0 };

/** Share of dialled calls that reached a person, as a whole percent; null before the first dial. */
export function connectRate(s: SessionStats): number | null {
    return s.dials > 0 ? Math.round((s.connected / s.dials) * 100) : null;
}

/** True when a keyboard event comes from somewhere the user types text. */
export function isTypingTarget(el: EventTarget | null): boolean {
    const node = el as HTMLElement | null;
    if (!node || typeof node.tagName !== "string") return false;
    return node.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(node.tagName);
}

// ── launch screen ──────────────────────────────────────────────────────────

export interface QueueRowSummaryLike {
    priority: string;
    lastAction?: { callbackDate?: string | null } | null;
}

export interface QueueSummary {
    total: number;
    /** Prospects who missed their meeting: to call back first. */
    absent: number;
    /** Callbacks planned for today or already late. */
    callbacksDue: number;
    /** Callbacks planned later (they come up on their day). */
    callbacksLater: number;
    /** Never contacted. */
    fresh: number;
    /** Follow-ups and new attempts. */
    retries: number;
}

/** What a session on this mission's queue holds, by the queue's own priorities. */
export function queueSummary(rows: QueueRowSummaryLike[], now: Date = new Date()): QueueSummary {
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    const s: QueueSummary = { total: rows.length, absent: 0, callbacksDue: 0, callbacksLater: 0, fresh: 0, retries: 0 };
    for (const r of rows) {
        if (r.priority === "ABSENT_RDV") s.absent++;
        else if (r.priority === "CALLBACK") {
            const at = r.lastAction?.callbackDate ? new Date(r.lastAction.callbackDate).getTime() : NaN;
            if (Number.isFinite(at) && at >= endOfDay) s.callbacksLater++;
            else s.callbacksDue++;
        } else if (r.priority === "NEW") s.fresh++;
        else s.retries++;
    }
    return s;
}
