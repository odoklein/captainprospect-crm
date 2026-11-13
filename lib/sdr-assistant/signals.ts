// ============================================
// SDR ASSISTANT — pure helpers (no I/O), shared by the data loaders, the
// tools and their tests.
//
// - Follow-ups are bucketed against the Paris calendar day, the same day the
//   Rappels page and the stats use.
// - Today's outreach turns into a short list of recommended next actions,
//   computed from the data rather than left to the model, so the answer is
//   grounded even when the model is terse.
// ============================================

import { DateTime } from "luxon";
import { outcomeOf, type OutcomeKey } from "@/lib/manager-home/outcomes";

export const APP_TIMEZONE = "Europe/Paris";

export type FollowUpBucket = "overdue" | "today" | "upcoming" | "undated";

/** Where a follow-up stands relative to now (Paris day). */
export function followUpBucket(callbackDate: Date | null, now: Date): FollowUpBucket {
    if (!callbackDate) return "undated";
    if (callbackDate.getTime() < now.getTime()) return "overdue";
    const day = DateTime.fromJSDate(callbackDate).setZone(APP_TIMEZONE).toISODate();
    const today = DateTime.fromJSDate(now).setZone(APP_TIMEZONE).toISODate();
    return day === today ? "today" : "upcoming";
}

/** "lun. 16 nov. à 10:30" in Paris time; "aujourd'hui à 10:30" for today. */
export function frWhen(date: Date | null, now: Date): string | null {
    if (!date) return null;
    const d = DateTime.fromJSDate(date).setZone(APP_TIMEZONE).setLocale("fr");
    const today = DateTime.fromJSDate(now).setZone(APP_TIMEZONE);
    const time = d.toFormat("HH'h'mm");
    if (d.hasSame(today, "day")) return `aujourd'hui à ${time}`;
    if (d.hasSame(today.plus({ days: 1 }), "day")) return `demain à ${time}`;
    if (d.hasSame(today.minus({ days: 1 }), "day")) return `hier à ${time}`;
    return `${d.toFormat("ccc d LLL")} à ${time}`;
}

/** Whole days between a past date and now (0 = today). */
export function daysLate(date: Date, now: Date): number {
    const a = DateTime.fromJSDate(date).setZone(APP_TIMEZONE).startOf("day");
    const b = DateTime.fromJSDate(now).setZone(APP_TIMEZONE).startOf("day");
    return Math.max(0, Math.round(b.diff(a, "days").days));
}

/** Start of the Paris day containing `now`, as a JS Date. */
export function startOfParisDay(now: Date): Date {
    return DateTime.fromJSDate(now).setZone(APP_TIMEZONE).startOf("day").toJSDate();
}

/** Record links the panel renders as links. SDR routes only. */
export function contactPath(id: string): string {
    return `/sdr/contacts/${id}`;
}
export function companyPath(id: string): string {
    return `/sdr/companies/${id}`;
}

/** Trims a free-text note for the model: one line, bounded. */
export function excerpt(text: string | null | undefined, max = 220): string | null {
    const clean = text?.replace(/\s+/g, " ").trim();
    if (!clean) return null;
    return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export interface OutreachRow {
    result: string;
    channel: string;
    /** Display name of the prospect ("Marie Durand · Acme" or the company). */
    who: string;
    link: string | null;
    note: string | null;
}

export interface Recommendation {
    /** Short imperative line, French. */
    action: string;
    /** Why, in one clause. */
    reason: string;
    /** Prospects it applies to, with their record link. */
    prospects: Array<{ name: string; link: string | null }>;
}

const FAMILY_ORDER: OutcomeKey[] = ["meeting", "interested", "callback", "refusal", "noReach", "dataIssue", "other"];

/** Counts per outcome family, in display order, empty families dropped. */
export function familyCounts(rows: Array<{ result: string }>): Array<{ family: OutcomeKey; count: number }> {
    const counts = new Map<OutcomeKey, number>();
    for (const r of rows) counts.set(outcomeOf(r.result), (counts.get(outcomeOf(r.result)) ?? 0) + 1);
    return FAMILY_ORDER.filter((f) => counts.has(f)).map((family) => ({ family, count: counts.get(family) ?? 0 }));
}

function uniqueProspects(rows: OutreachRow[], max = 5) {
    const seen = new Set<string>();
    const out: Array<{ name: string; link: string | null }> = [];
    for (const r of rows) {
        const key = r.link ?? r.who;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ name: r.who, link: r.link });
        if (out.length >= max) break;
    }
    return out;
}

/**
 * Next actions from today's outreach, most valuable first. Each one names the
 * prospects it is about; nothing is recommended without a row behind it.
 */
export function recommendNextActions(
    rows: OutreachRow[],
    context: { overdueFollowUps: number; dueTodayFollowUps: number },
): Recommendation[] {
    const recs: Recommendation[] = [];
    const interested = rows.filter((r) => outcomeOf(r.result) === "interested");
    if (interested.length > 0) {
        recs.push({
            action: "Proposer un créneau de RDV aux prospects intéressés",
            reason: "intéressés aujourd'hui, sans RDV pris",
            prospects: uniqueProspects(interested),
        });
    }
    const mailToSend = rows.filter((r) => r.result === "ENVOIE_MAIL" || r.result === "MAIL_DOC" || r.result === "MAIL_UNIQUEMENT");
    if (mailToSend.length > 0) {
        recs.push({
            action: "Envoyer les mails promis pendant les appels",
            reason: "un mail ou une documentation a été promis",
            prospects: uniqueProspects(mailToSend),
        });
    }
    if (context.overdueFollowUps > 0) {
        recs.push({
            action: "Traiter les rappels en retard avant de reprendre la file",
            reason: `${context.overdueFollowUps} rappel(s) dépassé(s)`,
            prospects: [],
        });
    }
    const dataIssues = rows.filter((r) => outcomeOf(r.result) === "dataIssue");
    if (dataIssues.length > 0) {
        recs.push({
            action: "Corriger ou enrichir les fiches au mauvais numéro / mauvais interlocuteur",
            reason: "la fiche bloque le prochain essai",
            prospects: uniqueProspects(dataIssues),
        });
    }
    const noReach = rows.filter((r) => outcomeOf(r.result) === "noReach");
    if (noReach.length >= 3) {
        recs.push({
            action: "Réessayer les non-répondants sur un autre créneau horaire",
            reason: "plusieurs appels sans réponse ou bloqués au standard",
            prospects: uniqueProspects(noReach, 3),
        });
    }
    if (rows.length === 0 && context.dueTodayFollowUps === 0 && context.overdueFollowUps === 0) {
        recs.push({
            action: "Démarrer la file d'actions",
            reason: "aucune action enregistrée aujourd'hui",
            prospects: [],
        });
    }
    return recs.slice(0, 5);
}
