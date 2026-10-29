/**
 * Model, depth and time budget for the Assistant Projet, read from the
 * environment.
 *
 * Every limit has a floor and a ceiling so a typo in an env var cannot turn the
 * deadline off (0) or into an hour.
 *
 *   OPENAI_ASSISTANT_MODEL              standard model                         (gpt-5.5)
 *   ASSISTANT_REASONING_EFFORT          its reasoning effort                   (none)
 *   OPENAI_ASSISTANT_DEEP_MODEL         "réflexion approfondie" model          (gpt-5.2)
 *   ASSISTANT_DEEP_REASONING_EFFORT     its reasoning effort                   (high)
 *   OPENAI_ASSISTANT_FALLBACK_MODEL     used once the chosen model has failed transiently;
 *                                       "none" disables it                     (gpt-4.1)
 *   ASSISTANT_TEMPERATURE               sampling temperature, sent only to models that take it (0.7)
 *   ASSISTANT_PROVIDER_TIMEOUT_MS       time to first byte of one provider call      (45 s)
 *   ASSISTANT_STREAM_IDLE_TIMEOUT_MS    max silence inside a streamed response       (30 s)
 *   ASSISTANT_DEEP_PROVIDER_TIMEOUT_MS  same, deep turns — a reasoning model thinks before it writes (150 s)
 *   ASSISTANT_DEEP_STREAM_IDLE_TIMEOUT_MS                                            (150 s)
 *   ASSISTANT_TURN_DEADLINE_MS          whole standard turn, tools and checks included (180 s)
 *   ASSISTANT_DEEP_TURN_DEADLINE_MS     whole deep turn                               (420 s)
 *   ASSISTANT_MAX_RETRIES               retries per provider call, transient errors only (2)
 *   ASSISTANT_ACTION_TTL_HOURS          how long a confirmation card stays executable (24 h)
 *
 * On Chat Completions, GPT-5.4+ only accept function tools with reasoning
 * effort "none"; GPT-5.2 accepts tools with any effort. Hence the defaults:
 * the newest model, fast, for standard turns, and 5.2 reasoning hard for deep.
 */

/**
 * How hard one turn may dig. "deep" buys more round-trips, more tool calls and
 * a reasoning model; the manager opts in per message, since it costs more.
 */
export type AssistantDepth = "standard" | "deep";

export type ReasoningEffort = "none" | "low" | "medium" | "high";

/**
 * Output tokens include a reasoning model's hidden thinking, so the deep
 * ceiling is generous: the deadline is what really bounds a turn.
 */
export const DEPTH_LIMITS: Record<AssistantDepth, { iterations: number; toolCalls: number; maxTokens: number }> = {
    standard: { iterations: 20, toolCalls: 40, maxTokens: 16_000 },
    deep: { iterations: 40, toolCalls: 80, maxTokens: 48_000 },
};

export const DEFAULT_STANDARD_MODEL = "gpt-5.5";
export const DEFAULT_DEEP_MODEL = "gpt-5.2";
export const DEFAULT_FALLBACK_MODEL = "gpt-4.1";

export interface AssistantModelConfig {
    primary: string;
    deepModel: string;
    fallback: string | null;
    reasoningEffort: ReasoningEffort;
    deepReasoningEffort: ReasoningEffort;
    providerTimeoutMs: number;
    idleTimeoutMs: number;
    deepProviderTimeoutMs: number;
    deepIdleTimeoutMs: number;
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
    reasoningEffort: ReasoningEffort;
    deadlineMs: number;
    providerTimeoutMs: number;
    idleTimeoutMs: number;
    iterations: number;
    toolCalls: number;
    maxTokens: number;
}

function bounded(raw: string | undefined, fallback: number, min: number, max: number): number {
    const value = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.round(value)));
}

function effort(raw: string | undefined, fallback: ReasoningEffort): ReasoningEffort {
    const value = raw?.trim().toLowerCase();
    return value === "none" || value === "low" || value === "medium" || value === "high" ? value : fallback;
}

function temperature(raw: string | undefined): number {
    const value = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
    return Number.isFinite(value) ? Math.min(1.5, Math.max(0, value)) : 0.7;
}

export function getAssistantModelConfig(env: NodeJS.ProcessEnv = process.env): AssistantModelConfig {
    const fallback = env.OPENAI_ASSISTANT_FALLBACK_MODEL?.trim();
    return {
        primary: env.OPENAI_ASSISTANT_MODEL?.trim() || DEFAULT_STANDARD_MODEL,
        deepModel: env.OPENAI_ASSISTANT_DEEP_MODEL?.trim() || DEFAULT_DEEP_MODEL,
        fallback: fallback === "none" ? null : fallback || DEFAULT_FALLBACK_MODEL,
        reasoningEffort: effort(env.ASSISTANT_REASONING_EFFORT, "none"),
        deepReasoningEffort: effort(env.ASSISTANT_DEEP_REASONING_EFFORT, "high"),
        providerTimeoutMs: bounded(env.ASSISTANT_PROVIDER_TIMEOUT_MS, 45_000, 5_000, 300_000),
        idleTimeoutMs: bounded(env.ASSISTANT_STREAM_IDLE_TIMEOUT_MS, 30_000, 3_000, 300_000),
        deepProviderTimeoutMs: bounded(env.ASSISTANT_DEEP_PROVIDER_TIMEOUT_MS, 150_000, 5_000, 300_000),
        deepIdleTimeoutMs: bounded(env.ASSISTANT_DEEP_STREAM_IDLE_TIMEOUT_MS, 150_000, 3_000, 300_000),
        turnDeadlineMs: bounded(env.ASSISTANT_TURN_DEADLINE_MS, 180_000, 10_000, 600_000),
        deepTurnDeadlineMs: bounded(env.ASSISTANT_DEEP_TURN_DEADLINE_MS, 420_000, 20_000, 600_000),
        maxRetries: bounded(env.ASSISTANT_MAX_RETRIES, 2, 0, 4),
        temperature: temperature(env.ASSISTANT_TEMPERATURE),
    };
}

export function planTurn(config: AssistantModelConfig, depth: AssistantDepth): TurnPlan {
    const limits = DEPTH_LIMITS[depth];
    const deep = depth === "deep";
    const model = deep ? config.deepModel : config.primary;
    // Deep falls back to the standard model: a quicker answer beats no answer.
    const fallback = config.fallback ?? (deep ? config.primary : null);
    return {
        depth,
        model,
        fallback: fallback && fallback !== model ? fallback : null,
        reasoningEffort: deep ? config.deepReasoningEffort : config.reasoningEffort,
        deadlineMs: deep ? config.deepTurnDeadlineMs : config.turnDeadlineMs,
        providerTimeoutMs: deep ? config.deepProviderTimeoutMs : config.providerTimeoutMs,
        idleTimeoutMs: deep ? config.deepIdleTimeoutMs : config.idleTimeoutMs,
        ...limits,
    };
}

export function getActionTtlMs(env: NodeJS.ProcessEnv = process.env): number {
    return bounded(env.ASSISTANT_ACTION_TTL_HOURS, 24, 1, 24 * 7) * 3_600_000;
}
