// ============================================
// DIALER — one attempt's state machine. Pure.
//
// Provider callbacks arrive late, twice, or out of order. fold() turns any event
// into a patch to apply with compare-and-set (store.casAttempt): the patch is only
// written if the row still holds the state it was computed from, so two handlers
// racing on the same attempt can never both « win » a transition — the loser
// re-reads and folds again. Rules:
//   • ENDED is terminal. A late event only fills facts still missing (AMD verdict).
//   • Live states only move forward: PENDING → DIALING → RINGING → ANSWERED → BRIDGING → CONNECTED.
//   • A call counts as a conversation ONLY once both legs are confirmed in the
//     conference (CONNECTED). Answered is not connected.
// ============================================

import type { DialAttemptState, DialOutcome } from "@prisma/client";

export type { DialAttemptState, DialOutcome };

export interface AttemptFacts {
    state: DialAttemptState;
    outcome: DialOutcome | null;
    callSid: string | null;
    answeredBy: string | null;
    placedAt: Date | null;
    ringingAt: Date | null;
    answeredAt: Date | null;
    detectedAt: Date | null;
    reservedAt: Date | null;
    bridgedAt: Date | null;
    endedAt: Date | null;
}

export type ProviderStatus = "queued" | "initiated" | "ringing" | "in-progress" | "answered" | "completed" | "busy" | "no-answer" | "failed" | "canceled";

export type AttemptEvent =
    | { type: "PLACED"; callSid: string; at: Date }
    | { type: "PROVIDER_STATUS"; status: ProviderStatus; at: Date; errorCode?: string | null }
    | { type: "AMD"; answeredBy: string; at: Date }
    | { type: "RESERVED"; at: Date }
    | { type: "BRIDGE_CONFIRMED"; at: Date }
    | { type: "RELEASE"; outcome: DialOutcome; at: Date };

export type AttemptPatch = Partial<AttemptFacts> & { errorCode?: string | null };

const RANK: Record<DialAttemptState, number> = { PENDING: 0, DIALING: 1, RINGING: 2, ANSWERED: 3, BRIDGING: 4, CONNECTED: 5, ENDED: 6 };

export const LIVE_STATES: DialAttemptState[] = ["PENDING", "DIALING", "RINGING", "ANSWERED", "BRIDGING", "CONNECTED"];

export function isLive(state: DialAttemptState): boolean {
    return state !== "ENDED";
}

export function parseProviderStatus(raw: string | null | undefined): ProviderStatus | null {
    const v = (raw ?? "").trim().toLowerCase();
    const all: ProviderStatus[] = ["queued", "initiated", "ringing", "in-progress", "answered", "completed", "busy", "no-answer", "failed", "canceled"];
    return (all as string[]).includes(v) ? (v as ProviderStatus) : null;
}

export type Classification = "human" | "machine" | "fax" | "unknown";

/** Twilio AnsweredBy → what we can act on. Anything unexpected is « unknown », never « human ». */
export function classifyAnsweredBy(raw: string | null | undefined): Classification {
    const v = (raw ?? "").trim().toLowerCase();
    if (v === "human") return "human";
    if (v === "fax") return "fax";
    if (v.startsWith("machine_")) return "machine";
    return "unknown";
}

/** Outcome of a call that was answered but never bridged, from what detection said. */
function unbridgedOutcome(answeredBy: string | null): DialOutcome {
    switch (classifyAnsweredBy(answeredBy)) {
        case "machine":
            return "VOICEMAIL";
        case "fax":
            return "MACHINE_OTHER";
        default:
            // A person (or possibly one) picked up and nobody took the call: that is an abandoned call.
            return "ABANDONED";
    }
}

function moveTo(f: AttemptFacts, state: DialAttemptState): boolean {
    return RANK[state] > RANK[f.state];
}

