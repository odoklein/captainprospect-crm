-- Inbound calls on users' Allo lines, written by the Allo webhook (call.received /
-- call.answered / call.completed) and read by the SDR incoming-call panel.

-- CreateEnum
CREATE TYPE "IncomingCallStatus" AS ENUM ('RINGING', 'ANSWERED', 'COMPLETED', 'MISSED');

-- CreateTable
CREATE TABLE "IncomingCall" (
    "id" TEXT NOT NULL,
    "sdrId" TEXT NOT NULL,
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "callerKey" TEXT,
    "status" "IncomingCallStatus" NOT NULL DEFAULT 'RINGING',
    "providerCallId" TEXT,
    "result" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "summary" TEXT,
    "recordingUrl" TEXT,
    "contactId" TEXT,
    "companyId" TEXT,
    "missionId" TEXT,
    "callerName" TEXT,
    "companyName" TEXT,
    "matchCount" INTEGER NOT NULL DEFAULT 0,
    "alloPersonName" TEXT,
    "alloCompanyName" TEXT,
    "dismissedAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomingCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncomingCall_sdrId_createdAt_idx" ON "IncomingCall"("sdrId", "createdAt");

-- CreateIndex
CREATE INDEX "IncomingCall_sdrId_callerKey_startedAt_idx" ON "IncomingCall"("sdrId", "callerKey", "startedAt");

-- AddForeignKey
ALTER TABLE "IncomingCall" ADD CONSTRAINT "IncomingCall_sdrId_fkey" FOREIGN KEY ("sdrId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

