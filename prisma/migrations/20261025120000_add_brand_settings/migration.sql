-- White-label: runtime brand of this instance (one row, id = 'default').
-- Additive only: one new table, no change to existing tables. The app tolerates
-- the table being absent (lib/brand/server.ts falls back to brand/brand.config.ts),
-- so this can be applied before or after the deploy that reads it.
-- Defaults equal brand/brand.config.ts, so the seeded row renders today's brand.

CREATE TABLE IF NOT EXISTS "BrandSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL DEFAULT 'Captain Prospect',
    "productName" TEXT NOT NULL DEFAULT 'Captain Prospect CRM',
    "tagline" TEXT NOT NULL DEFAULT 'Plateforme d''exécution commerciale',
    "description" TEXT NOT NULL DEFAULT 'agence de prospection commerciale B2B',
    "companyName" TEXT NOT NULL DEFAULT 'Suzali Conseil',
    "companyShortName" TEXT NOT NULL DEFAULT 'Suzali',
    "appUrl" TEXT NOT NULL DEFAULT 'https://app.captainprospect.fr',
    "website" TEXT NOT NULL DEFAULT 'https://captainprospect.fr',
    "senderName" TEXT NOT NULL DEFAULT 'Captain Prospect',
    "notificationsAddress" TEXT NOT NULL DEFAULT 'notifications@captainprospect.fr',
    "supportAddress" TEXT NOT NULL DEFAULT 'support@suzalink.com',
    "emailDomains" TEXT[] DEFAULT ARRAY['captainprospect.fr', 'suzaliconseil.com']::TEXT[],
    "lang" TEXT NOT NULL DEFAULT 'fr',
    "locale" TEXT NOT NULL DEFAULT 'fr-FR',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "timeZone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "primaryColor" TEXT NOT NULL DEFAULT '#263460',
    "accentColor" TEXT NOT NULL DEFAULT '#C64B8B',
    "neutralTint" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "fontPreset" TEXT NOT NULL DEFAULT 'default',
    "logoFullKey" TEXT,
    "logoFullInverseKey" TEXT,
    "logoMarkKey" TEXT,
    "logoMarkInverseKey" TEXT,
    "faviconKey" TEXT,
    "appleTouchIconKey" TEXT,
    "logoFullWidth" INTEGER NOT NULL DEFAULT 2460,
    "logoFullHeight" INTEGER NOT NULL DEFAULT 758,
    "logoVersion" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,

    CONSTRAINT "BrandSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "BrandSettings" ("id", "updatedAt")
VALUES ('default', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
