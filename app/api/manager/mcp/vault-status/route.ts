import { NextRequest } from 'next/server';
import { requireRole, successResponse, withErrorHandler } from '@/lib/api-utils';
import { isVaultConfigured, vaultReader } from '@/lib/call-vault-client';

// ============================================
// GET /api/manager/mcp/vault-status
// Can the MCP read the call vault (transcripts, call coverage)? Probes it once
// with the server's VAULT_API_KEY; never returns the key or the vault URL.
// ============================================

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireRole(['MANAGER'], request);

  if (!isVaultConfigured()) {
    return successResponse({ configured: false, reachable: false, operator: false, message: 'VAULT_API_URL / VAULT_API_KEY non configurés sur le serveur' });
  }

  const today = new Date().toISOString().slice(0, 10);
  try {
    // coverage is operator-only: success proves reachability, key validity AND the all-clients tools.
    await vaultReader.coverage(today, today);
    return successResponse({ configured: true, reachable: true, operator: true, message: 'Call-vault joignable' });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Call-vault injoignable';
    return successResponse({ configured: true, reachable: false, operator: false, message });
  }
});
