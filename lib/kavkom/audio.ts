// ============================================
// KAVKOM — the audio of a stored call (server-only). Kept apart from service.ts so the
// recording routes and the AI summary can read it without importing the call service.
// ============================================

import { kavkomClient } from "./config";

/** A fresh https link to the recording of a CDR (Kavkom signs them), or null. */
export async function kavkomAudioUrl(cdrUuid: string): Promise<string | null> {
    const client = kavkomClient();
    if (!client) return null;
    try {
        const link = await client.recordingLink(cdrUuid);
        return link && new URL(link).protocol === "https:" ? link : null;
    } catch (err) {
        console.warn("[kavkom] get_file_link failed", err);
        return null;
    }
}
