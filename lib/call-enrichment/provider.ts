import { AlloProvider } from './allo-provider';
import { VaultProvider } from './vault-provider';
import { TwilioProvider } from './twilio-provider';
import { isVaultConfigured } from '@/lib/call-vault-client';
import { integrationKey } from "@/lib/integrations/keys";

// ============================================
// Call sources, tried in order until one has the call:
//
//   1. Call Vault — the synced archive of every telephony line (Allo, Leexi…)
//   2. Twilio     — the in-app softphone, stored in our own database
//   3. Allo       — WithAllo's API directly, last resort (vault lag / outage /
//                   vault not deployed). Needs ALLO_API_KEY + the SDR's lines;
//                   CALL_ENRICHMENT_ALLO_FALLBACK=0 turns it off.
// ============================================

export type CallSourceKey = 'vault' | 'twilio' | 'allo';

export const CALL_SOURCE_ORDER: CallSourceKey[] = ['vault', 'twilio', 'allo'];

export const CALL_SOURCE_LABELS: Record<CallSourceKey, string> = {
  vault: 'Call Vault',
  twilio: 'Twilio',
  allo: 'Allo',
};

export interface CallRecord {
  summary?: string;
  transcription?: string;
  recordingUrl?: string;
  duration?: number;
  /** Which source answered — set by the chain. */
  source?: CallSourceKey;
  /** The call's id in its source (vault call id, TelephonyCall id, Allo call id). */
  providerCallId?: string;
  startedAt?: string;
}

export interface CallProviderInput {
  phones: string[];
  alloNumbers: string[];
  sdrId: string;
  windowStart: Date;
  windowEnd: Date;
  /** Lets the Twilio source match by record (and by the call already linked to the action). */
  actionId?: string | null;
  contactId?: string | null;
  companyId?: string | null;
}

export interface CallProvider {
  fetchMatchingCallRecord(input: CallProviderInput): Promise<CallRecord | null>;
}

export type SourceAttemptStatus = 'found' | 'empty' | 'skipped' | 'error';

/** What each source answered — shown to the manager, logged for support. */
export interface SourceAttempt {
  source: CallSourceKey;
  status: SourceAttemptStatus;
  /** Human-readable reason (skipped / error), French, safe to show. */
  reason?: string;
  /** Label of the time window that matched (found). */
  window?: string;
}

export interface SearchWindow {
  label: string;
  start: Date;
  end: Date;
}

export interface SourceAvailability {
  source: CallSourceKey;
  available: boolean;
  reason?: string;
}

function alloFallbackEnabled(): boolean {
  return process.env.CALL_ENRICHMENT_ALLO_FALLBACK !== '0';
}

/** Which sources can be asked right now, and why not when they can't. */
export function callSourceAvailability(input?: { alloNumbers?: string[] }): SourceAvailability[] {
  const alloKey = integrationKey("ALLO_API_KEY")?.trim();
  return [
    isVaultConfigured()
      ? { source: 'vault', available: true }
      : { source: 'vault', available: false, reason: 'Call Vault non configuré' },
    { source: 'twilio', available: true },
    !alloKey
      ? { source: 'allo', available: false, reason: 'Clé API Allo absente' }
      : !alloFallbackEnabled()
        ? { source: 'allo', available: false, reason: 'Repli Allo désactivé' }
        : input?.alloNumbers && input.alloNumbers.length === 0
          ? { source: 'allo', available: false, reason: 'Aucune ligne Allo pour ce SDR' }
          : { source: 'allo', available: true },
  ];
}

// Providers are rebuilt when the Allo key changes (Paramètres → Intégrations), without a restart.
let cache: { alloKey: string | undefined; providers: Record<CallSourceKey, CallProvider | null> } | null = null;

function providers(): Record<CallSourceKey, CallProvider | null> {
  const alloKey = integrationKey("ALLO_API_KEY")?.trim() || undefined;
  if (!cache || cache.alloKey !== alloKey) {
    cache = {
      alloKey,
      providers: {
        vault: new VaultProvider(),
        twilio: new TwilioProvider(),
        allo: alloKey ? new AlloProvider(alloKey) : null,
      },
    };
  }
  return cache.providers;
}

function hasContent(r: CallRecord | null): r is CallRecord {
  return Boolean(r && (r.recordingUrl?.trim() || r.transcription?.trim() || r.summary?.trim()));
}

/**
 * Walks Call Vault → Twilio → Allo and returns the first source's best call, trying
 * each source on every window (closest window first) before moving to the next
 * source. A source that fails is recorded and skipped — it never blocks the others.
 */
export async function findCallWithFallback(
  input: Omit<CallProviderInput, 'windowStart' | 'windowEnd'> & { windows: SearchWindow[] },
): Promise<{ record: (CallRecord & { source: CallSourceKey; window: string }) | null; attempts: SourceAttempt[] }> {
  return walkSources(input, callSourceAvailability({ alloNumbers: input.alloNumbers }), providers());
}

/** The chain itself, with its sources injected (tests). */
export async function walkSources(
  input: Omit<CallProviderInput, 'windowStart' | 'windowEnd'> & { windows: SearchWindow[] },
  availability: SourceAvailability[],
  all: Record<CallSourceKey, CallProvider | null>,
): Promise<{ record: (CallRecord & { source: CallSourceKey; window: string }) | null; attempts: SourceAttempt[] }> {
  const attempts: SourceAttempt[] = [];

  for (const source of CALL_SOURCE_ORDER) {
    const avail = availability.find((a) => a.source === source) ?? { source, available: false };
    const provider = all[source];
    if (!avail.available || !provider) {
      attempts.push({ source, status: 'skipped', reason: avail.reason });
      continue;
    }
    if (source !== 'twilio' && input.phones.length === 0) {
      attempts.push({ source, status: 'skipped', reason: 'Aucun numéro exploitable' });
      continue;
    }
    try {
      for (const w of input.windows) {
        const rec = await provider.fetchMatchingCallRecord({ ...input, windowStart: w.start, windowEnd: w.end });
        if (hasContent(rec)) {
          attempts.push({ source, status: 'found', window: w.label });
          console.log(`[call-enrichment] chain: found in ${source} (window "${w.label}")`);
          return { record: { ...rec, source, window: w.label }, attempts };
        }
      }
      attempts.push({ source, status: 'empty' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[call-enrichment] chain: ${source} failed — ${msg}`);
      attempts.push({ source, status: 'error', reason: `${CALL_SOURCE_LABELS[source]} indisponible` });
    }
  }
  console.log(`[call-enrichment] chain: no call found (${attempts.map((a) => `${a.source}=${a.status}`).join(' ')})`);
  return { record: null, attempts };
}

/** Single-window entry point (post-qualification enrichment): same chain, same order. */
export const callProvider: CallProvider = {
  async fetchMatchingCallRecord(input) {
    const { record } = await findCallWithFallback({
      ...input,
      windows: [{ label: 'Fenêtre', start: input.windowStart, end: input.windowEnd }],
    });
    return record;
  },
};
