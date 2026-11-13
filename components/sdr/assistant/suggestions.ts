import { BellRing, CalendarClock, CircleHelp, ListChecks, Mail, Phone, CalendarRange, type LucideIcon } from "lucide-react";

/**
 * Tone of the icon chip. Mapped to brand roles in the panel:
 * callback = the CRM's callback amber (Rappels, callback alert), call = primary
 * (structure, the call itself), day = accent (the AI summary), neutral = grey.
 */
export type SuggestionTone = "callback" | "call" | "day" | "neutral";

export interface Suggestion {
    id: string;
    /** Button label: short, what the SDR wants. */
    label: string;
    /** What is sent to the assistant. */
    prompt: string;
    icon: LucideIcon;
    tone: SuggestionTone;
}

/** The three starting actions, in the order of an SDR's morning. */
export const PRIMARY_SUGGESTIONS: Suggestion[] = [
    {
        id: "follow-ups",
        label: "Prospects en attente de relance",
        prompt: "Quels prospects attendent une relance de ma part ? Commence par les rappels en retard.",
        icon: BellRing,
        tone: "callback",
    },
    {
        id: "next-call",
        label: "Préparer mon prochain appel",
        prompt: "Prépare mon prochain appel : qui est le prospect, pourquoi l'appeler maintenant, l'accroche et les questions à poser.",
        icon: Phone,
        tone: "call",
    },
    {
        id: "today",
        label: "Bilan du jour et prochaines actions",
        prompt: "Fais le bilan de mes actions d'aujourd'hui et dis-moi quelles sont les prochaines actions à mener.",
        icon: ListChecks,
        tone: "day",
    },
];

/** Revealed by « Plus d'idées ». Every one maps to a capability the tools have. */
export const MORE_SUGGESTIONS: Suggestion[] = [
    {
        id: "week",
        label: "Mes rappels des 7 prochains jours",
        prompt: "Quels rappels ai-je dans les 7 prochains jours ?",
        icon: CalendarRange,
        tone: "callback",
    },
    {
        id: "reschedule",
        label: "Reporter mon rappel le plus en retard",
        prompt: "Reporte mon rappel le plus en retard à demain 10h.",
        icon: CalendarClock,
        tone: "callback",
    },
    {
        id: "mails",
        label: "Mails promis à envoyer",
        prompt: "Fais le bilan de ma journée : quels prospects attendent un mail que je leur ai promis ?",
        icon: Mail,
        tone: "day",
    },
    {
        id: "help",
        label: "Ce que l'assistant peut faire",
        prompt: "Que peux-tu faire pour moi ?",
        icon: CircleHelp,
        tone: "neutral",
    },
];
