/**
 * In-app notifications for what a run found. CRITICAL findings reach every
 * active manager at once; the rest wait for the morning digest (PR2) unless
 * the job says `notify: "immediate"`. A dry run notifies nobody.
 *
 * More than a handful at once collapses into one notification: an inbox of
 * twelve "[Agent] …" lines at 11:00 is noise, one line with a count is not.
 */

import { notifyAllManagers } from "@/lib/notifications";
import { markNotified } from "./findings";
import type { BaseJobConfig, ClaimedRun, FindingEvents, FindingRow } from "./types";

export const AGENT_RUN_PATH = "/manager/assistant/agent/runs";

export function runLink(runId: string): string {
    return `${AGENT_RUN_PATH}/${runId}`;
}

const TYPE_BY_SEVERITY = { INFO: "info", WARN: "warning", CRITICAL: "error" } as const;

/** Up to this many individual notifications per run; beyond, one summary. */
const MAX_INDIVIDUAL = 4;

export interface NotifyDeps {
    notifyAllManagers: typeof notifyAllManagers;
    markNotified: typeof markNotified;
}

const defaultDeps: NotifyDeps = { notifyAllManagers, markNotified };

/** Which of the announced findings get a notification now. */
export function selectToNotify(events: FindingEvents<FindingRow>, config: BaseJobConfig): FindingRow[] {
    if (config.dryRun) return [];
    const candidates = [...events.created, ...events.escalated, ...events.reopened];
    if (config.notify === "immediate") return candidates;
    return candidates.filter((f) => f.severity === "CRITICAL");
}

export async function notifyFindingEvents(
    params: { run: ClaimedRun; jobName: string; events: FindingEvents<FindingRow>; config: BaseJobConfig; now?: Date },
    deps: NotifyDeps = defaultDeps,
): Promise<{ notified: number; collapsed: boolean }> {
    const now = params.now ?? new Date();
    const list = selectToNotify(params.events, params.config);
    if (list.length === 0) return { notified: 0, collapsed: false };

    const link = runLink(params.run.id);
    if (list.length > MAX_INDIVIDUAL) {
        const critical = list.filter((f) => f.severity === "CRITICAL").length;
        await deps.notifyAllManagers({
            title: `[Agent] ${params.jobName} : ${list.length} signalements`,
            message: `${critical > 0 ? `${critical} critique(s). ` : ""}${list
                .slice(0, 3)
                .map((f) => f.title)
                .join(" · ")}${list.length > 3 ? " · …" : ""}`.slice(0, 300),
            type: critical > 0 ? "error" : "warning",
            link,
        });
    } else {
        for (const f of list) {
            await deps.notifyAllManagers({
                title: `[Agent] ${f.title}`.slice(0, 120),
                message: f.body.slice(0, 300),
                type: TYPE_BY_SEVERITY[f.severity],
                link,
            });
        }
    }
    await deps.markNotified(list.map((f) => f.id).filter(Boolean), now);
    return { notified: list.length, collapsed: list.length > MAX_INDIVIDUAL };
}
