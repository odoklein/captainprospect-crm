// Client-side model of the « Audio & IA » tab: where a call came from, and how
// a stored transcript reads as a conversation.

export type CallSourceKey = "vault" | "twilio" | "allo";
/** Where the audio attached to an RDV comes from — the 3 call sources, or a file a manager uploaded. */
export type AudioOrigin = CallSourceKey | "upload";

export const SOURCE_ORDER: CallSourceKey[] = ["vault", "twilio", "allo"];

export const ORIGIN_META: Record<AudioOrigin, { label: string; hint: string }> = {
  vault: { label: "Call Vault", hint: "Archive synchronisée des lignes téléphoniques" },
  twilio: { label: "Twilio", hint: "Softphone intégré au CRM" },
  allo: { label: "Allo", hint: "API WithAllo (repli)" },
  upload: { label: "Fichier importé", hint: "Audio importé à la main" },
};

/** Infers where a stored recording URL points. */
export function originOfRecording(url: string | null | undefined): AudioOrigin | null {
  const u = url?.trim();
  if (!u) return null;
  if (u.includes("api.twilio.com")) return "twilio";
  if (u.includes("withallo.com")) return "allo";
  if (u.includes("call-recordings/")) return "upload";
  if (/\/api\/calls\/[^/]+\/recording$/.test(u)) return "vault";
  return null;
}

export type SourceAttemptStatus = "found" | "empty" | "skipped" | "error";
export interface SourceAttempt {
  source: CallSourceKey;
  status: SourceAttemptStatus;
  reason?: string;
  window?: string;
}

/** Live state of one step of the chain in the UI (adds "checking" / "waiting" while it runs). */
export type ChainStepState = SourceAttemptStatus | "checking" | "waiting" | "pending";

export interface CandidateCall {
  id: string;
  source: CallSourceKey;
  providerCallId: string;
  from: string;
  to: string;
  direction: "INBOUND" | "OUTBOUND";
  durationSec: number;
  startedAt: string | null;
  status: string | null;
  summary: string | null;
  transcription: string | null;
  recordingUrl: string | null;
  matchedPhones: string[];
  linkedToRdv: boolean;
  inProgress: boolean;
}

export interface PhoneSourceInfo {
  key: string;
  label: string;
  phone: string;
  rawPhone: string;
  callCount: number;
}

export interface SourceListStatus {
  source: CallSourceKey;
  status: "ok" | "empty" | "skipped" | "error" | "not_asked";
  count: number;
  reason?: string;
}

// ─── Formatting ────────────────────────────────────────────────────────────

export function formatDuration(totalSec: number | null | undefined): string {
  const s = Math.max(0, Math.round(totalSec ?? 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m} min ${String(r).padStart(2, "0")}` : `${r} s`;
}

export function formatClock(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) return "0:00";
  const s = Math.floor(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

export function formatCallDate(iso: string | null): string {
  if (!iso) return "Date inconnue";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Date inconnue";
  return d.toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatPhone(p: string): string {
  const v = p.trim();
  if (/^\+33\d{9}$/.test(v)) return ("0" + v.slice(3)).replace(/(\d{2})(?=\d)/g, "$1 ");
  return v;
}

/** Hours between a call and the moment the RDV was logged — "the booking call" is the closest one. */
export function hoursFrom(iso: string | null, refIso: string | null): number | null {
  if (!iso || !refIso) return null;
  const a = new Date(iso).getTime();
  const b = new Date(refIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.abs(a - b) / 3_600_000;
}

// ─── Transcript ────────────────────────────────────────────────────────────

export type Speaker = "sdr" | "prospect" | "other";

export interface TranscriptTurn {
  speaker: Speaker;
  label: string;
  text: string;
}

const SDR_LABELS = /^(sdr|agent|user|commercial|conseiller|moi)$/i;
const PROSPECT_LABELS = /^(prospect|external|client|contact|interlocuteur)$/i;

/**
 * Reads a stored transcript ("SDR : …", "AGENT: …", "EXTERNAL: …") as turns. Consecutive
 * lines of the same speaker are merged. Returns null when the text has no speaker labels.
 */
export function parseTranscript(text: string): TranscriptTurn[] | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const turns: TranscriptTurn[] = [];
  let labelled = 0;
  for (const line of lines) {
    const m = /^([A-Za-zÀ-ÿ'’ .-]{1,32}?)\s?:\s+(.+)$/.exec(line);
    if (m) {
      const label = m[1]!.trim();
      const speaker: Speaker = SDR_LABELS.test(label) ? "sdr" : PROSPECT_LABELS.test(label) ? "prospect" : "other";
      if (speaker !== "other") labelled += 1;
      const last = turns[turns.length - 1];
      if (last && last.label === label) last.text += ` ${m[2]}`;
      else turns.push({ speaker, label: displayLabel(label, speaker), text: m[2]! });
    } else if (turns.length) {
      turns[turns.length - 1]!.text += ` ${line}`;
    } else {
      turns.push({ speaker: "other", label: "", text: line });
    }
  }
  return labelled >= Math.min(2, lines.length) ? turns : null;
}

function displayLabel(raw: string, speaker: Speaker): string {
  if (speaker === "sdr") return /^(sdr|agent|user)$/i.test(raw) ? "SDR" : raw;
  if (speaker === "prospect") return /^(external|prospect)$/i.test(raw) ? "Prospect" : raw;
  return raw;
}

/** Splits an AI summary into its paragraphs and « • » bullet lists. */
export function parseSummary(text: string): Array<{ kind: "p"; text: string } | { kind: "list"; title: string | null; items: string[] }> {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const bullets = lines.filter((l) => /^[•\-*]\s?/.test(l));
    if (bullets.length > 0 && bullets.length >= lines.length - 1) {
      const title = lines[0] && !/^[•\-*]\s?/.test(lines[0]) ? lines[0].replace(/\s*:$/, "") : null;
      return { kind: "list" as const, title, items: bullets.map((l) => l.replace(/^[•\-*]\s?/, "")) };
    }
    return { kind: "p" as const, text: lines.join(" ") };
  });
}
