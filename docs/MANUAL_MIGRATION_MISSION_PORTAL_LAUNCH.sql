-- Captain Prospect CRM
-- Unified manual migration: mission portal launch visibility
-- PostgreSQL / Supabase compatible
-- Safe to run more than once.

BEGIN;

ALTER TABLE "Mission"
ADD COLUMN IF NOT EXISTS "portalLaunchStartedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "portalVisibleAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Mission_clientId_portalVisibleAt_idx"
ON "Mission"("clientId", "portalVisibleAt");

COMMENT ON COLUMN "Mission"."portalLaunchStartedAt" IS
'Date when the manager started the portal warm-up phase.';

COMMENT ON COLUMN "Mission"."portalVisibleAt" IS
'Client and commercial activity becomes visible at this date. NULL means immediately visible.';

COMMIT;

-- Verification: both columns should be returned.
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'Mission'
  AND column_name IN ('portalLaunchStartedAt', 'portalVisibleAt')
ORDER BY column_name;

-- Verification: the index should be returned.
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'Mission'
  AND indexname = 'Mission_clientId_portalVisibleAt_idx';
