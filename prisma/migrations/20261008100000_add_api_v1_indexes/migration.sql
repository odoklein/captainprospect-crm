-- Public API (/api/v1) + MCP: indexes only, no column or table change.
-- Safe to apply (or skip) at any time; the API works without them, just slower on big histories.

CREATE INDEX IF NOT EXISTS "Action_contactId_createdAt_idx" ON "Action"("contactId", "createdAt");
CREATE INDEX IF NOT EXISTS "Action_companyId_createdAt_idx" ON "Action"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "Action_sdrId_createdAt_idx" ON "Action"("sdrId", "createdAt");
CREATE INDEX IF NOT EXISTS "ApiKeyUsageLog_apiKeyId_createdAt_idx" ON "ApiKeyUsageLog"("apiKeyId", "createdAt");
