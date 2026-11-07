/**
 * Tool lookup for the agent: the registry first, then the agent-local tools
 * (run-scoped tools and REPORTING_TOOLS) that may not be registered yet.
 *
 * `isRegistered` tells a playbook whether the runtime itself can reach a tool
 * (the runtime only knows the registry), so it can pick its fallback.
 * `prismaRunScope` builds the production sinks of a run's scope.
 */

import { getActionTtlMs } from "@/lib/ai/agent/models";
import { getTool } from "@/lib/ai/tools/registry";
import { REPORTING_TOOLS } from "@/lib/ai/tools/definitions/reporting";
import type { AnyToolDefinition } from "@/lib/ai/tools/types";
import { prisma } from "@/lib/prisma";
import { createProposal, withStore } from "../store";
import type { ClaimedRun } from "../types";
import { AGENT_RUN_TOOLS } from "./index";
import { prismaRecordFinding } from "./record_finding";
import type { RunToolScope } from "./with-run-tools";

const LOCAL = new Map<string, AnyToolDefinition>([...AGENT_RUN_TOOLS, ...REPORTING_TOOLS].map((t) => [t.name, t]));

export function resolveAgentTool(name: string): AnyToolDefinition | undefined {
    return getTool(name) ?? LOCAL.get(name);
}

export function isRegistered(name: string): boolean {
    return getTool(name) !== undefined;
}

/**
 * How long an agent proposal waits for a manager: the chat's TTL, but never
 * less than three days — a Friday report must still be approvable on Monday.
 */
export function agentProposalTtlMs(env: NodeJS.ProcessEnv = process.env): number {
    return Math.max(getActionTtlMs(env), 3 * 24 * 3_600_000);
}

export function prismaRunScope(run: ClaimedRun, extra: { dataset?: unknown; now?: () => Date } = {}): RunToolScope {
    const now = extra.now ?? (() => new Date());
    return {
        runId: run.id,
        clientId: run.clientId,
        missionId: run.missionId,
        resolveTool: resolveAgentTool,
        dataset: extra.dataset,
        createProposal: async (input) => {
            const id = await createProposal({
                runId: run.id,
                tool: input.tool,
                args: input.args,
                card: input.card,
                rationale: input.rationale,
                risk: input.risk,
                expiresAt: new Date(now().getTime() + agentProposalTtlMs()),
            });
            const number = await withStore(() => prisma.agentProposal.count({ where: { runId: run.id } }));
            return { id, number };
        },
        recordFinding: (input) => prismaRecordFinding(run.id, input, now()),
    };
}
