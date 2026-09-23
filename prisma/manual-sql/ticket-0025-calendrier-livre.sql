-- ============================================================
-- TC-0025 « Calendrier » — développement livré → TESTING
-- Session du 2026-09-23
--
-- À lancer UNE FOIS LE CORRECTIF DÉPLOYÉ, pas avant : ce script
-- déclare le code livré et ouvre la recette. Tant que la version
-- en production ne porte pas le correctif, laisser le ticket en
-- IN_PROGRESS est la vérité.
--
-- Correctif livré (chemin liste → commercial → calendrier) :
--   app/api/sdr/action-queue/route.ts        résout le commercial de la liste
--   app/sdr/action/page.tsx                  le porte sur chaque ligne de file
--   components/drawers/UnifiedActionDrawer.tsx  le transmet au BookingDrawer
--   components/drawers/ContactDrawer.tsx     idem, résolu via la mission
--   app/manager/rdv/_components/modals/AddRdvModal.tsx  présélection côté manager
--
-- La recette SDR reste à faire et n'est pas signée ici : seul le
-- rôle concerné peut signer sa ligne.
-- ============================================================

BEGIN;

WITH cible AS (
    SELECT t."id",
           t."status" AS ancien_statut,
           COALESCE(t."assigneeId", t."requesterId") AS acteur
    FROM "Ticket" t
    WHERE t."number" = 25
      AND t."status" <> 'TESTING'
),
maj AS (
    UPDATE "Ticket" t
       SET "status"    = 'TESTING',
           "updatedAt" = CURRENT_TIMESTAMP
      FROM cible c
     WHERE t."id" = c."id"
    RETURNING t."id"
),
-- Seule la ligne DEVELOPER est signée : le développement est fait.
signe AS (
    UPDATE "TicketReleaseCheck" rc
       SET "checked"     = true,
           "checkedById" = c."acteur",
           "checkedAt"   = CURRENT_TIMESTAMP,
           "notes"       = 'Liste → commercial → calendrier : preferredInterlocuteurId propagé en vue tableau, ContactDrawer et AddRdvModal.'
      FROM cible c
     WHERE rc."ticketId" = c."id"
       AND rc."role"     = 'DEVELOPER'
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
       STRING_AGG(rc."role"::text, ', ' ORDER BY rc."role")
           FILTER (WHERE NOT rc."checked")                AS roles_restants
  FROM "Ticket" t
  JOIN "TicketReleaseCheck" rc ON rc."ticketId" = t."id"
 WHERE t."number" = 25
 GROUP BY t."number", t."status";
