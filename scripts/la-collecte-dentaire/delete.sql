-- ============================================
-- Deletes the La Collecte Dentaire import of 2026-11-11 (client, mission « La Collecte
-- Dentaire — Relance des cabinets qualifiés », campaign, 3 lists, 453 cabinets).
-- Its cabinets now feed the Denterlab mission (scripts/denterlab/import.sql).
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/la-collecte-dentaire/delete.sql
--
-- Only the client created by scripts/la-collecte-dentaire/import.sql (id lcdcli62608e08adc29a8d6dbc9).
-- Refuses (and changes nothing) if any call / action was logged on it since.
-- One transaction. Re-running after success does nothing.
-- ============================================

\set ON_ERROR_STOP on
BEGIN;

DO $do$
DECLARE
    v_client  text := 'lcdcli62608e08adc29a8d6dbc9';
    v_actions integer;
    v_n       integer;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM "Client" WHERE id = v_client) THEN
        RAISE NOTICE 'Nothing to delete: client % is not there', v_client;
        RETURN;
    END IF;

    SELECT count(*) INTO v_actions FROM "Action" a
      JOIN "Campaign" k ON k.id = a."campaignId"
      JOIN "Mission" m ON m.id = k."missionId"
     WHERE m."clientId" = v_client;
    IF v_actions > 0 THEN
        RAISE EXCEPTION 'Stopped: % actions already logged on La Collecte Dentaire. Nothing deleted.', v_actions;
    END IF;

    DELETE FROM "Contact" WHERE "companyId" IN (
        SELECT co.id FROM "Company" co JOIN "List" l ON l.id = co."listId" JOIN "Mission" m ON m.id = l."missionId"
         WHERE m."clientId" = v_client);
    GET DIAGNOSTICS v_n = ROW_COUNT; RAISE NOTICE 'contacts deleted: %', v_n;
    DELETE FROM "Company" WHERE "listId" IN (
        SELECT l.id FROM "List" l JOIN "Mission" m ON m.id = l."missionId" WHERE m."clientId" = v_client);
    GET DIAGNOSTICS v_n = ROW_COUNT; RAISE NOTICE 'companies deleted: %', v_n;
    DELETE FROM "List" WHERE "missionId" IN (SELECT id FROM "Mission" WHERE "clientId" = v_client);
    GET DIAGNOSTICS v_n = ROW_COUNT; RAISE NOTICE 'lists deleted: %', v_n;
    DELETE FROM "Campaign" WHERE "missionId" IN (SELECT id FROM "Mission" WHERE "clientId" = v_client);
    DELETE FROM "Mission" WHERE "clientId" = v_client;
    GET DIAGNOSTICS v_n = ROW_COUNT; RAISE NOTICE 'missions deleted: %', v_n;
    DELETE FROM "Client" WHERE id = v_client;
    RAISE NOTICE 'client La Collecte Dentaire deleted';
END
$do$;

COMMIT;

SELECT count(*) AS remaining_lcd_clients FROM "Client" WHERE id = 'lcdcli62608e08adc29a8d6dbc9';
