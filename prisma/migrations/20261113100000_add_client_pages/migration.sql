-- Client workspace pages: briefs, launch notes and procedures written by managers.
-- New table only; nothing existing changes.
-- CreateTable
CREATE TABLE "ClientPage" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "missionId" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "icon" TEXT,
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientPage_clientId_position_idx" ON "ClientPage"("clientId", "position");

-- CreateIndex
CREATE INDEX "ClientPage_missionId_idx" ON "ClientPage"("missionId");

-- AddForeignKey
ALTER TABLE "ClientPage" ADD CONSTRAINT "ClientPage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPage" ADD CONSTRAINT "ClientPage_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPage" ADD CONSTRAINT "ClientPage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPage" ADD CONSTRAINT "ClientPage_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

