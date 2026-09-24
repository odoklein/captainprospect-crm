-- Images attached in the new-request form are uploaded before the conversation exists.
ALTER TABLE "SupportAttachment" ALTER COLUMN "conversationId" DROP NOT NULL;
