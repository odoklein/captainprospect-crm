const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function exec(sql) {
  return prisma.$executeRawUnsafe(sql);
}

async function run() {
  console.log("Applying HR migration (single-statement)...");

  // 1. Add managerId to User
  await exec(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "managerId" TEXT;`);
  await exec(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'User_managerId_fkey'
      ) THEN
        ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
  console.log("✓ Added managerId to User and foreign key");

  // 2. Create Enums
  await exec(`
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
  `);
  console.log("✓ Created HR Enums");

  // 3. Create HrProfile table
  await exec(`
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
  `);
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS "HrProfile_userId_key" ON "HrProfile"("userId");`);
  await exec(`CREATE INDEX IF NOT EXISTS "HrProfile_userId_idx" ON "HrProfile"("userId");`);
  await exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrProfile_userId_fkey') THEN
        ALTER TABLE "HrProfile" ADD CONSTRAINT "HrProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
  console.log("✓ Created HrProfile table and relations");

  // 4. Create HrProfileSnapshot table
  await exec(`
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
  `);
  await exec(`CREATE INDEX IF NOT EXISTS "HrProfileSnapshot_hrProfileId_idx" ON "HrProfileSnapshot"("hrProfileId");`);
  await exec(`CREATE INDEX IF NOT EXISTS "HrProfileSnapshot_changedAt_idx" ON "HrProfileSnapshot"("changedAt");`);
  await exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrProfileSnapshot_hrProfileId_fkey') THEN
        ALTER TABLE "HrProfileSnapshot" ADD CONSTRAINT "HrProfileSnapshot_hrProfileId_fkey" FOREIGN KEY ("hrProfileId") REFERENCES "HrProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
  console.log("✓ Created HrProfileSnapshot table");

  // 5. Create HrMonthRecord table
  await exec(`
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
  `);
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS "HrMonthRecord_userId_month_key" ON "HrMonthRecord"("userId", "month");`);
  await exec(`CREATE INDEX IF NOT EXISTS "HrMonthRecord_userId_idx" ON "HrMonthRecord"("userId");`);
  await exec(`CREATE INDEX IF NOT EXISTS "HrMonthRecord_hrProfileId_idx" ON "HrMonthRecord"("hrProfileId");`);
  await exec(`CREATE INDEX IF NOT EXISTS "HrMonthRecord_month_idx" ON "HrMonthRecord"("month");`);
  await exec(`CREATE INDEX IF NOT EXISTS "HrMonthRecord_status_idx" ON "HrMonthRecord"("status");`);
  await exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrMonthRecord_hrProfileId_fkey') THEN
        ALTER TABLE "HrMonthRecord" ADD CONSTRAINT "HrMonthRecord_hrProfileId_fkey" FOREIGN KEY ("hrProfileId") REFERENCES "HrProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrMonthRecord_userId_fkey') THEN
        ALTER TABLE "HrMonthRecord" ADD CONSTRAINT "HrMonthRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
  console.log("✓ Created HrMonthRecord table");

  // 6. Create HrDayDecisionRecord table
  await exec(`
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
  `);
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS "HrDayDecisionRecord_monthRecordId_date_key" ON "HrDayDecisionRecord"("monthRecordId", "date");`);
  await exec(`CREATE INDEX IF NOT EXISTS "HrDayDecisionRecord_monthRecordId_idx" ON "HrDayDecisionRecord"("monthRecordId");`);
  await exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrDayDecisionRecord_monthRecordId_fkey') THEN
        ALTER TABLE "HrDayDecisionRecord" ADD CONSTRAINT "HrDayDecisionRecord_monthRecordId_fkey" FOREIGN KEY ("monthRecordId") REFERENCES "HrMonthRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
  console.log("✓ Created HrDayDecisionRecord table");

  // 7. Create HrAuditLog table
  await exec(`
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
  `);
  await exec(`CREATE INDEX IF NOT EXISTS "HrAuditLog_monthRecordId_idx" ON "HrAuditLog"("monthRecordId");`);
  await exec(`CREATE INDEX IF NOT EXISTS "HrAuditLog_userId_idx" ON "HrAuditLog"("userId");`);
  await exec(`CREATE INDEX IF NOT EXISTS "HrAuditLog_actorId_idx" ON "HrAuditLog"("actorId");`);
  await exec(`CREATE INDEX IF NOT EXISTS "HrAuditLog_createdAt_idx" ON "HrAuditLog"("createdAt");`);
  await exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HrAuditLog_monthRecordId_fkey') THEN
        ALTER TABLE "HrAuditLog" ADD CONSTRAINT "HrAuditLog_monthRecordId_fkey" FOREIGN KEY ("monthRecordId") REFERENCES "HrMonthRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
  console.log("✓ Created HrAuditLog table");

  console.log("All HR migration statements applied successfully!");
}

run()
  .catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
