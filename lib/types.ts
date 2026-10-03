// User roles in the system
import { brand } from "@/lib/brand";
export type UserRole =
    | "SDR"
    | "BOOKER"
    | "MANAGER"
    | "CLIENT"
    | "DEVELOPER"
    | "BUSINESS_DEVELOPER";

// Communication channels
export type Channel = "CALL" | "EMAIL" | "LINKEDIN";

// List source types
export type ListType = "SUZALI" | "CLIENT" | "MIXED";

// Contact/Company completeness
export type CompletenessStatus = "INCOMPLETE" | "PARTIAL" | "ACTIONABLE";

// SDR action results (PRD Section 7)
export type ActionResult =
    | "NO_RESPONSE"
    | "BAD_CONTACT"
    | "BARRAGE_STANDARD"
    | "NUMERO_KO"
    | "INTERESTED"
    | "CALLBACK_REQUESTED"
    | "MEETING_BOOKED"
    | "MEETING_CANCELLED"
    | "INVALIDE"
    | "DISQUALIFIED"
    | "ENVOIE_MAIL"
    | "MAIL_ENVOYE"
    | "CONNECTION_SENT"
    | "MESSAGE_SENT"
    | "REPLIED"
    | "NOT_INTERESTED"
    | "REFUS"
    | "REFUS_ARGU"
    | "REFUS_CATEGORIQUE"
    | "RELANCE"
    | "RAPPEL"
    | "GERE_PAR_SIEGE"
    | "FAUX_NUMERO"
    | "PROJET_A_SUIVRE"
    | "MAUVAIS_INTERLOCUTEUR"
    | "MAIL_UNIQUEMENT"
    | "BARRAGE_SECRETAIRE"
    | "MAIL_DOC"
    | "HORS_CIBLE";

// Opportunity urgency levels
export type Urgency = "SHORT" | "MEDIUM" | "LONG";

// Labels for displaying in UI (fallback when config API unavailable)
export const ACTION_RESULT_LABELS: Record<string, string> = {
    NO_RESPONSE: "Pas de réponse",
    BAD_CONTACT: "Standard / Mauvais contact",
    BARRAGE_STANDARD: "Barrage standard",
    NUMERO_KO: "NUMERO KO",
    INTERESTED: "Intéressé",
    CALLBACK_REQUESTED: "Rappel demandé",
    MEETING_BOOKED: "Meeting booké",
    MEETING_CANCELLED: "Meeting annulé",
    INVALIDE: "Invalide",
    DISQUALIFIED: "Disqualifié",
    ENVOIE_MAIL: "Mail à envoyer",
    MAIL_ENVOYE: "Mail envoyé",
    CONNECTION_SENT: "Demande de connexion envoyée",
    MESSAGE_SENT: "Message envoyé",
    REPLIED: "A répondu",
    NOT_INTERESTED: "Pas intéressé",
    REFUS: "Refus",
    REFUS_ARGU: "Refus argu",
    REFUS_CATEGORIQUE: "Refus catégorique",
    RELANCE: "Relance",
    RAPPEL: "Rappel",
    GERE_PAR_SIEGE: "Géré par le siège",
    FAUX_NUMERO: "Faux numéro",
    PROJET_A_SUIVRE: "Projet à suivre",
    MAUVAIS_INTERLOCUTEUR: "Mauvais interlocuteur",
    MAIL_UNIQUEMENT: "Mail uniquement",
    BARRAGE_SECRETAIRE: "Barrage secrétaire",
    MAIL_DOC: "Mail doc",
    HORS_CIBLE: "Hors cible",
};

export const CHANNEL_LABELS: Record<Channel, string> = {
    CALL: "Appel",
    EMAIL: "Email",
    LINKEDIN: "LinkedIn",
};

export const URGENCY_LABELS: Record<Urgency, string> = {
    SHORT: "Court terme",
    MEDIUM: "Moyen terme",
    LONG: "Long terme",
};

export const LIST_TYPE_LABELS: Record<ListType, string> = {
    SUZALI: `Liste ${brand.companyShortName}`,
    CLIENT: "Liste Client",
    MIXED: "Liste mixte",
};

export const STATUS_LABELS: Record<CompletenessStatus, string> = {
    INCOMPLETE: "Incomplet",
    PARTIAL: "Partiel",
    ACTIONABLE: "Actionnable",
};
