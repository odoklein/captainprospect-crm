-- ============================================================
-- NOUVEAU TICKET — calendrier par commercial absent en vue tableau
-- Session du 2026-09-23
--
-- Reproduit par Odo sur app.captainprospect.fr/sdr/action :
-- liste « Talis - FERRE Margot » (rattachée à Margot Ferre — CRE),
-- ouverture du modal RDV sur Gosset Pauline / STEF TRANSPORT →
-- les 13 calendriers s'affichent à plat et c'est Charline Guillot
-- qui est présélectionnée.
--
-- Le script est idempotent : relancé, il n'insère pas de doublon.
-- Il crée le ticket en NEW / NOT_REQUIRED (ticket manager, pas une
-- demande à valider) et sa ligne d'historique 'created'.
-- ============================================================

BEGIN;

WITH demandeur AS (
    SELECT "id" FROM "User" WHERE "email" = 'odo@suzaliconseil.com' LIMIT 1
),
compose AS (
    SELECT
        'tc_cal_commercial_tableau'::text AS ticket_id,
        (SELECT "id" FROM demandeur)      AS requester_id,
        'RDV — le calendrier du commercial de la liste est ignoré hors mode carte'::text AS title,
        $desc$Quand une liste est rattachée à un commercial (List.commercialInterlocuteurId), le modal RDV doit proposer **uniquement** le calendrier de ce commercial, les autres restant repliés derrière « Autres calendriers (N) ».

C'est le cas en **mode carte**, mais pas ailleurs.

**Reproduction**
1. Manager → client TALIS NETWORK → BDD : la liste « Talis - FERRE Margot » est bien assignée à « Margot Ferre — CRE ».
2. Se connecter en SDR, /sdr/action, **vue Tableau**, filtre LISTE = « Talis - FERRE Margot ».
3. Ouvrir le modal RDV sur un contact de la liste (ex. Gosset Pauline — STEF TRANSPORT SAINT SEVER).

**Attendu** : bandeau « Commercial de cette base » avec le seul calendrier de Margot Ferre.
**Constaté** : bandeau « Choisir un commercial / calendrier » avec les 13 commerciaux à plat, Charline Guillot présélectionnée. C'est beaucoup trop pour un modal de réservation, et le RDV part sur le mauvais calendrier si le SDR ne corrige pas.

**Cause (analyse code)**
La donnée est correcte en base : le problème est que `preferredInterlocuteurId` n'est jamais calculé ni transmis sur ce chemin.

1. `app/api/sdr/action-queue/route.ts` — alimente la vue tableau. Il fait bien `INNER JOIN "List" l` (l.141 et l.197) mais ne sélectionne jamais `l."commercialInterlocuteurId"`. Les lignes du tableau ne portent donc aucun commercial.
2. `components/drawers/UnifiedActionDrawer.tsx:3556` — rend `<BookingDrawer>` avec `interlocuteurs={effectiveInterlocuteurs}` (tous les interlocuteurs du client, via /api/missions/[id]/client-booking) mais **sans** `preferredInterlocuteurId`.
3. `components/sdr/BookingDrawer.tsx:482` — `preferredInterlocuteurId` étant `undefined`, `hasPreferred` est faux : on tombe dans la branche « Choisir un commercial / calendrier » (l.1084) qui affiche `bookingOptions` à plat, et `selectedOptionId` retombe sur `bookingOptions[0]` (l.506) — d'où Charline Guillot.

**Pourquoi le mode carte marche**
`app/api/actions/next/route.ts:417-434` résout entreprise → liste → `commercialInterlocuteurId` (avec repli sur `Mission.defaultInterlocuteurId`), et `app/sdr/action/page.tsx:3525` transmet la prop. Ce `<BookingDrawer>` est situé **après** le `return` anticipé de la vue tableau (`app/sdr/action/page.tsx:1881`), donc inatteignable en mode tableau.

**Même défaut ailleurs**
- `components/drawers/ContactDrawer.tsx:1418` — ne transmet pas non plus la prop.
- `app/manager/rdv/_components/modals/AddRdvModal.tsx:597` — côté manager, la résolution ne passe pas du tout par la liste du contact : le modal charge tous les interlocuteurs du client de la mission et affiche un menu déroulant dès qu'il y en a plus d'un. À traiter dans le même lot.

**Correctif attendu**
Faire remonter `commercialInterlocuteurId` de la liste dans `/api/sdr/action-queue`, le porter sur chaque ligne de file, puis le transmettre en `preferredInterlocuteurId` depuis `UnifiedActionDrawer` et `ContactDrawer`. La logique d'affichage de `BookingDrawer` est déjà bonne et n'a pas à bouger.$desc$::text AS description
)
, ins AS (
    INSERT INTO "Ticket" (
        "id", "title", "description", "category", "scope", "affectedRoles",
        "requesterId", "validation", "status", "priority", "createdAt", "updatedAt"
    )
    SELECT
        c.ticket_id,
        c.title,
        c.description,
        'BUG'::"TicketCategory",
        'INTERNAL'::"TicketScope",
        ARRAY['SDR','MANAGER']::"UserRole"[],
        c.requester_id,
        'NOT_REQUIRED'::"TicketValidation",
        'NEW'::"TicketStatus",
        'HIGH'::"TaskPriority",
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    FROM compose c
    WHERE c.requester_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "Ticket" t WHERE t."id" = c.ticket_id)
      AND NOT EXISTS (SELECT 1 FROM "Ticket" t WHERE t."title" = c.title)
    RETURNING "id", "number", "title", "requesterId", "createdAt", "affectedRoles"
),
hist AS (
    INSERT INTO "TicketHistory" ("id", "ticketId", "userId", "field", "toValue", "createdAt")
    SELECT i."id" || '_hist', i."id", i."requesterId", 'created', 'NEW', i."createdAt"
    FROM ins i
    RETURNING "ticketId"
),
-- Une ligne de recette par rôle impacté : le ticket ne pourra pas
-- être clôturé tant que SDR et MANAGER n'ont pas signé.
checks AS (
    INSERT INTO "TicketReleaseCheck" ("id", "ticketId", "role", "checked")
    SELECT gen_random_uuid()::text, i."id", r.role, false
    FROM ins i
    CROSS JOIN LATERAL unnest(i."affectedRoles") AS r(role)
    ON CONFLICT ("ticketId", "role") DO NOTHING
    RETURNING "ticketId"
)
SELECT '#TC-' || lpad(i."number"::text, 4, '0') AS ref,
       i."title",
       (SELECT count(*) FROM hist)   AS lignes_historique,
       (SELECT count(*) FROM checks) AS lignes_recette
FROM ins i;

COMMIT;
