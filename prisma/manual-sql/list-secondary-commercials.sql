-- ============================================================
-- Plusieurs commerciaux par liste (ticket "sélection multiple commercial")
-- À exécuter une fois dans l'éditeur SQL Supabase (prod). Idempotent.
--
-- "commercialInterlocuteurId" reste le commercial principal (affiché en
-- premier dans le calendrier SDR) ; "secondaryCommercialIds" contient les
-- autres commerciaux de la base.
-- ============================================================
BEGIN;

ALTER TABLE "List"
    ADD COLUMN IF NOT EXISTS "secondaryCommercialIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Migration bookkeeping. The checksum is the SHA-256 of
-- prisma/migrations/20260924100000_add_list_secondary_commercials/migration.sql —
-- do not edit that file after running this.
DO $$ BEGIN
    IF to_regclass('public."_prisma_migrations"') IS NULL THEN
        RAISE NOTICE 'Table _prisma_migrations absente — bookkeeping ignoré (db push).';
        RETURN;
    END IF;

    INSERT INTO "_prisma_migrations"
        ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
    VALUES
        (
            '5a1e9c42-3d7b-4f0e-8c61-2b9d4e7f1a05',
            'd1865c3dc6ee4f7f0d018725b765ae3fe9e82052c9d9e15ac53bebf07079b637',
            NOW(),
            '20260924100000_add_list_secondary_commercials',
            NULL,
            NULL,
            NOW(),
            1
        )
    ON CONFLICT ("id") DO NOTHING;
END $$;

COMMIT;
