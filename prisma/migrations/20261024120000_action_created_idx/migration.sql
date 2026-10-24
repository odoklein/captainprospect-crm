-- Santé de la prospection / client intelligence: indexes only, no column or table change.
-- Safe to apply (or skip) at any time; no code depends on them, queries are just slower without.
-- Prisma migrate runs this in a transaction, so no CONCURRENTLY here. On a busy table, run the
-- two statements by hand with CREATE INDEX CONCURRENTLY instead.

CREATE INDEX IF NOT EXISTS "Action_createdAt_idx" ON "Action"("createdAt");
CREATE INDEX IF NOT EXISTS "Action_campaignId_createdAt_idx" ON "Action"("campaignId", "createdAt");
