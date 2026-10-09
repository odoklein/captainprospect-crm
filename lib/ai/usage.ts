/**
 * AI Token & Cost Tracking Service
 *
 * Tracks OpenAI token usage and calculates costs in EUR using real-time
 * model pricing tables (specifically optimized for low-cost models like gpt-4o-mini).
 */

import { prisma } from "@/lib/prisma";

export const OPENAI_PRICING: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
    "gpt-4o-mini": {
        inputPerMillion: 0.15,
        outputPerMillion: 0.60,
    },
    "gpt-4.1-mini": {
        inputPerMillion: 0.20,
        outputPerMillion: 0.80,
    },
    "gpt-4o": {
        inputPerMillion: 2.50,
        outputPerMillion: 10.00,
    },
    "o3-mini": {
        inputPerMillion: 1.10,
        outputPerMillion: 4.40,
    },
};

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

/**
 * Calculates token cost in USD and EUR based on the model pricing.
 */
export function calculateTokenCost(
    promptTokens: number,
    completionTokens: number,
    modelName: string = "gpt-4o-mini"
): { costUsd: number; costEur: number } {
    const key = Object.keys(OPENAI_PRICING).find((k) =>
        modelName.toLowerCase().includes(k.toLowerCase())
    ) || "gpt-4o-mini";

    const pricing = OPENAI_PRICING[key] || OPENAI_PRICING["gpt-4o-mini"];
    const costUsd =
        (promptTokens * pricing.inputPerMillion) / 1_000_000 +
        (completionTokens * pricing.outputPerMillion) / 1_000_000;
    const costEur = costUsd * EUR_USD_RATE;

    return {
        costUsd: Math.round(costUsd * 1_000_000) / 1_000_000,
        costEur: Math.round(costEur * 1_000_000) / 1_000_000,
    };
}

export interface UserAiUsageSummary {
    today: {
        tokens: number;
        promptTokens: number;
        completionTokens: number;
        costEur: number;
        requestCount: number;
    };
    total: {
        tokens: number;
        promptTokens: number;
        completionTokens: number;
        costEur: number;
        requestCount: number;
    };
    defaultModel: string;
}

/**
 * Retrieves aggregate AI token usage and calculated euro consumption for a user.
 */
export async function getUserAiUsage(userId: string): Promise<UserAiUsageSummary> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Fetch messages where this user was the author of the conversation
    const messages = await prisma.assistantMessage.findMany({
        where: {
            conversation: {
                createdById: userId,
            },
            role: "ASSISTANT",
            trace: {
                not: undefined,
            },
        },
        select: {
            trace: true,
            createdAt: true,
        },
        orderBy: {
            createdAt: "desc",
        },
        take: 500,
    });

    let todayTokens = 0;
    let todayPromptTokens = 0;
    let todayCompletionTokens = 0;
    let todayCostEur = 0;
    let todayCount = 0;

    let totalTokens = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalCostEur = 0;
    let totalCount = 0;

    for (const msg of messages) {
        const trace = msg.trace as Record<string, unknown> | null;
        if (!trace) continue;

        // Trace may contain a usage sub-object or top-level usage
        const usage = (trace.usage || trace) as {
            promptTokens?: number;
            completionTokens?: number;
            totalTokens?: number;
            model?: string;
        } | null;

        const pTokens = Number(usage?.promptTokens || 0);
        const cTokens = Number(usage?.completionTokens || 0);
        const tTokens = Number(usage?.totalTokens || pTokens + cTokens);
        const model = String(usage?.model || "gpt-4o-mini");

        if (tTokens > 0) {
            const { costEur } = calculateTokenCost(pTokens, cTokens, model);
            totalTokens += tTokens;
            totalPromptTokens += pTokens;
            totalCompletionTokens += cTokens;
            totalCostEur += costEur;
            totalCount += 1;

            if (msg.createdAt >= todayStart) {
                todayTokens += tTokens;
                todayPromptTokens += pTokens;
                todayCompletionTokens += cTokens;
                todayCostEur += costEur;
                todayCount += 1;
            }
        }
    }

    return {
        today: {
            tokens: todayTokens,
            promptTokens: todayPromptTokens,
            completionTokens: todayCompletionTokens,
            costEur: Math.round(todayCostEur * 10_000) / 10_000,
            requestCount: todayCount,
        },
        total: {
            tokens: totalTokens,
            promptTokens: totalPromptTokens,
            completionTokens: totalCompletionTokens,
            costEur: Math.round(totalCostEur * 10_000) / 10_000,
            requestCount: totalCount,
        },
        defaultModel: process.env.OPENAI_ASSISTANT_MODEL || "gpt-4o-mini",
    };
}
