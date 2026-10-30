/**
 * AI token and cost accounting.
 *
 * Prices come from the provider catalog. The cost formula bills cached input
 * at the cached price and treats reasoning tokens as output, which is how the
 * providers bill. `getUserAiUsage` reads the AiUsage ledger when it exists and
 * falls back to the per-message traces for deployments that predate it.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { LEGACY_PRICING, priceFor } from "./providers/catalog";

/** Legacy view of the catalog (USD per million, OpenAI only). Kept for older callers and tests. */
export const OPENAI_PRICING: Record<string, { inputPerMillion: number; outputPerMillion: number }> = LEGACY_PRICING;

/** Standard EUR/USD exchange rate conversion */
export const EUR_USD_RATE = 0.92;

export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    model?: string;
}

export interface UsageCost {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
    costEur: number;
    model: string;
}

/** Either naming works: the runtime's `Usage` or the older trace `promptTokens`/`completionTokens`. */
export interface UsageLike {
    inputTokens?: number;
    promptTokens?: number;
    cachedInputTokens?: number;
    outputTokens?: number;
    completionTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
}

const round6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

/**
 * Cost in USD and EUR for one call or one turn.
 *
 *   calculateTokenCost(promptTokens, completionTokens, model)   // legacy
 *   calculateTokenCost({ inputTokens, cachedInputTokens, outputTokens }, model)
 */
export function calculateTokenCost(promptTokens: number, completionTokens: number, modelName?: string): { costUsd: number; costEur: number };
export function calculateTokenCost(usage: UsageLike, modelName?: string): { costUsd: number; costEur: number };
export function calculateTokenCost(
    first: number | UsageLike,
    second?: number | string,
    third?: string,
): { costUsd: number; costEur: number } {
    let input: number;
    let cached: number;
    let output: number;
    let model: string;
    if (typeof first === "number") {
        input = first;
        cached = 0;
        output = typeof second === "number" ? second : 0;
        model = third ?? "gpt-4o-mini";
    } else {
        input = first.inputTokens ?? first.promptTokens ?? 0;
        cached = Math.min(first.cachedInputTokens ?? 0, input);
        output = first.outputTokens ?? first.completionTokens ?? 0;
        model = typeof second === "string" ? second : "gpt-4o-mini";
    }
    const price = priceFor(model);
    const costUsd =
        ((input - cached) * price.inputPerM + cached * price.cachedInputPerM + output * price.outputPerM) / 1_000_000;
    return { costUsd: round6(costUsd), costEur: round6(costUsd * EUR_USD_RATE) };
}

export interface UsageBucket {
    tokens: number;
    promptTokens: number;
    completionTokens: number;
    cachedInputTokens: number;
    costEur: number;
    requestCount: number;
}

export interface UserAiUsageSummary {
    today: UsageBucket;
    total: UsageBucket;
    defaultModel: string;
    /** "ledger" = AiUsage rows (per model call); "traces" = per-message traces (older deployments). */
    source: "ledger" | "traces";
    bySurface: Array<{ surface: string; costEur: number; requestCount: number }>;
    byProvider: Array<{ provider: string; costEur: number; requestCount: number }>;
    /** Share of input tokens served from the prompt cache, over `total`. */
    cachedRatio: number;
}

const emptyBucket = (): UsageBucket => ({ tokens: 0, promptTokens: 0, completionTokens: 0, cachedInputTokens: 0, costEur: 0, requestCount: 0 });

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

function isMissingTable(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2021" || error.code === "P2022");
}

