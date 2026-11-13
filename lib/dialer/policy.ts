// ============================================
// DIALER POLICY — how hard the dialer may push, per organisation. Pure.
//
// Stored in SystemConfig "dialer.policy" (JSON), with optional per-mission caps.
// Read through parseDialerPolicy(), which clamps every value to a code ceiling:
// a stored value can make the dialer more cautious, never bolder than below.
//
// Defaults are deliberately conservative until real traffic validates them:
// 2 lines, abandoned calls capped at 3 %, Mon–Fri 09:00–19:00 Paris.
// The legal frame (abandon-rate rules, calling hours, B2B vs B2C prospecting,
// consent for recording) must be confirmed for each market before raising them.
// ============================================

import { DateTime } from "luxon";

export const DIALER_POLICY_KEY = "dialer.policy";

export interface CallingWindow {
    /** ISO weekdays, 1 = Monday … 7 = Sunday. */
    days: number[];
    /** "HH:MM", Europe/Paris unless `timezone` says otherwise. */
    start: string;
    end: string;
}

export interface DialerPolicy {
    /** Organisation switch. The container flag DIALER_PARALLEL=on is also required. */
    parallelEnabled: boolean;
    maxLinesPerSdr: number;
    /** Per mission: lower caps only. */
    missionMaxLines: Record<string, number>;
    /** All ringing lines of the organisation together. */
    maxConcurrentOrg: number;
    ringTimeoutSec: number;
    amd: "async" | "off";
    amdTimeoutSec: number;
    uncertain: "bridge" | "release";
    /** Share of human answers left without an SDR, over the last `abandonSample` human answers. */
    maxAbandonRate: number;
    abandonSample: number;
    timezone: string;
    callingWindows: CallingWindow[];
    /** Attempts per prospect before automatic dialing stops proposing it. */
    maxAttemptsPerProspect: number;
    /** Outbound calls per caller id per day: protects the number's reputation. */
    maxDailyCallsPerNumber: number;
}

export const CEILINGS = {
    maxLinesPerSdr: 4,
    maxConcurrentOrg: 100,
    maxAbandonRate: 0.05,
    ringTimeoutSec: { min: 15, max: 40 },
    amdTimeoutSec: { min: 3, max: 10 },
    maxDailyCallsPerNumber: 400,
    maxAttemptsPerProspect: 15,
} as const;

