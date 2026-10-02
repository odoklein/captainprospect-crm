// ============================================
// Audio transcription via Mistral Voxtral (audio/transcriptions).
// Used by the manual audio-upload flow to turn an uploaded recording
// into a French transcription before fiche extraction. Kept on the
// same provider as the fiche-generation step (lib/ai/mistral-fiche.ts)
// so the whole audio pipeline only depends on MISTRAL_API_KEY.
// ============================================

export type TranscribeResult =
  | { ok: true; text: string }
  | { ok: false; message: string; status: number };

const MISTRAL_TRANSCRIPTIONS_URL = "https://api.mistral.ai/v1/audio/transcriptions";
const VOXTRAL_MODEL = process.env.MISTRAL_VOXTRAL_MODEL || "voxtral-mini-latest";

/**
 * Attempts transcription via a local or sidecar faster-whisper microservice.
 * Supports both standard /asr and OpenAI-compatible /v1/audio/transcriptions payloads.
 */
async function transcribeWithLocalWhisper(
  url: string,
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(buffer)], { type: mimeType || "audio/mpeg" }),
      filename || "audio.mp3",
    );
    form.append("language", "fr");
    form.append("task", "transcribe");
    form.append("output", "json");

    const response = await fetch(url, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(180_000), // 3 min timeout for long calls
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return { ok: false, error: `HTTP ${response.status}: ${errText.slice(0, 200)}` };
    }

    const data = await response.json().catch(() => null);
    const text =
      typeof data?.text === "string"
        ? data.text.trim()
        : typeof data === "string"
          ? data.trim()
          : "";

    if (!text) {
      return { ok: false, error: "Empty transcription payload received" };
    }

    return { ok: true, text };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Transcribes an audio buffer, forcing French ("fr") since the CRM's
 * downstream fiche-generation prompt expects French input.
 * Priority:
 *  1. Local faster-whisper microservice (via process.env.WHISPER_API_URL)
 *  2. Fallback to Mistral Voxtral (via process.env.MISTRAL_API_KEY)
 */
export async function transcribeAudioFr(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<TranscribeResult> {
  // 1. Try local faster-whisper service if configured
  const localWhisperUrl = process.env.WHISPER_API_URL;
  if (localWhisperUrl) {
    const localResult = await transcribeWithLocalWhisper(localWhisperUrl, buffer, filename, mimeType);
    if (localResult.ok) {
      return { ok: true, text: localResult.text };
    }
    console.warn(`[Transcription] Local Whisper (${localWhisperUrl}) failed: ${localResult.error}. Falling back to Mistral...`);
  }

  // 2. Fallback to Mistral Voxtral
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      message: localWhisperUrl
        ? "Le service Whisper local a échoué et la clé MISTRAL_API_KEY n'est pas configurée pour le repli."
        : "Clé API Mistral non configurée (MISTRAL_API_KEY) et aucun service WHISPER_API_URL défini.",
      status: 503,
    };
  }

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: mimeType || "audio/mpeg" }),
    filename || "audio.mp3",
  );
  form.append("model", VOXTRAL_MODEL);
  form.append("language", "fr");

  let response: Response;
  try {
    response = await fetch(MISTRAL_TRANSCRIPTIONS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    console.error("Mistral transcription fetch error:", e);
    return { ok: false, message: "Impossible de contacter le service de transcription Mistral", status: 502 };
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const message =
      (err as { error?: { message?: string }; message?: string })?.error?.message ||
      (err as { message?: string })?.message ||
      (response.status === 429
        ? "Trop de requêtes vers Mistral (transcription). Veuillez patienter quelques instants."
        : "Erreur lors de la transcription audio");
    console.error("Mistral transcription error:", response.status, err);
    return { ok: false, message, status: response.status >= 500 ? 502 : response.status };
  }

  const data = await response.json().catch(() => null);
  const text = typeof data?.text === "string" ? data.text.trim() : "";
  if (!text) {
    return { ok: false, message: "La transcription a renvoyé un résultat vide", status: 500 };
  }

  return { ok: true, text };
}
