/**
 * Statistiques — the same engine as /manager/analytics, as one tool.
 *
 * `getStatsOverview` already returns chart-ready data for a period AND the
 * equal-length period before it: totals, a day/week series, per-SDR and
 * per-mission tallies, a day × hour heatmap and the SAS state of the RDV.
 * Definitions (joint, lead chaud, transformation) come from lib/stats/metrics,
 * so the assistant and the Statistiques page can never disagree.
 *
 * A bound project fixes the client (and mission) scope; the agency view may
 * narrow with `client_ids`.
 */

import { z } from "zod";
import { parsePeriodRange } from "@/lib/manager-home/rules";
import { getStatsOverview } from "@/lib/stats/overview";
import { resolvePreset } from "@/lib/stats/period";
import { callsPerMeeting, conversionRate, reachRate, relativeChange } from "@/lib/stats/metrics";
import type { Tally } from "@/lib/stats/types";
import { defineReadTool, params } from "../helpers";
import { ToolValidationError } from "../types";

const PRESETS = ["today", "7d", "30d", "month", "lastMonth"] as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const schema = z.object({
    period: z.enum(PRESETS).optional(),
    start: z.string().regex(DAY).optional(),
    end: z.string().regex(DAY).optional(),
    client_ids: z.array(z.string().min(1)).max(50).optional(),
    mission_ids: z.array(z.string().min(1)).max(50).optional(),
    sdr_ids: z.array(z.string().min(1)).max(50).optional(),
    list_ids: z.array(z.string().min(1)).max(50).optional(),
    top: z.number().int().min(1).max(50).optional(),
});

/** A tally with the rates the Statistiques page shows, in %. */
function withRates(t: Tally) {
    return {
        appels: t.calls,
        joints: t.joined,
        leads_chauds: t.hot,
        rdv: t.meetings,
        joignabilite_pct: reachRate(t),
        transformation_pct: conversionRate(t),
        appels_par_rdv: callsPerMeeting(t),
    };
}

export const getStatsOverviewTool = defineReadTool({
    name: "get_stats_overview",
    label: "Statistiques de production",
    description:
        "Le moteur de la page Statistiques : pour une période ET la période précédente de même durée — totaux (appels, joints, leads chauds, RDV, joignabilité, transformation), courbe jour par jour (ou semaine), classement par SDR et par mission avec l'évolution, carte de chaleur jour × heure, état des RDV (confirmés, en attente, refusés au SAS). Données prêtes pour un graphique. Préfère-le à get_sales_report pour une tendance, une comparaison de SDR ou de missions, ou « quand appeler ».",
    parameters: params({
        period: {
            type: "string",
            enum: [...PRESETS],
            description: "today, 7d (7 derniers jours), 30d (par défaut), month (mois en cours), lastMonth (mois dernier). Ignoré si start/end sont donnés.",
        },
        start: { type: "string", description: "Premier jour inclus, YYYY-MM-DD (heure de Paris)" },
        end: { type: "string", description: "Dernier jour inclus, YYYY-MM-DD" },
        client_ids: { type: "array", items: { type: "string" }, description: "Vue agence seulement : limiter à ces clients" },
        mission_ids: { type: "array", items: { type: "string" }, description: "Limiter à ces missions" },
        sdr_ids: { type: "array", items: { type: "string" }, description: "Limiter à ces SDR" },
        list_ids: { type: "array", items: { type: "string" }, description: "Limiter à ces listes" },
        top: { type: "number", description: "Nombre de SDR et de missions détaillés, 15 par défaut" },
    }),
    schema,
    requiresProject: false,
    execute: async (args, ctx) => {
        const preset = args.period ?? "30d";
        const days = args.start && args.end ? { start: args.start, end: args.end } : resolvePreset(preset, ctx.resolvedAt);
        const range = parsePeriodRange(days.start, days.end);
        if (!range) throw new ToolValidationError("Période invalide (start ≤ end, au plus un an).");

        const project = ctx.project;
        const scope = {
            sdrIds: args.sdr_ids ?? [],
            listIds: args.list_ids ?? [],
            // The binding wins over whatever the model asks for.
            clientIds: project ? [project.clientId] : (args.client_ids ?? []),
            missionIds: project?.missionId ? [project.missionId] : (args.mission_ids ?? []),
        };

        const o = await getStatsOverview(range, scope);
        const top = args.top ?? 15;

        return {
            periode: { du: o.range.start, au: o.range.end, jours: o.range.days, granularite: o.range.granularity === "week" ? "semaine" : "jour" },
            periode_precedente: { du: o.range.prevStart, au: o.range.prevEnd },
            perimetre: project
                ? `${project.clientName}${project.missionName ? ` — ${project.missionName}` : ""}`
                : scope.clientIds.length ? `${scope.clientIds.length} client(s)` : "toute l'agence",
            total: {
                ...withRates(o.current),
                prospects_distincts: o.current.prospects,
                precedent: withRates(o.previous),
                evolution_pct: {
                    appels: relativeChange(o.current.calls, o.previous.calls),
                    joints: relativeChange(o.current.joined, o.previous.joined),
                    rdv: relativeChange(o.current.meetings, o.previous.meetings),
                },
            },
            resultats: o.current.byResult,
            rdv_sas: o.rdv,
            serie: o.series.map((p) => ({ date: p.key, label: p.label, appels: p.calls, joints: p.joined, rdv: p.meetings })),
            serie_precedente: o.prevSeries.map((p) => ({ date: p.key, appels: p.calls, joints: p.joined, rdv: p.meetings })),
            sdr: o.sdrs.slice(0, top).map((s) => ({
                id: s.id,
                nom: s.name,
                ...withRates(s.current),
                rdv_precedent: s.previous.meetings,
                appels_precedent: s.previous.calls,
            })),
            sdr_total: o.sdrs.length,
            missions: o.missions.slice(0, top).map((m) => ({
                id: m.id,
                nom: m.name,
                client: m.clientName,
                active: m.isActive,
                sdr: m.sdrCount,
                ...withRates(m.current),
                rdv_precedent: m.previous.meetings,
            })),
            missions_total: o.missions.length,
            // Only the cells with calls; dow 1 = lundi, hour = heure de Paris.
            chaleur: o.heatmap
                .filter((c) => c.calls > 0)
                .map((c) => ({ jour: c.dow, heure: c.hour, appels: c.calls, joints: c.joined, rdv: c.meetings })),
        };
    },
});
