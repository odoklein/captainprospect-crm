-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "VaultCredentialType" AS ENUM ('PORTAL', 'EMAIL', 'CALENDAR', 'CRM_EXTERNAL', 'LINKEDIN', 'PHONE_TOOL', 'OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "VaultAuditAction" AS ENUM ('CREATED', 'UPDATED', 'REVEALED', 'ROTATED', 'DELETED', 'PORTAL_ACCOUNT_CREATED', 'CREDENTIALS_EMAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "VaultCredential" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "missionId" TEXT,
    "type" "VaultCredentialType" NOT NULL,
    "label" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "passwordEnc" TEXT,
    "url" TEXT,
    "notes" TEXT,
    "interlocuteurId" TEXT,
    "userId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "lastRevealedAt" TIMESTAMP(3),
    "lastRevealedById" TEXT,
    "lastSentAt" TIMESTAMP(3),
    "lastSentTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "VaultAuditEvent" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT,
    "clientId" TEXT,
    "action" "VaultAuditAction" NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VaultCredential_clientId_type_idx" ON "VaultCredential"("clientId", "type");
CREATE INDEX IF NOT EXISTS "VaultCredential_missionId_idx" ON "VaultCredential"("missionId");
CREATE INDEX IF NOT EXISTS "VaultCredential_interlocuteurId_idx" ON "VaultCredential"("interlocuteurId");
CREATE INDEX IF NOT EXISTS "VaultCredential_userId_idx" ON "VaultCredential"("userId");
CREATE INDEX IF NOT EXISTS "VaultAuditEvent_clientId_createdAt_idx" ON "VaultAuditEvent"("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "VaultAuditEvent_credentialId_createdAt_idx" ON "VaultAuditEvent"("credentialId", "createdAt");
CREATE INDEX IF NOT EXISTS "VaultAuditEvent_actorId_idx" ON "VaultAuditEvent"("actorId");

-- AddForeignKey
ALTER TABLE "VaultCredential" ADD CONSTRAINT "VaultCredential_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultCredential" ADD CONSTRAINT "VaultCredential_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VaultCredential" ADD CONSTRAINT "VaultCredential_interlocuteurId_fkey" FOREIGN KEY ("interlocuteurId") REFERENCES "ClientInterlocuteur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VaultCredential" ADD CONSTRAINT "VaultCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VaultCredential" ADD CONSTRAINT "VaultCredential_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VaultCredential" ADD CONSTRAINT "VaultCredential_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VaultCredential" ADD CONSTRAINT "VaultCredential_lastRevealedById_fkey" FOREIGN KEY ("lastRevealedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultAuditEvent" ADD CONSTRAINT "VaultAuditEvent_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "VaultCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VaultAuditEvent" ADD CONSTRAINT "VaultAuditEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VaultAuditEvent" ADD CONSTRAINT "VaultAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
