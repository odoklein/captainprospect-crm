-- AlterTable
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "contractedDaysPerWeek" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Action_campaignId_idx" ON "Action"("campaignId");
