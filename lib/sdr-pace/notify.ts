// When to pop a pace notification. Pure, so the anti-spam rules are testable.
//
// - never after each call: only when the status changes, or as an hourly check-in
// - a change is held back until MIN_CHANGE_GAP_MS after the last notification, so an
//   SDR hovering around a threshold (3 ↔ 4 calls behind) doesn't get a toast per call.
//   While held back the previous status stays the reference: if the SDR drifts back
//   to it, nothing is ever shown.

import type { PaceStatus } from "./pace";

export const MIN_CHANGE_GAP_MS = 15 * 60 * 1000;
export const HOURLY_INTERVAL_MS = 60 * 60 * 1000;

/** Last status the SDR was actually notified about (persisted per day by the client). */
export interface NotifyState {
  status: PaceStatus;
  at: number;
}

export type PaceNotification =
  | { kind: "CHANGE"; from: PaceStatus | null; to: PaceStatus }
  | { kind: "HOURLY"; status: PaceStatus };

export interface NotifyDecision {
  notification: PaceNotification | null;
  next: NotifyState | null;
}

export function decidePaceNotification(
  prev: NotifyState | null,
  current: PaceStatus,
  now: number,
): NotifyDecision {
  if (!prev) {
    // First reading of the day: stay quiet when all is well, say so when it isn't.
    return {
      notification: current === "ON_TRACK" ? null : { kind: "CHANGE", from: null, to: current },
      next: { status: current, at: now },
    };
  }

  const elapsed = now - prev.at;

  if (prev.status !== current) {
    if (elapsed < MIN_CHANGE_GAP_MS) return { notification: null, next: prev };
    return {
      notification: { kind: "CHANGE", from: prev.status, to: current },
      next: { status: current, at: now },
    };
  }

  if (elapsed >= HOURLY_INTERVAL_MS) {
    return { notification: { kind: "HOURLY", status: current }, next: { status: current, at: now } };
  }

  return { notification: null, next: prev };
}
