-- "Absent en stand by": set a no-show aside without closing it.
-- It stays recorded as NO_SHOW but drops off the SDR absence banner and the
-- priority calling queue until a manager reactivates it.

-- AlterTable
ALTER TABLE "MeetingFeedback" ADD COLUMN IF NOT EXISTS "standByAt" TIMESTAMP(3);
ALTER TABLE "MeetingFeedback" ADD COLUMN IF NOT EXISTS "standByReason" TEXT;
ALTER TABLE "MeetingFeedback" ADD COLUMN IF NOT EXISTS "standById" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MeetingFeedback_standByAt_idx" ON "MeetingFeedback"("standByAt");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "MeetingFeedback" ADD CONSTRAINT "MeetingFeedback_standById_fkey" FOREIGN KEY ("standById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
