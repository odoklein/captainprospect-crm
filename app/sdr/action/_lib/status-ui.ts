import {
    Ban,
    Building2,
    Calendar,
    Clock,
    Linkedin,
    Mail,
    MessageSquare,
    PhoneOff,
    RotateCcw,
    Send,
    Sparkles,
    XCircle,
    type LucideIcon,
} from "lucide-react";
import { ACTION_RESULT_LABELS } from "@/lib/types";
import type { StatusDefinition } from "./types";

// ============================================
// One place that decides how an outcome looks (tone, icon, label).
// Every badge, chip and quick button on the page reads from here, so a status
// can no longer be violet in one column and indigo in the next.
// ============================================

export type OutcomeTone = "meeting" | "positive" | "callback" | "info" | "negative" | "neutral";

const CODE_TONES: Record<string, OutcomeTone> = {
    MEETING_BOOKED: "meeting",
    INTERESTED: "positive",
    PROJET_A_SUIVRE: "positive",
    REPLIED: "positive",
    CALLBACK_REQUESTED: "callback",
    RAPPEL: "callback",
    RELANCE: "callback",
    ENVOIE_MAIL: "info",
    MAIL_ENVOYE: "info",
    MAIL_DOC: "info",
    MAIL_UNIQUEMENT: "info",
    CONNECTION_SENT: "info",
    MESSAGE_SENT: "info",
    NO_RESPONSE: "neutral",
    BARRAGE_STANDARD: "neutral",
    BARRAGE_SECRETAIRE: "neutral",
    BAD_CONTACT: "negative",
    NUMERO_KO: "negative",
    FAUX_NUMERO: "negative",
    INVALIDE: "negative",
    MAUVAIS_INTERLOCUTEUR: "negative",
    GERE_PAR_SIEGE: "negative",
    HORS_CIBLE: "negative",
    NOT_INTERESTED: "negative",
    REFUS: "negative",
    REFUS_ARGU: "negative",
    REFUS_CATEGORIQUE: "negative",
    DISQUALIFIED: "negative",
    MEETING_CANCELLED: "negative",
};

export function toneForStatus(code: string | null | undefined, def?: StatusDefinition | null): OutcomeTone {
    if (!code) return "neutral";
    const known = CODE_TONES[code];
    if (known) return known;
    // Mission-specific codes: infer from what the status does.
    if (def?.triggersCallback) return "callback";
    if (def?.triggersExclusion) return "negative";
    if (def?.priorityLabel === "FOLLOW_UP") return "positive";
    return "neutral";
}

export const TONE_STYLES: Record<OutcomeTone, {
    /** Soft badge (table cells, history). */
    badge: string;
    /** Small status dot. */
    dot: string;
    /** Hover/active treatment for quick-outcome buttons. */
    button: string;
    /** Left accent for highlighted rows. */
    accent: string;
}> = {
    meeting: {
        badge: "bg-cp-green text-white border-cp-green",
        dot: "bg-cp-green",
        button: "hover:bg-cp-green hover:text-white hover:border-cp-green",
        accent: "border-l-cp-green",
    },
    positive: {
        badge: "bg-cp-green-soft text-cp-green border-cp-green/20",
        dot: "bg-cp-green",
        button: "hover:bg-cp-green-soft hover:text-cp-green hover:border-cp-green/40",
        accent: "border-l-cp-green",
    },
    callback: {
        badge: "bg-cp-warn-soft text-cp-warn border-cp-warn/20",
        dot: "bg-cp-warn",
        button: "hover:bg-cp-warn-soft hover:text-cp-warn hover:border-cp-warn/40",
        accent: "border-l-cp-warn",
    },
    info: {
        badge: "bg-cp-info-soft text-cp-info border-cp-info/20",
        dot: "bg-cp-info",
        button: "hover:bg-cp-info-soft hover:text-cp-info hover:border-cp-info/40",
        accent: "border-l-cp-info",
    },
    negative: {
        badge: "bg-cp-danger-soft text-cp-danger border-cp-danger/20",
        dot: "bg-cp-danger",
        button: "hover:bg-cp-danger-soft hover:text-cp-danger hover:border-cp-danger/40",
        accent: "border-l-cp-danger",
    },
    neutral: {
        badge: "bg-cp-neutral-soft text-cp-ink-2 border-cp-border",
        dot: "bg-cp-ink-3",
        button: "hover:bg-cp-neutral-soft hover:text-cp-ink hover:border-cp-border-strong",
        accent: "border-l-cp-border-strong",
    },
};

