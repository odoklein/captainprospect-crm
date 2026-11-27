-- Client portal « Vos hypothèses »: the two inputs the weekly letter needs to
-- estimate the pipeline generated (held RDV × opportunity rate × deal value).
-- Nullable: until the client enters them, the letter shows no pipeline figure.
ALTER TABLE "Client" ADD COLUMN "portalAvgDealValue" INTEGER;
ALTER TABLE "Client" ADD COLUMN "portalMeetingToOppRate" DOUBLE PRECISION;
ALTER TABLE "Client" ADD COLUMN "portalAssumptionsUpdatedAt" TIMESTAMP(3);
