-- ============================================================
-- TC-0032 — file d'attente "À valider" pour les demandes de l'équipe sales
-- TC-0027 — disposition "Hors scope" sur les RDV absents
--
-- Run once against the target database. Safe to re-run: every
-- statement is idempotent (IF NOT EXISTS / ON CONFLICT / guarded
-- DO blocks), so a partial run can simply be replayed.
--
-- Part 1 — TC-0032 schema (Ticket.validation + colonnes de décision)
-- Part 2 — TC-0027 schema (MeetingFeedback.outOfScope*)
-- Part 3 — permissions, sans lesquelles l'entrée de menu
--          "Support technique" reste invisible pour SDR / BD / Booker.
-- ============================================================

BEGIN;

-- ============================================================
-- PART 1 — TC-0032 : intake des demandes équipe sales
-- ============================================================

DO $$ BEGIN
    CREATE TYPE "TicketValidation" AS ENUM ('NOT_REQUIRED', 'PENDING', 'ACCEPTED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Les tickets existants ont tous été créés par un manager : NOT_REQUIRED
-- est donc le bon backfill, et la colonne peut être NOT NULL d'emblée.
ALTER TABLE "Ticket"
    ADD COLUMN IF NOT EXISTS "validation" "TicketValidation" NOT NULL DEFAULT 'NOT_REQUIRED',
    ADD COLUMN IF NOT EXISTS "validatedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "validatedById" TEXT,
    ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;

DO $$ BEGIN
    ALTER TABLE "Ticket"
        ADD CONSTRAINT "Ticket_validatedById_fkey"
        FOREIGN KEY ("validatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "Ticket_validation_createdAt_idx" ON "Ticket"("validation", "createdAt");

-- ============================================================
-- PART 2 — TC-0027 : RDV absent "hors scope"
-- Le stand by est une pause qu'on revient défaire ; hors scope
-- retire l'absence définitivement. Colonnes distinctes exprès :
-- un RDV hors scope ne doit pas pouvoir être "réactivé" par
-- inadvertance depuis la file stand by.
-- ============================================================

ALTER TABLE "MeetingFeedback"
    ADD COLUMN IF NOT EXISTS "outOfScopeAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "outOfScopeReason" TEXT,
    ADD COLUMN IF NOT EXISTS "outOfScopeById" TEXT;

DO $$ BEGIN
    ALTER TABLE "MeetingFeedback"
        ADD CONSTRAINT "MeetingFeedback_outOfScopeById_fkey"
        FOREIGN KEY ("outOfScopeById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "MeetingFeedback_outOfScopeAt_idx" ON "MeetingFeedback"("outOfScopeAt");

-- ============================================================
-- PART 3 — PERMISSIONS
-- ============================================================

INSERT INTO "Permission" ("id", "code", "name", "description", "category", "createdAt")
VALUES
    (gen_random_uuid()::text, 'pages.ticket_requests', 'Demandes support technique', 'Peut déposer une demande technique et suivre les siennes', 'pages', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE
    SET "name" = EXCLUDED."name",
        "description" = EXCLUDED."description",
        "category" = EXCLUDED."category";

-- L'équipe sales dépose et suit ses propres demandes. Elle n'accède
-- pas au board : celui-ci reste sur pages.tickets (MANAGER, DEVELOPER).
INSERT INTO "RolePermission" ("id", "role", "permissionId", "granted", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, grants.role::"UserRole", p."id", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
    ('pages.ticket_requests', 'SDR'),
    ('pages.ticket_requests', 'BUSINESS_DEVELOPER'),
    ('pages.ticket_requests', 'BOOKER')
) AS grants(code, role)
JOIN "Permission" p ON p."code" = grants.code
ON CONFLICT ("role", "permissionId") DO UPDATE
    SET "granted" = true,
        "updatedAt" = CURRENT_TIMESTAMP;

COMMIT;

-- ============================================================
-- VÉRIFICATION (à lancer après le COMMIT)
-- ============================================================
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'Ticket' AND column_name LIKE 'validat%' OR column_name = 'rejectionReason';
--
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'MeetingFeedback' AND column_name LIKE 'outOfScope%';
--
-- SELECT rp."role", p."code", rp."granted"
--   FROM "RolePermission" rp JOIN "Permission" p ON p."id" = rp."permissionId"
--  WHERE p."code" = 'pages.ticket_requests';
