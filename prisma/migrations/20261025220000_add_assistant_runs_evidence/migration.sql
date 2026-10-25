-- Assistant Projet: agent runs (cost, latency, outcome, one-turn lock) and the
-- evidence ledger (what each read returned, citable and openable).
-- Additive only: no existing table or column changes. Idempotent, like the
-- other assistant migrations, so a re-run is harmless.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "AssistantRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT', 'ABANDONED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "AssistantEvidenceStatus" AS ENUM ('OK', 'EMPTY', 'ERROR');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AssistantProjetRun" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "lockKey" TEXT,
    "userId" TEXT NOT NULL,
    "clientId" TEXT,
    "missionId" TEXT,
    "status" "AssistantRunStatus" NOT NULL DEFAULT 'RUNNING',
    "model" TEXT,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "costEur" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "firstTokenMs" INTEGER,
    "iterations" INTEGER NOT NULL DEFAULT 0,
    "toolCalls" INTEGER NOT NULL DEFAULT 0,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "verification" JSONB,
    "messageId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AssistantProjetRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssistantProjetEvidence" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT,
    "missionId" TEXT,
    "tool" TEXT NOT NULL,
    "argsHash" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "status" "AssistantEvidenceStatus" NOT NULL,
    "errorCode" TEXT,
    "summary" TEXT NOT NULL,
    "facts" JSONB,
    "period" JSONB,
    "resultDigest" TEXT,
    "payload" JSONB,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantProjetEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AssistantProjetRun_lockKey_key" ON "AssistantProjetRun"("lockKey");
CREATE INDEX IF NOT EXISTS "AssistantProjetRun_conversationId_startedAt_idx" ON "AssistantProjetRun"("conversationId", "startedAt");
CREATE INDEX IF NOT EXISTS "AssistantProjetRun_userId_startedAt_idx" ON "AssistantProjetRun"("userId", "startedAt");
CREATE INDEX IF NOT EXISTS "AssistantProjetEvidence_conversationId_tool_argsHash_idx" ON "AssistantProjetEvidence"("conversationId", "tool", "argsHash");
CREATE INDEX IF NOT EXISTS "AssistantProjetEvidence_runId_idx" ON "AssistantProjetEvidence"("runId");
CREATE INDEX IF NOT EXISTS "AssistantProjetEvidence_expiresAt_idx" ON "AssistantProjetEvidence"("expiresAt");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "AssistantProjetRun" ADD CONSTRAINT "AssistantProjetRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantProjetConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantProjetEvidence" ADD CONSTRAINT "AssistantProjetEvidence_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AssistantProjetRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
