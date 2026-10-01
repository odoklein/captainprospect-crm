-- CompanyEnrichmentLookup: AI web-search enrichment of a company's missing
-- fields. One row per lookup; `suggestions` holds one entry per field with its
-- own review status. Also serves as cache, rate-limit ledger and audit trail.
-- Idempotent (safe to re-run), like the other manual migrations.

CREATE TABLE IF NOT EXISTS "CompanyEnrichmentLookup" (
  "id"              TEXT NOT NULL,
  "companyId"       TEXT NOT NULL,
  "provider"        TEXT NOT NULL DEFAULT 'MISTRAL_WEB',
  "queryHash"       TEXT NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'OPEN',
  "requestedFields" TEXT[],
  "suggestions"     JSONB NOT NULL,
  "requestedById"   TEXT NOT NULL,
  "cacheHit"        BOOLEAN NOT NULL DEFAULT false,
  "searchCount"     INTEGER NOT NULL DEFAULT 0,
  "durationMs"      INTEGER,
  "expiresAt"       TIMESTAMP(3) NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CompanyEnrichmentLookup_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CompanyEnrichmentLookup_companyId_fkey'
  ) THEN
    ALTER TABLE "CompanyEnrichmentLookup" ADD CONSTRAINT "CompanyEnrichmentLookup_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "CompanyEnrichmentLookup_companyId_createdAt_idx"
  ON "CompanyEnrichmentLookup"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "CompanyEnrichmentLookup_queryHash_expiresAt_idx"
  ON "CompanyEnrichmentLookup"("queryHash", "expiresAt");
CREATE INDEX IF NOT EXISTS "CompanyEnrichmentLookup_requestedById_createdAt_idx"
  ON "CompanyEnrichmentLookup"("requestedById", "createdAt");
