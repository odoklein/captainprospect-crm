-- Durable "ne plus contacter" rules. See prisma/schema.prisma > model Exclusion
-- and lib/exclusions/matching.ts for how the *Key columns are normalized.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ExclusionTarget" AS ENUM ('COMPANY', 'CONTACT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "ExclusionScope" AS ENUM ('GLOBAL', 'CLIENT', 'MISSION');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "ExclusionSource" AS ENUM ('SDR_ACTION', 'MANAGER', 'CLIENT_PORTAL', 'IMPORT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Exclusion" (
    "id" TEXT NOT NULL,
    "target" "ExclusionTarget" NOT NULL,
    "scope" "ExclusionScope" NOT NULL,
    "scopeId" TEXT,
    "companyNameKey" TEXT,
    "domainKey" TEXT,
    "phoneKey" TEXT,
    "emailKey" TEXT,
    "contactNameKey" TEXT,
    "companyId" TEXT,
    "contactId" TEXT,
    "label" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" "ExclusionSource" NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "liftedAt" TIMESTAMP(3),
    "liftedById" TEXT,
    "liftReason" TEXT,
    "appliedCompanies" INTEGER NOT NULL DEFAULT 0,
    "appliedContacts" INTEGER NOT NULL DEFAULT 0,
    "lastAppliedAt" TIMESTAMP(3),

    CONSTRAINT "Exclusion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Exclusion_scope_scopeId_liftedAt_idx" ON "Exclusion"("scope", "scopeId", "liftedAt");
CREATE INDEX IF NOT EXISTS "Exclusion_companyNameKey_idx" ON "Exclusion"("companyNameKey");
CREATE INDEX IF NOT EXISTS "Exclusion_domainKey_idx" ON "Exclusion"("domainKey");
CREATE INDEX IF NOT EXISTS "Exclusion_phoneKey_idx" ON "Exclusion"("phoneKey");
CREATE INDEX IF NOT EXISTS "Exclusion_emailKey_idx" ON "Exclusion"("emailKey");
CREATE INDEX IF NOT EXISTS "Exclusion_createdAt_idx" ON "Exclusion"("createdAt");

-- Materialized stamps: what every hot query filters on.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "excludedAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "exclusionId" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "excludedAt" TIMESTAMP(3);
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "exclusionId" TEXT;

CREATE INDEX IF NOT EXISTS "Company_listId_excludedAt_idx" ON "Company"("listId", "excludedAt");
CREATE INDEX IF NOT EXISTS "Company_exclusionId_idx" ON "Company"("exclusionId");
CREATE INDEX IF NOT EXISTS "Contact_companyId_excludedAt_idx" ON "Contact"("companyId", "excludedAt");
CREATE INDEX IF NOT EXISTS "Contact_exclusionId_idx" ON "Contact"("exclusionId");

-- Which action statuses mean "final", not merely "parked".
ALTER TABLE "ActionStatusDefinition" ADD COLUMN IF NOT EXISTS "triggersExclusion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ActionStatusDefinition" ADD COLUMN IF NOT EXISTS "exclusionTarget" "ExclusionTarget";

-- Seed the defaults on existing installs: a categorical refusal or an
-- out-of-target call is a dead end for the whole company; a personal refusal
-- or a disqualification only burns that contact.
UPDATE "ActionStatusDefinition"
   SET "triggersExclusion" = true, "exclusionTarget" = 'COMPANY'
 WHERE "code" IN ('REFUS_CATEGORIQUE', 'HORS_CIBLE')
   AND "triggersExclusion" = false;

UPDATE "ActionStatusDefinition"
   SET "triggersExclusion" = true, "exclusionTarget" = 'CONTACT'
 WHERE "code" IN ('NOT_INTERESTED', 'DISQUALIFIED')
   AND "triggersExclusion" = false;
