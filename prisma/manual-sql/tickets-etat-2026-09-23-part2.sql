-- ============================================================
-- SUITE — session du 2026-09-23
--
-- LECTURE SEULE : rien n'est écrit.
--
-- PART 3 a déjà été renvoyée (historique des statuts). Il manque
-- les deux premières : sans le titre et la description, impossible
-- de savoir ce que sont TC-0035, TC-0036, TC-0037 et TC-0038.
--
-- PART A — fiche de chaque ticket (titre + description complète)
-- PART B — checklist de release, rôle par rôle
-- PART C — diagnostic « calendrier par commercial » (voir plus bas)
-- ============================================================

-- ============================================================
-- PART A — Fiche de chaque ticket
-- ============================================================

SELECT 'TC-' || LPAD(t."number"::text, 4, '0') AS ref,
       t."status",
       t."validation",
       t."priority",
       t."scope",
       t."affectedRoles",
       t."title",
       t."description",
       asg."name" AS assigne
  FROM "Ticket" t
  LEFT JOIN "User" asg ON asg."id" = t."assigneeId"
 WHERE t."number" IN (25, 26, 28, 32, 35, 36, 37, 38)
 ORDER BY t."number";

-- ============================================================
-- PART B — Checklist de release
--
-- Aucun ticket ne peut passer COMPLETED tant qu'une ligne reste
-- décochée (assertReleaseChecklistComplete, côté API). C'est ce
-- qui explique que TC-0032 et TC-0035, annoncés faits, ne soient
-- pas clôturés en base.
-- ============================================================

SELECT 'TC-' || LPAD(t."number"::text, 4, '0') AS ref,
       t."status",
       c."role",
       c."checked",
       c."checkedAt"::date AS coche_le
  FROM "Ticket" t
  LEFT JOIN "TicketReleaseCheck" c ON c."ticketId" = t."id"
 WHERE t."number" IN (25, 26, 28, 32, 35, 36, 37, 38)
 ORDER BY t."number", c."role";

-- ============================================================
-- PART C — Diagnostic « calendrier par commercial »
--
-- Le code SDR fait DÉJÀ ce que tu décris :
-- app/api/actions/next/route.ts résout la liste de l'entreprise
-- puis son commercialInterlocuteurId, et components/sdr/BookingDrawer.tsx
-- n'affiche que le calendrier de ce commercial, les autres étant
-- repliés derrière « Autres calendriers (N) ».
--
-- MAIS ce repli ne s'applique que si un commercial est réellement
-- rattaché. Si List."commercialInterlocuteurId" est NULL *et* que
-- la mission n'a pas de defaultInterlocuteurId, le code retombe sur
-- « tous les calendriers à plat » — exactement le symptôme décrit.
--
-- Cette requête dit si le problème est du code ou de la donnée :
-- toute ligne avec rattachement = 'AUCUN' et nb_calendriers > 1
-- est une liste où le SDR voit tous les calendriers d'un coup.
-- ============================================================

SELECT cli."name"    AS client,
       m."name"      AS mission,
       l."name"      AS liste,
       CASE
           WHEN l."commercialInterlocuteurId" IS NOT NULL THEN 'LISTE'
           WHEN m."defaultInterlocuteurId"    IS NOT NULL THEN 'MISSION (defaut)'
           ELSE 'AUCUN'
       END AS rattachement,
       COALESCE(i."firstName" || ' ' || i."lastName",
                d."firstName" || ' ' || d."lastName") AS commercial,
       (SELECT COUNT(*)
          FROM "ClientInterlocuteur" ci
         WHERE ci."clientId" = m."clientId"
           AND ci."isActive"
           AND jsonb_array_length(ci."bookingLinks"::jsonb) > 0
       ) AS nb_calendriers,
       (SELECT COUNT(*) FROM "Company" co
         WHERE co."listId" = l."id" AND co."excludedAt" IS NULL
       ) AS nb_entreprises
  FROM "List" l
  JOIN "Mission" m                    ON m."id"   = l."missionId"
  JOIN "Client"  cli                  ON cli."id" = m."clientId"
  LEFT JOIN "ClientInterlocuteur" i   ON i."id"   = l."commercialInterlocuteurId"
  LEFT JOIN "ClientInterlocuteur" d   ON d."id"   = m."defaultInterlocuteurId"
 WHERE l."isActive"
   AND NOT l."isArchived"
 ORDER BY (l."commercialInterlocuteurId" IS NOT NULL),
          (m."defaultInterlocuteurId" IS NOT NULL),
          cli."name", m."name", l."name";
