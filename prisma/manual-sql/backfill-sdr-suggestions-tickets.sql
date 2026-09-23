-- Rejoue en tickets les 8 suggestions SDR qui n'existaient que comme
-- notifications (déposées avant le correctif de app/api/sdr/suggestions/route.ts).
-- Données issues de export-sdr-suggestions.sql, exécuté le 2026-09-23.
--
-- À lancer sur la base qui contient ces notifications. Transactionnel : soit
-- tout passe, soit rien. Relançable sans risque — chaque ticket est ignoré s'il
-- existe déjà (par id de backfill ou par titre + demandeur).
--
-- Les ids "bkfl_sdr_*" ne sont pas des cuid : c'est volontaire, ils rendent les
-- lignes issues du backfill identifiables et supprimables d'un coup.
--
-- Ce que le SQL ne peut pas rendre : la notification ne gardait que les 200
-- premiers caractères de la description. Les deux suggestions concernées
-- (#002 et #005) portent la mention correspondante dans leur description.

BEGIN;

WITH s(ticket_id, title, requester_id, category, type_label, is_urgent, truncated, description, filed_at, notification_ids) AS (
    VALUES
        (
            'bkfl_sdr_001',
            'Recherche de numéro dans historique',
            'cmtsmegah00cvqf0k1a38382i',                  -- Thibault
            'TECHNICAL_SUPPORT', 'Donnée manquante', true, false,
            $txt$On ne peut pas faire une recherche de numéro qui nous rappel depuis l'historique, donc on ne retrouve pas facilement le contact qui nous a rappelé$txt$,
            TIMESTAMP '2026-09-21 16:17:10.617',
            ARRAY['cmubg7h0900ahli01648ivao7','cmubg7h0900afli014qioi2pk','cmubg7h0900aeli017z2xckpc','cmubg7h0a00ajli01c3x3k13m']
        ),
        (
            'bkfl_sdr_002',
            'Retrouver un numéro qui rappel',
            'cmmm46vf00000k504j7ifziwp',                  -- Julien
            'TECHNICAL_SUPPORT', 'Donnée manquante', true, true,
            $txt$Quand un prospect rappel suite à notre call, je n'arrive pas à retrouver sa fiche pour pouvoir faire le traitement.
Comme on a que le numéro, ce serait top si on copiant le numéro sur la barre de rec$txt$,
            TIMESTAMP '2026-09-21 16:03:38.563',
            ARRAY['cmubfq2f6009uli01gc7ozg9b','cmubfq2fa009yli01nlkiv3n6','cmubfq2f7009wli01v0zz5g6z','cmubfq2fb00a0li01ux7chols']
        ),
        (
            'bkfl_sdr_003',
            'DASHBOARD SALES',
            'cmu5nruef00iurv01r4d4eis2',                  -- ARMEL
            'TECHNICAL_SUPPORT', 'Donnée manquante', false, false,
            $txt$Est-ce possible de mettre les chiffres du mois (RDV PRIS etc) sur le dashboard  puis les chiffres de la journée c'est bien$txt$,
            TIMESTAMP '2026-09-21 12:50:20.112',
            ARRAY['cmub8th0000n3mu01z0vaea0a','cmub8th0000n9mu01mhpf9rl4','cmub8th0000n5mu019xhvn8ln','cmub8th0000n7mu01j5gm6oi1']
        ),
        (
            'bkfl_sdr_004',
            'Zone RDV',
            'cmm93ym6p001ol10450ao19rh',                  -- Morgane
            'IMPROVEMENT', 'Idée d''amélioration', false, false,
            $txt$Avoir un filtre des rendez-vous dans le mois actuel + Avoir le global$txt$,
            TIMESTAMP '2026-09-21 11:38:59.472',
            ARRAY['cmub69q1c00gdmu01ho9hikl0','cmub69q1d00ghmu01jdnsugqf','cmub69q1c00gfmu01k2zlioq1','cmub69q1d00gjmu0168i3luvt']
        ),
        (
            'bkfl_sdr_005',
            'Zone de recherche depuis la partie Appelé',
            'cmm93ym6p001ol10450ao19rh',                  -- Morgane
            'IMPROVEMENT', 'Idée d''amélioration', false, true,
            $txt$La partie historique devrait être fusionné avec la partie "Apeller" afin de retrouver facilement une personne qui nous rappelle depuis la zone "Appeler" plutot que d'aller dans la partie "Historique"$txt$,
            TIMESTAMP '2026-09-21 11:36:24.234',
            ARRAY['cmub66e9600g7mu017nhu6m5a','cmub66e9700g9mu01bwxl6nek','cmub66e9700gbmu010p37n0f1','cmub66e9600g5mu01s6ltmjh1']
        ),
        (
            'bkfl_sdr_006',
            'Linkedin',
            'cmm93ym6p001ol10450ao19rh',                  -- Morgane
            'TECHNICAL_SUPPORT', 'Donnée manquante', false, false,
            $txt$Est-ce possible de faire remonter le linkedin de la personne dans la zone contact ?$txt$,
            TIMESTAMP '2026-09-21 11:34:14.157',
            ARRAY['cmub63lvx00fzmu01jpnbjw14','cmub63lvx00fymu0166a01zlh','cmub63lvx00g1mu01lyjvf8vj','cmub63lvx00g3mu01rrtzed74']
        ),
        (
            'bkfl_sdr_007',
            'RDV ABSENT REMONTE DANS LA PARTIE APPELER',
            'cmm93ym6p001ol10450ao19rh',                  -- Morgane
            'IMPROVEMENT', 'Idée d''amélioration', false, false,
            $txt$Pouvons-nous une partie dans la zone appeler vers le haut, qui liste les absences en cours qu'on doit rappeler ?$txt$,
            TIMESTAMP '2026-09-21 11:33:36.162',
            ARRAY['cmub62skh00frmu01dfgprb9j','cmub62ski00fumu0100g8gjv8','cmub62ski00fvmu0165x5r7s4','cmub62skh00fqmu01ipcvpnbi']
        ),
        (
            'bkfl_sdr_008',
            'Recherhe de numéro pour ceux qui rappel',
            'cmmm46vf00000k504j7ifziwp',                  -- Julien
            'IMPROVEMENT', 'Idée d''amélioration', true, false,
            $txt$Besoin de pouvoir rechercher un numéro d'un appelant$txt$,
            TIMESTAMP '2026-09-18 15:27:20.682',
            ARRAY['cmu743tyi00ebpn01g03x2vxm','cmu743tym00ehpn019m0r3twf','cmu743tyo00ejpn01odolbrf1','cmu743tyk00edpn01zeplr89f','cmu743tyk00efpn01oryplffg']
        )
),
-- Même mise en forme que la route : l'intention d'origine en tête, puis le
-- texte du SDR, puis la provenance. Le marqueur HTML sert à retrouver les
-- tickets reconstruits.
composed AS (
    SELECT
        s.*,
        '**' || s.type_label || '**'
            || CASE WHEN s.is_urgent THEN ' · signalé comme urgent par le demandeur' ELSE '' END
            || E'\n\n' || s.description
            || E'\n\n' || CASE
                WHEN s.truncated
                THEN $note$_(Reconstruit depuis une notification : la description d'origine a été tronquée. Demandez le détail au demandeur si besoin.)_$note$
                ELSE $note$_(Reconstruit depuis une notification.)_$note$
            END
            || E'\n\n<!-- backfilled-from-notification -->' AS full_description
    FROM s
),
ins AS (
    INSERT INTO "Ticket" (
        "id", "title", "description", "category", "scope", "affectedRoles",
        "requesterId", "validation", "status", "priority", "createdAt", "updatedAt"
    )
    SELECT
        c.ticket_id,
        c.title,
        c.full_description,
        c.category::"TicketCategory",
        'INTERNAL'::"TicketScope",
        ARRAY[]::"UserRole"[],          -- les rôles impactés relèvent du triage manager
        c.requester_id,
        'PENDING'::"TicketValidation",  -- atterrit dans la file "À valider"
        'NEW'::"TicketStatus",
        'MEDIUM'::"TaskPriority",       -- la priorité reste la décision du manager
        c.filed_at,                     -- date de dépôt d'origine, pas aujourd'hui
        c.filed_at
    FROM composed c
    WHERE NOT EXISTS (SELECT 1 FROM "Ticket" t WHERE t."id" = c.ticket_id)
      AND NOT EXISTS (
          SELECT 1 FROM "Ticket" t
          WHERE t."title" = c.title AND t."requesterId" = c.requester_id
      )
    RETURNING "id", "number", "title", "requesterId", "createdAt"
),
hist AS (
    INSERT INTO "TicketHistory" ("id", "ticketId", "userId", "field", "toValue", "createdAt")
    SELECT i."id" || '_hist', i."id", i."requesterId", 'created', 'PENDING_VALIDATION', i."createdAt"
    FROM ins i
    RETURNING "ticketId"
),
-- L'alerte existante devient cliquable : même lien profond qu'une demande
-- déposée depuis Support technique.
relinked AS (
    UPDATE "Notification" n
    SET "link" = '/manager/tickets?validation=PENDING&ticket=' || i."id"
    FROM composed c
    JOIN ins i ON i."id" = c.ticket_id
    WHERE n."id" = ANY(c.notification_ids)
    RETURNING n."id"
)
SELECT
    '#TC-' || lpad(i."number"::text, 4, '0')            AS ref,
    i."title",
    i."createdAt"                                       AS filed_at,
    (SELECT count(*) FROM hist WHERE "ticketId" = i."id") AS history_rows,
    (SELECT count(*) FROM relinked)                     AS notifications_relinked_total
FROM ins i
ORDER BY i."number";

COMMIT;
