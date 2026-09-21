-- "Hors scope" disposition for reported no-shows (TC-0027).
-- Stand by is a pause the manager expects to undo; hors scope retires the
-- absence for good. Kept as its own set of columns rather than reusing
-- standByAt so an out-of-scope RDV cannot be silently "reactivated".

ALTER TABLE "MeetingFeedback"
    ADD COLUMN "outOfScopeAt" TIMESTAMP(3),
    ADD COLUMN "outOfScopeReason" TEXT,
    ADD COLUMN "outOfScopeById" TEXT;

ALTER TABLE "MeetingFeedback"
    ADD CONSTRAINT "MeetingFeedback_outOfScopeById_fkey"
    FOREIGN KEY ("outOfScopeById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "MeetingFeedback_outOfScopeAt_idx" ON "MeetingFeedback"("outOfScopeAt");
