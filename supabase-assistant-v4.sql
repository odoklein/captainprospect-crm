-- Captain AI v4 — assistant schema for the instance database (Supabase).
--
-- Why: the instance database stopped at 2026-09-24, so the conversation table
-- lacks folder / kind / visibility / pin / rolling-summary columns, and the
-- run + evidence tables were never created. Creating a conversation then fails
-- with a 500 (Prisma writes the kind/visibility defaults into a missing column).
--
-- Safe to run more than once: every type, table, column, index and constraint
-- is guarded. Run it in the Supabase SQL editor, or with:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase-assistant-v4.sql
--
-- Order matters: run tables (run + evidence) first, then the columns that
-- depend on them, then the usage ledger and the agent job tables.

-- ============================================================
-- 20261025220000_add_assistant_runs_evidence
-- ============================================================

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

-- ============================================================
-- 20261030100000_add_assistant_folders_memory_files
-- ============================================================

-- Captain AI v4, Track B PR1: assistant folders, memory, file text + chunks,
-- pinned visuals, and the folder/visibility/summary columns on conversations
-- and messages.
-- Additive only: no existing column changes, no data rewrite. Idempotent like
-- the other assistant migrations, so a re-run (or the hand-applied prod copy
-- in work/) is harmless. Physical names carry the AssistantProjet prefix
-- because a sister app shares the production database.

