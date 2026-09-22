// Client for the call-vault service (github.com/odoklein/call-vault) — the replacement for
// talking to WithAllo/Leexi/etc. directly. A plain internal HTTP call against a service this app
// controls, so unlike the provider calls it replaces, it can't 429 and needs no retry/backoff
// dance on this side.

export interface VaultCallMatch {
  callId: string;
  fromNumber: string;
  toNumber: string;
  direction: "INBOUND" | "OUTBOUND";
  status: string | null;
  durationSec: number;
  startedAt: string | null;
  summary: string | null;
  transcription: string | null;
  recordingUrl: string | null;
}

const VAULT_API_URL = process.env.VAULT_API_URL;
const VAULT_API_KEY = process.env.VAULT_API_KEY;

export function isVaultConfigured(): boolean {
  return Boolean(VAULT_API_URL && VAULT_API_KEY);
}

/**
 * A STABLE reference to a call's recording — safe to persist (e.g. into
 * Action.callRecordingUrl). Unlike VaultCallMatch.recordingUrl (a presigned URL with a short TTL,
 * fine for immediate display, wrong to store), this always resolves to a fresh signed URL when
 * fetched via the CRM's own /api/actions/[id]/recording proxy.
 */
export function vaultRecordingProxyUrl(callId: string): string | null {
  if (!VAULT_API_URL) return null;
  return new URL(`/api/calls/${callId}/recording`, VAULT_API_URL).toString();
}

/**
 * Ranked call matches for one or more candidate phone numbers within a time window.
 * Never throws — a vault outage should degrade to "no match found", not break action creation.
 */
export async function fetchVaultCallMatches(params: {
  phones: string[];
  windowStart: Date;
  windowEnd: Date;
  limit?: number;
}): Promise<VaultCallMatch[]> {
  if (!VAULT_API_URL || !VAULT_API_KEY) {
    console.warn("[call-vault-client] VAULT_API_URL/VAULT_API_KEY not set — returning no matches");
    return [];
  }

  const phones = params.phones.filter(Boolean);
  if (phones.length === 0) return [];

  const url = new URL("/api/calls", VAULT_API_URL);
  for (const phone of phones) url.searchParams.append("phone", phone);
  url.searchParams.set("windowStart", params.windowStart.toISOString());
  url.searchParams.set("windowEnd", params.windowEnd.toISOString());
  if (params.limit) url.searchParams.set("limit", String(params.limit));

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${VAULT_API_KEY}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.warn(`[call-vault-client] non-ok status=${res.status} url=${url.pathname}`);
      return [];
    }

    const data = (await res.json()) as { matches?: VaultCallMatch[] };
    return Array.isArray(data.matches) ? data.matches : [];
  } catch (e) {
    console.warn("[call-vault-client] request failed", e);
    return [];
  }
}
