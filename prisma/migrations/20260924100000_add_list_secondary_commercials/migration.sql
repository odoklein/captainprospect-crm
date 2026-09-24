-- Several commercials per list: commercialInterlocuteurId stays the primary one.
ALTER TABLE "List" ADD COLUMN IF NOT EXISTS "secondaryCommercialIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