async function usageFromLedger(userId: string, todayStart: Date): Promise<UserAiUsageSummary | null> {
    const sum = { inputTokens: true, cachedInputTokens: true, outputTokens: true, costEur: true } as const;
    const [total, today, bySurface, byProvider] = await Promise.all([
        prisma.aiUsage.aggregate({ where: { userId }, _sum: sum, _count: { _all: true } }),
        prisma.aiUsage.aggregate({ where: { userId, createdAt: { gte: todayStart } }, _sum: sum, _count: { _all: true } }),
        prisma.aiUsage.groupBy({ by: ["surface"], where: { userId }, _sum: { costEur: true }, _count: { _all: true } }),
        prisma.aiUsage.groupBy({ by: ["provider"], where: { userId }, _sum: { costEur: true }, _count: { _all: true } }),
    ]);
    if (total._count._all === 0) return null;

    const bucket = (agg: typeof total): UsageBucket => {
        const prompt = agg._sum.inputTokens ?? 0;
        const completion = agg._sum.outputTokens ?? 0;
        return {
            tokens: prompt + completion,
            promptTokens: prompt,
            completionTokens: completion,
            cachedInputTokens: agg._sum.cachedInputTokens ?? 0,
            costEur: round4(agg._sum.costEur ?? 0),
            requestCount: agg._count._all,
        };
    };
    const totalBucket = bucket(total);
    return {
        today: bucket(today),
        total: totalBucket,
        defaultModel: process.env.OPENAI_ASSISTANT_MODEL || "gpt-5.5",
        source: "ledger",
        bySurface: bySurface.map((r) => ({ surface: r.surface, costEur: round4(r._sum.costEur ?? 0), requestCount: r._count._all })),
        byProvider: byProvider.map((r) => ({ provider: r.provider, costEur: round4(r._sum.costEur ?? 0), requestCount: r._count._all })),
        cachedRatio: totalBucket.promptTokens > 0 ? round4(totalBucket.cachedInputTokens / totalBucket.promptTokens) : 0,
    };
}

async function usageFromTraces(userId: string, todayStart: Date): Promise<UserAiUsageSummary> {
    const messages = await prisma.assistantMessage.findMany({
        where: { conversation: { createdById: userId }, role: "ASSISTANT", trace: { not: undefined } },
        select: { trace: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 500,
    });

    const today = emptyBucket();
    const total = emptyBucket();
    for (const msg of messages) {
        const trace = msg.trace as Record<string, unknown> | null;
        if (!trace) continue;
        const usage = (trace.usage || trace) as {
            promptTokens?: number;
            completionTokens?: number;
            totalTokens?: number;
            cachedInputTokens?: number;
            costEur?: number;
            model?: string;
        } | null;
        const pTokens = Number(usage?.promptTokens || 0);
        const cTokens = Number(usage?.completionTokens || 0);
        const tTokens = Number(usage?.totalTokens || pTokens + cTokens);
        if (tTokens <= 0) continue;
        const cached = Number(usage?.cachedInputTokens || 0);
        const costEur =
            typeof usage?.costEur === "number" && usage.costEur > 0
                ? usage.costEur
                : calculateTokenCost({ promptTokens: pTokens, completionTokens: cTokens, cachedInputTokens: cached }, String(usage?.model || "gpt-4o-mini")).costEur;
        const add = (b: UsageBucket) => {
            b.tokens += tTokens;
            b.promptTokens += pTokens;
            b.completionTokens += cTokens;
            b.cachedInputTokens += cached;
            b.costEur += costEur;
            b.requestCount += 1;
        };
        add(total);
        if (msg.createdAt >= todayStart) add(today);
    }
    today.costEur = round4(today.costEur);
    total.costEur = round4(total.costEur);
    return {
        today,
        total,
        defaultModel: process.env.OPENAI_ASSISTANT_MODEL || "gpt-5.5",
        source: "traces",
        bySurface: total.requestCount > 0 ? [{ surface: "assistant.chat", costEur: total.costEur, requestCount: total.requestCount }] : [],
        byProvider: total.requestCount > 0 ? [{ provider: "openai", costEur: total.costEur, requestCount: total.requestCount }] : [],
        cachedRatio: total.promptTokens > 0 ? round4(total.cachedInputTokens / total.promptTokens) : 0,
    };
}

/**
 * Aggregate AI usage and euro consumption for a user: the ledger when it has
 * rows for them, the message traces otherwise (and when the table is missing).
 */
export async function getUserAiUsage(userId: string): Promise<UserAiUsageSummary> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    try {
        const fromLedger = await usageFromLedger(userId, todayStart);
        if (fromLedger) return fromLedger;
    } catch (error) {
        if (!isMissingTable(error)) throw error;
    }
    return usageFromTraces(userId, todayStart);
}
