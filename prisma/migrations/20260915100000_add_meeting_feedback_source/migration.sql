-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "MeetingFeedbackSource" AS ENUM ('PORTAL_CLIENT', 'PORTAL_COMMERCIAL', 'MANAGER', 'MANAGER_MANUAL');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "MeetingFeedback" ADD COLUMN IF NOT EXISTS "source" "MeetingFeedbackSource";
ALTER TABLE "MeetingFeedback" ADD COLUMN IF NOT EXISTS "reportedById" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MeetingFeedback_source_idx" ON "MeetingFeedback"("source");
CREATE INDEX IF NOT EXISTS "MeetingFeedback_reportedById_idx" ON "MeetingFeedback"("reportedById");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "MeetingFeedback" ADD CONSTRAINT "MeetingFeedback_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
