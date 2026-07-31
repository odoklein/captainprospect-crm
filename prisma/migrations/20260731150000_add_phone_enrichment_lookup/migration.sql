CREATE TABLE IF NOT EXISTS "PhoneEnrichmentLookup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'GOOGLE_PLACES',
    "queryHash" TEXT NOT NULL,
    "suggestedPhone" TEXT,
    "sourceUrl" TEXT,
    "matchedCompanyName" TEXT,
    "matchedAddress" TEXT,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "cacheHit" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneEnrichmentLookup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PhoneEnrichmentLookup_companyId_createdAt_idx"
ON "PhoneEnrichmentLookup"("companyId", "createdAt");

CREATE INDEX IF NOT EXISTS "PhoneEnrichmentLookup_queryHash_expiresAt_idx"
ON "PhoneEnrichmentLookup"("queryHash", "expiresAt");

CREATE INDEX IF NOT EXISTS "PhoneEnrichmentLookup_requestedById_createdAt_idx"
ON "PhoneEnrichmentLookup"("requestedById", "createdAt");
