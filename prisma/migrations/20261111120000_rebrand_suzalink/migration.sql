-- Rebrand: Captain Prospect → Suzalink.
--
-- 1. Column defaults follow brand/brand.config.ts (a fresh instance seeds Suzalink).
-- 2. The existing 'default' row moves to Suzalink field by field, ONLY where the
--    stored value is still the old Captain Prospect default. A value a manager
--    changed in Paramètres → Identité (or the control plane set) is kept.
--
-- Colours: Suzalink navy #06103A (primary) and pink #FF0A80 (accent), from the logo.
-- Logo files are not touched here (public/brand/* or an upload per slot).
-- Idempotent: re-running it changes nothing.

ALTER TABLE "BrandSettings" ALTER COLUMN "name" SET DEFAULT 'Suzalink';
ALTER TABLE "BrandSettings" ALTER COLUMN "productName" SET DEFAULT 'Suzalink CRM';
ALTER TABLE "BrandSettings" ALTER COLUMN "appUrl" SET DEFAULT 'https://app.suzalink.com';
ALTER TABLE "BrandSettings" ALTER COLUMN "website" SET DEFAULT 'https://suzalink.com';
ALTER TABLE "BrandSettings" ALTER COLUMN "senderName" SET DEFAULT 'Suzalink';
ALTER TABLE "BrandSettings" ALTER COLUMN "notificationsAddress" SET DEFAULT 'notifications@suzalink.com';
ALTER TABLE "BrandSettings" ALTER COLUMN "emailDomains" SET DEFAULT ARRAY['suzalink.com', 'suzaliconseil.com', 'captainprospect.fr']::TEXT[];
ALTER TABLE "BrandSettings" ALTER COLUMN "primaryColor" SET DEFAULT '#06103A';
ALTER TABLE "BrandSettings" ALTER COLUMN "accentColor" SET DEFAULT '#FF0A80';

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
    "primaryColor" = CASE WHEN upper("primaryColor") = '#263460' THEN '#06103A' ELSE "primaryColor" END,
    "accentColor" = CASE WHEN upper("accentColor") = '#C64B8B' THEN '#FF0A80' ELSE "accentColor" END,
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
     OR upper("primaryColor") = '#263460'
     OR upper("accentColor") = '#C64B8B'
  );
