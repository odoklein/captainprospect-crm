/**
 * The playbooks this release ships. A job names one by id; the executor
 * looks it up here. Adding a playbook is a code review, not a row.
 */

import { z } from "zod";
import { ASSISTANT_TOOLS } from "@/lib/ai/tools/registry";
import { DEFAULT_BUDGETS } from "../budget";
import { runMorningDigestPlaybook } from "../digest/morning";
import { MISSION_EXCLUDED_TOOLS, runMissionPlaybook } from "../mission";
import { WEEKLY_BILAN_TOOL_ALLOWLIST, runWeeklyBilanPlaybook } from "../reports/weekly_bilan";
import type { BaseJobConfig } from "../types";
import { clientAtRiskRule } from "../watch/rules/client_at_risk";
import { sdrUnderPaceRule } from "../watch/rules/sdr_under_pace";
import type { WatchRule } from "../watch/rules/types";
import { WATCH_TOOL_ALLOWLIST, runWatchPlaybook } from "../watch/runner";
import type { Playbook } from "./types";

const budgetSchema = z
    .object({
        maxToolCalls: z.number().int().min(0).optional(),
        maxCostEur: z.number().min(0).optional(),
        deadlineMs: z.number().int().min(0).optional(),
        maxSafeWrites: z.number().int().min(0).optional(),
        maxPhases: z.number().int().min(0).optional(),
    })
    .partial();

export const baseConfigSchema = z
    .object({
        dryRun: z.boolean().optional(),
        notify: z.enum(["immediate", "digest"]).optional(),
        budget: budgetSchema.optional(),
    })
    .passthrough();

const watchConfigSchema = baseConfigSchema.extend({
    /** client_at_risk: inactivity window in days (14). */
    days: z.number().int().min(1).max(180).optional(),
});

export const WATCH_RULES: WatchRule[] = [clientAtRiskRule, sdrUnderPaceRule];

export function getWatchRule(id: string): WatchRule | undefined {
    return WATCH_RULES.find((r) => r.id === id);
}

function watchPlaybook(id: string, label: string, description: string, rules: WatchRule[], defaultSchedule: string): Playbook {
    return {
        id,
        kind: "WATCH",
        label,
        description,
        scope: "any",
        configSchema: watchConfigSchema as unknown as z.ZodType<BaseJobConfig>,
        defaultSchedule,
        toolAllowlist: WATCH_TOOL_ALLOWLIST,
        budget: DEFAULT_BUDGETS.WATCH,
        run: (ctx) => runWatchPlaybook(rules, ctx, (ctx.config.jobName as string | undefined) ?? label),
    };
}

const reportConfigSchema = baseConfigSchema.extend({
    /** E-mails proposed with the publication (the card shows them; only addresses the CRM knows for the client pass). */
    recipients: z.array(z.string().trim().toLowerCase().email()).max(10).optional(),
    /** Any day of the week to report on; default: the current bilan week. */
    weekStart: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
});

/** The chat's tool set, minus credential and portal tools, plus the run's own proposal and finding tools. */
export const MISSION_TOOL_ALLOWLIST: ReadonlySet<string> = new Set(
    [...ASSISTANT_TOOLS.map((t) => t.name), "propose_action", "record_finding"].filter((name) => !MISSION_EXCLUDED_TOOLS.has(name)),
);

export const PLAYBOOKS: Playbook[] = [
    watchPlaybook("watch.client_at_risk", clientAtRiskRule.label, clientAtRiskRule.description, [clientAtRiskRule], clientAtRiskRule.defaultSchedule),
    watchPlaybook("watch.sdr_under_pace", sdrUnderPaceRule.label, sdrUnderPaceRule.description, [sdrUnderPaceRule], sdrUnderPaceRule.defaultSchedule),
    watchPlaybook("watch.all", "Veille complète", "Toutes les règles de veille en une passe.", WATCH_RULES, "0 11 * * 1-5"),
    {
        id: "report.weekly_bilan",
        kind: "REPORT",
        label: "Bilan hebdomadaire client",
        description: "Rédige le bilan de la semaine d'un client (chiffres, tendance, rendez-vous, vigilance, prochaines étapes) et propose sa publication.",
        scope: "client",
        configSchema: reportConfigSchema as unknown as z.ZodType<BaseJobConfig>,
        defaultSchedule: "0 14 * * 5",
        toolAllowlist: WEEKLY_BILAN_TOOL_ALLOWLIST,
        budget: DEFAULT_BUDGETS.REPORT,
        run: (ctx) => runWeeklyBilanPlaybook(ctx),
    },
    {
        id: "mission.delegated",
        kind: "MISSION",
        label: "Mission déléguée",
        description: "Exécute en arrière-plan une demande du manager : plan, étapes, synthèse ; toute action sensible est proposée.",
        scope: "any",
        configSchema: baseConfigSchema as unknown as z.ZodType<BaseJobConfig>,
        defaultSchedule: null,
        toolAllowlist: MISSION_TOOL_ALLOWLIST,
        // No override: the budget chosen at delegation (MISSION_BUDGETS) is stored on the run.
        run: (ctx) => runMissionPlaybook(ctx),
    },
    {
        id: "digest.morning",
        kind: "DIGEST",
        label: "Point du matin",
        description: "Chaque matin de semaine, résume pour chaque manager les signalements ouverts, propositions en attente, rapports à valider et exécutions de la nuit.",
        scope: "agency",
        configSchema: baseConfigSchema as unknown as z.ZodType<BaseJobConfig>,
        defaultSchedule: "30 7 * * 1-5",
        toolAllowlist: new Set<string>(),
        budget: DEFAULT_BUDGETS.DIGEST,
        run: (ctx) => runMorningDigestPlaybook(ctx),
    },
];

const BY_ID = new Map(PLAYBOOKS.map((p) => [p.id, p]));

if (BY_ID.size !== PLAYBOOKS.length) throw new Error("Duplicate playbook id");

export function getPlaybook(id: string): Playbook | undefined {
    return BY_ID.get(id);
}
