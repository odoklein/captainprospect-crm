-- =============================================
-- ReachInbox campaign → client links
-- Run in Supabase SQL Editor.
-- Stats are always fetched live from the ReachInbox API;
-- only the campaign→client association is persisted.
-- Matches prisma/schema.prisma model ReachInboxCampaignLink.
-- =============================================

CREATE TABLE IF NOT EXISTS "ReachInboxCampaignLink" (
    "id"           TEXT NOT NULL,
    "campaignId"   TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "mailboxId"    TEXT,
    "clientId"     TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReachInboxCampaignLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReachInboxCampaignLink_campaignId_key"
    ON "ReachInboxCampaignLink"("campaignId");
CREATE INDEX IF NOT EXISTS "ReachInboxCampaignLink_clientId_idx"
    ON "ReachInboxCampaignLink"("clientId");
CREATE INDEX IF NOT EXISTS "ReachInboxCampaignLink_mailboxId_idx"
    ON "ReachInboxCampaignLink"("mailboxId");

ALTER TABLE "ReachInboxCampaignLink"
    ADD CONSTRAINT "ReachInboxCampaignLink_mailboxId_fkey"
    FOREIGN KEY ("mailboxId") REFERENCES "Mailbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReachInboxCampaignLink"
    ADD CONSTRAINT "ReachInboxCampaignLink_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
