// ============================================
// TELEPHONY — live transcription (Twilio <Start><Transcription>). Pure parts.
//
// On the browser leg, Twilio's inbound track is what it receives from the
// caller (the SDR's microphone) and the outbound track is what it plays to
// them (the prospect, bridged by <Dial>). Each final sentence is POSTed to
// /api/webhooks/twilio/transcription; this module reads those callbacks.
//
// The callback format is parsed defensively: unknown or malformed fields are
// dropped, never guessed.
// ============================================

export type Speaker = "sdr" | "prospect";

export type TranscriptionEvent =
    | { kind: "line"; speaker: Speaker; seq: number; text: string; confidence: number | null; at: Date; final: boolean }
    | { kind: "stopped" }
    | { kind: "started" }
    | { kind: "error"; message: string }
    | { kind: "ignored"; reason: string };

function str(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function speakerOfTrack(track: string | null | undefined): Speaker | null {
    const t = (track ?? "").toLowerCase();
    if (t.startsWith("inbound")) return "sdr";
    if (t.startsWith("outbound")) return "prospect";
    return null;
}

export function parseTranscriptionCallback(params: Record<string, string>, now = new Date()): TranscriptionEvent {
    const event = (str(params.TranscriptionEvent) ?? "").toLowerCase();

    if (event === "transcription-started") return { kind: "started" };
    if (event === "transcription-stopped") return { kind: "stopped" };
    if (event === "transcription-error") return { kind: "error", message: str(params.TranscriptionError) ?? str(params.ErrorMessage) ?? "erreur de transcription" };
    if (event !== "transcription-content") return { kind: "ignored", reason: event || "no_event" };

    const speaker = speakerOfTrack(params.Track);
    if (!speaker) return { kind: "ignored", reason: "unknown_track" };

    let text: string | null = null;
    let confidence: number | null = null;
    try {
        const data = JSON.parse(params.TranscriptionData ?? "") as { transcript?: unknown; confidence?: unknown };
        text = str(data.transcript);
        confidence = typeof data.confidence === "number" && Number.isFinite(data.confidence) ? data.confidence : null;
    } catch {
        return { kind: "ignored", reason: "bad_data" };
    }
    if (!text) return { kind: "ignored", reason: "empty" };

    const seq = Number(params.SequenceId);
    const at = params.Timestamp ? new Date(params.Timestamp) : now;
    return {
        kind: "line",
        speaker,
        seq: Number.isFinite(seq) ? Math.trunc(seq) : 0,
        text: text.slice(0, 4000),
        confidence,
        at: Number.isNaN(at.getTime()) ? now : at,
        final: (params.Final ?? "true").toLowerCase() !== "false",
    };
}

export interface TranscriptLineLike {
    speaker: string;
    text: string;
}

/** Plain-text transcript, as stored on the Action (callTranscription). */
export function transcriptText(lines: TranscriptLineLike[], names: { sdr?: string; prospect?: string } = {}): string {
    const label = (s: string) => (s === "sdr" ? names.sdr || "SDR" : names.prospect || "Prospect");
    return lines.map((l) => `${label(l.speaker)} : ${l.text}`).join("\n");
}
