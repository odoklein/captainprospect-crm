-- « Nouveautés » pushed by the Console (PUT /api/instance/changelog): releases, announcements,
-- the update offer a MANAGER approves, and who has seen what. Additive only.
CREATE TABLE "InstanceChangelogEntry" (
    "externalId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "category" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "notes" JSONB NOT NULL DEFAULT '[]',
    "version" TEXT,
    "audience" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ctaLabel" TEXT,
    "ctaUrl" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offerTag" TEXT,
    "offerMigration" BOOLEAN NOT NULL DEFAULT false,
    "offerSecurity" BOOLEAN NOT NULL DEFAULT false,
    "offerDeadline" TIMESTAMP(3),
    "offerWindow" TEXT,
    "decision" TEXT,
    "decisionAt" TIMESTAMP(3),
    "postponedUntil" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InstanceChangelogEntry_pkey" PRIMARY KEY ("externalId")
);
CREATE INDEX "InstanceChangelogEntry_publishedAt_idx" ON "InstanceChangelogEntry"("publishedAt");

CREATE TABLE "InstanceChangelogSeen" (
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InstanceChangelogSeen_pkey" PRIMARY KEY ("entryId","userId")
);
CREATE INDEX "InstanceChangelogSeen_userId_idx" ON "InstanceChangelogSeen"("userId");
