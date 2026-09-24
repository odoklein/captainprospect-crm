-- ============================================================
-- Chat support : une nouvelle demande s'affichait avec l'historique d'une
-- ancienne conversation (fallback serveur sur "la dernière conversation").
-- À exécuter dans l'éditeur SQL Supabase (prod).
--
-- Partie 1 : schéma (obligatoire avant le déploiement du correctif).
-- Partie 2 : diagnostic en lecture seule, pour repérer les fils mélangés.
-- ============================================================

-- ---------- Partie 1 : pièces jointes "en attente" ----------
BEGIN;

ALTER TABLE "SupportAttachment" ALTER COLUMN "conversationId" DROP NOT NULL;

DO $$ BEGIN
    IF to_regclass('public."_prisma_migrations"') IS NULL THEN
        RAISE NOTICE 'Table _prisma_migrations absente — bookkeeping ignoré (db push).';
        RETURN;
    END IF;

    INSERT INTO "_prisma_migrations"
        ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
    VALUES
        (
            '8e4b2f17-6c3a-4d59-b0e2-7a1c9d5f3e48',
            'e6cdf73bfca663837e08bad49c2573a31341d9fafda02c391045ba3c92b3f6b0',
            NOW(),
            '20260924110000_support_attachment_pending',
            NULL,
            NULL,
            NOW(),
            1
        )
    ON CONFLICT ("id") DO NOTHING;
END $$;

COMMIT;

-- ---------- Partie 2 : diagnostic (lecture seule) ----------

-- 2a. Images rattachées à un message d'une AUTRE conversation que la leur
--     (preuve du mélange). Corrigeable avec la requête 2c.
SELECT a.id AS attachment_id, a."conversationId" AS attachment_conv,
       m."conversationId" AS message_conv, a."createdAt"
FROM "SupportAttachment" a
JOIN "SupportMessage" m ON m.id = a."messageId"
WHERE a."conversationId" IS DISTINCT FROM m."conversationId";

-- 2b. Conversations où plusieurs utilisateurs clients ont écrit, ou qui ont été
--     résolues puis ont reçu de nouveaux messages client (fils probablement mélangés).
SELECT c.id, cl.name AS client, c.subject, c.status, c."createdAt", c."resolvedAt",
       COUNT(DISTINCT m."authorId") FILTER (WHERE m.role = 'CLIENT') AS auteurs_clients,
       COUNT(*) FILTER (WHERE m.role = 'CLIENT') AS messages_clients,
       MIN(m."createdAt") AS premier_msg, MAX(m."createdAt") AS dernier_msg
FROM "SupportConversation" c
JOIN "Client" cl ON cl.id = c."clientId"
JOIN "SupportMessage" m ON m."conversationId" = c.id
GROUP BY c.id, cl.name
HAVING COUNT(DISTINCT m."authorId") FILTER (WHERE m.role = 'CLIENT') > 1
ORDER BY dernier_msg DESC
LIMIT 50;

-- 2c. (Correctif, à lancer seulement après vérification de 2a)
-- UPDATE "SupportAttachment" a
-- SET "conversationId" = m."conversationId"
-- FROM "SupportMessage" m
-- WHERE m.id = a."messageId" AND a."conversationId" IS DISTINCT FROM m."conversationId";
