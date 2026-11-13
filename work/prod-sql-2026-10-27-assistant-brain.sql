-- app.captainprospect.fr (Supabase) — schema catch-up for main @ 86e4796 (feat/assistant-brain).
-- Everything is additive and idempotent: re-running it is harmless, and the app runs without it
-- (InstanceLicense missing = "unlimited", the two Assistant tables aren't read by any code yet).
-- BrandSettings (20261025120000) is already in the database, so it's not here.
--
-- Run it in the Supabase SQL editor or psql, as a script, NOT inside one transaction:
-- CREATE INDEX CONCURRENTLY refuses to run in a transaction block.

-- ===== 1. 20261024120000_action_created_idx (speed only: stats / client intelligence)
-- CONCURRENTLY so SDRs keep writing to "Action" (76k rows) while it builds.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Action_createdAt_idx" ON "Action"("createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Action_campaignId_createdAt_idx" ON "Action"("campaignId", "createdAt");

-- ===== 2. 20261025220000_add_assistant_runs_evidence
DO $$ BEGIN
    CREATE TYPE "AssistantRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT', 'ABANDONED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "AssistantEvidenceStatus" AS ENUM ('OK', 'EMPTY', 'ERROR');
EXCEPTION WHEN duplicate_object THEN null; END $$;

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

CREATE UNIQUE INDEX IF NOT EXISTS "AssistantProjetRun_lockKey_key" ON "AssistantProjetRun"("lockKey");
CREATE INDEX IF NOT EXISTS "AssistantProjetRun_conversationId_startedAt_idx" ON "AssistantProjetRun"("conversationId", "startedAt");
CREATE INDEX IF NOT EXISTS "AssistantProjetRun_userId_startedAt_idx" ON "AssistantProjetRun"("userId", "startedAt");
CREATE INDEX IF NOT EXISTS "AssistantProjetEvidence_conversationId_tool_argsHash_idx" ON "AssistantProjetEvidence"("conversationId", "tool", "argsHash");
CREATE INDEX IF NOT EXISTS "AssistantProjetEvidence_runId_idx" ON "AssistantProjetEvidence"("runId");
CREATE INDEX IF NOT EXISTS "AssistantProjetEvidence_expiresAt_idx" ON "AssistantProjetEvidence"("expiresAt");

DO $$ BEGIN
    ALTER TABLE "AssistantProjetRun" ADD CONSTRAINT "AssistantProjetRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantProjetConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantProjetEvidence" ADD CONSTRAINT "AssistantProjetEvidence_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AssistantProjetRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===== 3. 20261026100000_add_instance_license (no row = no seat limit, all features on)
CREATE TABLE IF NOT EXISTS "InstanceLicense" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "plan" TEXT,
    "seatLimit" INTEGER,
    "features" JSONB NOT NULL DEFAULT '{}',
    "aiMonthlyQuota" INTEGER,
    "suspendedReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "InstanceLicense_pkey" PRIMARY KEY ("id")
);

-- ===== Check: expect 5 rows, all true
SELECT n, to_regclass(n) IS NOT NULL AS present
FROM unnest(ARRAY['"Action_createdAt_idx"', '"Action_campaignId_createdAt_idx"', '"AssistantProjetRun"', '"AssistantProjetEvidence"', '"InstanceLicense"']) AS n;
