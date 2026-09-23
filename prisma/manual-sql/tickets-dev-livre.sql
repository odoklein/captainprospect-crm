-- ============================================================
-- DÉVELOPPEMENT LIVRÉ → TESTING
-- Script réutilisable : session du 2026-09-23, lancé pour TC-0034.
--
-- Déclare le code livré sur les tickets listés ci-dessous : passage
-- en TESTING, signature de la SEULE ligne DEVELOPER, ligne d'historique.
--
-- Les autres rôles (SDR, MANAGER, CLIENT) ne sont jamais signés ici :
-- ce sont eux la recette métier, et seul le rôle concerné peut la
-- signer. Aucun passage à COMPLETED non plus — la règle « tous les
-- rôles impactés testés » est tenue par l'API
-- (assertReleaseChecklistComplete) et la clôture se fait depuis l'UI.
--
-- POUR RÉUTILISER : change la liste des numéros dans `cible` et
-- relance. Le script est idempotent (un ticket déjà en TESTING avec
-- sa ligne DEVELOPER signée ne bouge pas).
-- ============================================================

BEGIN;

WITH numeros AS (
    -- ► Les tickets dont le développement est livré.
    SELECT * FROM (VALUES
        (34)   -- DOUBLON D'APPEL
    ) AS v(num)
),
cible AS (
    SELECT t."id",
           t."number",
           t."status" AS ancien_statut,
           COALESCE(t."assigneeId", t."requesterId") AS acteur
    FROM "Ticket" t
    JOIN numeros n ON n.num = t."number"
    WHERE t."status" NOT IN ('TESTING', 'COMPLETED')
),
maj AS (
    UPDATE "Ticket" t
       SET "status"    = 'TESTING',
           "updatedAt" = CURRENT_TIMESTAMP
      FROM cible c
     WHERE t."id" = c."id"
    RETURNING t."id"
),
signe AS (
    UPDATE "TicketReleaseCheck" rc
       SET "checked"     = true,
           "checkedById" = c."acteur",
           "checkedAt"   = CURRENT_TIMESTAMP,
           "notes"       = COALESCE(rc."notes", 'Développement livré — recette métier à faire.')
      FROM cible c
     WHERE rc."ticketId" = c."id"
       AND rc."role"     = 'DEVELOPER'
       AND rc."checked"  = false
    RETURNING rc."ticketId"
)
INSERT INTO "TicketHistory" ("id", "ticketId", "userId", "field", "fromValue", "toValue", "createdAt")
SELECT gen_random_uuid()::text, c."id", c."acteur", 'status', c."ancien_statut", 'TESTING', CURRENT_TIMESTAMP
FROM cible c;

COMMIT;

-- ============================================================
-- VÉRIFICATION — ce qu'il reste à faire signer
-- ============================================================

SELECT 'TC-' || LPAD(t."number"::text, 4, '0')            AS ref,
       t."status",
       t."title",
       STRING_AGG(rc."role"::text, ', ' ORDER BY rc."role")
           FILTER (WHERE NOT rc."checked")                AS roles_restants
  FROM "Ticket" t
  JOIN "TicketReleaseCheck" rc ON rc."ticketId" = t."id"
 WHERE t."number" IN (34)
 GROUP BY t."number", t."status", t."title";
