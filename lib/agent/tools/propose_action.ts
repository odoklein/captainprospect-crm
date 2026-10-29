/**
 * `propose_action` — the agent's way to leave an action for a manager.
 *
 * The model names a write tool and its arguments; nothing runs. The proposal
 * goes through the same gate as a real call (`authorizeToolCall`: allowlist,
 * role, permissions, project, zod schema), its card comes from the tool's own
 * `describe()` (resolved from the database, never echoed from the model), and
 * one PENDING `AgentProposal` is inserted. A manager decides later, under
 * their own context (lib/agent/proposals.ts).
 *
 * Also used directly by the mission loop when a write was refused for budget
 * (dry run, or `maxSafeWrites` spent): see `proposeFromCall`.
 */

import { z } from "zod";
import { authorizeToolCall } from "@/lib/ai/tools/guard";
import { defineReadTool, params } from "@/lib/ai/tools/helpers";
import type { AnyToolDefinition, AssistantContext, PendingActionCard } from "@/lib/ai/tools/types";
import { ToolValidationError } from "@/lib/ai/tools/types";
import { AGENT_RUN_PERMISSION, getRunScope, type RunToolScope } from "./with-run-tools";

/** Tools a proposal may never name: they are the agent's own plumbing. */
const NOT_PROPOSABLE = new Set(["propose_action", "record_finding", "get_report_dataset", "load_tool_group"]);

const MAX_ARG_PREVIEW = 120;

/** A card for a safe write (they have no `describe()`): the label and the arguments as written. */
export function genericCard(tool: AnyToolDefinition, args: Record<string, unknown>): PendingActionCard {
    const details = Object.entries(args)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .slice(0, 8)
        .map(([label, value]) => {
            const text = typeof value === "string" ? value : JSON.stringify(value);
            return { label, value: text.length > MAX_ARG_PREVIEW ? `${text.slice(0, MAX_ARG_PREVIEW - 1)}…` : text };
        });
    return { title: tool.label, details, warning: null, confirmLabel: "Exécuter", danger: false };
}

export interface ProposeResult {
    id: string;
    number: number;
    tool: string;
    card: PendingActionCard;
}

/**
 * Validates and records one proposal. Throws ToolValidationError /
 * ToolAuthorizationError / ToolNotFoundError (the executor turns them into a
 * structured error for the model).
 */
export async function proposeFromCall(
    scope: RunToolScope,
    ctx: AssistantContext,
    input: { tool: string; args: unknown; rationale: string | null },
): Promise<ProposeResult> {
    if (NOT_PROPOSABLE.has(input.tool)) throw new ToolValidationError(`« ${input.tool} » ne peut pas être proposé.`);
    const tool = scope.resolveTool(input.tool);
    if (tool && tool.risk === "read") {
        throw new ToolValidationError(`« ${tool.name} » est une lecture : appelle-le directement au lieu de le proposer.`);
    }
    // The gate of a real call, minus the write budget (spending it is the point of proposing).
    const gateCtx: AssistantContext = { ...ctx, autoWriteBudget: Math.max(1, ctx.autoWriteBudget) };
    const args = authorizeToolCall(tool, input.tool, input.args, gateCtx) as Record<string, unknown>;
    const resolved = tool!;
    const card = resolved.describe ? await resolved.describe(args, gateCtx) : genericCard(resolved, args);
    const { id, number } = await scope.createProposal({
        tool: resolved.name,
        args,
        card,
        rationale: input.rationale?.trim() ? input.rationale.trim().slice(0, 2000) : null,
        risk: resolved.risk === "confirm" ? "confirm" : "safe_write",
    });
    return { id, number, tool: resolved.name, card };
}

const ProposeSchema = z.object({
    tool: z.string().min(1).max(80),
    args: z.record(z.string(), z.unknown()).default({}),
    rationale: z.string().min(1).max(2000),
});

export const proposeAction = defineReadTool({
    name: "propose_action",
    label: "Proposer une action",
    description:
        "Enregistre une action (outil d'écriture + arguments) pour validation par un manager, sans l'exécuter. Utilise-le pour toute action sensible ou quand l'écriture automatique est refusée.",
    parameters: params(
        {
            tool: { type: "string", description: "Nom de l'outil d'écriture à proposer (ex. create_task, send_draft)." },
            args: { type: "object", description: "Arguments de cet outil, comme pour un appel direct." },
            rationale: { type: "string", description: "Pourquoi cette action, en une ou deux phrases (lu par le manager)." },
        },
        ["tool", "args", "rationale"],
    ),
    schema: ProposeSchema,
    requiresProject: false,
    requiredPermissions: [AGENT_RUN_PERMISSION],
    noEvidence: true,
    execute: async (args, ctx) => {
        const scope = getRunScope(ctx);
        const result = await proposeFromCall(scope, ctx, { tool: args.tool, args: args.args, rationale: args.rationale });
        return {
            proposition: result.number,
            outil: result.tool,
            carte: result.card.title,
            statut: "enregistrée pour validation",
            _note: `[Proposition #${result.number} enregistrée pour validation]. Continue sans l'exécuter.`,
        };
    },
});