/** The patch this event produces, or null when it changes nothing (duplicate, late, or out of order). */
export function fold(f: AttemptFacts, e: AttemptEvent): AttemptPatch | null {
    if (f.state === "ENDED") {
        // Terminal. A late detection verdict is still worth keeping (detection-precision metrics).
        if (e.type === "AMD" && !f.answeredBy) return { answeredBy: e.answeredBy, detectedAt: e.at };
        if (e.type === "PLACED" && !f.callSid) return { callSid: e.callSid };
        return null;
    }

    switch (e.type) {
        case "PLACED":
            if (f.callSid && f.callSid !== e.callSid) return null;
            return moveTo(f, "DIALING") ? { state: "DIALING", callSid: e.callSid, placedAt: f.placedAt ?? e.at } : f.callSid ? null : { callSid: e.callSid };

        case "AMD":
            if (f.answeredBy) return null;
            // A verdict before the "answered" status (out of order) means it was answered.
            if (RANK[f.state] < RANK.ANSWERED) return { state: "ANSWERED", answeredAt: f.answeredAt ?? e.at, answeredBy: e.answeredBy, detectedAt: e.at };
            return { answeredBy: e.answeredBy, detectedAt: e.at };

        case "RESERVED":
            return f.state === "ANSWERED" ? { state: "BRIDGING", reservedAt: e.at } : null;

        case "BRIDGE_CONFIRMED":
            return f.state === "BRIDGING" ? { state: "CONNECTED", bridgedAt: e.at } : null;

        case "RELEASE":
            return { state: "ENDED", outcome: f.state === "CONNECTED" ? "CONVERSATION" : e.outcome, endedAt: e.at };

        case "PROVIDER_STATUS": {
            const end = (outcome: DialOutcome): AttemptPatch => ({ state: "ENDED", outcome, endedAt: e.at, ...(e.errorCode ? { errorCode: e.errorCode } : {}) });
            switch (e.status) {
                case "queued":
                case "initiated":
                    return moveTo(f, "DIALING") ? { state: "DIALING", placedAt: f.placedAt ?? e.at } : null;
                case "ringing":
                    return moveTo(f, "RINGING") ? { state: "RINGING", ringingAt: e.at } : null;
                case "in-progress":
                case "answered":
                    return moveTo(f, "ANSWERED") ? { state: "ANSWERED", answeredAt: e.at } : null;
                case "completed":
                    if (f.state === "CONNECTED") return end("CONVERSATION");
                    if (f.state === "BRIDGING") return end("ABANDONED"); // hung up during the bridge
                    if (f.state === "ANSWERED") return end(unbridgedOutcome(f.answeredBy));
                    return end("NO_ANSWER");
                case "busy":
                    return end("BUSY");
                case "no-answer":
                    return end("NO_ANSWER");
                case "failed":
                    return end("FAILED");
                case "canceled":
                    return end("CANCELED_SESSION");
            }
        }
    }
}

export function applyPatch(f: AttemptFacts, p: AttemptPatch): AttemptFacts {
    const facts: AttemptPatch = { ...p };
    delete facts.errorCode;
    return { ...f, ...facts } as AttemptFacts;
}

// ── routing an answered call ────────────────────────────────────────────────

export interface RoutingPolicy {
    /** async: wait for the machine-detection verdict · off: bridge on answer. */
    amd: "async" | "off";
    /** What to do when detection cannot tell. */
    uncertain: "bridge" | "release";
}

export type Route =
    | { action: "WAIT" } // answered, verdict not in yet
    | { action: "BRIDGE" }
    | { action: "RELEASE"; outcome: DialOutcome };

/**
 * Decides once an attempt is ANSWERED. The SDR availability is only a hint here:
 * the real decision is the atomic reservation (store.reserveAgent). A BRIDGE whose
 * reservation fails becomes RELEASE ABANDONED.
 *
 * Machine detection is probabilistic: « unknown » is common (short greetings,
 * noisy lines), and a real person can be classified as a machine. Defaulting
 * « unknown » to BRIDGE wastes a few seconds of the SDR's time at worst;
 * releasing would hang up on whoever said « allô ».
 */
export function routeAnswered(f: Pick<AttemptFacts, "state" | "answeredBy">, policy: RoutingPolicy, agentFree: boolean): Route | null {
    if (f.state !== "ANSWERED") return null;
    if (policy.amd === "async" && !f.answeredBy) return { action: "WAIT" };
    const kind = policy.amd === "off" ? "unknown" : classifyAnsweredBy(f.answeredBy);
    if (kind === "machine") return { action: "RELEASE", outcome: "VOICEMAIL" };
    if (kind === "fax") return { action: "RELEASE", outcome: "MACHINE_OTHER" };
    if (kind === "unknown" && policy.uncertain === "release") return { action: "RELEASE", outcome: "UNCERTAIN_RELEASED" };
    return agentFree ? { action: "BRIDGE" } : { action: "RELEASE", outcome: "ABANDONED" };
}

// ── timeouts (the sweeper's safety net for lost callbacks) ──────────────────

export interface TimeoutPolicy {
    ringTimeoutSec: number;
    /** How long a verdict may take once answered before we act without it. */
    amdTimeoutSec: number;
}

export type TimeoutAction =
    | { action: "RELEASE"; outcome: DialOutcome; hangup: boolean }
    | { action: "TREAT_AS_UNKNOWN" }; // answered, no verdict: route as « unknown »

const GRACE_SEC = 15;

export function timeoutFor(f: AttemptFacts & { createdAt: Date }, now: Date, p: TimeoutPolicy): TimeoutAction | null {
    const age = (d: Date | null) => (d ? (now.getTime() - d.getTime()) / 1000 : 0);
    switch (f.state) {
        case "PENDING":
            return age(f.createdAt) > 30 ? { action: "RELEASE", outcome: "FAILED", hangup: false } : null;
        case "DIALING":
        case "RINGING":
            return age(f.placedAt ?? f.createdAt) > p.ringTimeoutSec + GRACE_SEC ? { action: "RELEASE", outcome: "TIMEOUT", hangup: true } : null;
        case "ANSWERED":
            if (!f.answeredBy && age(f.answeredAt) > p.amdTimeoutSec) return { action: "TREAT_AS_UNKNOWN" };
            return age(f.answeredAt) > p.amdTimeoutSec + GRACE_SEC ? { action: "RELEASE", outcome: "ABANDONED", hangup: true } : null;
        case "BRIDGING":
            return age(f.reservedAt) > GRACE_SEC ? { action: "RELEASE", outcome: "ABANDONED", hangup: true } : null;
        default:
            return null;
    }
}
