// ============================================
// Shared rules for manual RDV audio uploads (client + server).
// Browsers frequently report an empty or "video/*" MIME type for
// m4a / webm / ogg recordings, so we validate on extension too and
// derive a clean MIME type for storage and for Mistral Voxtral.
// ============================================

export const MAX_AUDIO_SIZE = 50 * 1024 * 1024;
export const MAX_AUDIO_SIZE_LABEL = "50 Mo";

const MIME_BY_EXT: Record<string, string> = {
  mp3: "audio/mpeg",
  mpga: "audio/mpeg",
  mpeg: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  webm: "audio/webm",
};

export const AUDIO_EXTENSIONS = Object.keys(MIME_BY_EXT);

/** Value for <input accept>. */
export const AUDIO_ACCEPT = ["audio/*", ...AUDIO_EXTENSIONS.map((e) => `.${e}`)].join(",");

export const AUDIO_FORMATS_LABEL = "MP3, M4A, WAV, OGG, FLAC, WEBM";

export function audioExtension(filename: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(filename.trim());
  return m ? m[1].toLowerCase() : "";
}

/** True when the file looks like a supported audio file (MIME type or extension). */
export function isAcceptedAudioFile(filename: string, mimeType: string): boolean {
  if (mimeType && mimeType.toLowerCase().startsWith("audio/")) return true;
  return audioExtension(filename) in MIME_BY_EXT;
}

/** Best MIME type to store / send: trust a real audio/* type, otherwise infer from the extension. */
export function resolveAudioMime(filename: string, mimeType: string): string {
  const t = (mimeType || "").toLowerCase();
  if (t.startsWith("audio/")) return t;
  return MIME_BY_EXT[audioExtension(filename)] ?? "audio/mpeg";
}

/** Guarantees a filename with an extension Mistral can sniff. */
export function ensureAudioFilename(filename: string, mimeType: string): string {
  const base = filename?.trim() || "audio";
  if (audioExtension(base) in MIME_BY_EXT) return base;
  const t = mimeType.toLowerCase();
  const ext =
    t.includes("mp4") || t.includes("m4a") ? "m4a"
    : t.includes("wav") ? "wav"
    : t.includes("ogg") ? "ogg"
    : t.includes("webm") ? "webm"
    : t.includes("flac") ? "flac"
    : "mp3";
  return `${base.replace(/\.[A-Za-z0-9]{1,8}$/, "")}.${ext}`;
}
