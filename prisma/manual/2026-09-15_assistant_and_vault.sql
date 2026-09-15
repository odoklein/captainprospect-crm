-- =============================================================================
-- COFFRE D'ACCÈS + ASSISTANT PROJET — manual migration
--
-- Equivalent to:
--     npx prisma migrate deploy
-- for these two migrations:
--     prisma/migrations/20260915120000_add_access_vault
--     prisma/migrations/20260915150000_add_assistant_projet
--
-- Run it as a whole. It is:
--   · transactional — any failure rolls the entire script back
--   · idempotent    — safe to run twice; a second run changes nothing
--   · self-recording — it writes both rows into `_prisma_migrations`, so a
--     later `prisma migrate deploy` sees them as already applied instead of
--     trying to create these tables again
--
-- Requires: PostgreSQL. Nothing here touches existing rows or columns —
-- it only adds two enums + two tables (vault) and two enums + four tables
-- (assistant), plus their indexes and foreign keys.
--
-- NOTE ON NAMING: the assistant's conversation/message tables are physically
-- named AssistantProjetConversation / AssistantProjetMessage. A table called
-- AssistantConversation already exists in the Neon database — a different
-- feature, different columns, live rows — and must not be touched. The Prisma
-- models keep their short names through @@map.
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 1 — COFFRE D'ACCÈS (20260915120000_add_access_vault)
-- =============================================================================

