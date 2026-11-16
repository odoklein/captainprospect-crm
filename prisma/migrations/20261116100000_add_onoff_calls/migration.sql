-- Onoff Business telephony: calls pushed by Onoff's webhook, and each user's Onoff line.
-- Additive only: no existing row or column changes.
ALTER TABLE "User" ADD COLUMN "onoffPhoneNumber" TEXT;

CREATE TABLE "OnoffCall" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "sdrId" TEXT,
    "onoffUserEmail" TEXT,
    "onoffUserNumber" TEXT,
    "externalNumber" TEXT NOT NULL,
    "externalKey" TEXT,
    "externalName" TEXT,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "recordingUrl" TEXT,
    "voicemailUrl" TEXT,
    "notes" TEXT,
    "tags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnoffCall_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OnoffCall_externalKey_startedAt_idx" ON "OnoffCall"("externalKey", "startedAt");
CREATE INDEX "OnoffCall_sdrId_startedAt_idx" ON "OnoffCall"("sdrId", "startedAt");

ALTER TABLE "OnoffCall" ADD CONSTRAINT "OnoffCall_sdrId_fkey" FOREIGN KEY ("sdrId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
