-- ============================================================
-- ABSENT EN STAND BY — MeetingFeedback
-- Run once against the target database. Safe to re-run: every
-- statement is idempotent (ADD COLUMN IF NOT EXISTS / CREATE INDEX
-- IF NOT EXISTS / guarded DO block), so a partial run can simply
-- be replayed.
--
-- Adds the three columns behind "Absent en stand by": a no-show
-- that a manager sets aside stays recorded as NO_SHOW, but drops
-- off the SDR absence banner and the priority calling queue until
-- it is reactivated.
--
-- Additive only: three nullable columns, one index, one FK.
-- No existing row is touched, nothing is rewritten, and every
-- existing absence keeps standByAt = NULL, i.e. exactly today's
-- behaviour.
-- ============================================================

BEGIN;

-- Columns -----------------------------------------------------
ALTER TABLE "MeetingFeedback" ADD COLUMN IF NOT EXISTS "standByAt" TIMESTAMP(3);
ALTER TABLE "MeetingFeedback" ADD COLUMN IF NOT EXISTS "standByReason" TEXT;
ALTER TABLE "MeetingFeedback" ADD COLUMN IF NOT EXISTS "standById" TEXT;

-- Index -------------------------------------------------------
CREATE INDEX IF NOT EXISTS "MeetingFeedback_standByAt_idx" ON "MeetingFeedback"("standByAt");

-- Foreign key (who put it on stand by) ------------------------
DO $$ BEGIN
    ALTER TABLE "MeetingFeedback"
        ADD CONSTRAINT "MeetingFeedback_standById_fkey"
        FOREIGN KEY ("standById") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

-- ============================================================
-- CHECK — should return the three columns
-- ============================================================
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'MeetingFeedback'
--   AND column_name IN ('standByAt', 'standByReason', 'standById')
-- ORDER BY column_name;
