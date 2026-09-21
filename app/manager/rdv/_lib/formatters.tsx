import type { ReactNode } from "react";
import { Video, MapPin, Phone, Calendar, ThumbsUp, ThumbsDown, Minus, UserX } from "lucide-react";
import type { Meeting, ConfirmationFilter, MeetingFilters } from "../_types";

export function hashColor(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  const colors = [
    "#6C63FF", "#059669", "#D97706", "#DC2626", "#2563EB",
    "#DB2777", "#7C3AED", "#0D9488", "#EA580C", "#0891B2",
  ];
  return colors[Math.abs(h) % colors.length];
}

export function contactName(c: Meeting["contact"]): string {
  if (!c) return "—";
  return `${c.firstName || ""} ${c.lastName || ""}`.trim() || "—";
}

export function meetingStatus(m: Meeting): "upcoming" | "past" | "cancelled" {
  if (m.result === "MEETING_CANCELLED") return "cancelled";
  if (!m.callbackDate) return "past";
  return new Date(m.callbackDate) >= new Date() ? "upcoming" : "past";
}

export function statusLabel(s: string): string {
  const map: Record<string, string> = { upcoming: "À venir", past: "Passé", cancelled: "Annulé" };
  return map[s] || s;
}

export function statusColor(s: string): string {
  const map: Record<string, string> = { upcoming: "var(--green)", past: "var(--blue)", cancelled: "var(--red)" };
  return map[s] || "var(--ink3)";
}

export function statusBg(s: string): string {
  const map: Record<string, string> = { upcoming: "var(--greenLight)", past: "var(--blueLight)", cancelled: "var(--redLight)" };
  return map[s] || "var(--surface2)";
}

export function confirmationLabel(s: ConfirmationFilter): string {
  const map: Record<string, string> = {
    all: "Tous",
    PENDING: "À confirmer",
    CONFIRMED: "Confirmé",
    CANCELLED: "Annulé",
  };
  return map[s] || s;
}

export function confirmationColor(s: ConfirmationFilter): string {
  if (s === "CONFIRMED") return "var(--green)";
  if (s === "CANCELLED") return "var(--red)";
  if (s === "PENDING") return "var(--amber)";
  return "var(--ink3)";
}

export function confirmationBg(s: ConfirmationFilter): string {
  if (s === "CONFIRMED") return "var(--greenLight)";
  if (s === "CANCELLED") return "var(--redLight)";
  if (s === "PENDING") return "var(--amberLight)";
  return "var(--surface2)";
}

export function meetingTypeIcon(t: string | null): ReactNode {
  switch (t) {
    case "VISIO": return <Video size={14} />;
    case "PHYSIQUE": return <MapPin size={14} />;
    case "TELEPHONIQUE": return <Phone size={14} />;
    default: return <Calendar size={14} />;
  }
}

export function meetingTypeLabel(t: string | null): string {
  switch (t) {
    case "VISIO": return "Visio";
    case "PHYSIQUE": return "Physique";
    case "TELEPHONIQUE": return "Téléphonique";
    default: return "—";
  }
}

export function categoryLabel(c: string | null): string {
  if (c === "BESOIN") return "Besoin";
  if (c === "EXPLORATOIRE") return "Exploratoire";
  return "";
}

export function categoryColor(c: string | null): string {
  if (c === "BESOIN") return "var(--green)";
  if (c === "EXPLORATOIRE") return "var(--blue)";
  return "var(--ink3)";
}

export function categoryBg(c: string | null): string {
  if (c === "BESOIN") return "var(--greenLight)";
  if (c === "EXPLORATOIRE") return "var(--blueLight)";
  return "var(--surface2)";
}

export function outcomeIcon(o: string | null): ReactNode {
  switch (o) {
    case "POSITIVE": return <ThumbsUp size={14} style={{ color: "var(--green)" }} />;
    case "NEUTRAL": return <Minus size={14} style={{ color: "var(--amber)" }} />;
    case "NEGATIVE": return <ThumbsDown size={14} style={{ color: "var(--red)" }} />;
    case "NO_SHOW": return <UserX size={14} style={{ color: "var(--ink3)" }} />;
    default: return <Minus size={14} style={{ color: "var(--ink3)", opacity: 0.3 }} />;
  }
}

export function outcomeLabel(o: string | null): string {
  switch (o) {
    case "POSITIVE": return "Positif";
    case "NEUTRAL": return "Neutre";
    case "NEGATIVE": return "Négatif";
    case "NO_SHOW": return "Absent";
    default: return "Sans retour";
  }
}

export function formatDateShort(d: string | null): { day: string; month: string; time: string } {
  if (!d) return { day: "—", month: "", time: "" };
  const date = new Date(d);
  return {
    day: date.getDate().toString(),
    month: date.toLocaleDateString("fr-FR", { month: "short" }),
    time: date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
  };
}

