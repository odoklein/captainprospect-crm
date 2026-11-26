// ============================================
// LINE STATE — whether calls to the user's Twilio number ring in this browser,
// as the sidebar's avatar ring shows it. Pure: no DOM, safe to unit-test.
//
//   on         calls ring here                          (green ring)
//   paused     voicemail until a time, then on again    (amber arc draining)
//   voicemail  voicemail until the user turns it back   (amber ring)
//
// A pause is either chosen (press and hold the avatar: each quarter turn of
// the ring is 15 minutes) or taken by the CRM after two callbacks in a row
// rang out unanswered. Placing a call ends a pause: an SDR who dials is back.
// ============================================

export type PauseReason = "manual" | "missed";

export interface LinePause {
    /** Epoch ms. */
    from: number;
    until: number;
    reason: PauseReason;
}

export interface LineSettings {
    /** The user's « Recevoir les appels dans le CRM » switch. */
    receiveCalls: boolean;
    pause: LinePause | null;
}

export type LineMode = "on" | "paused" | "voicemail";

export interface LineStatus {
    mode: LineMode;
    /** paused only. */
    pause: LinePause | null;
    /** paused only: share of the pause still to run, 1 → 0 (the ring's amber arc). */
    remaining: number;
}

/** A pause that has run out is no pause. */
export function activePause(pause: LinePause | null, now: number): LinePause | null {
    return pause && pause.until > now ? pause : null;
}

export function lineStatus(settings: LineSettings, now: number): LineStatus {
    if (!settings.receiveCalls) return { mode: "voicemail", pause: null, remaining: 0 };
    const pause = activePause(settings.pause, now);
    if (!pause) return { mode: "on", pause: null, remaining: 0 };
    const total = Math.max(1, pause.until - pause.from);
    return { mode: "paused", pause, remaining: Math.min(1, Math.max(0, (pause.until - now) / total)) };
}

/** Calls ring in this browser only when the line is on. */
export function rings(settings: LineSettings, now: number): boolean {
    return lineStatus(settings, now).mode === "on";
}

// ── Press and hold ──────────────────────────────────────────────────────────

/** Below this, a press is a click (it opens the menu). */
export const HOLD_THRESHOLD_MS = 400;
/** Time for the ring to fill one quarter (15 minutes) once the hold has started. */
export const QUARTER_MS = 600;
export const QUARTER_MINUTES = 15;
export const MAX_QUARTERS = 4;

/** 0 → 1 over the four quarters, for drawing the ring while held. */
export function holdProgress(heldMs: number): number {
    if (heldMs < HOLD_THRESHOLD_MS) return 0;
    return Math.min(1, (heldMs - HOLD_THRESHOLD_MS) / (QUARTER_MS * MAX_QUARTERS));
}

/**
 * Minutes of pause a hold of `heldMs` chooses: null for a click, then the
 * quarter being filled (15, 30, 45 or 60) — so letting go just after the ring
 * starts to fill still gives 15 minutes.
 */
export function pauseMinutesForHold(heldMs: number): number | null {
    if (heldMs < HOLD_THRESHOLD_MS) return null;
    const quarters = Math.min(MAX_QUARTERS, Math.max(1, Math.ceil((heldMs - HOLD_THRESHOLD_MS) / QUARTER_MS)));
    return quarters * QUARTER_MINUTES;
}

// ── The CRM pausing on its own ──────────────────────────────────────────────

/** Callbacks in a row that rang out unanswered before the line pauses itself. */
export const MISSED_IN_A_ROW = 2;
export const MISSED_PAUSE_MINUTES = 30;

/** Shortest and longest pause the server accepts. */
export const PAUSE_MIN_MINUTES = 5;
export const PAUSE_MAX_MINUTES = 240;

export function clampPauseMinutes(minutes: number): number {
    if (!Number.isFinite(minutes)) return PAUSE_MIN_MINUTES;
    return Math.min(PAUSE_MAX_MINUTES, Math.max(PAUSE_MIN_MINUTES, Math.round(minutes)));
}

// ── Stored form (User.preferences.linePause) ────────────────────────────────

/** Reads what the server stored; anything malformed or over is no pause. */
export function parseStoredPause(raw: unknown, now: number): LinePause | null {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    const from = typeof o.from === "string" ? Date.parse(o.from) : NaN;
    const until = typeof o.until === "string" ? Date.parse(o.until) : NaN;
    if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from) return null;
    const reason: PauseReason = o.reason === "missed" ? "missed" : "manual";
    return activePause({ from, until, reason }, now);
}

export function storedPause(minutes: number, reason: PauseReason, now: number): { from: string; until: string; reason: PauseReason } {
    const m = clampPauseMinutes(minutes);
    return { from: new Date(now).toISOString(), until: new Date(now + m * 60_000).toISOString(), reason };
}

// ── Words ───────────────────────────────────────────────────────────────────

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** One line for the menu and the ring's label. */
export function describeLine(status: LineStatus): string {
    if (status.mode === "on") return "Les appels sonnent ici";
    if (status.mode === "voicemail") return "Messagerie : vos appelants tombent sur votre répondeur";
    const until = hhmm(status.pause!.until);
    return status.pause!.reason === "missed"
        ? `En pause jusqu'à ${until} : 2 appels sans réponse`
        : `En pause jusqu'à ${until}`;
}

export function pauseLabel(minutes: number): string {
    return minutes >= 60 ? `${minutes / 60} h` : `${minutes} min`;
}
