-- Rebrand: Captain Prospect (and the interim Captain Soft) → Suzalink.
--
-- 1. Column defaults follow brand/brand.config.ts (a fresh instance seeds Suzalink).
-- 2. On the instance still named Captain Prospect / Captain Soft, the 'default'
--    row moves to Suzalink field by field, ONLY where the stored value is still an
--    old Captain Prospect / Captain Soft value. A value a manager changed in
--    Paramètres → Identité (or the control plane set) is kept.
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
    "name" = CASE WHEN "name" IN ('Captain Prospect', 'Captain Soft') THEN 'Suzalink' ELSE "name" END,
    "productName" = CASE WHEN "productName" IN ('Captain Prospect CRM', 'Captain Soft CRM') THEN 'Suzalink CRM' ELSE "productName" END,
    "appUrl" = CASE WHEN "appUrl" = 'https://app.captainprospect.fr' THEN 'https://app.suzalink.com' ELSE "appUrl" END,
    "website" = CASE WHEN "website" = 'https://captainprospect.fr' THEN 'https://suzalink.com' ELSE "website" END,
    "senderName" = CASE WHEN "senderName" IN ('Captain Prospect', 'Captain Soft') THEN 'Suzalink' ELSE "senderName" END,
    "notificationsAddress" = CASE
        WHEN "notificationsAddress" = 'notifications@captainprospect.fr' THEN 'notifications@suzalink.com'
        ELSE "notificationsAddress"
    END,
    "emailDomains" = CASE
        WHEN "emailDomains" = ARRAY['captainprospect.fr', 'suzaliconseil.com']::TEXT[]
            THEN ARRAY['suzalink.com', 'suzaliconseil.com', 'captainprospect.fr']::TEXT[]
        ELSE "emailDomains"
    END,
    "primaryColor" = CASE WHEN upper("primaryColor") IN ('#263460', '#0E1B3D') THEN '#06103A' ELSE "primaryColor" END,
    "accentColor" = CASE WHEN upper("accentColor") IN ('#C64B8B', '#FF006E') THEN '#FF0A80' ELSE "accentColor" END,
    "updatedAt" = CURRENT_TIMESTAMP,
    "updatedBy" = COALESCE("updatedBy", 'migration:rebrand_suzalink')
WHERE "id" = 'default'
  -- Only this agency's own instance: another white-label instance has its own
  -- name and keeps every value it has, defaults included.
  AND "name" IN ('Captain Prospect', 'Captain Soft');
