/**
 * The AI usage ledger: one row per model call, whatever the surface.
 *
 * Fire-and-forget by design — accounting must never slow down or fail a turn.
 * A missing table (migration not applied yet) is logged once and ignored, in
 * line with the evidence store's convention.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateTokenCost } from "./usage";
import { endpointFor, resolveModel } from "./providers/catalog";
import type { DataClass, Usage } from "./providers/types";

export interface AiUsageEntry {
    /** "assistant.chat", "assistant.summary", "analyse_ia", "weekly_bilan", … */
    surface: string;
    model: string;
    usage: Usage;
    latencyMs?: number | null;
    tier?: string | null;
    dataClass?: DataClass | null;
    userId?: string | null;
    clientId?: string | null;
    missionId?: string | null;
    conversationId?: string | null;
    /** AssistantRun id (chat) or AgentRun id (background). */
    runId?: string | null;
    jobId?: string | null;
}

let warnedMissing = false;

function isMissingTable(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2021" || error.code === "P2022");
}

/** Writes one ledger row; returns immediately. */
export function recordAiUsage(entry: AiUsageEntry): void {
    void writeAiUsage(entry).catch((error) => {
        if (isMissingTable(error)) {
            if (!warnedMissing) {
                warnedMissing = true;
                console.warn("[ai.ledger] AiUsage table missing — migration applied? Usage is not being recorded.");
            }
            return;
        }
        console.error("[ai.ledger] usage not recorded", error);
    });
}

export async function writeAiUsage(entry: AiUsageEntry): Promise<void> {
    const spec = resolveModel(entry.model);
    const endpoint = endpointFor(spec.provider);
    const cost = calculateTokenCost(entry.usage, entry.model);
    let host: string | null = null;
    try {
        host = new URL(endpoint.baseUrl).host;
    } catch {
        host = null;
    }
    await prisma.aiUsage.create({
        data: {
            surface: entry.surface,
            provider: spec.provider,
            endpointHost: host,
            model: entry.model,
            tier: entry.tier ?? null,
            dataClass: entry.dataClass ?? null,
            inputTokens: entry.usage.inputTokens,
            cachedInputTokens: entry.usage.cachedInputTokens,
            outputTokens: entry.usage.outputTokens,
            reasoningTokens: entry.usage.reasoningTokens,
            costUsd: cost.costUsd,
            costEur: cost.costEur,
            latencyMs: entry.latencyMs ?? null,
            userId: entry.userId ?? null,
            clientId: entry.clientId ?? null,
            missionId: entry.missionId ?? null,
            conversationId: entry.conversationId ?? null,
            runId: entry.runId ?? null,
            jobId: entry.jobId ?? null,
        },
        select: { id: true },
    });
}
