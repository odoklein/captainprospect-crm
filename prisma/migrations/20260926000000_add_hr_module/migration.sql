-- HR Module migration: HrProfile, HrProfileSnapshot, HrMonthRecord, HrDayDecisionRecord, HrAuditLog, User.managerId

-- Add managerId to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "managerId" TEXT;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_managerId_fkey'
  ) THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContractType') THEN
    CREATE TYPE "ContractType" AS ENUM ('SALARIE', 'INDEPENDANT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RemunerationMode') THEN
    CREATE TYPE "RemunerationMode" AS ENUM ('FIXE', 'VARIABLE', 'FIXE_PLUS_VARIABLE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HrMonthStatus') THEN
    CREATE TYPE "HrMonthStatus" AS ENUM ('DRAFT', 'TO_VERIFY', 'VALIDATED', 'PAID');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HrDayDecision') THEN
    CREATE TYPE "HrDayDecision" AS ENUM ('PAID', 'UNPAID');
  END IF;
END $$;

-- HrProfile table
CREATE TABLE IF NOT EXISTS "HrProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "contractType" "ContractType" NOT NULL DEFAULT 'SALARIE',
  "remunerationMode" "RemunerationMode" NOT NULL DEFAULT 'FIXE',
  "fixedSalaryCents" INTEGER NOT NULL DEFAULT 0,
  "variablePerRdvCents" INTEGER NOT NULL DEFAULT 0,
  "dailyQuota" INTEGER NOT NULL DEFAULT 0,
  "effectiveFrom" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "HrProfile_userId_key" ON "HrProfile"("userId");
CREATE INDEX IF NOT EXISTS "HrProfile_userId_idx" ON "HrProfile"("userId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrProfile_userId_fkey') THEN
    ALTER TABLE "HrProfile" ADD CONSTRAINT "HrProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- HrProfileSnapshot table
CREATE TABLE IF NOT EXISTS "HrProfileSnapshot" (
  "id" TEXT NOT NULL,
  "hrProfileId" TEXT NOT NULL,
  "contractType" "ContractType" NOT NULL,
  "remunerationMode" "RemunerationMode" NOT NULL,
  "fixedSalaryCents" INTEGER NOT NULL,
  "variablePerRdvCents" INTEGER NOT NULL,
  "dailyQuota" INTEGER NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "changedById" TEXT NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason" TEXT,
  CONSTRAINT "HrProfileSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "HrProfileSnapshot_hrProfileId_idx" ON "HrProfileSnapshot"("hrProfileId");
CREATE INDEX IF NOT EXISTS "HrProfileSnapshot_changedAt_idx" ON "HrProfileSnapshot"("changedAt");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrProfileSnapshot_hrProfileId_fkey') THEN
    ALTER TABLE "HrProfileSnapshot" ADD CONSTRAINT "HrProfileSnapshot_hrProfileId_fkey" FOREIGN KEY ("hrProfileId") REFERENCES "HrProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- HrMonthRecord table
CREATE TABLE IF NOT EXISTS "HrMonthRecord" (
  "id" TEXT NOT NULL,
  "hrProfileId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "workingDays" INTEGER NOT NULL DEFAULT 0,
  "absenceDays" INTEGER NOT NULL DEFAULT 0,
  "totalCalls" INTEGER NOT NULL DEFAULT 0,
  "totalRdv" INTEGER NOT NULL DEFAULT 0,
  "dailyQuota" INTEGER NOT NULL DEFAULT 0,
  "fixedAmountCents" INTEGER NOT NULL DEFAULT 0,
  "variableAmountCents" INTEGER NOT NULL DEFAULT 0,
  "adjustmentCents" INTEGER NOT NULL DEFAULT 0,
  "totalAmountCents" INTEGER NOT NULL DEFAULT 0,
  "rulesSnapshot" JSONB,
  "status" "HrMonthStatus" NOT NULL DEFAULT 'DRAFT',
  "validatedAt" TIMESTAMP(3),
  "validatedById" TEXT,
  "paidAt" TIMESTAMP(3),
  "adjustmentNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrMonthRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "HrMonthRecord_userId_month_key" ON "HrMonthRecord"("userId", "month");
CREATE INDEX IF NOT EXISTS "HrMonthRecord_userId_idx" ON "HrMonthRecord"("userId");
CREATE INDEX IF NOT EXISTS "HrMonthRecord_hrProfileId_idx" ON "HrMonthRecord"("hrProfileId");
CREATE INDEX IF NOT EXISTS "HrMonthRecord_month_idx" ON "HrMonthRecord"("month");
CREATE INDEX IF NOT EXISTS "HrMonthRecord_status_idx" ON "HrMonthRecord"("status");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrMonthRecord_hrProfileId_fkey') THEN
    ALTER TABLE "HrMonthRecord" ADD CONSTRAINT "HrMonthRecord_hrProfileId_fkey" FOREIGN KEY ("hrProfileId") REFERENCES "HrProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrMonthRecord_userId_fkey') THEN
    ALTER TABLE "HrMonthRecord" ADD CONSTRAINT "HrMonthRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- HrDayDecisionRecord table
CREATE TABLE IF NOT EXISTS "HrDayDecisionRecord" (
  "id" TEXT NOT NULL,
  "monthRecordId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "callCount" INTEGER NOT NULL DEFAULT 0,
  "rdvCount" INTEGER NOT NULL DEFAULT 0,
  "decision" "HrDayDecision" NOT NULL,
  "reason" TEXT NOT NULL,
  "decidedById" TEXT NOT NULL,
  "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrDayDecisionRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "HrDayDecisionRecord_monthRecordId_date_key" ON "HrDayDecisionRecord"("monthRecordId", "date");
CREATE INDEX IF NOT EXISTS "HrDayDecisionRecord_monthRecordId_idx" ON "HrDayDecisionRecord"("monthRecordId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrDayDecisionRecord_monthRecordId_fkey') THEN
    ALTER TABLE "HrDayDecisionRecord" ADD CONSTRAINT "HrDayDecisionRecord_monthRecordId_fkey" FOREIGN KEY ("monthRecordId") REFERENCES "HrMonthRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- HrAuditLog table
CREATE TABLE IF NOT EXISTS "HrAuditLog" (
  "id" TEXT NOT NULL,
  "monthRecordId" TEXT,
  "userId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrAuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "HrAuditLog_monthRecordId_idx" ON "HrAuditLog"("monthRecordId");
CREATE INDEX IF NOT EXISTS "HrAuditLog_userId_idx" ON "HrAuditLog"("userId");
CREATE INDEX IF NOT EXISTS "HrAuditLog_actorId_idx" ON "HrAuditLog"("actorId");
CREATE INDEX IF NOT EXISTS "HrAuditLog_createdAt_idx" ON "HrAuditLog"("createdAt");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrAuditLog_monthRecordId_fkey') THEN
    ALTER TABLE "HrAuditLog" ADD CONSTRAINT "HrAuditLog_monthRecordId_fkey" FOREIGN KEY ("monthRecordId") REFERENCES "HrMonthRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
