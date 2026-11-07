/**
 * The REPORT dataset as the model sees it, and `get_report_dataset`, the
 * run-scoped read tool that returns it.
 *
 * Step 1 of a report collects the figures with SQL (no model); this file turns
 * them into one compact JSON payload with French keys. The payload is seeded
 * as evidence E1 on the AGENT thread before the writing turn, and the tool
 * returns the very same payload, so every figure of the report is checked
 * against it by the chat's verifier.
 */

import { z } from "zod";
import { defineReadTool, NO_PARAMS } from "@/lib/ai/tools/helpers";
import type { WeeklyBilanData } from "@/lib/reporting/weekly-bilan-render";
import { formatMeetingAt } from "@/lib/reporting/weekly-bilan-render";
import { AGENT_RUN_PERMISSION, getRunScope } from "../tools/with-run-tools";

export interface TrendPoint {
    /** Monday of the week, YYYY-MM-DD. */
    weekStart: string;
    /** Short label for the x axis, « 20/10 ». */
    label: string;
    calls: number;
    conversations: number;
    meetings: number;
}

export interface WeeklyReportDataset {
    client: { id: string; nom: string };
    semaine: { debut: string; fin: string; libelle: string };
    chiffres: {
        appels: number;
        appels_semaine_precedente: number;
        evolution_appels_pct: number | null;
        conversations: number;
        taux_conversation_pct: number | null;
        rdv: number;
        rdv_confirmes: number;
        rdv_en_attente: number;
        taux_transformation_pct: number | null;
        prospects_contactes: number;
        volume_faible: boolean;
    };
    tendance_6_semaines: Array<{ semaine: string; debut: string; appels: number; conversations: number; rdv: number }>;
    rendez_vous: Array<{ societe: string; interlocuteur: string | null; date: string; mission: string }>;
    points_saillants: string[];
    /** Call notes: context for the vigilance section, never quoted with names. */
    notes_appels: string[];
}

function pct(a: number, b: number): number | null {
    if (b <= 0) return null;
    return Math.round((a / b) * 1000) / 10;
}

/** Pure: the bilan data plus its 6-week trend → the model's payload. */
export function buildReportDataset(data: WeeklyBilanData, trend: TrendPoint[]): WeeklyReportDataset {
    const s = data.stats;
    return {
        client: { id: data.clientId, nom: data.clientName },
        semaine: { debut: data.week.start, fin: data.week.end, libelle: data.week.label },
        chiffres: {
            appels: s.calls,
            appels_semaine_precedente: s.previousCalls,
            evolution_appels_pct: s.previousCalls > 0 ? Math.round(((s.calls - s.previousCalls) / s.previousCalls) * 1000) / 10 : null,
            conversations: s.conversations,
            taux_conversation_pct: s.lowVolume ? null : pct(s.conversations, s.calls),
            rdv: s.meetings,
            rdv_confirmes: s.meetingsConfirmed,
            rdv_en_attente: s.meetingsPending,
            taux_transformation_pct: s.lowVolume ? null : pct(s.meetings, s.conversations),
            prospects_contactes: s.prospects,
            volume_faible: s.lowVolume,
        },
        tendance_6_semaines: trend.map((t) => ({ semaine: t.label, debut: t.weekStart, appels: t.calls, conversations: t.conversations, rdv: t.meetings })),
        rendez_vous: data.meetings.slice(0, 30).map((m) => ({
            societe: m.company,
            interlocuteur: m.contactTitle,
            date: formatMeetingAt(m.at),
            mission: m.missionName,
        })),
        points_saillants: data.highlights.slice(0, 8),
        notes_appels: data.notes.slice(0, 25),
    };
}

export const getReportDataset = defineReadTool({
    name: "get_report_dataset",
    label: "Données du rapport",
    description:
        "Renvoie les chiffres du rapport en cours (semaine, tendance 6 semaines, rendez-vous, points saillants). Seule source de chiffres du rapport.",
    parameters: NO_PARAMS,
    schema: z.object({}).passthrough(),
    requiresProject: false,
    requiredPermissions: [AGENT_RUN_PERMISSION],
    execute: async (_args, ctx) => {
        const scope = getRunScope(ctx);
        if (!scope.dataset) return { erreur: "Aucun jeu de données pour cette tâche." };
        return scope.dataset;
    },
});
