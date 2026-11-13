-- Sales execution engine: dialer sessions & attempts, provider event log,
-- post-call proposals (docs/SALES_EXECUTION_ENGINE.md). Idempotent: safe to re-run.

DO $$ BEGIN
    CREATE TYPE "DialerMode" AS ENUM ('POWER', 'PARALLEL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "DialerSessionStatus" AS ENUM ('OPEN', 'PAUSED', 'ENDED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "DialerAgentState" AS ENUM ('JOINING', 'READY', 'RESERVED', 'ON_CALL', 'WRAP_UP', 'OFFLINE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "DialAttemptState" AS ENUM ('PENDING', 'DIALING', 'RINGING', 'ANSWERED', 'BRIDGING', 'CONNECTED', 'ENDED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "DialOutcome" AS ENUM ('NO_ANSWER', 'BUSY', 'FAILED', 'CANCELED_SIBLING', 'CANCELED_SESSION', 'VOICEMAIL', 'MACHINE_OTHER', 'UNCERTAIN_RELEASED', 'ABANDONED', 'CONVERSATION', 'TIMEOUT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "ProposalStatus" AS ENUM ('PROPOSED', 'APPLIED', 'DISMISSED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- DialerSession
CREATE TABLE IF NOT EXISTS "DialerSession" (
    "id" TEXT NOT NULL,
    "sdrId" TEXT NOT NULL,
    "missionId" TEXT,
    "campaignId" TEXT,
    "mode" "DialerMode" NOT NULL DEFAULT 'PARALLEL',
    "status" "DialerSessionStatus" NOT NULL DEFAULT 'OPEN',
    "agentState" "DialerAgentState" NOT NULL DEFAULT 'JOINING',
    "reservedAttemptId" TEXT,
    "conferenceName" TEXT NOT NULL,
    "agentCallSid" TEXT,
    "maxLines" INTEGER NOT NULL,
    "policySnapshot" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DialerSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DialerSession_conferenceName_key" ON "DialerSession"("conferenceName");
CREATE UNIQUE INDEX IF NOT EXISTS "DialerSession_agentCallSid_key" ON "DialerSession"("agentCallSid");
CREATE INDEX IF NOT EXISTS "DialerSession_sdrId_status_idx" ON "DialerSession"("sdrId", "status");
CREATE INDEX IF NOT EXISTS "DialerSession_status_lastHeartbeatAt_idx" ON "DialerSession"("status", "lastHeartbeatAt");
-- Invariant (not expressible in schema.prisma): at most one live session per SDR.
CREATE UNIQUE INDEX IF NOT EXISTS "DialerSession_one_live_per_sdr" ON "DialerSession"("sdrId") WHERE "status" <> 'ENDED';

-- DialAttempt
CREATE TABLE IF NOT EXISTS "DialAttempt" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sdrId" TEXT NOT NULL,
    "contactId" TEXT,
    "companyId" TEXT,
    "campaignId" TEXT,
    "toNumber" TEXT NOT NULL,
    "fromNumber" TEXT NOT NULL,
    "state" "DialAttemptState" NOT NULL DEFAULT 'PENDING',
    "outcome" "DialOutcome",
    "callSid" TEXT,
    "answeredBy" TEXT,
    "telephonyCallId" TEXT,
    "errorCode" TEXT,
    "selection" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "placedAt" TIMESTAMP(3),
    "ringingAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "detectedAt" TIMESTAMP(3),
    "reservedAt" TIMESTAMP(3),
    "bridgedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    CONSTRAINT "DialAttempt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DialAttempt_callSid_key" ON "DialAttempt"("callSid");
CREATE UNIQUE INDEX IF NOT EXISTS "DialAttempt_telephonyCallId_key" ON "DialAttempt"("telephonyCallId");
CREATE INDEX IF NOT EXISTS "DialAttempt_sessionId_state_idx" ON "DialAttempt"("sessionId", "state");
CREATE INDEX IF NOT EXISTS "DialAttempt_sdrId_createdAt_idx" ON "DialAttempt"("sdrId", "createdAt");
CREATE INDEX IF NOT EXISTS "DialAttempt_fromNumber_createdAt_idx" ON "DialAttempt"("fromNumber", "createdAt");
CREATE INDEX IF NOT EXISTS "DialAttempt_contactId_createdAt_idx" ON "DialAttempt"("contactId", "createdAt");
CREATE INDEX IF NOT EXISTS "DialAttempt_state_createdAt_idx" ON "DialAttempt"("state", "createdAt");
-- Invariant (not expressible in schema.prisma): a number is never rung twice at once, whoever dials it.
CREATE UNIQUE INDEX IF NOT EXISTS "DialAttempt_one_live_per_number" ON "DialAttempt"("toNumber") WHERE "state" <> 'ENDED';

DO $$ BEGIN
    ALTER TABLE "DialAttempt" ADD CONSTRAINT "DialAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DialerSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- DialerEvent
CREATE TABLE IF NOT EXISTS "DialerEvent" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "sessionId" TEXT,
    "attemptId" TEXT,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "tries" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    CONSTRAINT "DialerEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DialerEvent_dedupeKey_key" ON "DialerEvent"("dedupeKey");
CREATE INDEX IF NOT EXISTS "DialerEvent_attemptId_idx" ON "DialerEvent"("attemptId");
CREATE INDEX IF NOT EXISTS "DialerEvent_processedAt_receivedAt_idx" ON "DialerEvent"("processedAt", "receivedAt");

-- PostCallProposal
CREATE TABLE IF NOT EXISTS "PostCallProposal" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "sdrId" TEXT NOT NULL,
    "contactId" TEXT,
    "companyId" TEXT,
    "campaignId" TEXT,
    "kind" TEXT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PROPOSED',
    "mode" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "holdReason" TEXT,
    "blocked" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "resultRef" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PostCallProposal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PostCallProposal_key_key" ON "PostCallProposal"("key");
CREATE INDEX IF NOT EXISTS "PostCallProposal_callId_idx" ON "PostCallProposal"("callId");
CREATE INDEX IF NOT EXISTS "PostCallProposal_sdrId_status_idx" ON "PostCallProposal"("sdrId", "status");
CREATE INDEX IF NOT EXISTS "PostCallProposal_status_createdAt_idx" ON "PostCallProposal"("status", "createdAt");

-- TelephonyCall: latest analysed call of a prospect (lib/qualification/queue.ts)
CREATE INDEX IF NOT EXISTS "TelephonyCall_contactId_startedAt_idx" ON "TelephonyCall"("contactId", "startedAt");
CREATE INDEX IF NOT EXISTS "TelephonyCall_companyId_startedAt_idx" ON "TelephonyCall"("companyId", "startedAt");
