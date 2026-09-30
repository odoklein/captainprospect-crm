-- UserSession: one row per sign-in, so a manager can see every device/IP
-- logged in as a given user and revoke them ("Force logout") without waiting
-- for the 8h JWT to expire.

CREATE TABLE IF NOT EXISTS "UserSession" (
  "id"            TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "ip"            TEXT,
  "country"       TEXT,
  "userAgent"     TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt"     TIMESTAMP(3),
  "revokedById"   TEXT,
  "revokedReason" TEXT,

  CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserSession_userId_fkey'
  ) THEN
    ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserSession_revokedById_fkey'
  ) THEN
    ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_revokedById_fkey"
      FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "UserSession_userId_revokedAt_idx" ON "UserSession"("userId", "revokedAt");
CREATE INDEX IF NOT EXISTS "UserSession_lastSeenAt_idx" ON "UserSession"("lastSeenAt");
