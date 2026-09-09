-- AlterTable
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "linkedFromId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Company_linkedFromId_idx" ON "Company"("linkedFromId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Company_linkedFromId_fkey'
  ) THEN
    ALTER TABLE "Company" ADD CONSTRAINT "Company_linkedFromId_fkey"
      FOREIGN KEY ("linkedFromId") REFERENCES "Company"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
