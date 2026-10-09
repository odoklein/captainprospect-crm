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

// ============================================
// Transcript reads (MCP). Unlike fetchVaultCallMatches these THROW on failure: an MCP answer of
// "no transcript found" during a vault outage would be a made-up fact, not a graceful degradation.
// ============================================

export class VaultUnavailableError extends Error {}

export interface VaultSearchParams {
  q?: string;
  /** Tenant of the CRM principal — when set, the vault only returns calls linked to it. */
  clientId?: string;
  missionId?: string;
  actionId?: string;
  contactId?: string;
  companyId?: string;
  sdrUserId?: string;
  phones?: string[];
  from?: string;
  to?: string;
  hasTranscript?: boolean;
  cursor?: string;
  limit: number;
}

export interface VaultSearchItem {
  id: string;
  startedAt: string;
  durationSec: number;
  direction: "INBOUND" | "OUTBOUND";
  remoteNumber: string | null;
  status: string | null;
  summary: string | null;
  hasTranscript: boolean;
  hasRecording: boolean;
  snippet: string | null;
  actionId: string | null;
  contactId: string | null;
  companyId: string | null;
  sdrUserId: string | null;
  missionId: string | null;
  clientId: string | null;
  result: string | null;
  matchConfidence: "HIGH" | "MEDIUM" | "LOW" | null;
  matchReason: string | null;
}

export interface VaultTranscriptSegment {
  speaker: "SDR" | "PROSPECT" | "AGENT" | "UNKNOWN";
  source: string;
  text: string;
  start?: number;
  end?: number;
}

export interface VaultCallDetail {
  id: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSec: number;
  direction: "INBOUND" | "OUTBOUND";
  remoteNumber: string | null;
  status: string | null;
  summary: string | null;
  transcription: string | null;
  transcriptSegments: VaultTranscriptSegment[] | null;
  hasRecording: boolean;
  sdrUserId: string | null;
  link: {
    actionId: string;
    contactId: string | null;
    companyId: string | null;
    missionId: string;
    clientId: string;
    result: string;
    loggedAt: string;
    confidence: "HIGH" | "MEDIUM" | "LOW" | null;
    reason: string | null;
  } | null;
}

/** What the MCP services need from the vault — injectable so tests can record the requests. */
export interface VaultReader {
  searchCalls(params: VaultSearchParams): Promise<{ items: VaultSearchItem[]; nextCursor: string | null }>;
  /** null when the call doesn't exist or isn't visible to the given tenant. */
  getCall(id: string, opts: { by?: "action"; clientId?: string; missionId?: string }): Promise<VaultCallDetail | null>;
  coverage(from: string, to: string): Promise<unknown>;
}

async function vaultGet<T>(path: string, params: Record<string, string | string[] | undefined>, opts: { allow404?: boolean } = {}): Promise<T | null> {
  if (!VAULT_API_URL || !VAULT_API_KEY) throw new VaultUnavailableError("call vault not configured (VAULT_API_URL / VAULT_API_KEY)");
  const url = new URL(path, VAULT_API_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    for (const one of Array.isArray(v) ? v : [v]) url.searchParams.append(k, one);
  }
  let res: Response;
  try {
    res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${VAULT_API_KEY}` }, signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    throw new VaultUnavailableError(`call vault unreachable: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (res.status === 404 && opts.allow404) return null;
  if (!res.ok) throw new VaultUnavailableError(`call vault error status=${res.status} path=${url.pathname}`);
  return (await res.json()) as T;
}

export const vaultReader: VaultReader = {
  async searchCalls(p) {
    const data = await vaultGet<{ items: VaultSearchItem[]; nextCursor: string | null }>("/api/calls/search", {
      q: p.q,
      crmClientId: p.clientId,
      crmMissionId: p.missionId,
      actionId: p.actionId,
      contactId: p.contactId,
      companyId: p.companyId,
      sdrUserId: p.sdrUserId,
      phone: p.phones,
      from: p.from,
      to: p.to,
      hasTranscript: p.hasTranscript === undefined ? undefined : String(p.hasTranscript),
      cursor: p.cursor,
      limit: String(p.limit),
    });
    return data ?? { items: [], nextCursor: null };
  },
  getCall(id, o) {
    return vaultGet<VaultCallDetail>(`/api/calls/${encodeURIComponent(id)}`, { by: o.by, crmClientId: o.clientId, crmMissionId: o.missionId }, { allow404: true });
  },
  async coverage(from, to) {
    return vaultGet<unknown>("/api/calls/coverage", { from, to });
  },
};

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
