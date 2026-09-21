import type { Meeting, RdvStatus } from "../_types";

/**
 * An absence still to deal with: flagged NO_SHOW and not yet closed. Once the
 * RDV has been replaced it is cancelled with the "replaced" reason, and it
 * drops off the absence boards instead of sitting there for good.
 *
 * A manager can also park one ("absent en stand by") from /manager/rdv-absences:
 * it stays recorded, but it is not the SDR's problem today, so it leaves here too.
 */
export function isOpenNoShow(m: Meeting): boolean {
    return (
        m.meetingFeedback?.outcome === "NO_SHOW"
        && !m.meetingFeedback.standByAt
        && m.result !== "MEETING_CANCELLED"
    );
}

/**
 * Bookings made through a client calendar carry a machine-written note
 * ("RDV planifié via calendrier (X)", historically followed by an empty JSON
 * dump). It says nothing to whoever reads the card, so it is hidden here the
 * same way it already is in the client and commercial portals.
 */
const BOOKING_TRACE_NOTE = /^RDV planifié via calendrier[\s\S]*$/;

export function getDisplayNote(m: Meeting): string | null {
    const note = m.note?.trim();
    if (!note || BOOKING_TRACE_NOTE.test(note)) return null;
    return note;
}

export function getRdvStatus(m: Meeting): RdvStatus {
    if (m.result === "MEETING_CANCELLED") return "cancelled";
    if (!m.callbackDate) return "upcoming";
    return new Date(m.callbackDate) > new Date() ? "upcoming" : "past";
}

export function getMeetingDisplayDate(m: Meeting): Date | null {
    return m.callbackDate ? new Date(m.callbackDate) : null;
}

/**
 * Format a Date for an <input type="datetime-local">, which expects a LOCAL
 * wall-clock string ("YYYY-MM-DDTHH:mm"). Using toISOString().slice(0,16) here
 * emits a UTC string that the input then re-reads as local time, silently
 * shifting the stored RDV by the browser's UTC offset on every open + save.
 */
export function toLocalDatetimeInput(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function getInitials(m: Meeting): string {
    const f = m.contact.firstName?.[0] ?? "";
    const l = m.contact.lastName?.[0] ?? "";
    return (f + l).toUpperCase() || "?";
}

export const AVATAR_COLORS = ["#6366f1", "#8b5cf6", "#059669", "#d97706", "#0ea5e9", "#ec4899", "#64748b"];

export function getAvatarColor(m: Meeting): string {
    let h = 0;
    for (let i = 0; i < m.id.length; i++) h = ((h << 5) - h) + m.id.charCodeAt(i);
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function formatScheduledDate(meeting: Meeting): string {
    if (!meeting.callbackDate) return "Date à confirmer";
    return new Date(meeting.callbackDate).toLocaleDateString("fr-FR", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export const formatCardTime = (d: Date) =>
    d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export const formatCardMonth = (d: Date) =>
    d.toLocaleDateString("fr-FR", { month: "short" }).toUpperCase().replace(".", "");
