-- Softphone: live transcript lines + AI summary at the end of the call

-- AlterTable
ALTER TABLE "TelephonyCall" ADD COLUMN IF NOT EXISTS "aiSummary" JSONB,
ADD COLUMN IF NOT EXISTS "aiSummaryStatus" TEXT,
ADD COLUMN IF NOT EXISTS "aiSummaryError" TEXT,
ADD COLUMN IF NOT EXISTS "aiSummaryAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TelephonyTranscriptLine" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "speaker" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "at" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelephonyTranscriptLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelephonyTranscriptLine_callId_speaker_seq_key" ON "TelephonyTranscriptLine"("callId", "speaker", "seq");
CREATE INDEX "TelephonyTranscriptLine_callId_at_idx" ON "TelephonyTranscriptLine"("callId", "at");

-- AddForeignKey
ALTER TABLE "TelephonyTranscriptLine" ADD CONSTRAINT "TelephonyTranscriptLine_callId_fkey" FOREIGN KEY ("callId") REFERENCES "TelephonyCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
