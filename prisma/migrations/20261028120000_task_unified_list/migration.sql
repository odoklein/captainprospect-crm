-- Unified task list, phase 1: Task becomes the single store for to-dos.
--   - projectId becomes optional (personal / inbox tasks)
--   - new columns: clientId, source, sourceRef, sessionId, audienceRole, assigneeLabel
--   - backfill: client from the project, onboarding source, SessionTask mirrors,
--     and a Task for every SessionTask that was never mirrored
-- Additive and idempotent: re-running it changes nothing. SessionTask is kept
-- (read-only from phase 4 on) until a later migration drops it.

DO $$ BEGIN
    CREATE TYPE "TaskSource" AS ENUM ('MANUAL', 'ONBOARDING', 'SESSION', 'AI', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Task" ALTER COLUMN "projectId" DROP NOT NULL;

ALTER TABLE "Task"
    ADD COLUMN IF NOT EXISTS "clientId" TEXT,
    ADD COLUMN IF NOT EXISTS "source" "TaskSource" NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN IF NOT EXISTS "sourceRef" TEXT,
    ADD COLUMN IF NOT EXISTS "sessionId" TEXT,
    ADD COLUMN IF NOT EXISTS "audienceRole" "SessionTaskRole",
    ADD COLUMN IF NOT EXISTS "assigneeLabel" TEXT;

CREATE INDEX IF NOT EXISTS "Task_clientId_idx" ON "Task"("clientId");
CREATE INDEX IF NOT EXISTS "Task_source_idx" ON "Task"("source");
CREATE INDEX IF NOT EXISTS "Task_sessionId_idx" ON "Task"("sessionId");

DO $$ BEGIN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_clientId_fkey"
        FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_sessionId_fkey"
        FOREIGN KEY ("sessionId") REFERENCES "ClientSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 1. Client of every task that sits in a client project
UPDATE "Task" t
SET "clientId" = p."clientId"
FROM "Project" p
WHERE t."projectId" = p."id"
  AND t."clientId" IS NULL
  AND p."clientId" IS NOT NULL;

-- 2. Onboarding checklist rows (lib/onboarding/checklist-template.ts)
UPDATE "Task"
SET "source" = 'ONBOARDING'
WHERE 'onboarding' = ANY("labels")
  AND "source" = 'MANUAL';

-- 3. Tasks that already mirror a SessionTask
UPDATE "Task" t
SET "source"        = 'SESSION',
    "sourceRef"     = 'sessionTask:' || s."id",
    "sessionId"     = s."sessionId",
    "audienceRole"  = s."assigneeRole",
    "assigneeLabel" = s."assignee",
    "clientId"      = COALESCE(t."clientId", cs."clientId")
FROM "SessionTask" s
JOIN "ClientSession" cs ON cs."id" = s."sessionId"
WHERE s."taskId" = t."id"
  AND t."sessionId" IS NULL;

-- 4. SessionTasks never mirrored: create their Task (in the client project when
--    there is one, as findOrCreateClientProject picks it), created by that
--    project's owner, else by whoever created the client's onboarding.
--    Rows with neither stay SessionTask-only; find them afterwards with
--    SELECT * FROM "SessionTask" WHERE "taskId" IS NULL;
INSERT INTO "Task" (
    "id", "projectId", "clientId", "title", "status", "priority", "dueDate",
    "completedAt", "createdById", "source", "sourceRef", "sessionId",
    "audienceRole", "assigneeLabel", "createdAt", "updatedAt"
)
SELECT
    'sesstask_' || s."id",
    proj."id",
    cs."clientId",
    s."label",
    (CASE WHEN s."doneAt" IS NULL THEN 'TODO' ELSE 'DONE' END)::"TaskStatus",
    s."priority"::text::"TaskPriority",
    s."dueDate",
    s."doneAt",
    creator."userId",
    'SESSION',
    'sessionTask:' || s."id",
    s."sessionId",
    s."assigneeRole",
    s."assignee",
    s."createdAt",
    NOW()
FROM "SessionTask" s
JOIN "ClientSession" cs ON cs."id" = s."sessionId"
LEFT JOIN LATERAL (
    SELECT p."id", p."ownerId"
    FROM "Project" p
    WHERE p."clientId" = cs."clientId" AND p."status" = 'ACTIVE' AND p."archivedAt" IS NULL
    ORDER BY p."createdAt" ASC
    LIMIT 1
) proj ON TRUE
JOIN LATERAL (
    SELECT u."id" AS "userId"
    FROM "User" u
    WHERE u."id" = COALESCE(
        proj."ownerId",
        (SELECT o."createdById" FROM "ClientOnboarding" o WHERE o."clientId" = cs."clientId")
    )
) creator ON TRUE
WHERE s."taskId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "Task" t WHERE t."id" = 'sesstask_' || s."id");

UPDATE "SessionTask" s
SET "taskId" = 'sesstask_' || s."id"
WHERE s."taskId" IS NULL
  AND EXISTS (SELECT 1 FROM "Task" t WHERE t."id" = 'sesstask_' || s."id");
