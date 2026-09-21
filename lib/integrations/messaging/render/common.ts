/**
 * Shared formatting utilities for messaging renderers.
 */

/**
 * Escapes text for Slack mrkdwn by replacing &, <, and >.
 */
export function esc(text: string): string {
  if (!text) return text;
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Normalizes whitespace and truncates text to a maximum length.
 */
export function truncate(text: string, max: number): string {
  if (!text) return text;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return normalized.substring(0, max - 1) + "…";
}

/**
 * Maps status strings to emoji badges.
 */
export function badge(status: string): string {
  switch (status.toUpperCase()) {
    case "PENDING":
      return "🟡 À confirmer";
    case "CONFIRMED":
      return "🟢 Confirmé";
    case "ABSENT":
    case "NO_SHOW":
      return "👻 Absent";
    case "STAND_BY":
      return "⏸️ Stand-by";
    case "CANCELLED":
      return "🔴 Annulé";
    case "RESOLVED":
      return "✅ Résolu";
    case "REOPENED":
      return "🔄 Réouvert";
    default:
      return "⚪ " + status;
  }
}

/**
 * Formats a date to 'dd/MM/yyyy HH:mm' in the Europe/Paris timezone, fr-FR locale.
 */
export function fmtDateParis(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
      .format(d)
      .replace(",", "");
  } catch (e) {
    return null;
  }
}

/**
 * Builds an absolute URL from NEXT_PUBLIC_APP_URL.
 */
export function deepLink(path: string): string | null {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) return null;
  // Ensure we don't double up slashes
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const cleanPath = path.replace(/^\/+/, "");
  return `${cleanBase}/${cleanPath}`;
}

/**
 * Returns a severity color based on the severity level.
 * 0 = green, 1 = blue, 2 = orange, 3 = red.
 */
export function severityColor(severity: number): string {
  switch (severity) {
    case 0:
      return "#36a64f";
    case 1:
      return "#2196f3";
    case 2:
      return "#ff9800";
    case 3:
      return "#f44336";
    default:
      return "#2196f3";
  }
}
