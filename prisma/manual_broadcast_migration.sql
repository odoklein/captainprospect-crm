-- ==============================================================================
-- CAPTAIN PROSPECT - MANUAL SQL MIGRATION FOR BROADCASTS & NOTIFICATIONS HUB
-- NOTE: THIS SCRIPT IS PROVIDED FOR MANUAL EXECUTION ONLY.
-- DO NOT RUN AUTOMATICALLY. RUN ONLY WHEN READY ON YOUR DATABASE CLIENT (pgAdmin, psql, Supabase, etc.)
-- ==============================================================================

-- 1. Create enum types if not exists (or use VARCHAR checks for maximum compatibility)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'broadcast_trigger_type') THEN
        CREATE TYPE broadcast_trigger_type AS ENUM ('AUTOMATED_EVENT', 'MANUAL_CAMPAIGN', 'SCHEDULED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'broadcast_category_type') THEN
        CREATE TYPE broadcast_category_type AS ENUM ('RDV', 'SECURITY', 'ANNOUNCEMENT', 'ACCOUNT', 'CUSTOM');
    END IF;
END$$;

-- 2. Create the unified BroadcastDefinition table
CREATE TABLE IF NOT EXISTS "BroadcastDefinition" (
    "id" VARCHAR(64) PRIMARY KEY DEFAULT ('bdef_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16)),
    "key" VARCHAR(100) NOT NULL UNIQUE,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(50) NOT NULL DEFAULT 'CUSTOM',
    "triggerType" VARCHAR(50) NOT NULL DEFAULT 'AUTOMATED_EVENT',
    "triggerEventLabel" VARCHAR(150),
    "channels" JSONB NOT NULL DEFAULT '["EMAIL"]'::jsonb,
    "isSystemLocked" BOOLEAN NOT NULL DEFAULT FALSE,
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "subject" VARCHAR(500) NOT NULL,
    "blocksJson" JSONB,
    "bodyHtml" TEXT NOT NULL,
    "accentColor" VARCHAR(20) DEFAULT '#4f46e5',
    "createdById" VARCHAR(64),
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for quick lookups
CREATE INDEX IF NOT EXISTS "idx_broadcast_def_key" ON "BroadcastDefinition"("key");
CREATE INDEX IF NOT EXISTS "idx_broadcast_def_category" ON "BroadcastDefinition"("category");
CREATE INDEX IF NOT EXISTS "idx_broadcast_def_active" ON "BroadcastDefinition"("isActive");

-- 3. Optional: Seed existing system templates into BroadcastDefinition if table is empty
INSERT INTO "BroadcastDefinition" ("key", "name", "description", "category", "triggerType", "triggerEventLabel", "channels", "isSystemLocked", "isActive", "subject", "bodyHtml")
SELECT 
    'rdv_notification',
    'Notification Nouveau RDV Client',
    'Email automatique envoyé au client et aux commerciaux dès qu''un rendez-vous est qualifié et réservé.',
    'RDV',
    'AUTOMATED_EVENT',
    'Dès qu''un RDV est pris',
    '["EMAIL", "IN_APP_BANNER"]'::jsonb,
    TRUE,
    TRUE,
    COALESCE(s."subject", '✅ Nouveau RDV confirmé - {{contactFirstName}} {{contactLastName}} ({{companyName}})'),
    COALESCE(s."bodyHtml", '<p>Nouveau RDV</p>')
FROM (SELECT 1) _
LEFT JOIN "SystemEmailTemplate" s ON s."key" = 'rdv_notification'
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "BroadcastDefinition" ("key", "name", "description", "category", "triggerType", "triggerEventLabel", "channels", "isSystemLocked", "isActive", "subject", "bodyHtml")
SELECT 
    'password_recovery',
    'Récupération Mot de passe (Lien)',
    'Email automatique envoyé lorsqu''un utilisateur clique sur Mot de passe oublié.',
    'SECURITY',
    'AUTOMATED_EVENT',
    'Demande de mot de passe oublié',
    '["EMAIL"]'::jsonb,
    TRUE,
    TRUE,
    COALESCE(s."subject", 'Réinitialisation de votre mot de passe - Captain Prospect'),
    COALESCE(s."bodyHtml", '<p>Réinitialisation mot de passe</p>')
FROM (SELECT 1) _
LEFT JOIN "SystemEmailTemplate" s ON s."key" = 'password_recovery'
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "BroadcastDefinition" ("key", "name", "description", "category", "triggerType", "triggerEventLabel", "channels", "isSystemLocked", "isActive", "subject", "bodyHtml")
SELECT 
    'password_otp',
    'Code de sécurité OTP',
    'Email automatique contenant le code à 6 chiffres pour valider une connexion.',
    'SECURITY',
    'AUTOMATED_EVENT',
    'Validation code à 2 facteurs / OTP',
    '["EMAIL"]'::jsonb,
    TRUE,
    TRUE,
    COALESCE(s."subject", 'Votre code de validation de sécurité - Captain Prospect'),
    COALESCE(s."bodyHtml", '<p>Code OTP</p>')
FROM (SELECT 1) _
LEFT JOIN "SystemEmailTemplate" s ON s."key" = 'password_otp'
ON CONFLICT ("key") DO NOTHING;

-- 4. Verify table creation
-- SELECT "key", "name", "category", "isActive", "updatedAt" FROM "BroadcastDefinition";
