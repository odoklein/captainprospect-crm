-- AI usage ledger (one row per model call, every surface) and the cached /
-- reasoning token counters on assistant runs. Additive and idempotent, like the
-- other assistant migrations: a re-run is harmless.

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiUsage" (
    "id" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "endpointHost" TEXT,
    "model" TEXT NOT NULL,
    "tier" TEXT,
    "dataClass" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "reasoningTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costEur" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "userId" TEXT,
    "clientId" TEXT,
    "missionId" TEXT,
    "conversationId" TEXT,
    "runId" TEXT,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");
CREATE INDEX IF NOT EXISTS "AiUsage_userId_createdAt_idx" ON "AiUsage"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiUsage_surface_createdAt_idx" ON "AiUsage"("surface", "createdAt");
CREATE INDEX IF NOT EXISTS "AiUsage_runId_idx" ON "AiUsage"("runId");

-- AlterTable: cached / reasoning counters, tier and provider on assistant runs
ALTER TABLE "AssistantProjetRun" ADD COLUMN IF NOT EXISTS "cachedInputTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AssistantProjetRun" ADD COLUMN IF NOT EXISTS "reasoningTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AssistantProjetRun" ADD COLUMN IF NOT EXISTS "tier" TEXT;
ALTER TABLE "AssistantProjetRun" ADD COLUMN IF NOT EXISTS "provider" TEXT;