const RESULT_ICONS: Record<string, LucideIcon> = {
    NO_RESPONSE: XCircle,
    BAD_CONTACT: Ban,
    INTERESTED: Sparkles,
    CALLBACK_REQUESTED: Clock,
    MEETING_BOOKED: Calendar,
    MEETING_CANCELLED: XCircle,
    DISQUALIFIED: XCircle,
    ENVOIE_MAIL: Mail,
    MAIL_ENVOYE: Send,
    BARRAGE_STANDARD: PhoneOff,
    BARRAGE_SECRETAIRE: PhoneOff,
    NUMERO_KO: PhoneOff,
    FAUX_NUMERO: PhoneOff,
    INVALIDE: Ban,
    REFUS: XCircle,
    REFUS_ARGU: XCircle,
    REFUS_CATEGORIQUE: XCircle,
    RELANCE: RotateCcw,
    RAPPEL: Clock,
    PROJET_A_SUIVRE: Sparkles,
    MAUVAIS_INTERLOCUTEUR: Ban,
    MAIL_UNIQUEMENT: Mail,
    MAIL_DOC: Mail,
    HORS_CIBLE: Ban,
    GERE_PAR_SIEGE: Building2,
    NOT_INTERESTED: XCircle,
    CONNECTION_SENT: Linkedin,
    MESSAGE_SENT: Send,
    REPLIED: MessageSquare,
};

export function iconForResult(code: string | null | undefined): LucideIcon {
    return (code && RESULT_ICONS[code]) || XCircle;
}

/** Hover hints that disambiguate look-alike statuses. */
export const STATUS_HINTS: Record<string, string> = {
    RELANCE: "Rappel demandé — le prospect attend ton appel (signal d'intérêt)",
    RAPPEL: "Rappel logistique — le prospect n'a pas encore été joint",
};

/** Used only when /api/config/action-statuses is unavailable. */
export const FALLBACK_STATUSES: StatusDefinition[] = [
    { code: "NO_RESPONSE", label: ACTION_RESULT_LABELS.NO_RESPONSE, requiresNote: false },
    { code: "BAD_CONTACT", label: "Mauvais contact", requiresNote: false },
    { code: "INTERESTED", label: ACTION_RESULT_LABELS.INTERESTED, requiresNote: true },
    { code: "CALLBACK_REQUESTED", label: ACTION_RESULT_LABELS.CALLBACK_REQUESTED, requiresNote: true, triggersCallback: true },
    { code: "MEETING_BOOKED", label: "RDV pris", requiresNote: false },
    { code: "DISQUALIFIED", label: ACTION_RESULT_LABELS.DISQUALIFIED, requiresNote: false },
    { code: "ENVOIE_MAIL", label: ACTION_RESULT_LABELS.ENVOIE_MAIL, requiresNote: true },
    { code: "MAIL_ENVOYE", label: ACTION_RESULT_LABELS.MAIL_ENVOYE, requiresNote: false },
];

const DEFAULT_CALLBACK_CODES = ["CALLBACK_REQUESTED", "RAPPEL", "RELANCE"];

/** Mirrors buildCallbackResultCodes in app/api/sdr/action-queue/route.ts. */
export function buildCallbackCodes(statuses: StatusDefinition[]): Set<string> {
    const configured = statuses
        .filter((s) => {
            if (s.triggersCallback === true) return true;
            const haystack = `${s.code} ${s.label}`.toUpperCase();
            return haystack.includes("RAPPEL") || haystack.includes("RELANCE");
        })
        .map((s) => s.code);
    return new Set<string>([...DEFAULT_CALLBACK_CODES, ...configured]);
}

export function statusRequiresNote(code: string, statuses: StatusDefinition[]): boolean {
    const def = statuses.find((s) => s.code === code);
    if (def) return def.requiresNote;
    return ["INTERESTED", "CALLBACK_REQUESTED", "ENVOIE_MAIL"].includes(code);
}

export function labelForStatus(code: string, labels: Record<string, string>): string {
    return labels[code] ?? ACTION_RESULT_LABELS[code] ?? code;
}
