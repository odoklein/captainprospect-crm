-- AlterTable
ALTER TABLE "List" ADD COLUMN IF NOT EXISTS "contactsViewEnabled" BOOLEAN NOT NULL DEFAULT false;

