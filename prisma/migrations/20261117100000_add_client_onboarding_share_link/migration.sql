-- Client-facing onboarding link: the agency shares /onboarding/<token> with its
-- client, who fills the questionnaire without an account.
ALTER TABLE "ClientOnboarding"
    ADD COLUMN "shareToken" TEXT,
    ADD COLUMN "shareCreatedAt" TIMESTAMP(3),
    ADD COLUMN "shareCreatedById" TEXT,
    ADD COLUMN "shareExpiresAt" TIMESTAMP(3),
    ADD COLUMN "clientOpenedAt" TIMESTAMP(3),
    ADD COLUMN "clientLastSeenAt" TIMESTAMP(3),
    ADD COLUMN "clientSubmittedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "ClientOnboarding_shareToken_key" ON "ClientOnboarding"("shareToken");
