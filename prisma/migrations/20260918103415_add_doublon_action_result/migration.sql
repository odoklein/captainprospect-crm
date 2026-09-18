-- Add DOUBLON to ActionResult enum (custom status created in manager settings)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'ActionResult' AND e.enumlabel = 'DOUBLON'
  ) THEN
    ALTER TYPE "ActionResult" ADD VALUE 'DOUBLON';
  END IF;
END
$$;
