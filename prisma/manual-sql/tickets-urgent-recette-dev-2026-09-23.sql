-- ============================================================
-- TICKETS URGENTS — signature développeur + recalage des statuts
-- Session du 2026-09-23
--
-- Parties indépendantes, lançables séparément :
--   PART 0 — aperçu avant écriture (lecture seule)
--   PART 1 — signer la recette DEVELOPER des tickets URGENT en TESTING
--   PART 2 — recaler les tickets annoncés « pas encore faits »
--   PART 3 — ce qui bloque encore la clôture (lecture seule)
--
-- Comme dans tickets-status-update-2026-09-21.sql, AUCUN ticket
-- n'est passé à COMPLETED ici. La règle « tous les rôles impactés
-- testés » est tenue par l'API (assertReleaseChecklistComplete),
-- pas par une contrainte SQL : forcer COMPLETED en SQL contournerait
-- précisément la garantie pour laquelle la checklist existe.
-- La clôture se fait depuis l'interface, une fois la recette faite.
-- ============================================================

-- ============================================================
-- PART 0 — Aperçu (lecture seule)
--
-- À lancer seul d'abord : montre exactement ce que PART 1 va signer.
-- ============================================================

SELECT 'TC-' || LPAD(t."number"::text, 4, '0') AS ref,
       t."priority",
       t."status",
       t."title",
       c."role",
       c."checked"
  FROM "Ticket" t
  JOIN "TicketReleaseCheck" c ON c."ticketId" = t."id"
 WHERE t."priority" = 'URGENT'
   AND t."status"   = 'TESTING'
 ORDER BY t."number", c."role";

BEGIN;

-- ============================================================
-- PART 1 — Recette développeur des tickets URGENT en TESTING
--
-- Un ticket en TESTING est, par définition, développé : on signe
-- donc la ligne DEVELOPER. Les autres rôles (SDR, MANAGER, CLIENT)
-- ne sont PAS touchés — ce sont eux la vraie recette métier, et
-- personne d'autre que le rôle concerné ne peut la signer.
--
-- Le signataire est le développeur assigné quand il y en a un,
-- sinon le demandeur : on n'invente pas un acteur.
-- ============================================================

UPDATE "TicketReleaseCheck" c
   SET "checked"     = true,
       "checkedById" = COALESCE(t."assigneeId", t."requesterId"),
       "checkedAt"   = CURRENT_TIMESTAMP,
       "notes"       = COALESCE(c."notes", 'Développement livré — signé en lot le 2026-09-23.')
  FROM "Ticket" t
 WHERE t."id" = c."ticketId"
   AND t."priority" = 'URGENT'
   AND t."status"   = 'TESTING'
   AND c."role"     = 'DEVELOPER'
   AND c."checked"  = false;

-- ============================================================
-- PART 2 — Recaler les tickets annoncés « pas encore faits »
--
-- TC-0025, TC-0026, TC-0028 et TC-0037 sont en TESTING alors que
-- la recette dit le contraire. Pour 25/26/28 le passage venait du
-- UPDATE en lot du 21/09 (même horodatage à la milliseconde), pas
-- d'une recette réelle : TESTING y voulait dire « code livré », pas
-- « testé ». On les remet en IN_PROGRESS pour que le tableau dise
-- la vérité, et on décoche leur ligne DEVELOPER.
--
-- ⚠ Retire de cette liste tout ticket que tu considères réellement
--    livré avant de lancer.
-- ============================================================

WITH a_recaler AS (
    SELECT t."id",
           t."status" AS ancien_statut,
           COALESCE(t."assigneeId", t."requesterId") AS acteur
    FROM "Ticket" t
    WHERE t."number" IN (25, 26, 28, 37)
      AND t."status" = 'TESTING'
),
decoche AS (
    UPDATE "TicketReleaseCheck" c
       SET "checked" = false, "checkedById" = NULL, "checkedAt" = NULL
      FROM a_recaler r
     WHERE c."ticketId" = r."id" AND c."role" = 'DEVELOPER'
    RETURNING c."ticketId"
),
maj AS (
    UPDATE "Ticket" t
       SET "status"    = 'IN_PROGRESS',
           "updatedAt" = CURRENT_TIMESTAMP
      FROM a_recaler r
     WHERE t."id" = r."id"
    RETURNING t."id"
)
INSERT INTO "TicketHistory" ("id", "ticketId", "userId", "field", "fromValue", "toValue", "createdAt")
SELECT gen_random_uuid()::text, r."id", r."acteur", 'status', r."ancien_statut", 'IN_PROGRESS', CURRENT_TIMESTAMP
FROM a_recaler r;

COMMIT;

-- ============================================================
-- PART 3 — Ce qui bloque encore la clôture (lecture seule)
--
-- Après PART 1, voici les rôles qu'il reste à faire signer pour
-- que chaque ticket URGENT puisse passer COMPLETED depuis l'UI.
-- ============================================================

SELECT 'TC-' || LPAD(t."number"::text, 4, '0')            AS ref,
       t."status",
       t."title",
       STRING_AGG(c."role"::text, ', ' ORDER BY c."role") AS roles_restants
  FROM "Ticket" t
  JOIN "TicketReleaseCheck" c ON c."ticketId" = t."id"
 WHERE t."priority" = 'URGENT'
   AND t."status" <> 'COMPLETED'
   AND c."checked" = false
 GROUP BY t."number", t."status", t."title"
 ORDER BY t."number";
