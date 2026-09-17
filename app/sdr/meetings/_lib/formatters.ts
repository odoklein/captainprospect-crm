import type { Meeting, RdvStatus } from "../_types";

/**
 * An absence still to deal with: flagged NO_SHOW and not yet closed. Once the
 * RDV has been replaced it is cancelled with the "replaced" reason, and it
 * drops off the absence boards instead of sitting there for good.
 */
export function isOpenNoShow(m: Meeting): boolean {
    return m.meetingFeedback?.outcome === "NO_SHOW" && m.result !== "MEETING_CANCELLED";
}

export function getRdvStatus(m: Meeting): RdvStatus {
    if (m.result === "MEETING_CANCELLED") return "cancelled";
    if (!m.callbackDate) return "upcoming";
    return new Date(m.callbackDate) > new Date() ? "upcoming" : "past";
}

export function getMeetingDisplayDate(m: Meeting): Date | null {
    return m.callbackDate ? new Date(m.callbackDate) : null;
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
