-- Lecture seule : rien n'est écrit ici.
--
-- Les suggestions SDR déposées avant TC-0033 n'existaient que comme
-- notifications (voir app/api/sdr/suggestions/route.ts). Ce script les extrait
-- de la base où elles se trouvent, dédoublonnées et reparsées, pour décider
-- lesquelles rejouer dans Support technique.
--
-- À lancer sur la base qui contient les données (SQL editor Supabase, psql…),
-- puis colle le résultat tel quel : le INSERT est généré à partir de là.
--
-- Format d'origine du message :
--   "<nom du SDR> (<libellé du type>) :\n<description tronquée à 200 car.>"

WITH src AS (
    -- Les \r éventuels casseraient les ancrages de fin de ligne plus bas.
    SELECT n.id, n.title, replace(n.message, E'\r', '') AS message, n.type, n."createdAt"
    FROM "Notification" n
),
raw AS (
    SELECT
        n.id,
        n.title,
        n.message,
        n.type,
        n."createdAt",
        -- La première ligne porte l'en-tête, le reste est la description.
        split_part(n.message, E'\n', 1)                              AS header,
        substring(n.message FROM position(E'\n' IN n.message) + 1)   AS body
    FROM src n
    WHERE n.title LIKE 'Suggestion SDR : %'
      -- Les suggestions postérieures au correctif portent déjà leur référence
      -- de ticket : elles n'ont rien à rejouer.
      AND n.message !~ '^#TC-[0-9]+ · '
      AND position(E'\n' IN n.message) > 0
),
parsed AS (
    SELECT
        r.id,
        btrim(substring(r.title FROM 'Suggestion SDR : (.*)$'))  AS ticket_title,
        btrim(regexp_replace(r.header, ' \([^()]+\) :$', ''))    AS sdr_name,
        btrim(substring(r.header FROM '\(([^()]+)\) :$'))        AS type_label,
        btrim(r.body)                                            AS description,
        r.type,
        r."createdAt",
        r.title,
        r.message
    FROM raw r
),
-- notifyAllManagers écrit une ligne identique par manager : titre + message
-- est la seule identité stable (createdAt diffère de quelques ms).
grouped AS (
    SELECT
        p.ticket_title,
        p.sdr_name,
        p.type_label,
        p.description,
        min(p."createdAt")                              AS filed_at,
        bool_or(p.type = 'warning')                     AS is_urgent,
        count(*)                                        AS notification_count,
        string_agg(p.id, ',' ORDER BY p."createdAt")    AS notification_ids
    FROM parsed p
    GROUP BY p.ticket_title, p.sdr_name, p.type_label, p.description
)
SELECT
    g.ticket_title,
    g.sdr_name,
    g.type_label,
    CASE g.type_label
        WHEN 'Bug / Problème technique' THEN 'BUG'
        WHEN 'Idée d''amélioration'     THEN 'IMPROVEMENT'
        ELSE 'TECHNICAL_SUPPORT'   -- "Donnée manquante" et "Autre suggestion"
    END                                             AS category,
    g.is_urgent,
    -- 200 caractères est exactement là où notifyAllManagers coupait :
    -- à cette longueur, la fin du texte est perdue.
    (length(g.description) >= 199)                  AS description_truncated,
    g.description,
    g.filed_at,
    g.notification_count,
    g.notification_ids,
    -- Le demandeur n'était stocké que par son nom d'affichage : on tente de le
    -- retrouver parmi les équipes autorisées à déposer une demande.
    u.id                                            AS requester_id,
    u.role                                          AS requester_role,
    -- Déjà rejouée ? (même titre, même demandeur)
    EXISTS (
        SELECT 1 FROM "Ticket" t
        WHERE t.title = g.ticket_title AND t."requesterId" = u.id
    )                                               AS ticket_already_exists
FROM grouped g
LEFT JOIN "User" u
       ON lower(btrim(u.name)) = lower(g.sdr_name)
      AND u.role IN ('SDR', 'BUSINESS_DEVELOPER', 'BOOKER')
ORDER BY g.filed_at DESC;