-- pg_trgm is optional (fuzzy file/memory search is runtime-detected). Where
-- the role may not create extensions, or the contrib package is missing, we
-- only notice.
DO $$ BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION
    WHEN insufficient_privilege THEN RAISE NOTICE 'pg_trgm not created: insufficient privilege (optional)';
    WHEN feature_not_supported THEN RAISE NOTICE 'pg_trgm not created: extension unavailable (optional)';
    WHEN undefined_file THEN RAISE NOTICE 'pg_trgm not created: extension files missing (optional)';
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "AssistantFolderKind" AS ENUM ('CLIENT', 'GENERAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "AssistantConversationKind" AS ENUM ('CHAT', 'AGENT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "AssistantVisibility" AS ENUM ('PRIVATE', 'SHARED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "AssistantMemoryScope" AS ENUM ('AGENCY', 'FOLDER', 'USER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "AssistantMemoryKind" AS ENUM ('FACT', 'PREFERENCE', 'DECISION', 'CONTACT', 'GOAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "AssistantFileTextStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'NEEDS_OCR', 'UNSUPPORTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AssistantProjetFolder" (
    "id" TEXT NOT NULL,
    "kind" "AssistantFolderKind" NOT NULL,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "icon" TEXT,
    "instructions" TEXT,
    "starterQuestions" JSONB,
    "settings" JSONB,
    "storageFolderId" TEXT,
    "createdById" TEXT NOT NULL,
    "lastActivityAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantProjetFolder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssistantProjetMemory" (
    "id" TEXT NOT NULL,
    "scope" "AssistantMemoryScope" NOT NULL,
    "folderId" TEXT,
    "userId" TEXT,
    "missionId" TEXT,
    "kind" "AssistantMemoryKind" NOT NULL DEFAULT 'FACT',
    "content" VARCHAR(600) NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "contentKey" TEXT NOT NULL,
    "source" JSONB,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantProjetMemory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssistantProjetFileText" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "status" "AssistantFileTextStatus" NOT NULL DEFAULT 'PENDING',
    "text" TEXT,
    "pages" INTEGER,
    "chars" INTEGER NOT NULL DEFAULT 0,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "extractor" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "extractedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantProjetFileText_pkey" PRIMARY KEY ("id")
);

-- "tsv" is a stored generated column (Prisma: Unsupported("tsvector")?):
-- Postgres maintains it, the app only reads it.
CREATE TABLE IF NOT EXISTS "AssistantProjetFileChunk" (
    "id" TEXT NOT NULL,
    "fileTextId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "page" INTEGER,
    "heading" TEXT,
    "content" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "tsv" tsvector GENERATED ALWAYS AS (to_tsvector('french', "content")) STORED,

    CONSTRAINT "AssistantProjetFileChunk_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssistantProjetPin" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "visual" JSONB NOT NULL,
    "source" JSONB,
    "question" TEXT,
    "conversationId" TEXT,
    "messageId" TEXT,
    "createdById" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "refreshedAt" TIMESTAMP(3),
    "refreshError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantProjetPin_pkey" PRIMARY KEY ("id")
);

-- AlterTable: conversations get a folder, a kind, a visibility and the
-- rolling-summary bookkeeping; messages get attachments, feedback, supersededAt.
ALTER TABLE "AssistantProjetConversation"
    ADD COLUMN IF NOT EXISTS "folderId" TEXT,
    ADD COLUMN IF NOT EXISTS "kind" "AssistantConversationKind" NOT NULL DEFAULT 'CHAT',
    ADD COLUMN IF NOT EXISTS "visibility" "AssistantVisibility" NOT NULL DEFAULT 'PRIVATE',
    ADD COLUMN IF NOT EXISTS "pinnedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "summaryUpToMessageId" TEXT,
    ADD COLUMN IF NOT EXISTS "summaryTokens" INTEGER,
    ADD COLUMN IF NOT EXISTS "titleEditedAt" TIMESTAMP(3);

ALTER TABLE "AssistantProjetMessage"
    ADD COLUMN IF NOT EXISTS "attachments" JSONB,
    ADD COLUMN IF NOT EXISTS "feedback" JSONB,
    ADD COLUMN IF NOT EXISTS "supersededAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AssistantProjetFolder_clientId_key" ON "AssistantProjetFolder"("clientId");
CREATE UNIQUE INDEX IF NOT EXISTS "AssistantProjetFolder_storageFolderId_key" ON "AssistantProjetFolder"("storageFolderId");
CREATE INDEX IF NOT EXISTS "AssistantProjetFolder_kind_archivedAt_lastActivityAt_idx" ON "AssistantProjetFolder"("kind", "archivedAt", "lastActivityAt");

CREATE UNIQUE INDEX IF NOT EXISTS "AssistantProjetMemory_scopeKey_contentKey_key" ON "AssistantProjetMemory"("scopeKey", "contentKey");
CREATE INDEX IF NOT EXISTS "AssistantProjetMemory_scope_folderId_deletedAt_idx" ON "AssistantProjetMemory"("scope", "folderId", "deletedAt");
CREATE INDEX IF NOT EXISTS "AssistantProjetMemory_scope_userId_deletedAt_idx" ON "AssistantProjetMemory"("scope", "userId", "deletedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "AssistantProjetFileText_fileId_key" ON "AssistantProjetFileText"("fileId");
CREATE INDEX IF NOT EXISTS "AssistantProjetFileText_folderId_status_idx" ON "AssistantProjetFileText"("folderId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "AssistantProjetFileChunk_fileTextId_index_key" ON "AssistantProjetFileChunk"("fileTextId", "index");
CREATE INDEX IF NOT EXISTS "AssistantProjetFileChunk_folderId_idx" ON "AssistantProjetFileChunk"("folderId");
CREATE INDEX IF NOT EXISTS "AssistantProjetFileChunk_tsv_idx" ON "AssistantProjetFileChunk" USING GIN ("tsv");

CREATE INDEX IF NOT EXISTS "AssistantProjetPin_folderId_position_idx" ON "AssistantProjetPin"("folderId", "position");

CREATE INDEX IF NOT EXISTS "AssistantProjetConversation_folderId_lastMessageAt_idx" ON "AssistantProjetConversation"("folderId", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "AssistantProjetConversation_visibility_lastMessageAt_idx" ON "AssistantProjetConversation"("visibility", "lastMessageAt");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "AssistantProjetFolder" ADD CONSTRAINT "AssistantProjetFolder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantProjetFolder" ADD CONSTRAINT "AssistantProjetFolder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantProjetMemory" ADD CONSTRAINT "AssistantProjetMemory_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "AssistantProjetFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantProjetMemory" ADD CONSTRAINT "AssistantProjetMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantProjetFileText" ADD CONSTRAINT "AssistantProjetFileText_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantProjetFileText" ADD CONSTRAINT "AssistantProjetFileText_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "AssistantProjetFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantProjetFileChunk" ADD CONSTRAINT "AssistantProjetFileChunk_fileTextId_fkey" FOREIGN KEY ("fileTextId") REFERENCES "AssistantProjetFileText"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantProjetPin" ADD CONSTRAINT "AssistantProjetPin_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "AssistantProjetFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantProjetPin" ADD CONSTRAINT "AssistantProjetPin_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantProjetConversation" ADD CONSTRAINT "AssistantProjetConversation_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "AssistantProjetFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- 20261030120000_add_ai_usage
-- ============================================================

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

-- ============================================================
-- 20261101120000_add_agent_jobs
-- ============================================================

-- Captain Agent (background worker): jobs, runs, steps, proposals, findings.
-- Additive only: no existing table or column changes. Idempotent, like the
-- other assistant migrations, so a re-run is harmless. Ids only, no foreign
-- key to User / Client / Mission / AssistantProjetConversation on purpose.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "AgentJobKind" AS ENUM ('WATCH', 'REPORT', 'MISSION', 'DIGEST');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "AgentTrigger" AS ENUM ('SCHEDULE', 'MANUAL', 'EVENT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_APPROVAL', 'DONE', 'FAILED', 'CANCELLED', 'DEFERRED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "AgentStepStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "AgentProposalState" AS ENUM ('PENDING', 'EXECUTING', 'APPROVED', 'REJECTED', 'EXECUTED', 'EXPIRED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "AgentSeverity" AS ENUM ('INFO', 'WARN', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "AgentFindingState" AS ENUM ('OPEN', 'ACKED', 'SNOOZED', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AgentJob" (
    "id" TEXT NOT NULL,
    "kind" "AgentJobKind" NOT NULL,
    "playbook" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "folderId" TEXT,
    "clientId" TEXT,
    "missionId" TEXT,
    "schedule" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "config" JSONB,
    "createdById" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "lastStatus" "AgentRunStatus",
    "failures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgentRun" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "kind" "AgentJobKind" NOT NULL,
    "playbook" TEXT NOT NULL,
    "trigger" "AgentTrigger" NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dedupeKey" TEXT,
    "folderId" TEXT,
    "clientId" TEXT,
    "missionId" TEXT,
    "actorId" TEXT NOT NULL,
    "conversationId" TEXT,
    "goal" TEXT,
    "plan" JSONB,
    "budget" JSONB NOT NULL,
    "usage" JSONB,
    "summary" TEXT,
    "findingsCount" INTEGER NOT NULL DEFAULT 0,
    "proposalsCount" INTEGER NOT NULL DEFAULT 0,
    "stepsCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'worker',
    "lockedBy" TEXT,
    "heartbeatAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "checkpoint" JSONB,
    "cancelRequestedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgentStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "phase" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "AgentStepStatus" NOT NULL DEFAULT 'PENDING',
    "assistantRunId" TEXT,
    "tool" TEXT,
    "args" JSONB,
    "resultDigest" TEXT,
    "evidenceLabels" JSONB,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "costEur" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "model" TEXT,
    "durationMs" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgentProposal" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "batchId" TEXT,
    "tool" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "card" JSONB NOT NULL,
    "rationale" TEXT,
    "risk" TEXT NOT NULL,
    "state" "AgentProposalState" NOT NULL DEFAULT 'PENDING',
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "actionLogId" TEXT,

    CONSTRAINT "AgentProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgentFinding" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "rule" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "severity" "AgentSeverity" NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metrics" JSONB,
    "evidenceIds" JSONB,
    "folderId" TEXT,
    "clientId" TEXT,
    "missionId" TEXT,
    "subjectUserId" TEXT,
    "suggested" JSONB,
    "state" "AgentFindingState" NOT NULL DEFAULT 'OPEN',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenCount" INTEGER NOT NULL DEFAULT 1,
    "notifiedAt" TIMESTAMP(3),
    "ackedById" TEXT,
    "ackedAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AgentJob_playbook_folderId_clientId_missionId_key" ON "AgentJob"("playbook", "folderId", "clientId", "missionId");
CREATE INDEX IF NOT EXISTS "AgentJob_enabled_nextRunAt_idx" ON "AgentJob"("enabled", "nextRunAt");

CREATE UNIQUE INDEX IF NOT EXISTS "AgentRun_dedupeKey_key" ON "AgentRun"("dedupeKey");
CREATE INDEX IF NOT EXISTS "AgentRun_status_runAfter_priority_idx" ON "AgentRun"("status", "runAfter", "priority");
CREATE INDEX IF NOT EXISTS "AgentRun_jobId_createdAt_idx" ON "AgentRun"("jobId", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentRun_status_heartbeatAt_idx" ON "AgentRun"("status", "heartbeatAt");
CREATE INDEX IF NOT EXISTS "AgentRun_createdAt_idx" ON "AgentRun"("createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "AgentStep_runId_index_key" ON "AgentStep"("runId", "index");

CREATE INDEX IF NOT EXISTS "AgentProposal_state_expiresAt_idx" ON "AgentProposal"("state", "expiresAt");
CREATE INDEX IF NOT EXISTS "AgentProposal_runId_idx" ON "AgentProposal"("runId");

CREATE UNIQUE INDEX IF NOT EXISTS "AgentFinding_dedupeKey_key" ON "AgentFinding"("dedupeKey");
CREATE INDEX IF NOT EXISTS "AgentFinding_state_severity_lastSeenAt_idx" ON "AgentFinding"("state", "severity", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "AgentFinding_rule_state_idx" ON "AgentFinding"("rule", "state");
CREATE INDEX IF NOT EXISTS "AgentFinding_clientId_state_idx" ON "AgentFinding"("clientId", "state");
CREATE INDEX IF NOT EXISTS "AgentFinding_subjectUserId_state_idx" ON "AgentFinding"("subjectUserId", "state");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AgentJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AgentStep" ADD CONSTRAINT "AgentStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AgentProposal" ADD CONSTRAINT "AgentProposal_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AgentFinding" ADD CONSTRAINT "AgentFinding_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
