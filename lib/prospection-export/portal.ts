/**
 * Pure logic behind the client portal "Base de données" page: turning status
 * codes into client-facing stages, rolling contact lines up to a company, and
 * the weekly activity series. No DB access, so it is unit-tested directly.
 */

import { DateTime } from "luxon";
import type { EffectiveStatusDefinition } from "@/lib/services/StatusConfigService";
import { DEFAULT_CALLBACK_CODES, UNTREATED_LABEL, type RowTreatment } from "./types";
import { STAGE_RANK, type PortalActivityWeek, type PortalStage, type PortalTreatment } from "./portal-types";

const ZONE = "Europe/Paris";

// Used only when a code is missing from the mission's status config.
const FALLBACK_OPPORTUNITY = new Set(["INTERESTED", "PROJET_A_SUIVRE"]);
const FALLBACK_CLOSED = new Set([
    "DISQUALIFIED", "REFUS", "REFUS_ARGU", "REFUS_CATEGORIQUE", "HORS_CIBLE",
    "BAD_CONTACT", "FAUX_NUMERO", "NUMERO_KO", "MAUVAIS_INTERLOCUTEUR",
    "BARRAGE_STANDARD", "BARRAGE_SECRETAIRE",
]);

type StageFields = Pick<
    EffectiveStatusDefinition,
    "code" | "priorityLabel" | "triggersCallback" | "triggersOpportunity" | "triggersExclusion"
>;

/**
 * Maps a result code to a stage using the mission's own config: callback →
 * "À rappeler", opportunity / follow-up → "Intérêt", SKIP / exclusion → dead
 * end ("Sans suite"), anything still being retried → "En cours".
 */
export function buildStageResolver(statuses: StageFields[]): (code: string) => PortalStage {
    const byCode = new Map(statuses.map((s) => [s.code, s]));
    return (code) => {
        if (code === "MEETING_BOOKED") return "meeting";
        const s = byCode.get(code);
        if (s) {
            if (s.triggersCallback || s.priorityLabel === "CALLBACK") return "callback";
            if (s.triggersOpportunity || s.priorityLabel === "FOLLOW_UP") return "opportunity";
            if (s.triggersExclusion || s.priorityLabel === "SKIP") return "closed";
            return "in_progress";
        }
        if (DEFAULT_CALLBACK_CODES.has(code)) return "callback";
        if (FALLBACK_OPPORTUNITY.has(code)) return "opportunity";
        if (FALLBACK_CLOSED.has(code)) return "closed";
        return "in_progress";
    };
}

export const UNTREATED_TREATMENT: PortalTreatment = {
    stage: "untreated",
    treated: false,
    lastResult: null,
    lastResultLabel: UNTREATED_LABEL,
    actionCount: 0,
    callCount: 0,
    meetingBooked: false,
    lastActionAt: null,
    nextCallbackAt: null,
    meetingAt: null,
};

/** One contact line. A still-valid meeting wins over whatever was logged after it. */
export function toPortalTreatment(
    t: RowTreatment,
    stageFor: (code: string) => PortalStage,
    meetingLabel: string
): PortalTreatment {
    if (!t.treated) return UNTREATED_TREATMENT;
    const meetingBooked = t.meetingBookedAt !== null;
    return {
        stage: meetingBooked ? "meeting" : stageFor(t.lastResult ?? ""),
        treated: true,
        lastResult: meetingBooked ? "MEETING_BOOKED" : t.lastResult,
        lastResultLabel: meetingBooked ? meetingLabel : t.lastResultLabel,
        actionCount: t.actionCount,
        callCount: t.callCount,
        meetingBooked,
        lastActionAt: t.lastActionAt?.toISOString() ?? null,
        nextCallbackAt: t.nextCallbackAt?.toISOString() ?? null,
        meetingAt: t.meetingAt?.toISOString() ?? null,
    };
}

/**
 * Company = its best line (ties → most recent), with company-wide counts
 * (company-level actions repeat on every line, so they're counted from the
 * actions, not summed) and the latest contact date across all lines.
 */
export function companyRollup(
    lines: PortalTreatment[],
    totals: { actionCount: number; callCount: number } | undefined
): PortalTreatment {
    let best: PortalTreatment | null = null;
    let lastActionAt: string | null = null;
    let nextCallbackAt: string | null = null;
    let meetingAt: string | null = null;
    for (const t of lines) {
        if (!t.treated) continue;
        if (t.lastActionAt && (!lastActionAt || t.lastActionAt > lastActionAt)) lastActionAt = t.lastActionAt;
        // Soonest pending callback, latest meeting.
        if (t.nextCallbackAt && (!nextCallbackAt || t.nextCallbackAt < nextCallbackAt)) nextCallbackAt = t.nextCallbackAt;
        if (t.meetingAt && (!meetingAt || t.meetingAt > meetingAt)) meetingAt = t.meetingAt;
        const better =
            !best ||
            STAGE_RANK[t.stage] > STAGE_RANK[best.stage] ||
            (STAGE_RANK[t.stage] === STAGE_RANK[best.stage] && (t.lastActionAt ?? "") > (best.lastActionAt ?? ""));
        if (better) best = t;
    }
    if (!best) return UNTREATED_TREATMENT;
    return {
        ...best,
        actionCount: totals?.actionCount ?? best.actionCount,
        callCount: totals?.callCount ?? best.callCount,
        meetingBooked: best.stage === "meeting",
        lastActionAt,
        nextCallbackAt,
        meetingAt,
    };
}

/** Actions and booked meetings per Paris week, `weeks` long, ending with the current week. */
export function buildWeeklyActivity(
    actions: { createdAt: Date; result: string }[],
    now: Date,
    weeks = 12
): PortalActivityWeek[] {
    const current = DateTime.fromJSDate(now).setZone(ZONE).startOf("week");
    const starts = Array.from({ length: weeks }, (_, i) => current.minus({ weeks: weeks - 1 - i }));
    const bounds = starts.map((d) => d.toMillis());
    const end = current.plus({ weeks: 1 }).toMillis();
    const out: PortalActivityWeek[] = starts.map((d) => ({ week: d.toISODate() as string, actions: 0, meetings: 0 }));

    for (const a of actions) {
        const t = a.createdAt.getTime();
        if (t < bounds[0] || t >= end) continue;
        let i = bounds.length - 1;
        while (i > 0 && t < bounds[i]) i--;
        out[i].actions++;
        if (a.result === "MEETING_BOOKED") out[i].meetings++;
    }
    return out;
}
