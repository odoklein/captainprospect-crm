/**
 * A watch rule detects with SQL/Prisma and returns the FULL current set of
 * findings for its scope (lib/agent/findings.ts resolves what is missing).
 * No model involved: the LLM only writes the digest afterwards.
 */

import type { DetectedFinding } from "../../types";

export interface WatchScope {
    clientId: string | null;
    missionId: string | null;
}

export interface WatchRuleContext {
    now: Date;
    scope: WatchScope;
    /** The job's config (rule-specific keys, e.g. `days`). */
    config: Record<string, unknown>;
    signal: AbortSignal;
}

export interface WatchRule {
    id: string;
    label: string;
    description: string;
    /** Five-field cron, Europe/Paris. */
    defaultSchedule: string;
    /** The dedupe scope: "agency", or the client id when the rule runs per client. */
    scopeKey(ctx: WatchRuleContext): string;
    detect(ctx: WatchRuleContext): Promise<DetectedFinding[]>;
}
