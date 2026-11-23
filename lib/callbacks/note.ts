import { formatParisDateTime } from "@/lib/utils/parseDateFromNote";

// The "(Rappel programmé: 23/11/2026 09:00)" suffix kept on callback notes so the
// note and Action.callbackDate never disagree. Written in Europe/Paris whatever
// the server timezone, and replaced (not appended) when the callback moves.

const NOTE_MAX = 500;
const SCHEDULED_RE = /\s*\(?Rappel programmé[^:()]*:\s*[\d/.-]+[ ,]+\d{1,2}[:h]\d{2}\)?\s*$/i;

export function stripScheduledText(note: string | null | undefined): string {
    return (note ?? "").replace(SCHEDULED_RE, "").trim();
}

export function withScheduledText(note: string | null | undefined, date: Date, isDefault = false): string {
    const text = `Rappel programmé${isDefault ? " par défaut" : ""}: ${formatParisDateTime(date)}`;
    const base = stripScheduledText(note);
    if (!base) return text;
    const room = NOTE_MAX - text.length - 3;
    return `${base.slice(0, Math.max(0, room))} (${text})`;
}
