-- Captain AI v4, Track B PR1: assistant folders, memory, file text + chunks,
-- pinned visuals, and the folder/visibility/summary columns on conversations
-- and messages.
-- Additive only: no existing column changes, no data rewrite. Idempotent like
-- the other assistant migrations, so a re-run (or the hand-applied prod copy
-- in work/) is harmless. Physical names carry the AssistantProjet prefix
-- because a sister app shares the production database.

-- pg_trgm is optional (fuzzy file/memory search is runtime-detected). Where
-- the role may not create extensions, or the contrib package is missing, we
-- only notice.
DO $$ BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION
    WHEN insufficient_privilege THEN RAISE NOTICE 'pg_trgm not created: insufficient privilege (optional)';
    WHEN feature_not_supported THEN RAISE NOTICE 'pg_trgm not created: extension unavailable (optional)';
    WHEN undefined_file THEN RAISE NOTICE 'pg_trgm not created: extension files missing (optional)';
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "AssistantFolderKind" AS ENUM ('CLIENT', 'GENERAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "AssistantConversationKind" AS ENUM ('CHAT', 'AGENT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "AssistantVisibility" AS ENUM ('PRIVATE', 'SHARED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "AssistantMemoryScope" AS ENUM ('AGENCY', 'FOLDER', 'USER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "AssistantMemoryKind" AS ENUM ('FACT', 'PREFERENCE', 'DECISION', 'CONTACT', 'GOAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "AssistantFileTextStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'NEEDS_OCR', 'UNSUPPORTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AssistantProjetFolder" (
    "id" TEXT NOT NULL,
    "kind" "AssistantFolderKind" NOT NULL,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "icon" TEXT,
    "instructions" TEXT,
    "starterQuestions" JSONB,
    "settings" JSONB,
    "storageFolderId" TEXT,
    "createdById" TEXT NOT NULL,
    "lastActivityAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantProjetFolder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssistantProjetMemory" (
    "id" TEXT NOT NULL,
    "scope" "AssistantMemoryScope" NOT NULL,
    "folderId" TEXT,
    "userId" TEXT,
    "missionId" TEXT,
    "kind" "AssistantMemoryKind" NOT NULL DEFAULT 'FACT',
    "content" VARCHAR(600) NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "contentKey" TEXT NOT NULL,
    "source" JSONB,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantProjetMemory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssistantProjetFileText" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "status" "AssistantFileTextStatus" NOT NULL DEFAULT 'PENDING',
    "text" TEXT,
    "pages" INTEGER,
    "chars" INTEGER NOT NULL DEFAULT 0,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "extractor" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "extractedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantProjetFileText_pkey" PRIMARY KEY ("id")
);

-- "tsv" is a stored generated column (Prisma: Unsupported("tsvector")?):
-- Postgres maintains it, the app only reads it.
CREATE TABLE IF NOT EXISTS "AssistantProjetFileChunk" (
    "id" TEXT NOT NULL,
    "fileTextId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "page" INTEGER,
    "heading" TEXT,
    "content" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "tsv" tsvector GENERATED ALWAYS AS (to_tsvector('french', "content")) STORED,

    CONSTRAINT "AssistantProjetFileChunk_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssistantProjetPin" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "visual" JSONB NOT NULL,
    "source" JSONB,
    "question" TEXT,
    "conversationId" TEXT,
    "messageId" TEXT,
    "createdById" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "refreshedAt" TIMESTAMP(3),
    "refreshError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantProjetPin_pkey" PRIMARY KEY ("id")
);

-- AlterTable: conversations get a folder, a kind, a visibility and the
-- rolling-summary bookkeeping; messages get attachments, feedback, supersededAt.
ALTER TABLE "AssistantProjetConversation"
    ADD COLUMN IF NOT EXISTS "folderId" TEXT,
    ADD COLUMN IF NOT EXISTS "kind" "AssistantConversationKind" NOT NULL DEFAULT 'CHAT',
    ADD COLUMN IF NOT EXISTS "visibility" "AssistantVisibility" NOT NULL DEFAULT 'PRIVATE',
    ADD COLUMN IF NOT EXISTS "pinnedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "summaryUpToMessageId" TEXT,
    ADD COLUMN IF NOT EXISTS "summaryTokens" INTEGER,
    ADD COLUMN IF NOT EXISTS "titleEditedAt" TIMESTAMP(3);

ALTER TABLE "AssistantProjetMessage"
    ADD COLUMN IF NOT EXISTS "attachments" JSONB,
    ADD COLUMN IF NOT EXISTS "feedback" JSONB,
    ADD COLUMN IF NOT EXISTS "supersededAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AssistantProjetFolder_clientId_key" ON "AssistantProjetFolder"("clientId");
CREATE UNIQUE INDEX IF NOT EXISTS "AssistantProjetFolder_storageFolderId_key" ON "AssistantProjetFolder"("storageFolderId");
CREATE INDEX IF NOT EXISTS "AssistantProjetFolder_kind_archivedAt_lastActivityAt_idx" ON "AssistantProjetFolder"("kind", "archivedAt", "lastActivityAt");

CREATE UNIQUE INDEX IF NOT EXISTS "AssistantProjetMemory_scopeKey_contentKey_key" ON "AssistantProjetMemory"("scopeKey", "contentKey");
CREATE INDEX IF NOT EXISTS "AssistantProjetMemory_scope_folderId_deletedAt_idx" ON "AssistantProjetMemory"("scope", "folderId", "deletedAt");
CREATE INDEX IF NOT EXISTS "AssistantProjetMemory_scope_userId_deletedAt_idx" ON "AssistantProjetMemory"("scope", "userId", "deletedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "AssistantProjetFileText_fileId_key" ON "AssistantProjetFileText"("fileId");
CREATE INDEX IF NOT EXISTS "AssistantProjetFileText_folderId_status_idx" ON "AssistantProjetFileText"("folderId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "AssistantProjetFileChunk_fileTextId_index_key" ON "AssistantProjetFileChunk"("fileTextId", "index");
CREATE INDEX IF NOT EXISTS "AssistantProjetFileChunk_folderId_idx" ON "AssistantProjetFileChunk"("folderId");
CREATE INDEX IF NOT EXISTS "AssistantProjetFileChunk_tsv_idx" ON "AssistantProjetFileChunk" USING GIN ("tsv");

CREATE INDEX IF NOT EXISTS "AssistantProjetPin_folderId_position_idx" ON "AssistantProjetPin"("folderId", "position");

CREATE INDEX IF NOT EXISTS "AssistantProjetConversation_folderId_lastMessageAt_idx" ON "AssistantProjetConversation"("folderId", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "AssistantProjetConversation_visibility_lastMessageAt_idx" ON "AssistantProjetConversation"("visibility", "lastMessageAt");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "AssistantProjetFolder" ADD CONSTRAINT "AssistantProjetFolder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantProjetFolder" ADD CONSTRAINT "AssistantProjetFolder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantProjetMemory" ADD CONSTRAINT "AssistantProjetMemory_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "AssistantProjetFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantProjetMemory" ADD CONSTRAINT "AssistantProjetMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantProjetFileText" ADD CONSTRAINT "AssistantProjetFileText_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantProjetFileText" ADD CONSTRAINT "AssistantProjetFileText_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "AssistantProjetFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantProjetFileChunk" ADD CONSTRAINT "AssistantProjetFileChunk_fileTextId_fkey" FOREIGN KEY ("fileTextId") REFERENCES "AssistantProjetFileText"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantProjetPin" ADD CONSTRAINT "AssistantProjetPin_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "AssistantProjetFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantProjetPin" ADD CONSTRAINT "AssistantProjetPin_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "AssistantProjetConversation" ADD CONSTRAINT "AssistantProjetConversation_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "AssistantProjetFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
