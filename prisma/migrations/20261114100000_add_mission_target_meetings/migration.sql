-- Numeric mission target (« RDV visés ») so the mission page can tell whether the mission is on pace.
-- Nullable: missions without a target keep working; pace is simply not computed.
ALTER TABLE "Mission" ADD COLUMN "targetMeetings" INTEGER;
