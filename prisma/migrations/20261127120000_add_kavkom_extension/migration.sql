-- Kavkom (lib/kavkom): each user's Kavkom extension. Click-to-call from the CRM
-- rings it first, then the prospect; the calls Kavkom pushes to
-- /api/webhooks/kavkom are attached to the user by this extension.
-- kavkomCallerId: the number shown to prospects on those calls (null = the
-- extension's own outbound caller id, set in Kavkom).
ALTER TABLE "User" ADD COLUMN "kavkomExtension" TEXT;
ALTER TABLE "User" ADD COLUMN "kavkomCallerId" TEXT;
CREATE UNIQUE INDEX "User_kavkomExtension_key" ON "User"("kavkomExtension");
