// ============================================
// ONOFF AUDIO — the link to play a stored call's recording or voicemail.
// Imported calls (and webhook calls once the API knows them) carry Onoff ids, not
// links: Onoff signs a fresh link on demand, valid 10 minutes. Webhook calls also
// keep the link Onoff pushed, used when the API key is absent.
// ============================================

import { integrationKey } from "@/lib/integrations/keys";
import { OnoffApiClient } from "./api";

export const isOnoffApiConfigured = () => Boolean(integrationKey("ONOFF_API_KEY")?.trim());

export async function freshOnoffAudioUrl(row: { apiCallId: string | null; recordingId: string | null; voicemailId: string | null }): Promise<string | null> {
    const key = integrationKey("ONOFF_API_KEY")?.trim();
    if (!key) return null;
    const api = new OnoffApiClient(key, undefined, undefined, 0);
    try {
        if (row.recordingId && row.apiCallId) return await api.recordingUrl(row.apiCallId);
        if (row.voicemailId) return await api.voicemailUrl(row.voicemailId);
    } catch (e) {
        console.warn("[onoff] fresh audio link failed", row.apiCallId, e instanceof Error ? e.message : e);
    }
    return null;
}
