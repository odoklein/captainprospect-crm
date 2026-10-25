/**
 * Model, depth and time budget for the Assistant Projet, read from the
 * environment.
 *
 * Every limit has a floor and a ceiling so a typo in an env var cannot turn the
 * deadline off (0) or into an hour.
 *
 *   OPENAI_ASSISTANT_MODEL              standard model                         (gpt-4o-mini)
 *   OPENAI_ASSISTANT_DEEP_MODEL         "réflexion approfondie" model          (gpt-4.1)
 *   OPENAI_ASSISTANT_FALLBACK_MODEL     used once the chosen model has failed transiently;
 *                                       unset = none in standard, the standard model in deep
 *   ASSISTANT_PROVIDER_TIMEOUT_MS       time to first byte of one provider call      (30 s)
 *   ASSISTANT_STREAM_IDLE_TIMEOUT_MS    max silence inside a streamed response       (20 s)
 *   ASSISTANT_TURN_DEADLINE_MS          whole standard turn, tools and checks included (90 s)
 *   ASSISTANT_DEEP_TURN_DEADLINE_MS     whole deep turn                               (180 s)
 *   ASSISTANT_MAX_RETRIES               retries per provider call, transient errors only (2)
 *   ASSISTANT_ACTION_TTL_HOURS          how long a confirmation card stays executable (24 h)
 */

import { DEFAULT_LOW_COST_MODEL } from "@/lib/ai/openai";

/**
 * How hard one turn may dig. "deep" buys more round-trips, more tool calls and
 * a stronger model; the manager opts in per message, since it costs more.
 */
export type AssistantDepth = "standard" | "deep";

export const DEPTH_LIMITS: Record<AssistantDepth, { iterations: number; toolCalls: number; maxTokens: number }> = {
    standard: { iterations: 8, toolCalls: 12, maxTokens: 1800 },
    deep: { iterations: 14, toolCalls: 25, maxTokens: 3500 },
};

export const DEFAULT_DEEP_MODEL = "gpt-4.1";

export interface AssistantModelConfig {
    primary: string;
    deepModel: string;
    fallback: string | null;
    providerTimeoutMs: number;
    idleTimeoutMs: number;
    turnDeadlineMs: number;
    deepTurnDeadlineMs: number;
    maxRetries: number;
    temperature: number;
}

/** What one turn at a given depth runs with. */
export interface TurnPlan {
    depth: AssistantDepth;
    model: string;
    fallback: string | null;
    deadlineMs: number;
    iterations: number;
    toolCalls: number;
    maxTokens: number;
}

function bounded(raw: string | undefined, fallback: number, min: number, max: number): number {
    const value = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.round(value)));
}

export function getAssistantModelConfig(env: NodeJS.ProcessEnv = process.env): AssistantModelConfig {
    return {
        primary: env.OPENAI_ASSISTANT_MODEL?.trim() || DEFAULT_LOW_COST_MODEL,
        deepModel: env.OPENAI_ASSISTANT_DEEP_MODEL?.trim() || DEFAULT_DEEP_MODEL,
        fallback: env.OPENAI_ASSISTANT_FALLBACK_MODEL?.trim() || null,
        providerTimeoutMs: bounded(env.ASSISTANT_PROVIDER_TIMEOUT_MS, 30_000, 5_000, 120_000),
        idleTimeoutMs: bounded(env.ASSISTANT_STREAM_IDLE_TIMEOUT_MS, 20_000, 3_000, 120_000),
        turnDeadlineMs: bounded(env.ASSISTANT_TURN_DEADLINE_MS, 90_000, 10_000, 280_000),
        deepTurnDeadlineMs: bounded(env.ASSISTANT_DEEP_TURN_DEADLINE_MS, 180_000, 20_000, 280_000),
        maxRetries: bounded(env.ASSISTANT_MAX_RETRIES, 2, 0, 4),
        temperature: 0.3,
    };
}

export function planTurn(config: AssistantModelConfig, depth: AssistantDepth): TurnPlan {
    const limits = DEPTH_LIMITS[depth];
    const model = depth === "deep" ? config.deepModel : config.primary;
    // Deep falls back to the standard model: a cheaper answer beats no answer.
    const fallback = config.fallback ?? (depth === "deep" ? config.primary : null);
    return {
        depth,
        model,
        fallback: fallback && fallback !== model ? fallback : null,
        deadlineMs: depth === "deep" ? config.deepTurnDeadlineMs : config.turnDeadlineMs,
        ...limits,
    };
}

export function getActionTtlMs(env: NodeJS.ProcessEnv = process.env): number {
    return bounded(env.ASSISTANT_ACTION_TTL_HOURS, 24, 1, 24 * 7) * 3_600_000;
}
