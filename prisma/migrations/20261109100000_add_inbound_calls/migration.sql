-- Twilio inbound calls: direction, voicemail, link to « Appels à traiter », SDR preferences

-- CreateEnum
CREATE TYPE "TelephonyDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- AlterTable
ALTER TABLE "TelephonyCall" ADD COLUMN "direction" "TelephonyDirection" NOT NULL DEFAULT 'OUTBOUND',
ADD COLUMN "voicemail" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "incomingCallId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "twilioReceiveCalls" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "voicemailGreeting" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TelephonyCall_incomingCallId_key" ON "TelephonyCall"("incomingCallId");
