// ============================================
// Where the line's pause is stored: one key of User.preferences (shared JSON:
// notifications, appearance…), written by PUT /api/telephony/prefs and read by
// /api/telephony/prefs and /api/telephony/config. Rules in ./line-state.
// ============================================

import type { Prisma } from "@prisma/client";
import { parseStoredPause, storedPause, type PauseReason } from "./line-state";

const PAUSE_KEY = "linePause";

function preferencesOf(raw: Prisma.JsonValue | null | undefined): Record<string, unknown> {
    return raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
}

/** The pause as the client reads it (epoch ms), or null when none is running. */
export function pauseView(raw: Prisma.JsonValue | null | undefined, now = Date.now()) {
    const p = parseStoredPause(preferencesOf(raw)[PAUSE_KEY], now);
    return p ? { from: p.from, until: p.until, reason: p.reason } : null;
}

/** The preferences with the pause set (or removed, for null), the other keys untouched. */
export function withPause(
    raw: Prisma.JsonValue | null | undefined,
    pause: { minutes: number; reason: PauseReason } | null,
    now = Date.now(),
): Prisma.InputJsonValue {
    const next = preferencesOf(raw);
    if (pause) next[PAUSE_KEY] = storedPause(pause.minutes, pause.reason, now);
    else delete next[PAUSE_KEY];
    return next as Prisma.InputJsonValue;
}
