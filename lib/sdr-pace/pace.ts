// Pure pace rules for the SDR "rythme d'appels" indicator — no DB, no clock
// access, so they can be unit-tested directly (npm run test:sdr-pace).
//
// Idea: the daily quota (70 calls) is meant for ~6 h of *effective* calling, not
// for the wall clock. So "where should the SDR be right now" is the quota times
// the share of their planned calling time that has effectively elapsed — lunch,
// gaps between planning blocks and detected pauses/meetings don't count.

export const PACE_DEFAULTS = { dailyQuota: 70, targetHours: 6 } as const;

/** Bounds enforced by the manager settings API. */
export const PACE_LIMITS = {
  dailyQuota: { min: 1, max: 500 },
  targetHours: { min: 1, max: 12 },
} as const;

/** Calls behind the expected count: 0–3 on track, 4–8 to catch up, 9+ late. */
export const PACE_THRESHOLDS = { behindFrom: 4, lateFrom: 9 } as const;

// ============================================
// Effective time
// ============================================

/** Minutes since midnight, Paris time. */
export interface Interval {
  start: number;
  end: number;
}

/** Used when the SDR has no planning block today — matches the usual 09:00–17:00 block. */
export const DEFAULT_WINDOW: Interval = { start: 9 * 60, end: 17 * 60 };
/** Observed call gap in the data (almost no call between 12:30 and 13:30). */
export const LUNCH_BREAK: Interval = { start: 12 * 60 + 30, end: 13 * 60 + 30 };
/** 09:00–17:00 minus lunch: a "full" day. Shorter plannings get a prorated quota. */
export const FULL_DAY_CALLING_MINUTES = 7 * 60;
/** A silence of at least this long between two calls is read as a pause or meeting. */
export const PAUSE_GAP_MINUTES = 30;
/** …but at most this much of it is forgiven per day, so slow calling can't hide as "pauses". */
export const MAX_FORGIVEN_PAUSE_MINUTES = 90;

function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

function subtractInterval(list: Interval[], cut: Interval): Interval[] {
  const out: Interval[] = [];
  for (const i of list) {
    if (cut.end <= i.start || cut.start >= i.end) {
      out.push(i);
      continue;
    }
    if (cut.start > i.start) out.push({ start: i.start, end: cut.start });
    if (cut.end < i.end) out.push({ start: cut.end, end: i.end });
  }
  return out;
}

function totalMinutes(list: Interval[], upTo = Infinity): number {
  return list.reduce((sum, i) => sum + Math.max(0, Math.min(i.end, upTo) - i.start), 0);
}

function overlapMinutes(list: Interval[], other: Interval, upTo: number): number {
  return list.reduce((sum, i) => {
    const start = Math.max(i.start, other.start);
    const end = Math.min(i.end, other.end, upTo);
    return sum + Math.max(0, end - start);
  }, 0);
}

export interface EffectiveTimeInput {
  /** Today's planning blocks; empty → DEFAULT_WINDOW. */
  blocks: Interval[];
  /** Minute of the day of each call made today (any order). */
  callMinutes: number[];
  nowMinute: number;
}

export interface EffectiveTime {
  /** Calling time planned for the whole day (blocks minus lunch). */
  plannedMinutes: number;
  /** Planned calling time elapsed so far, minus forgiven pauses. */
  elapsedMinutes: number;
  forgivenPauseMinutes: number;
  /** Whether "now" falls inside planned calling time (false at lunch / outside hours). */
  isCallingTime: boolean;
}

export function computeEffectiveTime(input: EffectiveTimeInput): EffectiveTime {
  const base = input.blocks.length > 0 ? input.blocks : [DEFAULT_WINDOW];
  const planned = subtractInterval(mergeIntervals(base), LUNCH_BREAK);
  const plannedMinutes = totalMinutes(planned);

  // Only gaps that ended with another call count: the silence running right now
  // is not forgiven, it's exactly what the indicator is there to flag.
  const calls = [...input.callMinutes].filter((m) => m <= input.nowMinute).sort((a, b) => a - b);
  let pauseMinutes = 0;
  for (let i = 1; i < calls.length; i++) {
    if (calls[i] - calls[i - 1] >= PAUSE_GAP_MINUTES) {
      pauseMinutes += overlapMinutes(planned, { start: calls[i - 1], end: calls[i] }, input.nowMinute);
    }
  }
  const forgivenPauseMinutes = Math.min(pauseMinutes, MAX_FORGIVEN_PAUSE_MINUTES);

  const elapsedPlanned = totalMinutes(planned, input.nowMinute);
  return {
    plannedMinutes,
    elapsedMinutes: Math.max(0, elapsedPlanned - forgivenPauseMinutes),
    forgivenPauseMinutes,
    isCallingTime: planned.some((i) => input.nowMinute >= i.start && input.nowMinute < i.end),
  };
}

