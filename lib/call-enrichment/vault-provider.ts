import type { CallProvider, CallProviderInput, CallRecord } from './provider';
import { fetchVaultCallMatches, vaultRecordingProxyUrl } from '@/lib/call-vault-client';

/**
 * CallProvider backed by call-vault instead of WithAllo directly. `alloNumbers`/`sdrId` from
 * CallProviderInput go unused — the vault already synced every line, it doesn't need to be told
 * which one a given action came from.
 */
export class VaultProvider implements CallProvider {
  async fetchMatchingCallRecord(input: CallProviderInput): Promise<CallRecord | null> {
    const matches = await fetchVaultCallMatches({
      phones: input.phones,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      limit: 1,
    });

    const best = matches[0];
    if (!best) return null;

    return {
      summary: best.summary?.trim() || undefined,
      transcription: best.transcription?.trim() || undefined,
      // Store the stable proxy reference, not the presigned URL the vault returned inline —
      // that one expires in an hour and this field gets persisted (see vaultRecordingProxyUrl).
      recordingUrl: best.recordingUrl?.trim() ? (vaultRecordingProxyUrl(best.callId) ?? undefined) : undefined,
    };
  }
}
