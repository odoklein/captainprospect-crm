-- White-label: license of this instance (one row, id = 'default'), pushed by the
-- control plane. Additive only: one new table, no change to existing tables.
-- The app tolerates the table being absent or empty (no limit, all features on),
-- so this can be applied before or after the deploy that reads it.

CREATE TABLE IF NOT EXISTS "InstanceLicense" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "plan" TEXT,
    "seatLimit" INTEGER,
    "features" JSONB NOT NULL DEFAULT '{}',
    "aiMonthlyQuota" INTEGER,
    "suspendedReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "InstanceLicense_pkey" PRIMARY KEY ("id")
);
