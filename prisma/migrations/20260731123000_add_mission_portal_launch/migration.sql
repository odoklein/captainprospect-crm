ALTER TABLE "Mission"
ADD COLUMN IF NOT EXISTS "portalLaunchStartedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "portalVisibleAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Mission_clientId_portalVisibleAt_idx"
ON "Mission"("clientId", "portalVisibleAt");
