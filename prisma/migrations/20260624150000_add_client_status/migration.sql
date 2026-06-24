-- Add ClientStatus enum and status column for quick Actif / En Pause / Arrêté toggle on clients.
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'PAUSED', 'STOPPED');

ALTER TABLE "Client"
  ADD COLUMN "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE';