export function dateProximityColor(d: string | null): string {
  if (!d) return "var(--ink3)";
  const diff = new Date(d).getTime() - Date.now();
  if (diff < 0) return "var(--red)";
  if (diff < 48 * 60 * 60 * 1000) return "var(--amber)";
  return "var(--green)";
}

export function proximityLabel(d: string | null): { text: string; color: string } {
  if (!d) return { text: "—", color: "var(--ink3)" };
  const diff = new Date(d).getTime() - Date.now();
  if (diff < 0) {
    const absDiff = Math.abs(diff);
    if (absDiff < 60 * 60 * 1000) return { text: `Il y a ${Math.round(absDiff / 60000)}min`, color: "var(--red)" };
    if (absDiff < 24 * 60 * 60 * 1000) return { text: `Il y a ${Math.round(absDiff / 3600000)}h`, color: "var(--red)" };
    return { text: "Passé", color: "var(--red)" };
  }
  if (diff < 60 * 60 * 1000) return { text: `Dans ${Math.round(diff / 60000)}min`, color: "var(--amber)" };
  if (diff < 24 * 60 * 60 * 1000) return { text: `Dans ${Math.round(diff / 3600000)}h`, color: "var(--amber)" };
  if (diff < 48 * 60 * 60 * 1000) return { text: "Demain", color: "var(--amber)" };
  if (diff < 7 * 24 * 60 * 60 * 1000) return { text: `Dans ${Math.round(diff / 86400000)}j`, color: "var(--green)" };
  return { text: `Dans ${Math.round(diff / 86400000)}j`, color: "var(--ink3)" };
}

export function formatDuration(minutes: number | null): string {
  if (!minutes) return "";
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${h}h`;
}

export function transcriptToText(voipTranscript: unknown): string {
  const segments = Array.isArray(voipTranscript)
    ? voipTranscript
    : Array.isArray((voipTranscript as { segments?: unknown[] })?.segments)
      ? (voipTranscript as { segments: unknown[] }).segments
      : null;
  if (!segments) return "";
  return segments
    .map((s: unknown) => {
      const seg = s as { speaker?: string; text?: string };
      const speaker = seg?.speaker === "agent" ? "Agent" : seg?.speaker === "prospect" ? "Prospect" : "Speaker";
      const text = typeof seg?.text === "string" ? seg.text.trim() : "";
      return text ? `${speaker}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

export function generateICS(meeting: {
  callbackDate: string | null;
  duration: number | null;
  contact?: { firstName: string | null; lastName: string | null } | null;
  company?: { name: string } | null;
  meetingAddress?: string | null;
  meetingJoinUrl?: string | null;
  meetingType?: string | null;
}): string {
  const start = meeting.callbackDate ? new Date(meeting.callbackDate) : new Date();
  const dur = meeting.duration || 30;
  const end = new Date(start.getTime() + dur * 60000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  const fmtDate = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

  const contactLabel = meeting.contact
    ? `${meeting.contact.firstName || ""} ${meeting.contact.lastName || ""}`.trim()
    : "";
  const summary = `RDV${contactLabel ? ` - ${contactLabel}` : ""}${meeting.company?.name ? ` (${meeting.company.name})` : ""}`;
  const location = meeting.meetingJoinUrl || meeting.meetingAddress || "";

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CaptainProspect//RDV//FR",
    "BEGIN:VEVENT",
    `DTSTART:${fmtDate(start)}`,
    `DTEND:${fmtDate(end)}`,
    `SUMMARY:${summary}`,
    location ? `LOCATION:${location}` : "",
    `DESCRIPTION:Type: ${meeting.meetingType || "Non spécifié"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

export function downloadICS(meeting: Parameters<typeof generateICS>[0]) {
  const icsContent = generateICS(meeting);
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rdv.ics";
  a.click();
  URL.revokeObjectURL(url);
}

export function buildDateRange(
  datePreset: MeetingFilters["datePreset"],
  dateFrom: string,
  dateTo: string
): { from: string; to: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  switch (datePreset) {
    case "today": return { from: fmt(now), to: fmt(now) };
    case "7days": { const d = new Date(); d.setDate(d.getDate() - 7); return { from: fmt(d), to: fmt(now) }; }
    case "30days": {
      // Current calendar month by creation date
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: fmt(startOfMonth), to: fmt(endOfMonth) };
    }
    case "3months": { const d = new Date(); d.setMonth(d.getMonth() - 3); return { from: fmt(d), to: fmt(now) }; }
    // No bound at all: an absence backlog goes back further than 3 months,
    // and a date window would quietly hide the oldest ones.
    case "all": return { from: "", to: "" };
    case "custom": return { from: dateFrom, to: dateTo };
  }
}
