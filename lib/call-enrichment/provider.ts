import { AlloProvider } from './allo-provider';
import { VaultProvider } from './vault-provider';
import { isVaultConfigured } from '@/lib/call-vault-client';

export interface CallRecord {
  summary?: string;
  transcription?: string;
  recordingUrl?: string;
}

export interface CallProviderInput {
  phones: string[];
  alloNumbers: string[];
  sdrId: string;
  windowStart: Date;
  windowEnd: Date;
}

export interface CallProvider {
  fetchMatchingCallRecord(input: CallProviderInput): Promise<CallRecord | null>;
}

function buildProvider(): CallProvider {
  // call-vault owns the actual WithAllo connection now — this app should never talk to a
  // telephony provider directly. AlloProvider stays wired below as a fallback: unset
  // VAULT_API_URL/VAULT_API_KEY to roll back to the old direct-to-WithAllo path instantly.
  if (isVaultConfigured()) {
    console.log('[call-enrichment] provider=Vault');
    return new VaultProvider();
  }

  const apiKey = process.env.ALLO_API_KEY;
  if (apiKey) {
    console.log('[call-enrichment] provider=Allo (legacy direct fallback — set VAULT_API_URL/VAULT_API_KEY to use call-vault instead)');
    return new AlloProvider(apiKey);
  }

  console.warn('[call-enrichment] provider=NOOP — neither VAULT_API_URL/VAULT_API_KEY nor ALLO_API_KEY is set, enrichment disabled');
  // No-op until env vars are set
  return {
    fetchMatchingCallRecord: async () => {
      console.warn('[call-enrichment] fetchMatchingCallRecord: NOOP (set VAULT_API_URL/VAULT_API_KEY)');
      return null;
    },
  };
}

export const callProvider: CallProvider = buildProvider();
