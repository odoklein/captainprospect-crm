-- « Nouveautés »: release notes and announcements pushed by the Console, and who saw them.
-- Additive only.
CREATE TABLE "ChangelogEntry" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "version" TEXT,
    "items" JSONB,
    "category" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "audience" TEXT NOT NULL DEFAULT 'managers',
    "ctaLabel" TEXT,
    "ctaUrl" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangelogEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChangelogSeen" (
    "entryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bannerDismissedAt" TIMESTAMP(3),

    CONSTRAINT "ChangelogSeen_pkey" PRIMARY KEY ("entryId","userId")
);

CREATE UNIQUE INDEX "ChangelogEntry_externalId_key" ON "ChangelogEntry"("externalId");
CREATE INDEX "ChangelogEntry_publishedAt_idx" ON "ChangelogEntry"("publishedAt");
CREATE INDEX "ChangelogSeen_userId_idx" ON "ChangelogSeen"("userId");

ALTER TABLE "ChangelogSeen" ADD CONSTRAINT "ChangelogSeen_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ChangelogEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChangelogSeen" ADD CONSTRAINT "ChangelogSeen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
