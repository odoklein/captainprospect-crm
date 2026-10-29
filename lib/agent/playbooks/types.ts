/**
 * A playbook is code: an id, a kind, a scope, a config schema with defaults,
 * a default schedule, the tools it may use, and `run()`. Jobs reference it by
 * id and only carry configuration, so a release can change what a playbook
 * does without touching any row.
 */

import type { z } from "zod";
import type { AgentJobKind, BaseJobConfig, PlaybookOutcome, PlaybookRunContext, RunBudget } from "../types";

export type PlaybookScope = "agency" | "client" | "mission" | "any";

export interface Playbook<TConfig extends BaseJobConfig = BaseJobConfig> {
    id: string;
    kind: AgentJobKind;
    label: string;
    description: string;
    scope: PlaybookScope;
    /** Parses `AgentJob.config`; defaults applied, unknown keys kept. */
    configSchema: z.ZodType<TConfig>;
    /** Five-field cron in Europe/Paris, or null for on-demand playbooks. */
    defaultSchedule: string | null;
    /** Tools the model may use in this playbook's phases (WATCH: show_visual only). */
    toolAllowlist: ReadonlySet<string>;
    /** Overrides of the kind's default budget. */
    budget?: Partial<RunBudget>;
    run(ctx: PlaybookRunContext): Promise<PlaybookOutcome>;
}
