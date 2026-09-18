-- ============================================================
-- SUPPORT CLIENT MULTI-DEMANDES — SCHEMA EVOLUTION
-- Allows multiple independent support conversations per client.
-- Adds subject, creator tracking, and drops the 1-per-client unique constraint.
-- Safe to re-run: idempotent.
-- ============================================================

BEGIN;

-- 1. Drop unique constraint on clientId if present
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'SupportConversation_clientId_key'
    ) THEN
        ALTER TABLE "SupportConversation" DROP CONSTRAINT "SupportConversation_clientId_key";
    END IF;
END $$;

-- Also drop unique index if it exists independently
DROP INDEX IF EXISTS "SupportConversation_clientId_key";

-- 2. Add subject column
ALTER TABLE "SupportConversation" 
    ADD COLUMN IF NOT EXISTS "subject" TEXT NOT NULL DEFAULT 'Demande d''assistance';

-- 3. Add createdById column
ALTER TABLE "SupportConversation" 
    ADD COLUMN IF NOT EXISTS "createdById" TEXT;

-- 4. Foreign key for createdById
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'SupportConversation_createdById_fkey'
    ) THEN
        ALTER TABLE "SupportConversation" 
            ADD CONSTRAINT "SupportConversation_createdById_fkey" 
            FOREIGN KEY ("createdById") REFERENCES "User"("id") 
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS "SupportConversation_clientId_idx" ON "SupportConversation"("clientId");
CREATE INDEX IF NOT EXISTS "SupportConversation_createdById_idx" ON "SupportConversation"("createdById");

COMMIT;