export const DEFAULT_DIALER_POLICY: DialerPolicy = {
    parallelEnabled: false,
    maxLinesPerSdr: 2,
    missionMaxLines: {},
    maxConcurrentOrg: 20,
    ringTimeoutSec: 25,
    amd: "async",
    amdTimeoutSec: 6,
    uncertain: "bridge",
    maxAbandonRate: 0.03,
    abandonSample: 50,
    timezone: "Europe/Paris",
    callingWindows: [{ days: [1, 2, 3, 4, 5], start: "09:00", end: "19:00" }],
    maxAttemptsPerProspect: 8,
    maxDailyCallsPerNumber: 150,
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function int(v: unknown, min: number, max: number, fallback: number): number {
    return typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : fallback;
}

function windows(v: unknown): CallingWindow[] | null {
    if (!Array.isArray(v)) return null;
    const out = v
        .map((w) => (w && typeof w === "object" ? (w as Record<string, unknown>) : null))
        .filter((w): w is Record<string, unknown> => !!w)
        .map((w) => ({
            days: Array.isArray(w.days) ? [...new Set(w.days.filter((d): d is number => Number.isInteger(d) && d >= 1 && d <= 7))] : [],
            start: typeof w.start === "string" && HHMM.test(w.start) ? w.start : "",
            end: typeof w.end === "string" && HHMM.test(w.end) ? w.end : "",
        }))
        .filter((w) => w.days.length > 0 && w.start && w.end && w.start < w.end)
        .slice(0, 14);
    return out;
}

export function parseDialerPolicy(raw: string | null | undefined): DialerPolicy {
    const d = DEFAULT_DIALER_POLICY;
    if (!raw) return { ...d };
    let o: Record<string, unknown>;
    try {
        o = JSON.parse(raw) as Record<string, unknown>;
        if (!o || typeof o !== "object") return { ...d };
    } catch {
        return { ...d };
    }
    const maxLinesPerSdr = int(o.maxLinesPerSdr, 1, CEILINGS.maxLinesPerSdr, d.maxLinesPerSdr);
    const missionMaxLines: Record<string, number> = {};
    if (o.missionMaxLines && typeof o.missionMaxLines === "object") {
        for (const [k, v] of Object.entries(o.missionMaxLines as Record<string, unknown>).slice(0, 500)) {
            if (/^[A-Za-z0-9_-]{1,64}$/.test(k)) missionMaxLines[k] = int(v, 1, maxLinesPerSdr, maxLinesPerSdr);
        }
    }
    const abandon = typeof o.maxAbandonRate === "number" && Number.isFinite(o.maxAbandonRate) ? Math.max(0, Math.min(CEILINGS.maxAbandonRate, o.maxAbandonRate)) : d.maxAbandonRate;
    const parsedWindows = windows(o.callingWindows);
    return {
        parallelEnabled: o.parallelEnabled === true,
        maxLinesPerSdr,
        missionMaxLines,
        maxConcurrentOrg: int(o.maxConcurrentOrg, 1, CEILINGS.maxConcurrentOrg, d.maxConcurrentOrg),
        ringTimeoutSec: int(o.ringTimeoutSec, CEILINGS.ringTimeoutSec.min, CEILINGS.ringTimeoutSec.max, d.ringTimeoutSec),
        amd: o.amd === "off" ? "off" : "async",
        amdTimeoutSec: int(o.amdTimeoutSec, CEILINGS.amdTimeoutSec.min, CEILINGS.amdTimeoutSec.max, d.amdTimeoutSec),
        uncertain: o.uncertain === "release" ? "release" : "bridge",
        maxAbandonRate: abandon,
        abandonSample: int(o.abandonSample, 20, 500, d.abandonSample),
        timezone: typeof o.timezone === "string" && DateTime.local().setZone(o.timezone).isValid ? o.timezone : d.timezone,
        // An empty or invalid list never means « always »: it falls back to the default window.
        callingWindows: parsedWindows && parsedWindows.length > 0 ? parsedWindows : d.callingWindows,
        maxAttemptsPerProspect: int(o.maxAttemptsPerProspect, 1, CEILINGS.maxAttemptsPerProspect, d.maxAttemptsPerProspect),
        maxDailyCallsPerNumber: int(o.maxDailyCallsPerNumber, 10, CEILINGS.maxDailyCallsPerNumber, d.maxDailyCallsPerNumber),
    };
}

export function inCallingWindow(now: Date, policy: Pick<DialerPolicy, "timezone" | "callingWindows">): boolean {
    const local = DateTime.fromJSDate(now, { zone: policy.timezone });
    const hhmm = local.toFormat("HH:mm");
    return policy.callingWindows.some((w) => w.days.includes(local.weekday) && hhmm >= w.start && hhmm < w.end);
}

// ── adaptive line count ─────────────────────────────────────────────────────

export interface LineInputs {
    policy: DialerPolicy;
    missionId: string | null;
    agentState: string;
    sessionStatus: string;
    /** Lines of this session currently live (not ENDED). */
    liveLines: number;
    /** Live lines of the whole organisation. */
    orgLiveLines: number;
    /** Recent history of this SDR (or mission): attempts placed, human answers, abandoned. */
    recent: { attempts: number; humanAnswers: number; abandoned: number };
    now: Date;
}

export interface LineDecision {
    /** Target number of live lines. */
    target: number;
    /** New calls to place now (target − live, never negative). */
    toPlace: number;
    reason: string;
}

/** Pseudo-counts: a prior of ~20 % human answers until real data dominates. */
const PRIOR_ANSWERS = 1;
const PRIOR_ATTEMPTS = 5;
const MIN_ABANDON_SAMPLE = 10;

/**
 * How many lines should ring for this SDR. Dials only for an SDR who is READY:
 * no line ever rings while they talk or qualify, so two answers can never be
 * waiting for the same person by design, not only by the reservation lock.
 */
export function decideLines(i: LineInputs): LineDecision {
    const stop = (reason: string): LineDecision => ({ target: 0, toPlace: 0, reason });
    if (!i.policy.parallelEnabled) return stop("Mode parallèle désactivé pour l'organisation");
    if (i.sessionStatus !== "OPEN") return stop("Session en pause");
    if (i.agentState !== "READY") return stop("SDR indisponible");
    if (!inCallingWindow(i.now, i.policy)) return stop("Hors des plages d'appel autorisées");

    let cap = i.policy.maxLinesPerSdr;
    if (i.missionId && i.policy.missionMaxLines[i.missionId]) cap = Math.min(cap, i.policy.missionMaxLines[i.missionId]);

    let target: number;
    let reason: string;
    const { attempts, humanAnswers, abandoned } = i.recent;
    if (humanAnswers >= MIN_ABANDON_SAMPLE && abandoned / humanAnswers > i.policy.maxAbandonRate) {
        target = 1;
        reason = `Taux d'abandon ${Math.round((abandoned / humanAnswers) * 1000) / 10} % au-dessus du plafond : une seule ligne`;
    } else {
        const p = (humanAnswers + PRIOR_ANSWERS) / (attempts + PRIOR_ATTEMPTS);
        target = Math.max(1, Math.min(cap, Math.floor(1 / p)));
        reason = `${target} ligne${target > 1 ? "s" : ""} (taux de décroché estimé ${Math.round(p * 100)} %, plafond ${cap})`;
    }

    const orgHeadroom = Math.max(0, i.policy.maxConcurrentOrg - i.orgLiveLines);
    const toPlace = Math.max(0, Math.min(target - i.liveLines, orgHeadroom));
    if (toPlace === 0 && target > i.liveLines && orgHeadroom === 0) reason = "Capacité de l'organisation atteinte";
    return { target, toPlace, reason };
}
