-- ============================================================
-- AUDIT — la blacklist "de fait", celle qui existe déjà
--
-- LECTURE SEULE. Aucune écriture, rien à annuler.
--
-- Avant la fonction "Ne plus contacter", une entreprise était
-- blacklistée en posant un statut terminal sur une action. Ces
-- requêtes retrouvent ces entreprises, et surtout QUI a pris la
-- décision et QUAND.
--
-- USAGE : lancez UNE requête à la fois (sélectionnez son bloc puis
-- exécutez). L'éditeur SQL Supabase n'affiche que le résultat de la
-- dernière requête si vous lancez tout le fichier d'un coup.
--
-- Les statuts retenus sont volontairement larges : mieux vaut voir
-- trop qu'oublier une entreprise ayant demandé l'arrêt. À ajuster
-- selon votre config — voir lib/constants/actionStatusPresets.ts
-- ============================================================


-- ============================================================
-- 1) LA LISTE — une ligne par entreprise, sa dernière décision
-- ============================================================

WITH terminal AS (
    SELECT
        COALESCE(a."companyId", c."companyId")           AS company_id,
        a."result"::text                                  AS statut,
        a."note"                                          AS motif,
        a."createdAt"                                     AS le,
        u."name"                                          AS par_qui,
        u."role"::text                                    AS role_auteur,
        ROW_NUMBER() OVER (
            PARTITION BY COALESCE(a."companyId", c."companyId")
            ORDER BY a."createdAt" DESC
        ) AS rn
    FROM "Action" a
    LEFT JOIN "Contact" c ON c."id" = a."contactId"
    JOIN "User" u         ON u."id" = a."sdrId"
    WHERE a."result"::text IN (
        'REFUS_CATEGORIQUE',
        'HORS_CIBLE',
        'REFUS',
        'REFUS_ARGU',
        'NOT_INTERESTED',
        'DISQUALIFIED',
        'GERE_PAR_SIEGE'
    )
)
SELECT
    co."name"        AS societe,
    co."website"     AS site,
    co."phone"       AS standard,
    cl."name"        AS client,
    m."name"         AS mission,
    l."name"         AS liste,
    t.statut,
    t.par_qui,
    t.role_auteur,
    t.le::date       AS decide_le,
    t.motif
FROM terminal t
JOIN "Company" co ON co."id" = t.company_id
JOIN "List"    l  ON l."id"  = co."listId"
JOIN "Mission" m  ON m."id"  = l."missionId"
JOIN "Client"  cl ON cl."id" = m."clientId"
WHERE t.rn = 1
ORDER BY t.le DESC;


-- ============================================================
-- 2) QUI BLACKLISTE — répartition par personne
-- ============================================================
-- Montre si la décision est portée par toute l'équipe ou
-- concentrée sur une ou deux personnes.

SELECT
    u."name"                  AS par_qui,
    u."role"::text            AS role,
    a."result"::text          AS statut,
    COUNT(*)                  AS nb_actions,
    MIN(a."createdAt")::date  AS premiere,
    MAX(a."createdAt")::date  AS derniere
FROM "Action" a
JOIN "User" u ON u."id" = a."sdrId"
WHERE a."result"::text IN (
    'REFUS_CATEGORIQUE', 'HORS_CIBLE', 'REFUS', 'REFUS_ARGU',
    'NOT_INTERESTED', 'DISQUALIFIED', 'GERE_PAR_SIEGE'
)
GROUP BY u."name", u."role", a."result"
ORDER BY nb_actions DESC;


-- ============================================================
-- 3) LES REVENANTS — la preuve chiffrée du problème
-- ============================================================
-- Entreprises blacklistées une fois, puis rappelées APRÈS coup.
-- Chaque ligne est un cas où le statut n'a pas tenu : ré-import,
-- autre liste, ou autre contact de la même société.

WITH blacklistee AS (
    SELECT
        COALESCE(a."companyId", c."companyId") AS company_id,
        MIN(a."createdAt")                     AS blacklistee_le
    FROM "Action" a
    LEFT JOIN "Contact" c ON c."id" = a."contactId"
    WHERE a."result"::text IN ('REFUS_CATEGORIQUE', 'HORS_CIBLE', 'GERE_PAR_SIEGE')
    GROUP BY 1
),
rappels AS (
    SELECT
        b.company_id,
        COUNT(*)              AS nb_rappels,
        MAX(a."createdAt")    AS dernier_rappel
    FROM blacklistee b
    JOIN "Action" a
      ON COALESCE(a."companyId", (SELECT c2."companyId" FROM "Contact" c2 WHERE c2."id" = a."contactId"))
         = b.company_id
    WHERE a."createdAt" > b.blacklistee_le
      AND a."channel"::text = 'CALL'
    GROUP BY b.company_id
)
SELECT
    co."name"                 AS societe,
    cl."name"                 AS client,
    b.blacklistee_le::date    AS blacklistee_le,
    r.nb_rappels,
    r.dernier_rappel::date    AS dernier_rappel
FROM rappels r
JOIN blacklistee b ON b.company_id = r.company_id
JOIN "Company" co  ON co."id" = r.company_id
JOIN "List" l      ON l."id"  = co."listId"
JOIN "Mission" m   ON m."id"  = l."missionId"
JOIN "Client" cl   ON cl."id" = m."clientId"
ORDER BY r.nb_rappels DESC;


-- ============================================================
-- 4) DOUBLONS INTER-LISTES — même société, plusieurs fiches
-- ============================================================
-- Une société blacklistée sur une fiche mais toujours appelable
-- sur une autre. Le rapprochement se fait ici sur le nom brut ;
-- la vraie fonction normalise bien plus finement (casse, accents,
-- forme juridique) — voir lib/exclusions/matching.ts

SELECT
    LOWER(TRIM(co."name"))              AS societe_normalisee,
    COUNT(DISTINCT co."id")             AS nb_fiches,
    COUNT(DISTINCT l."missionId")       AS nb_missions,
    STRING_AGG(DISTINCT cl."name", ', ') AS clients
FROM "Company" co
JOIN "List" l    ON l."id"  = co."listId"
JOIN "Mission" m ON m."id"  = l."missionId"
JOIN "Client" cl ON cl."id" = m."clientId"
GROUP BY 1
HAVING COUNT(DISTINCT co."id") > 1
ORDER BY nb_fiches DESC
LIMIT 100;
