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
