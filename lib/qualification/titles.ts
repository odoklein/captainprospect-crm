// Job-title reading for the qualification engine. Pure.
// Only clear-cut titles are classified; everything else stays "unknown" rather than guessed.

import type { TitleLevel } from "./types";

const GATEKEEPER =
    /\b(assistant(?:e)?|secr[ée]taire|r[ée]ceptionniste|standardiste|accueil|hôtesse|stagiaire|alternant(?:e)?|apprenti(?:e)?)\b/i;
const DECISION =
    /\b(pdg|p-?dg|ceo|cfo|coo|cto|cmo|dg|dga|g[ée]rant(?:e)?|dirigeant(?:e)?|fondateur|fondatrice|co-?fondateur|co-?fondatrice|pr[ée]sident(?:e)?|directeur|directrice|director|owner|propri[ée]taire|associ[ée](?:e)?|chef d['’]entreprise|managing)\b/i;
const INFLUENCER = /\b(responsable|head|manager|chef|lead|coordinat(?:eur|rice)|charg[ée](?:e)? de)\b/i;

/** Gatekeeper wins over a decision word: « assistante de direction », « assistant du directeur ». */
export function titleLevel(title: string | null | undefined): TitleLevel {
    const t = (title ?? "").trim();
    if (!t) return "unknown";
    if (GATEKEEPER.test(t)) return "gatekeeper";
    if (DECISION.test(t)) return "decision";
    if (INFLUENCER.test(t)) return "influencer";
    return "unknown";
}
