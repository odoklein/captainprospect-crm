-- ============================================================
-- NE PLUS CONTACTER — exclusions durables
--
-- Run once against the target database (Supabase). Safe to re-run:
-- every statement is idempotent (IF NOT EXISTS / guarded DO blocks),
-- so a partial run can simply be replayed.
--
-- Part 1 creates the schema.
-- Part 2 seeds which action statuses mean "final".
-- Part 3 records the migration so `prisma migrate deploy` skips it.
--
-- No new permission is needed: the manager entry reuses
-- 'pages.prospects' (same as "Listes & Prospection") and the client
-- portal entry reuses 'pages.dashboard'. Whoever sees those today
-- sees the new pages immediately.
-- ============================================================

BEGIN;

-- ============================================================
-- PART 1 — SCHEMA
-- ============================================================

-- Enums -------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE "ExclusionTarget" AS ENUM ('COMPANY', 'CONTACT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "ExclusionScope" AS ENUM ('GLOBAL', 'CLIENT', 'MISSION');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "ExclusionSource" AS ENUM ('SDR_ACTION', 'MANAGER', 'CLIENT_PORTAL', 'IMPORT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Table -------------------------------------------------------
-- Self-contained on purpose: the *Key columns and the label are
-- denormalized, so the rule keeps working after the Company it came
-- from is deleted, re-imported into another list, or duplicated
-- across missions. companyId / contactId are traceability only.
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

-- Materialized stamps -----------------------------------------
-- What every hot query filters on (SDR queue, manager queue), so the
-- dialling path never has to evaluate a matching rule.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "excludedAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "exclusionId" TEXT;
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "excludedAt" TIMESTAMP(3);
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "exclusionId" TEXT;

CREATE INDEX IF NOT EXISTS "Company_listId_excludedAt_idx" ON "Company"("listId", "excludedAt");
CREATE INDEX IF NOT EXISTS "Company_exclusionId_idx" ON "Company"("exclusionId");
CREATE INDEX IF NOT EXISTS "Contact_companyId_excludedAt_idx" ON "Contact"("companyId", "excludedAt");
CREATE INDEX IF NOT EXISTS "Contact_exclusionId_idx" ON "Contact"("exclusionId");

-- Which statuses are a real dead end --------------------------
ALTER TABLE "ActionStatusDefinition" ADD COLUMN IF NOT EXISTS "triggersExclusion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ActionStatusDefinition" ADD COLUMN IF NOT EXISTS "exclusionTarget" "ExclusionTarget";

-- ============================================================
-- PART 2 — DEFAULTS
-- ============================================================
-- priorityLabel = SKIP is NOT the criterion: MEETING_BOOKED and
-- MAIL_UNIQUEMENT are also SKIP, and excluding a booked meeting
-- would be a serious bug. Only genuine dead ends are armed here.
--
-- A categorical refusal or an out-of-target call kills the whole
-- company; a personal refusal or a disqualification burns only that
-- contact. Guarded on "triggersExclusion" = false so a later manual
-- override is never overwritten by a replay.

UPDATE "ActionStatusDefinition"
   SET "triggersExclusion" = true, "exclusionTarget" = 'COMPANY'
 WHERE "code" IN ('REFUS_CATEGORIQUE', 'HORS_CIBLE')
   AND "triggersExclusion" = false;

UPDATE "ActionStatusDefinition"
   SET "triggersExclusion" = true, "exclusionTarget" = 'CONTACT'
 WHERE "code" IN ('NOT_INTERESTED', 'DISQUALIFIED')
   AND "triggersExclusion" = false;

-- ============================================================
-- PART 3 — MIGRATION BOOKKEEPING
-- ============================================================
-- Without this, the next `prisma migrate deploy` tries to create
-- these objects again and fails. The checksum is the SHA-256 of
-- prisma/migrations/20260923120000_add_exclusions/migration.sql —
-- Prisma verifies it, so do not edit that file after running this.
--
-- Skipped silently if you drive the schema with `prisma db push` and
-- have no `_prisma_migrations` table. The id is fixed, so a second
-- run is a no-op.
DO $$ BEGIN
    IF to_regclass('public."_prisma_migrations"') IS NULL THEN
        RAISE NOTICE 'Table _prisma_migrations absente — bookkeeping ignoré (db push).';
        RETURN;
    END IF;

    INSERT INTO "_prisma_migrations"
        ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
    VALUES
        (
            'c3d2e1f0-7b45-4a68-9e83-1f4a6c2d8b30',
            'be2f6a96bb28741195fcaa0614d294b2d1063c950569dded90deab61f4a1b328',
            NOW(),
            '20260923120000_add_exclusions',
            NULL,
            NULL,
            NOW(),
            1
        )
    ON CONFLICT ("id") DO NOTHING;
END $$;

COMMIT;

-- ============================================================
-- Verification (run separately after COMMIT)
-- ============================================================
-- 1) Schema is in place — expect 4 rows.
-- SELECT table_name, column_name
-- FROM information_schema.columns
-- WHERE (table_name = 'Company'  AND column_name IN ('excludedAt', 'exclusionId'))
--    OR (table_name = 'Contact'  AND column_name IN ('excludedAt', 'exclusionId'))
-- ORDER BY table_name, column_name;

-- 2) Which statuses now propose an exclusion, and at which level.
-- SELECT "scopeType", "scopeId", "code", "label", "triggersExclusion", "exclusionTarget"
-- FROM "ActionStatusDefinition"
-- WHERE "triggersExclusion" = true
-- ORDER BY "code", "scopeType";

-- 3) Nothing is excluded yet — both counts must be 0 on a first run.
-- SELECT
--   (SELECT COUNT(*) FROM "Company" WHERE "excludedAt" IS NOT NULL) AS companies_excluded,
--   (SELECT COUNT(*) FROM "Contact" WHERE "excludedAt" IS NOT NULL) AS contacts_excluded,
--   (SELECT COUNT(*) FROM "Exclusion") AS rules;
