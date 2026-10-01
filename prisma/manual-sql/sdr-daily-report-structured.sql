-- "Retour journée SDR": structured end-of-day report on top of "SdrDailyFeedback".
-- Idempotent — safe to run more than once. Run it BEFORE deploying the code that
-- reads/writes these columns (the SDR gate treats a failing status call as "don't block",
-- but the manager views select the new columns).
--
-- Requires the table from create-sdr-daily-feedback.sql.

-- The structured form has no 1-5 score and no free-text review; legacy rows keep theirs.
ALTER TABLE "SdrDailyFeedback" ALTER COLUMN "score"  DROP NOT NULL;
ALTER TABLE "SdrDailyFeedback" ALTER COLUMN "review" DROP NOT NULL;

ALTER TABLE "SdrDailyFeedback"
    ADD COLUMN IF NOT EXISTS "reportDate"      TEXT,
    ADD COLUMN IF NOT EXISTS "reachability"    TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS "prospectReturns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS "pitchFeeling"    TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS "mainBlocker"     TEXT,
    ADD COLUMN IF NOT EXISTS "fieldComment"    TEXT;

-- One report per SDR per (Europe/Paris) day. Legacy rows have a NULL reportDate and
-- Postgres treats NULLs as distinct, so they never collide.
CREATE UNIQUE INDEX IF NOT EXISTS "SdrDailyFeedback_sdrId_reportDate_key"
    ON "SdrDailyFeedback" ("sdrId", "reportDate");
