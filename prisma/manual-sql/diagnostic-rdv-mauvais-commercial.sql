-- ============================================================
-- Diagnostic (lecture seule) : RDV posé sur le mauvais commercial.
-- Cas Sonia / Thalys : RDV sur l'agenda de Sarah alors que la base appartient
-- à un autre commercial. À exécuter dans l'éditeur SQL Supabase (prod).
-- ============================================================

-- 1. Les RDV des 7 derniers jours dont le commercial n'est PAS un commercial
--    de la base (principal ou secondaire), ou qui n'ont aucun commercial.
--    "chemin_probable" :
--      - aucun commercial  -> bouton "RDV pris" des rappels / drawer sans calendrier / import
--      - autre commercial  -> "Autres calendriers" choisi à la main (ou mauvais agenda cliqué)
SELECT
    a."createdAt"                              AS pris_le,
    u.name                                     AS sdr,
    cl.name                                    AS client,
    l.name                                     AS base,
    co.name                                    AS societe,
    TRIM(CONCAT(c."firstName", ' ', c."lastName")) AS contact,
    a."callbackDate"                           AS date_rdv,
    TRIM(CONCAT(ia."firstName", ' ', ia."lastName")) AS commercial_du_rdv,
    TRIM(CONCAT(il."firstName", ' ', il."lastName")) AS commercial_de_la_base,
    CASE
        WHEN a."interlocuteurId" IS NULL THEN 'aucun commercial (RDV pris sans calendrier)'
        WHEN l."commercialInterlocuteurId" IS NULL THEN 'base sans commercial'
        ELSE 'autre commercial que celui de la base'
    END                                        AS chemin_probable,
    a.note
FROM "Action" a
JOIN "User" u            ON u.id = a."sdrId"
LEFT JOIN "Contact" c    ON c.id = a."contactId"
JOIN "Company" co        ON co.id = COALESCE(a."companyId", c."companyId")
JOIN "List" l            ON l.id = co."listId"
JOIN "Mission" m         ON m.id = l."missionId"
JOIN "Client" cl         ON cl.id = m."clientId"
LEFT JOIN "ClientInterlocuteur" ia ON ia.id = a."interlocuteurId"
LEFT JOIN "ClientInterlocuteur" il ON il.id = l."commercialInterlocuteurId"
WHERE a.result = 'MEETING_BOOKED'
  AND a."createdAt" >= NOW() - INTERVAL '7 days'
  AND (
        a."interlocuteurId" IS NULL
     OR l."commercialInterlocuteurId" IS NULL
     OR (a."interlocuteurId" <> l."commercialInterlocuteurId"
         AND NOT (a."interlocuteurId" = ANY(COALESCE(l."secondaryCommercialIds", ARRAY[]::text[]))))
  )
ORDER BY a."createdAt" DESC;
-- NB : si la colonne "secondaryCommercialIds" n'existe pas encore, exécuter d'abord
-- prisma/manual-sql/list-secondary-commercials.sql (ou retirer la ligne AND NOT (...)).

-- 2. Zoom sur Sonia (remplacer le nom si besoin).
SELECT a.id, a."createdAt", a."callbackDate", a.note,
       TRIM(CONCAT(ia."firstName", ' ', ia."lastName")) AS commercial_du_rdv,
       l.name AS base
FROM "Action" a
JOIN "User" u ON u.id = a."sdrId"
LEFT JOIN "Contact" c ON c.id = a."contactId"
JOIN "Company" co ON co.id = COALESCE(a."companyId", c."companyId")
JOIN "List" l ON l.id = co."listId"
LEFT JOIN "ClientInterlocuteur" ia ON ia.id = a."interlocuteurId"
WHERE a.result = 'MEETING_BOOKED'
  AND u.name ILIKE '%sonia%'
ORDER BY a."createdAt" DESC
LIMIT 20;
