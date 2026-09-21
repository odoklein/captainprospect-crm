-- ============================================================
-- MISE À JOUR DES TICKETS — session du 2026-09-21
--
-- À lancer APRÈS ticket-requests-and-rdv-out-of-scope.sql :
-- la partie 2 écrit dans "TicketReleaseCheck" et suppose que le
-- schéma est à jour.
--
-- Parties indépendantes, lançables séparément :
--   PART 1 — passer en TESTING les tickets développés
--   PART 2 — corriger les affectedRoles des tickets CLIENT_FACING
--   PART 3 — inspection du ticket de test TC-0020 (destructif : à décommenter)
--   PART 4 — état du backlog non assigné (lecture seule)
--
-- Volontairement, AUCUN ticket n'est passé à COMPLETED ici : la
-- règle "tous les rôles impactés testés" est appliquée par l'API
-- (assertReleaseChecklistComplete), pas par une contrainte SQL.
-- Passer COMPLETED en SQL contournerait exactement la garantie
-- pour laquelle la checklist existe. La clôture se fait depuis
-- l'interface, une fois la recette faite.
-- ============================================================

BEGIN;

-- ============================================================
-- PART 1 — Tickets développés → TESTING
--
-- L'auteur du changement est le développeur assigné quand il y en
-- a un, sinon le demandeur : on n'invente pas un acteur.
-- ============================================================

WITH cible AS (
    SELECT t."id",
           t."number",
           t."status" AS ancien_statut,
           COALESCE(t."assigneeId", t."requesterId") AS acteur
    FROM "Ticket" t
    WHERE t."number" IN (
        25,  -- Calendrier — filtre par commercial dans AddRdvModal
        26,  -- MAIL CLIENT — clientEmailGate (déjà livré le 21/09 à 10h54)
        27,  -- RDV ABSENT — disposition "hors scope"
        28,  -- Onglets statuts RDV — Valides / Passés, suppression de Confirmés
        29,  -- Fusion "Accès" + "Interlocuteurs"
        32   -- Tickets équipe sales — file "À valider"
    )
      AND t."status" <> 'TESTING'
),
maj AS (
    UPDATE "Ticket" t
       SET "status" = 'TESTING',
           "updatedAt" = CURRENT_TIMESTAMP
      FROM cible c
     WHERE t."id" = c."id"
    RETURNING t."id"
)
INSERT INTO "TicketHistory" ("id", "ticketId", "userId", "field", "fromValue", "toValue", "createdAt")
SELECT gen_random_uuid()::text, c."id", c."acteur", 'status', c."ancien_statut", 'TESTING', CURRENT_TIMESTAMP
FROM cible c;

-- ============================================================
-- PART 2 — affectedRoles des tickets CLIENT_FACING
--
-- Le code refuse désormais un ticket CLIENT_FACING qui n'a pas
-- CLIENT dans ses rôles impactés : sans ce correctif, ouvrir un de
-- ces tickets dans "Modifier" et l'enregistrer échoue à la
-- validation. La cause était le pré-remplissage à ["DEVELOPER"]
-- dans le formulaire, corrigé côté code.
-- ============================================================

UPDATE "Ticket"
   SET "affectedRoles" = "affectedRoles" || ARRAY['CLIENT']::"UserRole"[],
       "updatedAt" = CURRENT_TIMESTAMP
 WHERE "scope" = 'CLIENT_FACING'
   AND NOT ('CLIENT' = ANY("affectedRoles"));

-- La checklist de release doit refléter les rôles réellement impactés :
-- une ligne par rôle, sans toucher aux signatures déjà posées.
INSERT INTO "TicketReleaseCheck" ("id", "ticketId", "role", "checked")
SELECT gen_random_uuid()::text, t."id", r.role, false
FROM "Ticket" t
CROSS JOIN LATERAL unnest(t."affectedRoles") AS r(role)
WHERE NOT EXISTS (
    SELECT 1 FROM "TicketReleaseCheck" c
     WHERE c."ticketId" = t."id" AND c."role" = r.role
)
ON CONFLICT ("ticketId", "role") DO NOTHING;

COMMIT;

-- ============================================================
-- PART 3 — TC-0020 « sssssssss »
--
-- Ticket de test, COMPLETED et CLIENT_FACING, rattaché au client
-- "Jeff Essaie". Regardez d'abord ce qu'il porte : la suppression
-- emporte ses commentaires, son historique et ses checks (cascade)
-- et n'est pas réversible. Décommentez le DELETE une fois vérifié.
-- ============================================================

SELECT 'TC-' || LPAD(t."number"::text, 4, '0') AS ref,
       t."title",
       t."scope",
       t."status",
       c."name" AS client,
       (SELECT COUNT(*) FROM "TicketComment" tc WHERE tc."ticketId" = t."id") AS commentaires,
       (SELECT COUNT(*) FROM "TicketHistory" th WHERE th."ticketId" = t."id") AS historique
  FROM "Ticket" t
  LEFT JOIN "Client" c ON c."id" = t."clientId"
 WHERE t."number" = 20;

-- DELETE FROM "Ticket" WHERE "number" = 20;

-- ============================================================
-- PART 4 — Backlog non assigné (lecture seule)
--
-- Les 10 tickets TODO n'ont aucun assigné. L'affectation est une
-- décision d'équipe, donc rien n'est écrit ici : voici la liste à
-- trancher, la plus prioritaire et la plus ancienne en premier.
-- ============================================================

SELECT 'TC-' || LPAD(t."number"::text, 4, '0') AS ref,
       t."priority",
       t."status",
       t."category",
       t."title",
       t."createdAt"::date AS cree_le
  FROM "Ticket" t
 WHERE t."assigneeId" IS NULL
   AND t."status" NOT IN ('COMPLETED')
   AND t."validation" <> 'PENDING'   -- les demandes à valider ont leur propre file
 ORDER BY CASE t."priority"
              WHEN 'URGENT' THEN 1
              WHEN 'HIGH'   THEN 2
              WHEN 'MEDIUM' THEN 3
              ELSE 4
          END,
          t."createdAt";

-- ============================================================
-- VÉRIFICATION
-- ============================================================
-- SELECT 'TC-' || LPAD("number"::text, 4, '0') AS ref, "status", "scope", "affectedRoles"
--   FROM "Ticket" WHERE "number" IN (20, 25, 26, 27, 28, 29, 32) ORDER BY "number";
