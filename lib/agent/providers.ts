/**
 * Which model a background phase runs on. Isolated so Track A's provider
 * layer (`lib/ai/providers/*`, routing tiers) can replace the body without
 * touching the worker: today it is the chat's own plan + OpenAI key.
 *
 *   standard → planTurn(config, "standard")   (digests, short syntheses)
 *   gather   → the same (cheap reads)         (Track A will route it lower)
 *   deep     → planTurn(config, "deep")       (reports, mission planning)
 */

import { getAssistantModelConfig, planTurn, type AssistantModelConfig, type TurnPlan } from "@/lib/ai/agent/models";
import { openAIChatFn, type ChatFn } from "@/lib/ai/agent/runtime";
import { integrationKey } from "@/lib/integrations/keys";
import type { ModelTier } from "./types";

export class AgentNotConfigured extends Error {
    constructor(message = "L'agent n'est pas configuré : OPENAI_API_KEY est absente (Paramètres → Intégrations).") {
        super(message);
        this.name = "AgentNotConfigured";
    }
}

export interface TierProvider {
    chat: ChatFn;
    config: AssistantModelConfig;
    plan: TurnPlan;
}

export function isAgentConfigured(): boolean {
    return Boolean(integrationKey("OPENAI_API_KEY"));
}

export function chatForTier(tier: ModelTier, env: NodeJS.ProcessEnv = process.env): TierProvider {
    const apiKey = integrationKey("OPENAI_API_KEY");
    if (!apiKey) throw new AgentNotConfigured();
    const config = getAssistantModelConfig(env);
    const plan = planTurn(config, tier === "deep" ? "deep" : "standard");
    return { chat: openAIChatFn(apiKey), config, plan };
}
