/**
 * Runtime adapter for the eval runner: one scenario in, one normalised result
 * out. Swapping the runtime under test only touches this file.
 */

import { runAssistantTurn, buildToolUsagePrompt } from "@/lib/ai/tools/loop";
import { getAssistantSystemPrompt } from "@/lib/assistant/projet/systemPrompt";
import type { AssistantContext } from "@/lib/ai/tools/types";
import type { EvalTurnResult, Scenario } from "./scenarios";

export const RUNTIME_NAME = "legacy-loop";

export async function runEvalTurn(scenario: Scenario, ctx: AssistantContext, apiKey: string): Promise<EvalTurnResult> {
    const systemPrompt = [getAssistantSystemPrompt(ctx), buildToolUsagePrompt(ctx)].join("\n\n");
    const startedAt = Date.now();
    try {
        const turn = await runAssistantTurn({
            systemPrompt,
            history: [...(scenario.history ?? []), { role: "user", content: scenario.prompt }],
            ctx,
            apiKey,
        });
        return {
            answer: turn.answer,
            proposedActionTool: turn.proposedAction?.tool ?? null,
            trace: turn.trace.map((t) => ({ tool: t.tool, ok: t.ok, errorCode: t.errorCode })),
            latencyMs: Date.now() - startedAt,
            firstTextMs: null,
            usage: {
                promptTokens: turn.usage.promptTokens,
                completionTokens: turn.usage.completionTokens,
                costEur: turn.usage.costEur,
            },
            model: turn.model,
            verification: null,
        };
    } catch (error) {
        return {
            answer: "",
            proposedActionTool: null,
            trace: [],
            latencyMs: Date.now() - startedAt,
            firstTextMs: null,
            usage: { promptTokens: 0, completionTokens: 0, costEur: 0 },
            model: "",
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
