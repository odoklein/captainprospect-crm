-- Intake gate for Support Technique (TC-0032).
-- Tickets filed by the internal sales team arrive as PENDING and stay out of
-- the work queue until a manager accepts or rejects them. Every existing
-- ticket was manager-created, so the default NOT_REQUIRED backfills correctly.

-- CreateEnum
CREATE TYPE "TicketValidation" AS ENUM ('NOT_REQUIRED', 'PENDING', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "Ticket"
    ADD COLUMN "validation" "TicketValidation" NOT NULL DEFAULT 'NOT_REQUIRED',
    ADD COLUMN "validatedAt" TIMESTAMP(3),
    ADD COLUMN "validatedById" TEXT,
    ADD COLUMN "rejectionReason" TEXT;

-- AddForeignKey
ALTER TABLE "Ticket"
    ADD CONSTRAINT "Ticket_validatedById_fkey"
    FOREIGN KEY ("validatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Ticket_validation_createdAt_idx" ON "Ticket"("validation", "createdAt");
