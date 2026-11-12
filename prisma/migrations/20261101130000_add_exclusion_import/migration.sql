-- Blacklist bulk imports: one row per uploaded file, with every line and what
-- became of it. Additive and idempotent: a re-run is harmless, and nothing else
-- reads this table, so the app keeps working if it is applied late.

-- CreateTable
CREATE TABLE IF NOT EXISTS "ExclusionImport" (
    "id" TEXT NOT NULL,
    "fileName" TEXT,
    "scope" "ExclusionScope" NOT NULL,
    "scopeId" TEXT,
    "reason" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "source" "ExclusionSource" NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "appliedCompanies" INTEGER NOT NULL DEFAULT 0,
    "appliedContacts" INTEGER NOT NULL DEFAULT 0,
    "rows" JSONB NOT NULL,
    "ruleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExclusionImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExclusionImport_scope_scopeId_createdAt_idx" ON "ExclusionImport"("scope", "scopeId", "createdAt");
CREATE INDEX IF NOT EXISTS "ExclusionImport_createdAt_idx" ON "ExclusionImport"("createdAt");
