-- CreateTable
CREATE TABLE IF NOT EXISTS "ClientCalCredential" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "passwordEnc" TEXT,
    "loginUrl" TEXT,
    "notes" TEXT,
    "updatedById" TEXT,
    "lastRevealedAt" TIMESTAMP(3),
    "lastRevealedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientCalCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ClientCalCredential_clientId_key" ON "ClientCalCredential"("clientId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClientCalCredential_clientId_idx" ON "ClientCalCredential"("clientId");

-- AddForeignKey
ALTER TABLE "ClientCalCredential" ADD CONSTRAINT "ClientCalCredential_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCalCredential" ADD CONSTRAINT "ClientCalCredential_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCalCredential" ADD CONSTRAINT "ClientCalCredential_lastRevealedById_fkey" FOREIGN KEY ("lastRevealedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
