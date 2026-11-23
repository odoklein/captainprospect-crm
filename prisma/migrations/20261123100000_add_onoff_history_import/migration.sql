-- Onoff history import (Onoff public API, MAX plan): AI summary, transcript and coaching
-- score on each call, ids to fetch fresh recording links, and the import runs.
-- Additive only: existing rows keep their values ("webhook" source).
ALTER TABLE "OnoffCall" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'webhook';
ALTER TABLE "OnoffCall" ADD COLUMN "apiCallId" TEXT;
ALTER TABLE "OnoffCall" ADD COLUMN "memberId" TEXT;
ALTER TABLE "OnoffCall" ADD COLUMN "recordingId" TEXT;
ALTER TABLE "OnoffCall" ADD COLUMN "voicemailId" TEXT;
ALTER TABLE "OnoffCall" ADD COLUMN "summary" TEXT;
ALTER TABLE "OnoffCall" ADD COLUMN "transcription" TEXT;
ALTER TABLE "OnoffCall" ADD COLUMN "evaluationScore" DOUBLE PRECISION;
ALTER TABLE "OnoffCall" ADD COLUMN "evaluation" JSONB;
ALTER TABLE "OnoffCall" ADD COLUMN "detailsAt" TIMESTAMP(3);

CREATE INDEX "OnoffCall_apiCallId_idx" ON "OnoffCall"("apiCallId");

CREATE TABLE "OnoffImportRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'members',
    "membersTotal" INTEGER NOT NULL DEFAULT 0,
    "membersDone" INTEGER NOT NULL DEFAULT 0,
    "callsFound" INTEGER NOT NULL DEFAULT 0,
    "callsNew" INTEGER NOT NULL DEFAULT 0,
    "detailsTotal" INTEGER NOT NULL DEFAULT 0,
    "detailsDone" INTEGER NOT NULL DEFAULT 0,
    "recordings" INTEGER NOT NULL DEFAULT 0,
    "summaries" INTEGER NOT NULL DEFAULT 0,
    "actionsLinked" INTEGER NOT NULL DEFAULT 0,
    "unmatched" JSONB,
    "error" TEXT,
    "startedById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "OnoffImportRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OnoffImportRun_startedAt_idx" ON "OnoffImportRun"("startedAt");
