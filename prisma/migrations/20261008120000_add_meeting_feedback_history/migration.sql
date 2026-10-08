-- Archive of replaced absences (see MeetingFeedbackHistory in schema.prisma).
-- The app is fail-open while this is unapplied: a replaced RDV just keeps its
-- "absent" status instead of being reset.

CREATE TABLE IF NOT EXISTS "MeetingFeedbackHistory" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "outcome" "MeetingOutcome" NOT NULL,
    "recontactRequested" "RecontactPreference" NOT NULL,
    "clientNote" TEXT,
    "source" "MeetingFeedbackSource",
    "reportedAt" TIMESTAMP(3) NOT NULL,
    "previousCallbackDate" TIMESTAMP(3),
    "newCallbackDate" TIMESTAMP(3) NOT NULL,
    "replacedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replacedById" TEXT,
    CONSTRAINT "MeetingFeedbackHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MeetingFeedbackHistory_actionId_replacedAt_idx" ON "MeetingFeedbackHistory"("actionId", "replacedAt");

DO $$ BEGIN
    ALTER TABLE "MeetingFeedbackHistory" ADD CONSTRAINT "MeetingFeedbackHistory_actionId_fkey"
        FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
