-- Support Technique: development tickets (bugs, improvements, feature requests,
-- technical support) with a client-facing roadmap and changelog projection.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "TicketCategory" AS ENUM ('BUG', 'IMPROVEMENT', 'FEATURE_REQUEST', 'TECHNICAL_SUPPORT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "TicketScope" AS ENUM ('INTERNAL', 'CLIENT_FACING', 'MISSION_RELATED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "TicketStatus" AS ENUM ('NEW', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'TESTING', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
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

-- AlterTable: attach uploaded screenshots to a ticket
ALTER TABLE "File" ADD COLUMN IF NOT EXISTS "ticketId" TEXT;

-- CreateIndex
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

-- AddForeignKey
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
