-- ==============================================================================
-- CAPTAIN PROSPECT - MANUAL SQL MIGRATION FOR BROADCASTS & NOTIFICATIONS HUB
-- ==============================================================================

-- 1. Create the unified BroadcastDefinition table
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

-- 2. Indexes for quick lookups
CREATE INDEX IF NOT EXISTS "idx_broadcast_def_key" ON "BroadcastDefinition"("key");
CREATE INDEX IF NOT EXISTS "idx_broadcast_def_category" ON "BroadcastDefinition"("category");
CREATE INDEX IF NOT EXISTS "idx_broadcast_def_active" ON "BroadcastDefinition"("isActive");

-- 3. Seed Default Templates (Atomic VALUES with ON CONFLICT)
INSERT INTO "BroadcastDefinition" (
    "key",
    "name",
    "description",
    "category",
    "triggerType",
    "triggerEventLabel",
    "channels",
    "isSystemLocked",
    "isActive",
    "subject",
    "bodyHtml"
)
VALUES (
    'rdv_notification',
    'Notification Nouveau RDV Client',
    'Email automatique envoyé au client et aux commerciaux dès qu''un rendez-vous est qualifié et réservé.',
    'RDV',
    'AUTOMATED_EVENT',
    'Dès qu''un RDV est pris',
    '["EMAIL", "IN_APP_BANNER"]'::jsonb,
    TRUE,
    TRUE,
    '✅ Nouveau RDV confirmé - {{contactFirstName}} {{contactLastName}} ({{companyName}})',
    '<!-- Notification RDV --><h1>Nouveau RDV confirmé</h1><p>Un nouveau rendez-vous a été qualifié.</p>'
)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "BroadcastDefinition" (
    "key",
    "name",
    "description",
    "category",
    "triggerType",
    "triggerEventLabel",
    "channels",
    "isSystemLocked",
    "isActive",
    "subject",
    "bodyHtml"
)
VALUES (
    'password_recovery',
    'Récupération Mot de passe (Lien)',
    'Email automatique envoyé lorsqu''un utilisateur clique sur Mot de passe oublié.',
    'SECURITY',
    'AUTOMATED_EVENT',
    'Demande de mot de passe oublié',
    '["EMAIL"]'::jsonb,
    TRUE,
    TRUE,
    'Réinitialisation de votre mot de passe - Captain Prospect',
    '<!-- Récupération Mot de passe --><h1>Réinitialisation de mot de passe</h1><p>Cliquez sur le lien pour réinitialiser votre mot de passe.</p>'
)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "BroadcastDefinition" (
    "key",
    "name",
    "description",
    "category",
    "triggerType",
    "triggerEventLabel",
    "channels",
    "isSystemLocked",
    "isActive",
    "subject",
    "bodyHtml"
)
VALUES (
    'password_otp',
    'Code de sécurité OTP',
    'Email automatique contenant le code à 6 chiffres pour valider une connexion.',
    'SECURITY',
    'AUTOMATED_EVENT',
    'Validation code à 2 facteurs / OTP',
    '["EMAIL"]'::jsonb,
    TRUE,
    TRUE,
    'Votre code de validation de sécurité - Captain Prospect',
    '<!-- Code OTP --><h1>Code de validation</h1><p>Voici votre code de sécurité temporaire.</p>'
)
ON CONFLICT ("key") DO NOTHING;
