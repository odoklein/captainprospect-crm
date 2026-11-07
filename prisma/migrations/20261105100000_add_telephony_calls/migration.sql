-- In-app Twilio softphone: outbound call log + per-user caller id

-- CreateEnum
CREATE TYPE "TelephonyCallStatus" AS ENUM ('INITIATED', 'RINGING', 'IN_PROGRESS', 'COMPLETED', 'BUSY', 'NO_ANSWER', 'FAILED', 'CANCELED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twilioCallerId" TEXT;

-- CreateTable
CREATE TABLE "TelephonyCall" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'twilio',
    "sdrId" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "fromNumber" TEXT NOT NULL,
    "contactId" TEXT,
    "companyId" TEXT,
    "campaignId" TEXT,
    "actionId" TEXT,
    "status" "TelephonyCallStatus" NOT NULL DEFAULT 'INITIATED',
    "parentCallSid" TEXT,
    "childCallSid" TEXT,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "recordingSid" TEXT,
    "recordingUrl" TEXT,
    "recordingDurationSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelephonyCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelephonyCall_actionId_key" ON "TelephonyCall"("actionId");
CREATE UNIQUE INDEX "TelephonyCall_parentCallSid_key" ON "TelephonyCall"("parentCallSid");
CREATE UNIQUE INDEX "TelephonyCall_childCallSid_key" ON "TelephonyCall"("childCallSid");
CREATE INDEX "TelephonyCall_sdrId_createdAt_idx" ON "TelephonyCall"("sdrId", "createdAt");
CREATE INDEX "TelephonyCall_sdrId_contactId_createdAt_idx" ON "TelephonyCall"("sdrId", "contactId", "createdAt");
CREATE INDEX "TelephonyCall_sdrId_companyId_createdAt_idx" ON "TelephonyCall"("sdrId", "companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "TelephonyCall" ADD CONSTRAINT "TelephonyCall_sdrId_fkey" FOREIGN KEY ("sdrId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
