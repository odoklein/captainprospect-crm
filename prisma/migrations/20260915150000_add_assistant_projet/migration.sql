-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "AssistantMessageRole" AS ENUM ('USER', 'ASSISTANT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "AssistantArtifactKind" AS ENUM ('EMAIL_DRAFT', 'BRIEF', 'REPORT', 'NOTE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AssistantProjetConversation" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "missionId" TEXT,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssistantProjetConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssistantProjetMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "AssistantMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "trace" JSONB,
    "action" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantProjetMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssistantActionLog" (
    "id" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "args" JSONB,
    "outcome" TEXT NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "actorId" TEXT,
    "clientId" TEXT,
    "missionId" TEXT,
    "conversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantActionLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssistantArtifact" (
    "id" TEXT NOT NULL,
    "kind" "AssistantArtifactKind" NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "missionId" TEXT,
    "conversationId" TEXT,
    "createdById" TEXT,
    "sentAt" TIMESTAMP(3),
    "recipients" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssistantArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AssistantProjetConversation_clientId_missionId_lastMessageAt_idx" ON "AssistantProjetConversation"("clientId", "missionId", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "AssistantProjetConversation_createdById_idx" ON "AssistantProjetConversation"("createdById");
CREATE INDEX IF NOT EXISTS "AssistantProjetMessage_conversationId_createdAt_idx" ON "AssistantProjetMessage"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "AssistantActionLog_clientId_createdAt_idx" ON "AssistantActionLog"("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "AssistantActionLog_conversationId_idx" ON "AssistantActionLog"("conversationId");
CREATE INDEX IF NOT EXISTS "AssistantActionLog_actorId_idx" ON "AssistantActionLog"("actorId");
CREATE INDEX IF NOT EXISTS "AssistantArtifact_clientId_missionId_createdAt_idx" ON "AssistantArtifact"("clientId", "missionId", "createdAt");
CREATE INDEX IF NOT EXISTS "AssistantArtifact_conversationId_idx" ON "AssistantArtifact"("conversationId");

-- AddForeignKey
ALTER TABLE "AssistantProjetConversation" ADD CONSTRAINT "AssistantProjetConversation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssistantProjetConversation" ADD CONSTRAINT "AssistantProjetConversation_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssistantProjetConversation" ADD CONSTRAINT "AssistantProjetConversation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssistantProjetMessage" ADD CONSTRAINT "AssistantProjetMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantProjetConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssistantActionLog" ADD CONSTRAINT "AssistantActionLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssistantActionLog" ADD CONSTRAINT "AssistantActionLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssistantActionLog" ADD CONSTRAINT "AssistantActionLog_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssistantActionLog" ADD CONSTRAINT "AssistantActionLog_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantProjetConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssistantArtifact" ADD CONSTRAINT "AssistantArtifact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssistantArtifact" ADD CONSTRAINT "AssistantArtifact_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssistantArtifact" ADD CONSTRAINT "AssistantArtifact_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantProjetConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssistantArtifact" ADD CONSTRAINT "AssistantArtifact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
