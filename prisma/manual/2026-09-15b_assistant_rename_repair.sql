-- =============================================================================
-- REPAIR — assistant conversation tables renamed
--
-- Run this on the database the app actually uses (production = Supabase).
-- It fixes the 500s on /api/manager/assistant/conversations.
--
-- WHAT HAPPENED
-- The first manual script created "AssistantConversation" / "AssistantMessage".
-- Those names collide with tables the sister app creates, so the Prisma models
-- were remapped to "AssistantProjetConversation" / "AssistantProjetMessage"
-- (@@map). The deployed code now queries names that do not exist yet.
--
-- WHY A PLAIN RE-RUN OF THE FIRST SCRIPT IS NOT ENOUGH
-- "AssistantActionLog_conversationId_fkey" and
-- "AssistantArtifact_conversationId_fkey" already exist and point at the OLD
-- table. The first script guards every ADD CONSTRAINT with
-- `EXCEPTION WHEN duplicate_object THEN NULL`, so it would skip them and leave
-- both foreign keys aimed at the wrong table — inserts would fail later, not
-- now, which is worse. This script drops and re-points them explicitly.
--
-- Transactional and idempotent. Nothing is dropped except two foreign-key
-- constraints, which are recreated immediately.
-- =============================================================================

BEGIN;

-- ============================================
-- 1. The renamed tables
-- ============================================

CREATE TABLE IF NOT EXISTS "AssistantProjetConversation" (
    "id"            TEXT NOT NULL,
    -- NULL = "vue agence", a thread bound to no single client.
    "clientId"      TEXT,
    "missionId"     TEXT,
    "createdById"   TEXT NOT NULL,
    "title"         TEXT NOT NULL,
    "summary"       TEXT,
    "messageCount"  INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssistantProjetConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssistantProjetMessage" (
    "id"             TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role"           "AssistantMessageRole" NOT NULL,
    "content"        TEXT NOT NULL,
    "trace"          JSONB,
    "action"         JSONB,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantProjetMessage_pkey" PRIMARY KEY ("id")
);

-- Harmless if the column is already nullable.
ALTER TABLE "AssistantProjetConversation" ALTER COLUMN "clientId" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "AssistantProjetConversation_clientId_missionId_lastMessageAt_idx"
    ON "AssistantProjetConversation"("clientId", "missionId", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "AssistantProjetConversation_createdById_idx"
    ON "AssistantProjetConversation"("createdById");
CREATE INDEX IF NOT EXISTS "AssistantProjetMessage_conversationId_createdAt_idx"
    ON "AssistantProjetMessage"("conversationId", "createdAt");

DO $$ BEGIN
    ALTER TABLE "AssistantProjetConversation" ADD CONSTRAINT "AssistantProjetConversation_clientId_fkey"
        FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantProjetConversation" ADD CONSTRAINT "AssistantProjetConversation_missionId_fkey"
        FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantProjetConversation" ADD CONSTRAINT "AssistantProjetConversation_createdById_fkey"
        FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantProjetMessage" ADD CONSTRAINT "AssistantProjetMessage_conversationId_fkey"
        FOREIGN KEY ("conversationId") REFERENCES "AssistantProjetConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================
-- 2. Re-point the two foreign keys that still reference the old table
--
-- DROP ... IF EXISTS then ADD, rather than a guarded ADD: the constraint name
-- already exists, so a guarded ADD is exactly what would leave it wrong.
-- ============================================

ALTER TABLE "AssistantActionLog" DROP CONSTRAINT IF EXISTS "AssistantActionLog_conversationId_fkey";
ALTER TABLE "AssistantActionLog" ADD CONSTRAINT "AssistantActionLog_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "AssistantProjetConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AssistantArtifact" DROP CONSTRAINT IF EXISTS "AssistantArtifact_conversationId_fkey";
ALTER TABLE "AssistantArtifact" ADD CONSTRAINT "AssistantArtifact_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "AssistantProjetConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;


-- =============================================================================
-- VERIFICATION — run separately. The four tables must be OK, and both foreign
-- keys must point at AssistantProjetConversation.
-- =============================================================================

SELECT
    t.name,
    CASE WHEN to_regclass('public."' || t.name || '"') IS NOT NULL THEN 'OK' ELSE 'MANQUANTE' END AS etat
FROM (VALUES
    ('AssistantProjetConversation'),
    ('AssistantProjetMessage'),
    ('AssistantActionLog'),
    ('AssistantArtifact')
) AS t(name);

SELECT
    c.conname        AS contrainte,
    cible.relname    AS pointe_vers
FROM pg_constraint c
JOIN pg_class cible ON cible.oid = c.confrelid
WHERE c.conname IN (
    'AssistantActionLog_conversationId_fkey',
    'AssistantArtifact_conversationId_fkey',
    'AssistantProjetMessage_conversationId_fkey'
);


-- =============================================================================
-- OPTIONAL CLEANUP — only after the app works again, and only if you are sure.
--
-- The first script may have created empty "AssistantConversation" /
-- "AssistantMessage" tables here. On the Neon database those names belong to
-- the sister app and hold real rows, so this is NOT safe to run blindly.
-- Check first:
--
--   SELECT COUNT(*) FROM "AssistantConversation";
--   SELECT COUNT(*) FROM "AssistantMessage";
--
-- If both are 0 and nothing else uses them:
--
--   DROP TABLE IF EXISTS "AssistantMessage";
--   DROP TABLE IF EXISTS "AssistantConversation";
-- =============================================================================
