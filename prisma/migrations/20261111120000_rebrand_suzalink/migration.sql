-- Rebrand: Captain Prospect → Suzalink.
--
-- 1. Column defaults follow brand/brand.config.ts (a fresh instance seeds Suzalink).
-- 2. The existing 'default' row moves to Suzalink field by field, ONLY where the
--    stored value is still the old Captain Prospect default. A value a manager
--    changed in Paramètres → Identité (or the control plane set) is kept.
--
-- Colours and logos are not touched here: they change with the new logo files.
-- Idempotent: re-running it changes nothing.

ALTER TABLE "BrandSettings" ALTER COLUMN "name" SET DEFAULT 'Suzalink';
ALTER TABLE "BrandSettings" ALTER COLUMN "productName" SET DEFAULT 'Suzalink CRM';
ALTER TABLE "BrandSettings" ALTER COLUMN "appUrl" SET DEFAULT 'https://app.suzalink.com';
ALTER TABLE "BrandSettings" ALTER COLUMN "website" SET DEFAULT 'https://suzalink.com';
ALTER TABLE "BrandSettings" ALTER COLUMN "senderName" SET DEFAULT 'Suzalink';
ALTER TABLE "BrandSettings" ALTER COLUMN "notificationsAddress" SET DEFAULT 'notifications@suzalink.com';
ALTER TABLE "BrandSettings" ALTER COLUMN "emailDomains" SET DEFAULT ARRAY['suzalink.com', 'suzaliconseil.com', 'captainprospect.fr']::TEXT[];

UPDATE "BrandSettings"
SET
    "name" = CASE WHEN "name" = 'Captain Prospect' THEN 'Suzalink' ELSE "name" END,
    "productName" = CASE WHEN "productName" = 'Captain Prospect CRM' THEN 'Suzalink CRM' ELSE "productName" END,
    "appUrl" = CASE WHEN "appUrl" = 'https://app.captainprospect.fr' THEN 'https://app.suzalink.com' ELSE "appUrl" END,
    "website" = CASE WHEN "website" = 'https://captainprospect.fr' THEN 'https://suzalink.com' ELSE "website" END,
    "senderName" = CASE WHEN "senderName" = 'Captain Prospect' THEN 'Suzalink' ELSE "senderName" END,
    "notificationsAddress" = CASE
        WHEN "notificationsAddress" = 'notifications@captainprospect.fr' THEN 'notifications@suzalink.com'
        ELSE "notificationsAddress"
    END,
    "emailDomains" = CASE
        WHEN "emailDomains" = ARRAY['captainprospect.fr', 'suzaliconseil.com']::TEXT[]
            THEN ARRAY['suzalink.com', 'suzaliconseil.com', 'captainprospect.fr']::TEXT[]
        ELSE "emailDomains"
    END,
    "updatedAt" = CURRENT_TIMESTAMP,
    "updatedBy" = COALESCE("updatedBy", 'migration:rebrand_suzalink')
WHERE "id" = 'default'
  AND (
        "name" = 'Captain Prospect'
     OR "productName" = 'Captain Prospect CRM'
     OR "appUrl" = 'https://app.captainprospect.fr'
     OR "website" = 'https://captainprospect.fr'
     OR "senderName" = 'Captain Prospect'
     OR "notificationsAddress" = 'notifications@captainprospect.fr'
     OR "emailDomains" = ARRAY['captainprospect.fr', 'suzaliconseil.com']::TEXT[]
  );
