-- ============================================================
-- SUPPORT TECHNIQUE — development tickets
-- Run once against the target database. Safe to re-run: every
-- statement is idempotent (IF NOT EXISTS / ON CONFLICT / guarded
-- DO blocks), so a partial run can simply be replayed.
--
-- Part 1 creates the schema, Part 2 grants the permissions that
-- make the menu entries appear.
-- ============================================================

BEGIN;

-- ============================================================
-- PART 1 — SCHEMA
-- ============================================================

-- Enums -------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE "TicketCategory" AS ENUM ('BUG', 'IMPROVEMENT', 'FEATURE_REQUEST', 'TECHNICAL_SUPPORT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "TicketScope" AS ENUM ('INTERNAL', 'CLIENT_FACING', 'MISSION_RELATED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "TicketStatus" AS ENUM ('NEW', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'TESTING', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Tables ------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Ticket" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "TicketCategory" NOT NULL,
    "scope" "TicketScope" NOT NULL DEFAULT 'INTERNAL',
    "affectedRoles" "UserRole"[] DEFAULT ARRAY[]::"UserRole"[],
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TicketStatus" NOT NULL DEFAULT 'NEW',
    "publishToRoadmap" BOOLEAN NOT NULL DEFAULT false,
    "publicTitle" TEXT,
    "publicDescription" TEXT,
    "clientId" TEXT,
    "missionId" TEXT,
    "requesterId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "sourceSupportMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TicketComment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TicketHistory" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TicketReleaseCheck" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "checkedById" TEXT,
    "checkedAt" TIMESTAMP(3),
    "notes" TEXT,
    CONSTRAINT "TicketReleaseCheck_pkey" PRIMARY KEY ("id")
);

-- Screenshots / attachments reuse the existing File table.
ALTER TABLE "File" ADD COLUMN IF NOT EXISTS "ticketId" TEXT;

-- Indexes -----------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "Ticket_number_key" ON "Ticket"("number");
CREATE INDEX IF NOT EXISTS "Ticket_status_idx" ON "Ticket"("status");
CREATE INDEX IF NOT EXISTS "Ticket_priority_idx" ON "Ticket"("priority");
CREATE INDEX IF NOT EXISTS "Ticket_category_idx" ON "Ticket"("category");
CREATE INDEX IF NOT EXISTS "Ticket_scope_idx" ON "Ticket"("scope");
CREATE INDEX IF NOT EXISTS "Ticket_clientId_idx" ON "Ticket"("clientId");
CREATE INDEX IF NOT EXISTS "Ticket_missionId_idx" ON "Ticket"("missionId");
CREATE INDEX IF NOT EXISTS "Ticket_assigneeId_idx" ON "Ticket"("assigneeId");
CREATE INDEX IF NOT EXISTS "Ticket_requesterId_idx" ON "Ticket"("requesterId");
CREATE INDEX IF NOT EXISTS "Ticket_publishToRoadmap_status_idx" ON "Ticket"("publishToRoadmap", "status");
CREATE INDEX IF NOT EXISTS "Ticket_dueDate_idx" ON "Ticket"("dueDate");

CREATE INDEX IF NOT EXISTS "TicketComment_ticketId_createdAt_idx" ON "TicketComment"("ticketId", "createdAt");
CREATE INDEX IF NOT EXISTS "TicketComment_userId_idx" ON "TicketComment"("userId");

CREATE INDEX IF NOT EXISTS "TicketHistory_ticketId_createdAt_idx" ON "TicketHistory"("ticketId", "createdAt");
CREATE INDEX IF NOT EXISTS "TicketHistory_userId_idx" ON "TicketHistory"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "TicketReleaseCheck_ticketId_role_key" ON "TicketReleaseCheck"("ticketId", "role");
CREATE INDEX IF NOT EXISTS "TicketReleaseCheck_ticketId_idx" ON "TicketReleaseCheck"("ticketId");

CREATE INDEX IF NOT EXISTS "File_ticketId_idx" ON "File"("ticketId");

-- Foreign keys ------------------------------------------------
DO $$ BEGIN
    ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_sourceSupportMessageId_fkey" FOREIGN KEY ("sourceSupportMessageId") REFERENCES "SupportMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "TicketComment" ADD CONSTRAINT "TicketComment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "TicketComment" ADD CONSTRAINT "TicketComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "TicketHistory" ADD CONSTRAINT "TicketHistory_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "TicketHistory" ADD CONSTRAINT "TicketHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "TicketReleaseCheck" ADD CONSTRAINT "TicketReleaseCheck_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "TicketReleaseCheck" ADD CONSTRAINT "TicketReleaseCheck_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "File" ADD CONSTRAINT "File_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- PART 2 — PERMISSIONS
-- Without these rows the "Support technique" / "Roadmap" menu
-- entries stay hidden, because the sidebar filters on permission.
-- ============================================================

INSERT INTO "Permission" ("id", "code", "name", "description", "category", "createdAt")
VALUES
    (gen_random_uuid()::text, 'pages.tickets',                   'Support technique',      'Accès aux tickets de développement',                  'pages',    CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'pages.client_roadmap',            'Roadmap client',         'Accès à la roadmap et aux nouveautés côté client',     'pages',    CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'features.create_ticket',          'Créer ticket',           'Peut créer des tickets de développement',              'features', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'features.assign_ticket',          'Assigner ticket',        'Peut assigner un ticket à un développeur',             'features', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'features.publish_ticket_roadmap', 'Publier sur la roadmap', 'Peut publier un ticket sur la roadmap client',         'features', CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'features.delete_ticket',          'Supprimer ticket',       'Peut supprimer un ticket',                             'features', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE
    SET "name" = EXCLUDED."name",
        "description" = EXCLUDED."description",
        "category" = EXCLUDED."category";

-- Grants, per role.
INSERT INTO "RolePermission" ("id", "role", "permissionId", "granted", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, grants.role::"UserRole", p."id", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
    ('pages.tickets',                   'MANAGER'),
    ('pages.tickets',                   'DEVELOPER'),
    ('pages.client_roadmap',            'CLIENT'),
    ('features.create_ticket',          'MANAGER'),
    ('features.assign_ticket',          'MANAGER'),
    ('features.publish_ticket_roadmap', 'MANAGER'),
    ('features.delete_ticket',          'MANAGER')
) AS grants(code, role)
JOIN "Permission" p ON p."code" = grants.code
ON CONFLICT ("role", "permissionId") DO UPDATE SET "granted" = true;

COMMIT;

-- ============================================================
-- Verification (run separately after COMMIT)
-- ============================================================
-- SELECT p."code", rp."role", rp."granted"
-- FROM "Permission" p
-- JOIN "RolePermission" rp ON rp."permissionId" = p."id"
-- WHERE p."code" LIKE '%ticket%' OR p."code" = 'pages.client_roadmap'
-- ORDER BY p."code", rp."role";
