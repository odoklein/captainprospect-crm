-- SMS through Twilio: messages per prospect, STOP opt-outs, SDR signature

-- CreateEnum
CREATE TYPE "SmsDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "smsSignature" TEXT;

-- CreateTable
CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "sdrId" TEXT NOT NULL,
    "direction" "SmsDirection" NOT NULL,
    "prospectNumber" TEXT NOT NULL,
    "lineNumber" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "twilioSid" TEXT,
    "errorCode" TEXT,
    "contactId" TEXT,
    "companyId" TEXT,
    "campaignId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsOptOut" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "keyword" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsOptOut_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SmsMessage_twilioSid_key" ON "SmsMessage"("twilioSid");
CREATE INDEX "SmsMessage_sdrId_prospectNumber_createdAt_idx" ON "SmsMessage"("sdrId", "prospectNumber", "createdAt");
CREATE INDEX "SmsMessage_sdrId_direction_readAt_idx" ON "SmsMessage"("sdrId", "direction", "readAt");
CREATE INDEX "SmsMessage_contactId_idx" ON "SmsMessage"("contactId");
CREATE INDEX "SmsMessage_companyId_idx" ON "SmsMessage"("companyId");
CREATE UNIQUE INDEX "SmsOptOut_number_key" ON "SmsOptOut"("number");

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_sdrId_fkey" FOREIGN KEY ("sdrId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