// ============================================
// Status
// ============================================

export type PaceStatus = "ON_TRACK" | "BEHIND" | "LATE";

export const PACE_STATUS_COPY: Record<
  PaceStatus,
  { /** status badge */ badge: string; /** tone of the coaching line */ emoji: string; label: string; message: string }
> = {
  ON_TRACK: {
    badge: "✅",
    emoji: "😎",
    label: "Dans le rythme",
    message: "Tu es pile dans le rythme. Pas le moment de lever le pied, continue à envoyer.",
  },
  BEHIND: {
    badge: "🟠",
    emoji: "👀",
    label: "À rattraper",
    message: "Petit retard au compteur. Rien de dramatique, mais remets un peu de gaz maintenant.",
  },
  LATE: {
    badge: "🔴",
    emoji: "📞",
    label: "En retard",
    message: "Mode rattrapage. On se concentre et on rattrape vite !",
  },
};

export const GOAL_REACHED_MESSAGE = "Objectif du jour atteint, bravo ! Chaque appel en plus est du bonus.";

/** The coaching line for a result; once the quota is met, says so instead of "keep going". */
export function paceHeadline(p: Pick<PaceResult, "status" | "goalReached">): { emoji: string; text: string } {
  if (p.goalReached) return { emoji: "🎯", text: GOAL_REACHED_MESSAGE };
  const copy = PACE_STATUS_COPY[p.status];
  return { emoji: copy.emoji, text: copy.message };
}

export function statusForBehind(behindBy: number): PaceStatus {
  if (behindBy >= PACE_THRESHOLDS.lateFrom) return "LATE";
  if (behindBy >= PACE_THRESHOLDS.behindFrom) return "BEHIND";
  return "ON_TRACK";
}

export interface PaceInput {
  callsDone: number;
  dailyQuota: number;
  targetHours: number;
  time: Pick<EffectiveTime, "plannedMinutes" | "elapsedMinutes">;
}

export interface PaceResult {
  status: PaceStatus;
  callsDone: number;
  /** Quota for today — the configured quota, prorated when less than a full day is planned. */
  dayQuota: number;
  /** Cumulative calls expected at this point of the effective calling time. */
  expected: number;
  /** expected − callsDone: > 0 behind, < 0 ahead. */
  delta: number;
  behindBy: number;
  aheadBy: number;
  goalReached: boolean;
  /** Share of today's planned calling time that has effectively elapsed, 0–1. */
  progress: number;
  effectiveHoursElapsed: number;
  effectiveHoursTarget: number;
  /** Configured rhythm, e.g. 70 / 6 = 11.67 calls per hour. */
  callsPerHour: number;
}

export function computePace(input: PaceInput): PaceResult {
  const { callsDone, dailyQuota, targetHours, time } = input;

  const dayShare = Math.min(1, time.plannedMinutes / FULL_DAY_CALLING_MINUTES);
  const dayQuota = Math.max(1, Math.round(dailyQuota * dayShare));
  const progress = time.plannedMinutes > 0 ? Math.min(1, time.elapsedMinutes / time.plannedMinutes) : 0;
  // Rounded up: that's how the checkpoints in the brief read (2 h → 24, 5 h → 59).
  // The epsilon keeps float noise (35.000000000000007) from tipping a whole number up.
  const expected = Math.max(0, Math.ceil(dayQuota * progress - 1e-9));
  const delta = expected - callsDone;
  const behindBy = Math.max(0, delta);
  const effectiveHoursTarget = targetHours * dayShare;

  return {
    status: statusForBehind(behindBy),
    callsDone,
    dayQuota,
    expected,
    delta,
    behindBy,
    aheadBy: Math.max(0, -delta),
    goalReached: callsDone >= dayQuota,
    progress,
    effectiveHoursElapsed: effectiveHoursTarget * progress,
    effectiveHoursTarget,
    callsPerHour: dailyQuota / targetHours,
  };
}

// ============================================
// Display helpers
// ============================================

/** "31 / 70 appels · Objectif à ce stade : 35 · Retard : 4 appels" */
export function formatPaceSummary(p: Pick<PaceResult, "callsDone" | "dayQuota" | "expected" | "delta">): string {
  const gap =
    p.delta > 0
      ? `Retard : ${p.delta} appel${p.delta > 1 ? "s" : ""}`
      : p.delta < 0
      ? `Avance : ${-p.delta} appel${-p.delta > 1 ? "s" : ""}`
      : "Écart : 0 appel";
  return `${p.callsDone} / ${p.dayQuota} appels · Objectif à ce stade : ${p.expected} · ${gap}`;
}

/** 2.5 → "2h30" */
export function formatHours(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}
