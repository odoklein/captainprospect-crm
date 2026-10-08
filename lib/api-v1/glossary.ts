import type { ActionResult } from "@prisma/client";

/**
 * What each result code MEANS for a salesperson. Without this an agent reads
 * "DOUBLON" or "BARRAGE_SECRETAIRE" and has to guess; with it, it can answer in
 * plain French and group results the way the teams do (see result-codes note:
 * teams use RAPPEL / RELANCE / PROJET_A_SUIVRE, the legacy CALLBACK_REQUESTED /
 * INTERESTED are kept for old rows).
 */
export type ResultCategory = "rdv" | "follow_up" | "refusal" | "no_answer" | "gatekeeper" | "bad_data" | "other";

export const CATEGORY_LABELS: Record<ResultCategory, string> = {
  rdv: "RDV pris",
  follow_up: "A suivre (rappel, relance, projet, mail)",
  refusal: "Refus / pas intéressé",
  no_answer: "Pas de réponse",
  gatekeeper: "Barrage (standard, secrétaire, siège)",
  bad_data: "Donnée inutilisable (faux numéro, doublon, hors cible, mauvais interlocuteur)",
  other: "Autre",
};

export const RESULT_META: Record<ActionResult, { label: string; category: ResultCategory }> = {
  MEETING_BOOKED: { label: "RDV pris", category: "rdv" },
  MEETING_CANCELLED: { label: "RDV annulé", category: "other" },
  RAPPEL: { label: "Rappel", category: "follow_up" },
  RELANCE: { label: "Relance", category: "follow_up" },
  PROJET_A_SUIVRE: { label: "Projet à suivre", category: "follow_up" },
  CALLBACK_REQUESTED: { label: "Rappel demandé (ancien code)", category: "follow_up" },
  INTERESTED: { label: "Intéressé (ancien code)", category: "follow_up" },
  ENVOIE_MAIL: { label: "Mail à envoyer", category: "follow_up" },
  MAIL_ENVOYE: { label: "Mail envoyé", category: "follow_up" },
  MAIL_DOC: { label: "Mail avec documentation", category: "follow_up" },
  MAIL_UNIQUEMENT: { label: "Ne veut être contacté que par mail", category: "follow_up" },
  REPLIED: { label: "A répondu", category: "follow_up" },
  REFUS: { label: "Refus", category: "refusal" },
  REFUS_ARGU: { label: "Refus argumenté", category: "refusal" },
  REFUS_CATEGORIQUE: { label: "Refus catégorique", category: "refusal" },
  NOT_INTERESTED: { label: "Pas intéressé", category: "refusal" },
  DISQUALIFIED: { label: "Disqualifié", category: "refusal" },
  NO_RESPONSE: { label: "Pas de réponse", category: "no_answer" },
  BARRAGE_STANDARD: { label: "Barrage standard", category: "gatekeeper" },
  BARRAGE_SECRETAIRE: { label: "Barrage secrétaire", category: "gatekeeper" },
  GERE_PAR_SIEGE: { label: "Géré par le siège", category: "gatekeeper" },
  FAUX_NUMERO: { label: "Faux numéro", category: "bad_data" },
  NUMERO_KO: { label: "Numéro invalide", category: "bad_data" },
  BAD_CONTACT: { label: "Mauvais contact", category: "bad_data" },
  INVALIDE: { label: "Lead invalide", category: "bad_data" },
  DOUBLON: { label: "Doublon", category: "bad_data" },
  HORS_CIBLE: { label: "Hors cible", category: "bad_data" },
  MAUVAIS_INTERLOCUTEUR: { label: "Mauvais interlocuteur", category: "bad_data" },
  CONNECTION_SENT: { label: "Invitation LinkedIn envoyée", category: "other" },
  MESSAGE_SENT: { label: "Message LinkedIn envoyé", category: "other" },
};

export const resultLabel = (r: string): string => RESULT_META[r as ActionResult]?.label ?? r;
export const resultCategory = (r: string): ResultCategory => RESULT_META[r as ActionResult]?.category ?? "other";

/** Prospect actually spoken to (or at least reached) — the basis of the "reach rate". */
export const REACHED_CATEGORIES: ResultCategory[] = ["rdv", "follow_up", "refusal"];
