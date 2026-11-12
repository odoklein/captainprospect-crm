-- AI pre-call brief, cached per prospect and mission

-- CreateTable
CREATE TABLE "ProspectBrief" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectBrief_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProspectBrief_targetId_missionId_key" ON "ProspectBrief"("targetId", "missionId");
