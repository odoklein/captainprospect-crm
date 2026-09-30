-- AuditEvent: unified "who did what" log — exports, deletes, role/permission
-- changes, forced logouts, bulk actions. See prisma/schema.prisma for the
-- full doc comment.

CREATE TABLE IF NOT EXISTS "AuditEvent" (
  "id"         TEXT NOT NULL,
  "actorId"    TEXT,
  "actorRole"  TEXT,
  "action"     TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId"   TEXT,
  "summary"    TEXT NOT NULL,
  "before"     JSONB,
  "after"      JSONB,
  "metadata"   JSONB,
  "ip"         TEXT,
  "userAgent"  TEXT,
  "sessionId"  TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AuditEvent_actorId_fkey'
  ) THEN
    ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");