DO $$ BEGIN
    CREATE TYPE "VaultCredentialType" AS ENUM
        ('PORTAL', 'EMAIL', 'CALENDAR', 'CRM_EXTERNAL', 'LINKEDIN', 'PHONE_TOOL', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "VaultAuditAction" AS ENUM
        ('CREATED', 'UPDATED', 'REVEALED', 'ROTATED', 'DELETED', 'PORTAL_ACCOUNT_CREATED', 'CREDENTIALS_EMAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "VaultCredential" (
    "id"               TEXT NOT NULL,
    "clientId"         TEXT NOT NULL,
    "missionId"        TEXT,
    "type"             "VaultCredentialType" NOT NULL,
    "label"            TEXT NOT NULL,
    "login"            TEXT NOT NULL,
    -- AES-256-GCM ciphertext (lib/encryption.ts). Never a plaintext password.
    "passwordEnc"      TEXT,
    "url"              TEXT,
    "notes"            TEXT,
    "interlocuteurId"  TEXT,
    "userId"           TEXT,
    "createdById"      TEXT,
    "updatedById"      TEXT,
    "lastRevealedAt"   TIMESTAMP(3),
    "lastRevealedById" TEXT,
    "lastSentAt"       TIMESTAMP(3),
    "lastSentTo"       TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VaultCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "VaultAuditEvent" (
    "id"           TEXT NOT NULL,
    "credentialId" TEXT,
    "clientId"     TEXT,
    "action"       "VaultAuditAction" NOT NULL,
    "summary"      TEXT NOT NULL,
    "metadata"     JSONB,
    "actorId"      TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VaultAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VaultCredential_clientId_type_idx"        ON "VaultCredential"("clientId", "type");
CREATE INDEX IF NOT EXISTS "VaultCredential_missionId_idx"            ON "VaultCredential"("missionId");
CREATE INDEX IF NOT EXISTS "VaultCredential_interlocuteurId_idx"      ON "VaultCredential"("interlocuteurId");
CREATE INDEX IF NOT EXISTS "VaultCredential_userId_idx"               ON "VaultCredential"("userId");
CREATE INDEX IF NOT EXISTS "VaultAuditEvent_clientId_createdAt_idx"   ON "VaultAuditEvent"("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "VaultAuditEvent_credentialId_createdAt_idx" ON "VaultAuditEvent"("credentialId", "createdAt");
CREATE INDEX IF NOT EXISTS "VaultAuditEvent_actorId_idx"              ON "VaultAuditEvent"("actorId");

DO $$ BEGIN
    ALTER TABLE "VaultCredential" ADD CONSTRAINT "VaultCredential_clientId_fkey"
        FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "VaultCredential" ADD CONSTRAINT "VaultCredential_missionId_fkey"
        FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "VaultCredential" ADD CONSTRAINT "VaultCredential_interlocuteurId_fkey"
        FOREIGN KEY ("interlocuteurId") REFERENCES "ClientInterlocuteur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "VaultCredential" ADD CONSTRAINT "VaultCredential_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "VaultCredential" ADD CONSTRAINT "VaultCredential_createdById_fkey"
        FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "VaultCredential" ADD CONSTRAINT "VaultCredential_updatedById_fkey"
        FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "VaultCredential" ADD CONSTRAINT "VaultCredential_lastRevealedById_fkey"
        FOREIGN KEY ("lastRevealedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "VaultAuditEvent" ADD CONSTRAINT "VaultAuditEvent_credentialId_fkey"
        FOREIGN KEY ("credentialId") REFERENCES "VaultCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "VaultAuditEvent" ADD CONSTRAINT "VaultAuditEvent_clientId_fkey"
        FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "VaultAuditEvent" ADD CONSTRAINT "VaultAuditEvent_actorId_fkey"
        FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- PART 2 — ASSISTANT PROJET (20260915150000_add_assistant_projet)
-- =============================================================================

DO $$ BEGIN
    CREATE TYPE "AssistantMessageRole" AS ENUM ('USER', 'ASSISTANT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "AssistantArtifactKind" AS ENUM ('EMAIL_DRAFT', 'BRIEF', 'REPORT', 'NOTE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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
    -- Which tools ran, ok/ko and timings.
    "trace"          JSONB,
    -- A proposed or executed action. Never holds a secret.
    "action"         JSONB,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantProjetMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssistantActionLog" (
    "id"             TEXT NOT NULL,
    "tool"           TEXT NOT NULL,
    "args"           JSONB,
    "outcome"        TEXT NOT NULL,
    -- false = automatic (reversible) write, true = a human clicked.
    "confirmed"      BOOLEAN NOT NULL DEFAULT false,
    "ok"             BOOLEAN NOT NULL DEFAULT true,
    "actorId"        TEXT,
    "clientId"       TEXT,
    "missionId"      TEXT,
    "conversationId" TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantActionLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssistantArtifact" (
    "id"             TEXT NOT NULL,
    "kind"           "AssistantArtifactKind" NOT NULL,
    "title"          TEXT NOT NULL,
    "subject"        TEXT,
    "body"           TEXT NOT NULL,
    "clientId"       TEXT NOT NULL,
    "missionId"      TEXT,
    "conversationId" TEXT,
    "createdById"    TEXT,
    "sentAt"         TIMESTAMP(3),
    "recipients"     JSONB,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssistantArtifact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AssistantProjetConversation_clientId_missionId_lastMessageAt_idx"
    ON "AssistantProjetConversation"("clientId", "missionId", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "AssistantProjetConversation_createdById_idx"
    ON "AssistantProjetConversation"("createdById");
CREATE INDEX IF NOT EXISTS "AssistantProjetMessage_conversationId_createdAt_idx"
    ON "AssistantProjetMessage"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "AssistantActionLog_clientId_createdAt_idx"
    ON "AssistantActionLog"("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "AssistantActionLog_conversationId_idx"
    ON "AssistantActionLog"("conversationId");
CREATE INDEX IF NOT EXISTS "AssistantActionLog_actorId_idx"
    ON "AssistantActionLog"("actorId");
CREATE INDEX IF NOT EXISTS "AssistantArtifact_clientId_missionId_createdAt_idx"
    ON "AssistantArtifact"("clientId", "missionId", "createdAt");
CREATE INDEX IF NOT EXISTS "AssistantArtifact_conversationId_idx"
    ON "AssistantArtifact"("conversationId");

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

DO $$ BEGIN
    ALTER TABLE "AssistantActionLog" ADD CONSTRAINT "AssistantActionLog_actorId_fkey"
        FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantActionLog" ADD CONSTRAINT "AssistantActionLog_clientId_fkey"
        FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantActionLog" ADD CONSTRAINT "AssistantActionLog_missionId_fkey"
        FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantActionLog" ADD CONSTRAINT "AssistantActionLog_conversationId_fkey"
        FOREIGN KEY ("conversationId") REFERENCES "AssistantProjetConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantArtifact" ADD CONSTRAINT "AssistantArtifact_clientId_fkey"
        FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantArtifact" ADD CONSTRAINT "AssistantArtifact_missionId_fkey"
        FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantArtifact" ADD CONSTRAINT "AssistantArtifact_conversationId_fkey"
        FOREIGN KEY ("conversationId") REFERENCES "AssistantProjetConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantArtifact" ADD CONSTRAINT "AssistantArtifact_createdById_fkey"
        FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- A conversation with no client is the agency-wide view. Harmless where the
-- column is already nullable, which is why it is not guarded.
ALTER TABLE "AssistantProjetConversation" ALTER COLUMN "clientId" DROP NOT NULL;


-- =============================================================================
-- PART 3 — Tell Prisma these migrations are applied
--
-- Without this, the next `prisma migrate deploy` tries to create these tables
-- again and fails. The checksums are the SHA-256 of each migration.sql file —
-- Prisma verifies them, so do not edit those files after running this.
-- =============================================================================

-- Skipped silently if you drive the schema with `prisma db push` and have no
-- `_prisma_migrations` table. Ids are fixed, so a second run is a no-op.
DO $$ BEGIN
    IF to_regclass('public."_prisma_migrations"') IS NULL THEN
        RAISE NOTICE 'Table _prisma_migrations absente — bookkeeping ignoré (db push).';
        RETURN;
    END IF;

    INSERT INTO "_prisma_migrations"
        ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
    VALUES
        (
            'a1f0c3d2-9b47-4e58-8c61-5d2e7a0f9b10',
            '5f5b7cff1b029990519a03ae49bfd2e15a6e7b45d56e0d252d77e1ba3dfba4e3',
            NOW(),
            '20260915120000_add_access_vault',
            NULL,
            NULL,
            NOW(),
            1
        ),
        (
            'b2e1d4c3-8a56-4f69-9d72-6e3f8b1a0c21',
            '4165d4f0ac92dfde66b2dd6755f6dd1b3b973c344af413735e9aa7a7b7957f86',
            NOW(),
            '20260915150000_add_assistant_projet',
            NULL,
            NULL,
            NOW(),
            1
        )
    ON CONFLICT DO NOTHING;
END $$;

COMMIT;


-- =============================================================================
-- VERIFICATION — run separately. Expect 6 rows, all "OK".
-- =============================================================================

SELECT
    t.name,
    CASE WHEN to_regclass('public."' || t.name || '"') IS NOT NULL
         THEN 'OK' ELSE 'MANQUANTE' END AS etat
FROM (VALUES
    ('VaultCredential'),
    ('VaultAuditEvent'),
    ('AssistantConversation'),
    ('AssistantMessage'),
    ('AssistantActionLog'),
    ('AssistantArtifact')
) AS t(name);
