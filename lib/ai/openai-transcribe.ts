// ============================================
// Audio transcription via OpenAI Whisper (audio/transcriptions).
// Used by the manual audio-upload flow to turn an uploaded recording
// into a French transcription before fiche extraction.
// ============================================

export type TranscribeResult =
  | { ok: true; text: string }
  | { ok: false; message: string; status: number };

const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";
const WHISPER_MODEL = process.env.OPENAI_WHISPER_MODEL || "whisper-1";

/**
 * Transcribes an audio buffer, forcing French ("fr") since the CRM's
 * downstream fiche-generation prompt expects French input.
 */
export async function transcribeAudioFr(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<TranscribeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, message: "Clé API OpenAI non configurée (OPENAI_API_KEY)", status: 503 };
  }

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: mimeType || "audio/mpeg" }),
    filename || "audio.mp3",
  );
  form.append("model", WHISPER_MODEL);
  form.append("language", "fr");
  form.append("response_format", "json");

  let response: Response;
  try {
    response = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    console.error("OpenAI transcription fetch error:", e);
    return { ok: false, message: "Impossible de contacter le service de transcription OpenAI", status: 502 };
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const message =
      (err as { error?: { message?: string } })?.error?.message ||
      (response.status === 429
        ? "Trop de requêtes vers OpenAI (transcription). Veuillez patienter quelques instants."
        : "Erreur lors de la transcription audio");
    console.error("OpenAI transcription error:", response.status, err);
    return { ok: false, message, status: response.status >= 500 ? 502 : response.status };
  }

  const data = await response.json().catch(() => null);
  const text = typeof data?.text === "string" ? data.text.trim() : "";
  if (!text) {
    return { ok: false, message: "La transcription a renvoyé un résultat vide", status: 500 };
  }

  return { ok: true, text };
}
