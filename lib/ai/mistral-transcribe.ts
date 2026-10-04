// ============================================
// Audio transcription via Mistral Voxtral (audio/transcriptions).
// Used by the manual audio-upload flow to turn an uploaded recording
// into a French transcription before fiche extraction. Kept on the
// same provider as the fiche-generation step (lib/ai/mistral-fiche.ts)
// so the whole audio pipeline only depends on MISTRAL_API_KEY.
// ============================================

import { ensureAudioFilename, resolveAudioMime } from "@/lib/audio-upload";

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

  // 2. Mistral Voxtral
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

  // Timeout scales with file size: ~60 s base + 12 s per MB, capped under the route's maxDuration.
  const sizeMb = buffer.length / (1024 * 1024);
  const timeoutMs = Math.min(270_000, Math.round(60_000 + sizeMb * 12_000));
  const safeName = ensureAudioFilename(filename, mimeType);
  const safeMime = resolveAudioMime(filename, mimeType);

  let lastMessage = "Erreur lors de la transcription audio";
  let lastStatus = 502;

  // Up to 2 attempts, only retrying on transient failures (429 / 5xx / network).
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2500));

    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buffer)], { type: safeMime }), safeName);
    form.append("model", VOXTRAL_MODEL);
    form.append("language", "fr");

    let response: Response;
    try {
      response = await fetch(MISTRAL_TRANSCRIPTIONS_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (name === "TimeoutError" || name === "AbortError") {
        console.error("Mistral transcription timeout after", timeoutMs, "ms");
        return {
          ok: false,
          message:
            "La transcription a pris trop de temps (enregistrement trop long). Essayez avec un fichier plus court ou compressé (MP3).",
          status: 504,
        };
      }
      console.error("Mistral transcription fetch error:", e);
      lastMessage = "Impossible de contacter le service de transcription Mistral";
      lastStatus = 502;
      continue;
    }

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
        message?: unknown;
      };
      console.error("Mistral transcription error:", response.status, JSON.stringify(err).slice(0, 500));
      const upstream =
        err?.error?.message || (typeof err?.message === "string" ? err.message : "") || "";

      if (response.status === 401 || response.status === 403) {
        return { ok: false, message: "Clé API Mistral invalide ou non autorisée pour la transcription (MISTRAL_API_KEY).", status: 502 };
      }
      if (response.status === 413) {
        return { ok: false, message: "Fichier audio trop volumineux pour le service de transcription. Compressez-le (MP3) ou découpez-le.", status: 413 };
      }
      if (response.status === 400 || response.status === 422) {
        return {
          ok: false,
          message: `Mistral n'a pas pu lire ce fichier audio (format ou durée non pris en charge).${upstream ? ` Détail : ${upstream.slice(0, 160)}` : ""}`,
          status: 422,
        };
      }
      if (response.status === 429) {
        lastMessage = "Trop de requêtes vers Mistral (transcription). Veuillez patienter quelques instants puis réessayer.";
        lastStatus = 429;
        continue;
      }
      lastMessage = upstream || "Erreur lors de la transcription audio";
      lastStatus = 502;
      if (response.status >= 500) continue;
      return { ok: false, message: lastMessage, status: 502 };
    }

    const data = await response.json().catch(() => null);
    const text = typeof data?.text === "string" ? data.text.trim() : "";
    if (!text) {
      return {
        ok: false,
        message: "Aucune parole détectée dans l'enregistrement (la transcription est vide).",
        status: 422,
      };
    }
    return { ok: true, text };
  }

  return { ok: false, message: lastMessage, status: lastStatus };
}
