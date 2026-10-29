/**
 * The playbooks this release ships. A job names one by id; the executor
 * looks it up here. Adding a playbook is a code review, not a row.
 */

import { z } from "zod";
import { DEFAULT_BUDGETS } from "../budget";
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

export const PLAYBOOKS: Playbook[] = [
    watchPlaybook("watch.client_at_risk", clientAtRiskRule.label, clientAtRiskRule.description, [clientAtRiskRule], clientAtRiskRule.defaultSchedule),
    watchPlaybook("watch.sdr_under_pace", sdrUnderPaceRule.label, sdrUnderPaceRule.description, [sdrUnderPaceRule], sdrUnderPaceRule.defaultSchedule),
    watchPlaybook("watch.all", "Veille complète", "Toutes les règles de veille en une passe.", WATCH_RULES, "0 11 * * 1-5"),
];

const BY_ID = new Map(PLAYBOOKS.map((p) => [p.id, p]));

if (BY_ID.size !== PLAYBOOKS.length) throw new Error("Duplicate playbook id");

export function getPlaybook(id: string): Playbook | undefined {
    return BY_ID.get(id);
}
