-- ============================================================
-- ÉTAT DES TICKETS ÉVOQUÉS — session du 2026-09-23
--
-- LECTURE SEULE : rien n'est écrit, aucune transaction.
-- À lancer sur la base qui porte les données (SQL editor Supabase,
-- psql…), puis colle le résultat tel quel dans la conversation.
--
-- Tickets concernés : TC-0025, TC-0026, TC-0028, TC-0032,
--                     TC-0035, TC-0036, TC-0037, TC-0038
--
-- PART 1 — fiche complète de chaque ticket (titre + description)
-- PART 2 — checklist de release, rôle par rôle
-- PART 3 — dernier mouvement de statut de chacun
-- ============================================================

-- ============================================================
-- PART 1 — Fiche de chaque ticket
--
-- La description est renvoyée entière : c'est elle qui dit ce que
-- le ticket demande vraiment, le titre seul ne suffit pas.
-- ============================================================

SELECT 'TC-' || LPAD(t."number"::text, 4, '0') AS ref,
       t."status",
       t."validation",
       t."priority",
       t."category",
       t."scope",
       t."affectedRoles",
       t."title",
       t."description",
       req."name"  AS demandeur,
       asg."name"  AS assigne,
       cli."name"  AS client,
       t."createdAt"::date   AS cree_le,
       t."updatedAt"::date   AS maj_le,
       t."completedAt"::date AS cloture_le
  FROM "Ticket" t
  LEFT JOIN "User"   req ON req."id" = t."requesterId"
  LEFT JOIN "User"   asg ON asg."id" = t."assigneeId"
  LEFT JOIN "Client" cli ON cli."id" = t."clientId"
 WHERE t."number" IN (25, 26, 28, 32, 35, 36, 37, 38)
 ORDER BY t."number";

-- ============================================================
-- PART 2 — Checklist de release
--
-- Un ticket ne peut pas passer COMPLETED tant qu'une ligne reste
-- décochée (assertReleaseChecklistComplete, côté API). C'est donc
-- ici qu'on voit ce qui bloque la clôture de ceux annoncés « faits ».
-- ============================================================

SELECT 'TC-' || LPAD(t."number"::text, 4, '0') AS ref,
       t."status",
       c."role",
       c."checked",
       chk."name"        AS coche_par,
       c."checkedAt"::date AS coche_le,
       c."notes"
  FROM "Ticket" t
  LEFT JOIN "TicketReleaseCheck" c   ON c."ticketId" = t."id"
  LEFT JOIN "User"               chk ON chk."id" = c."checkedById"
 WHERE t."number" IN (25, 26, 28, 32, 35, 36, 37, 38)
 ORDER BY t."number", c."role";

-- ============================================================
-- PART 3 — Dernier mouvement de statut
--
-- Pour recouper ce qui a été annoncé fait avec ce que la base a
-- réellement enregistré, et par qui.
-- ============================================================

SELECT 'TC-' || LPAD(t."number"::text, 4, '0') AS ref,
       h."fromValue",
       h."toValue",
       u."name" AS par,
       h."createdAt"
  FROM "Ticket" t
  JOIN "TicketHistory" h ON h."ticketId" = t."id" AND h."field" = 'status'
  LEFT JOIN "User" u     ON u."id" = h."userId"
 WHERE t."number" IN (25, 26, 28, 32, 35, 36, 37, 38)
 ORDER BY t."number", h."createdAt" DESC;
