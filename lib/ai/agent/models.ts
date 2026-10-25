/**
 * Model and time budget for the Assistant Projet, read from the environment.
 *
 * Every limit has a floor and a ceiling so a typo in an env var cannot turn the
 * deadline off (0) or into an hour.
 *
 *   OPENAI_ASSISTANT_MODEL              primary model            (gpt-4o-mini)
 *   OPENAI_ASSISTANT_FALLBACK_MODEL     used once the primary has failed transiently (unset = none)
 *   ASSISTANT_PROVIDER_TIMEOUT_MS       time to first byte of one provider call   (30 s)
 *   ASSISTANT_STREAM_IDLE_TIMEOUT_MS    max silence inside a streamed response    (20 s)
 *   ASSISTANT_TURN_DEADLINE_MS          whole turn, tools and verification included (90 s)
 *   ASSISTANT_MAX_RETRIES               retries per provider call, transient errors only (2)
 *   ASSISTANT_ACTION_TTL_HOURS          how long a confirmation card stays executable (24 h)
 */

import { DEFAULT_LOW_COST_MODEL } from "@/lib/ai/openai";

export interface AssistantModelConfig {
    primary: string;
    fallback: string | null;
    providerTimeoutMs: number;
    idleTimeoutMs: number;
    turnDeadlineMs: number;
    maxRetries: number;
    temperature: number;
    maxTokens: number;
}

function bounded(raw: string | undefined, fallback: number, min: number, max: number): number {
    const value = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.round(value)));
}

export function getAssistantModelConfig(env: NodeJS.ProcessEnv = process.env): AssistantModelConfig {
    const primary = env.OPENAI_ASSISTANT_MODEL?.trim() || DEFAULT_LOW_COST_MODEL;
    const fallback = env.OPENAI_ASSISTANT_FALLBACK_MODEL?.trim() || null;
    return {
        primary,
        fallback: fallback && fallback !== primary ? fallback : null,
        providerTimeoutMs: bounded(env.ASSISTANT_PROVIDER_TIMEOUT_MS, 30_000, 5_000, 120_000),
        idleTimeoutMs: bounded(env.ASSISTANT_STREAM_IDLE_TIMEOUT_MS, 20_000, 3_000, 120_000),
        turnDeadlineMs: bounded(env.ASSISTANT_TURN_DEADLINE_MS, 90_000, 10_000, 280_000),
        maxRetries: bounded(env.ASSISTANT_MAX_RETRIES, 2, 0, 4),
        temperature: 0.3,
        maxTokens: 1500,
    };
}

export function getActionTtlMs(env: NodeJS.ProcessEnv = process.env): number {
    return bounded(env.ASSISTANT_ACTION_TTL_HOURS, 24, 1, 24 * 7) * 3_600_000;
}
