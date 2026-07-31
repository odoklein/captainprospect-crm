ALTER TABLE "Mission"
ADD COLUMN "portalLaunchStartedAt" TIMESTAMP(3),
ADD COLUMN "portalVisibleAt" TIMESTAMP(3);

CREATE INDEX "Mission_clientId_portalVisibleAt_idx"
ON "Mission"("clientId", "portalVisibleAt");
