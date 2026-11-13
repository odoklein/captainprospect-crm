// ============================================
// DIALER ORCHESTRATOR — server-authoritative parallel dialing.
//
// The browser never decides who is dialled or bridged: it only joins its
// session's conference, sends heartbeats and says « ready » after qualifying.
// Everything else is driven by signed provider callbacks and the sweeper:
//
//   pump()            SDR READY → place the missing lines (queue-backed candidates)
//   onAnswered/onAmd  fold the event; route ONLY if it changed the attempt
//   bridge()          reserve the SDR atomically → redirect that call into the
//                     conference → release every sibling
//   onConferenceJoin  prospect in the conference = CONNECTED (a real conversation)
//   settle()          any attempt reaching ENDED: free or wrap up the SDR, log, pump
//   sweep()           timeouts, lost heartbeats, orphan reservations
//
// Every function is safe to call twice with the same input.
// ============================================

import type { DialerPolicy } from "./policy";
import { decideLines } from "./policy";
import { routeAnswered, timeoutFor, type AttemptEvent, type DialOutcome, type ProviderStatus } from "./attempt-state";
import {
    allLiveAttempts, applyAttemptEvent, attemptedTargets, claimAgentLeg, dialsFromNumberSince, getAttempt, getAttemptBySid, getSession,
    insertAttempt, liveAttempts, orgLiveLines, orphanReservations, recentStats, reserveAgent, setAgentState, setAttemptTelephonyCall,
    setSessionStatus, staleSessions, type Applied, type AttemptRow, type SessionRow, type SqlDb,
} from "./store";
import type { TwilioCalls } from "./twilio-rest";
import { abandonTwiml, bridgeTwiml } from "./twiml";

export interface Candidate {
    contactId: string | null;
    companyId: string | null;
    campaignId: string | null;
    /** E.164, already validated against the allowed countries. */
    toNumber: string;
    selection: { score: number; headline: string };
}

export interface DialerDeps {
    db: SqlDb;
    twilio: TwilioCalls;
    policy: DialerPolicy;
    now: () => Date;
    /** Absolute callback URLs (signed by Twilio against them). */
    urls: {
        answer: (attemptId: string) => string;
        status: (attemptId: string) => string;
        amd: (attemptId: string) => string;
        recording: (telephonyCallId: string) => string;
    };
    callerId: (sdrId: string) => Promise<string | null>;
    /** Eligible prospects, best first, from the File d'actions (never re-implemented here). */
    candidates: (session: SessionRow, limit: number, exclude: Set<string>) => Promise<Candidate[]>;
    /** Runs `fn` only if no other pump of this session holds the lock; null when busy. */
    lock: <T>(sessionId: string, fn: () => Promise<T>) => Promise<T | null>;
    /** Opens the TelephonyCall row of a bridged call (transcript, recording, AI summary). */
    onConnected: (attempt: AttemptRow) => Promise<string | null>;
    /** Mirrors a final outcome into the call log / CRM (TelephonyCall status, automatic NRP…). */
    onEnded: (attempt: AttemptRow) => Promise<void>;
    record: boolean;
    /** The prospect hears the recording notice before the bridge. */
    notice: boolean;
    brand: string;
    log?: (event: string, data: Record<string, unknown>) => void;
}

const NUMBER_WINDOW_MS = 24 * 3600_000;
const RETRY_WINDOW_MS = 24 * 3600_000;
const HEARTBEAT_STALE_MS = 60_000;

const log = (d: DialerDeps, event: string, data: Record<string, unknown>) => d.log?.(event, data);

// ── placing lines ───────────────────────────────────────────────────────────

export interface PumpResult {
    placed: number;
    target: number;
    reason: string;
}

export async function pump(d: DialerDeps, sessionId: string): Promise<PumpResult> {
    const prepared = await d.lock(sessionId, async () => {
        const session = await getSession(d.db, sessionId);
        if (!session) return { rows: [] as AttemptRow[], decision: { target: 0, toPlace: 0, reason: "Session introuvable" } };
        const [live, orgLive, recent] = await Promise.all([
            liveAttempts(d.db, sessionId),
            orgLiveLines(d.db),
            recentStats(d.db, session.sdrId, d.policy.abandonSample),
        ]);
        const decision = decideLines({
            policy: { ...d.policy, maxLinesPerSdr: Math.min(d.policy.maxLinesPerSdr, session.maxLines) },
            missionId: session.missionId,
            agentState: session.agentState,
            sessionStatus: session.status,
            liveLines: live.length,
            orgLiveLines: orgLive,
            recent,
            now: d.now(),
        });
        if (decision.toPlace === 0) return { rows: [] as AttemptRow[], decision };

        const fromNumber = await d.callerId(session.sdrId);
        if (!fromNumber) return { rows: [], decision: { ...decision, toPlace: 0, reason: "Aucun numéro Twilio attribué" } };
        const used = await dialsFromNumberSince(d.db, fromNumber, new Date(d.now().getTime() - NUMBER_WINDOW_MS));
        if (used >= d.policy.maxDailyCallsPerNumber) {
            return { rows: [], decision: { ...decision, toPlace: 0, reason: `Quota quotidien du numéro atteint (${used} appels) : réputation protégée` } };
        }

        const exclude = await attemptedTargets(d.db, session.sdrId, new Date(d.now().getTime() - RETRY_WINDOW_MS));
        const pool = await d.candidates(session, decision.toPlace * 3, exclude);
        const rows: AttemptRow[] = [];
        for (const c of pool) {
            if (rows.length >= decision.toPlace) break;
            const key = c.contactId ?? c.companyId;
            if (key && exclude.has(key)) continue;
            // Null: this number is already ringing somewhere (another SDR, another session).
            const id = await insertAttempt(d.db, { sessionId, sdrId: session.sdrId, contactId: c.contactId, companyId: c.companyId, campaignId: c.campaignId, toNumber: c.toNumber, fromNumber, selection: c.selection });
            if (!id) continue;
            const row = await getAttempt(d.db, id);
            if (row) rows.push(row);
        }
        const reason = rows.length === 0 && decision.toPlace > 0 ? "Aucun prospect éligible à l'appel automatique" : decision.reason;
        return { rows, decision: { ...decision, reason } };
    });
    if (!prepared) return { placed: 0, target: 0, reason: "Déjà en cours" };

    let placed = 0;
    for (const row of prepared.rows) {
        // The SDR may have been reserved by an answer while we were preparing: do not ring for nobody.
        const session = await getSession(d.db, sessionId);
        if (!session || session.status !== "OPEN" || session.agentState !== "READY") {
            await release(d, row.id, "CANCELED_SESSION");
            continue;
        }
        try {
            const { sid } = await d.twilio.createCall({
                to: row.toNumber,
                from: row.fromNumber,
                answerUrl: d.urls.answer(row.id),
                statusCallback: d.urls.status(row.id),
                amdCallback: d.policy.amd === "async" ? d.urls.amd(row.id) : null,
                ringTimeoutSec: d.policy.ringTimeoutSec,
                amdTimeoutSec: d.policy.amdTimeoutSec,
            });
            await applyAttemptEvent(d.db, row.id, { type: "PLACED", callSid: sid, at: d.now() });
            placed++;
        } catch (err) {
            log(d, "dialer.place_failed", { attemptId: row.id, error: String(err) });
            const applied = await applyAttemptEvent(d.db, row.id, { type: "PROVIDER_STATUS", status: "failed", at: d.now(), errorCode: err instanceof Error ? err.message.slice(0, 120) : "provider_error" });
            if (applied?.changed) await d.onEnded(applied.after);
        }
    }
    return { placed, target: prepared.decision.target, reason: prepared.decision.reason };
}

// ── provider events ─────────────────────────────────────────────────────────

/** Call status callback of a prospect leg. */
export async function onStatus(d: DialerDeps, attemptId: string, status: ProviderStatus, errorCode: string | null = null): Promise<void> {
    const applied = await applyAttemptEvent(d.db, attemptId, { type: "PROVIDER_STATUS", status, at: d.now(), errorCode });
    if (!applied?.changed) return;
    if (applied.after.state === "ANSWERED" && applied.before.state !== "ANSWERED") await route(d, attemptId);
    if (applied.after.state === "ENDED") await settle(d, applied);
}

/** Async machine-detection verdict. */
export async function onAmd(d: DialerDeps, attemptId: string, answeredBy: string): Promise<void> {
    const applied = await applyAttemptEvent(d.db, attemptId, { type: "AMD", answeredBy, at: d.now() });
    if (applied?.changed && applied.after.state === "ANSWERED") await route(d, attemptId);
}

async function route(d: DialerDeps, attemptId: string): Promise<void> {
    const attempt = await getAttempt(d.db, attemptId);
    if (!attempt) return;
    const session = await getSession(d.db, attempt.sessionId);
    const agentFree = Boolean(session && session.status !== "ENDED" && session.agentState === "READY");
    const r = routeAnswered(attempt, d.policy, agentFree);
    if (!r || r.action === "WAIT") return;
    if (r.action === "RELEASE") return void (await release(d, attemptId, r.outcome));
    await bridge(d, attempt);
}

/** The heart of parallel mode. */
async function bridge(d: DialerDeps, attempt: AttemptRow): Promise<void> {
    if (!(await reserveAgent(d.db, attempt.sessionId, attempt.id))) {
        log(d, "dialer.reservation_lost", { attemptId: attempt.id });
        return void (await release(d, attempt.id, "ABANDONED"));
    }
    const reserved = await applyAttemptEvent(d.db, attempt.id, { type: "RESERVED", at: d.now() });
    if (!reserved?.changed) {
        // The prospect hung up between the verdict and the reservation.
        await setAgentState(d.db, attempt.sessionId, ["RESERVED"], "READY", { attemptId: attempt.id });
        return void (await pump(d, attempt.sessionId));
    }
    const session = await getSession(d.db, attempt.sessionId);
    try {
        if (!session || !attempt.callSid) throw new Error("session or call missing");
        await d.twilio.redirectCall(attempt.callSid, bridgeTwiml(session.conferenceName, d.notice));
    } catch (err) {
        log(d, "dialer.bridge_failed", { attemptId: attempt.id, error: String(err) });
        await release(d, attempt.id, "ABANDONED");
        return;
    }
    // Siblings: one conversation per SDR. A sibling someone already answered hears who called.
    for (const s of await liveAttempts(d.db, attempt.sessionId)) {
        if (s.id === attempt.id) continue;
        const answered = s.state === "ANSWERED" || s.state === "BRIDGING";
        await release(d, s.id, answered ? "ABANDONED" : "CANCELED_SIBLING");
    }
}

/** Ends an attempt by our decision (hangs the line up), then settles it. */
export async function release(d: DialerDeps, attemptId: string, outcome: DialOutcome): Promise<void> {
    const applied = await applyAttemptEvent(d.db, attemptId, { type: "RELEASE", outcome, at: d.now() });
    if (!applied?.changed) return;
    const sid = applied.before.callSid;
    if (sid) {
        const answered = ["ANSWERED", "BRIDGING", "CONNECTED"].includes(applied.before.state);
        try {
            if (outcome === "ABANDONED" && answered) await d.twilio.redirectCall(sid, abandonTwiml(d.brand));
            else await d.twilio.endCall(sid, answered);
        } catch (err) {
            // The sweeper and the provider's own ring timeout close it anyway; never fail the release.
            log(d, "dialer.hangup_failed", { attemptId, error: String(err) });
        }
    }
    await settle(d, applied);
}

/** An attempt has just ENDED (exactly one caller gets here per attempt). */
async function settle(d: DialerDeps, applied: Applied): Promise<void> {
    const a = applied.after;
    if (a.outcome === "CONVERSATION") {
        await setAgentState(d.db, a.sessionId, ["ON_CALL", "RESERVED"], "WRAP_UP", { attemptId: a.id });
    } else {
        // The SDR was reserved for this call but it never became a conversation: free them.
        await setAgentState(d.db, a.sessionId, ["RESERVED", "ON_CALL"], "READY", { attemptId: a.id });
    }
    try {
        await d.onEnded(a);
    } catch (err) {
        log(d, "dialer.on_ended_failed", { attemptId: a.id, error: String(err) });
    }
    await pump(d, a.sessionId);
}

// ── conference events ───────────────────────────────────────────────────────

export async function onConferenceJoin(d: DialerDeps, sessionId: string, callSid: string): Promise<void> {
    const session = await getSession(d.db, sessionId);
    if (!session || session.status === "ENDED") return;
    if (session.agentCallSid === callSid) {
        if (await setAgentState(d.db, sessionId, ["JOINING", "OFFLINE"], "READY")) await pump(d, sessionId);
        return;
    }
    const attempt = await getAttemptBySid(d.db, callSid);
    if (!attempt || attempt.sessionId !== sessionId) return;
    const applied = await applyAttemptEvent(d.db, attempt.id, { type: "BRIDGE_CONFIRMED", at: d.now() });
    if (!applied?.changed) return;
    await setAgentState(d.db, sessionId, ["RESERVED"], "ON_CALL", { attemptId: attempt.id });
    const telephonyCallId = await d.onConnected(applied.after);
    if (telephonyCallId) {
        await setAttemptTelephonyCall(d.db, attempt.id, telephonyCallId);
        if (d.record) {
            await d.twilio.startRecording(callSid, d.urls.recording(telephonyCallId)).catch((err) => log(d, "dialer.recording_failed", { attemptId: attempt.id, error: String(err) }));
        }
    }
}

export async function onConferenceLeave(d: DialerDeps, sessionId: string, callSid: string): Promise<void> {
    const session = await getSession(d.db, sessionId);
    if (session?.agentCallSid === callSid) await endSession(d, sessionId, "agent_left");
}

export async function onAgentLeg(d: DialerDeps, sessionId: string, agentCallSid: string): Promise<boolean> {
    return claimAgentLeg(d.db, sessionId, agentCallSid);
}

// ── SDR controls ────────────────────────────────────────────────────────────

/** The SDR hangs up on the prospect but stays in the session (the conference lives on). */
export async function hangupCurrent(d: DialerDeps, sessionId: string): Promise<boolean> {
    const session = await getSession(d.db, sessionId);
    if (!session?.reservedAttemptId) return false;
    const a = await getAttempt(d.db, session.reservedAttemptId);
    if (!a?.callSid || a.state !== "CONNECTED") return false;
    // The provider's "completed" callback then settles it as a conversation → WRAP_UP.
    await d.twilio.endCall(a.callSid, true);
    return true;
}

export async function agentReady(d: DialerDeps, sessionId: string): Promise<boolean> {
    const ok = await setAgentState(d.db, sessionId, ["WRAP_UP"], "READY");
    if (ok) await pump(d, sessionId);
    return ok;
}

/** Pause: nothing new rings and every line not yet answered stops ringing. A live conversation is left alone. */
export async function pauseSession(d: DialerDeps, sessionId: string): Promise<boolean> {
    const ok = await setSessionStatus(d.db, sessionId, ["OPEN"], "PAUSED");
    if (ok) for (const a of await liveAttempts(d.db, sessionId)) if (["PENDING", "DIALING", "RINGING"].includes(a.state)) await release(d, a.id, "CANCELED_SESSION");
    return ok;
}

export async function resumeSession(d: DialerDeps, sessionId: string): Promise<boolean> {
    const ok = await setSessionStatus(d.db, sessionId, ["PAUSED"], "OPEN");
    if (ok) await pump(d, sessionId);
    return ok;
}

export async function endSession(d: DialerDeps, sessionId: string, reason: string): Promise<boolean> {
    const ok = await setSessionStatus(d.db, sessionId, ["OPEN", "PAUSED"], "ENDED", reason);
    if (!ok) return false;
    for (const a of await liveAttempts(d.db, sessionId)) if (a.state !== "CONNECTED") await release(d, a.id, a.state === "ANSWERED" || a.state === "BRIDGING" ? "ABANDONED" : "CANCELED_SESSION");
    log(d, "dialer.session_ended", { sessionId, reason });
    return true;
}

// ── sweeper ─────────────────────────────────────────────────────────────────

export interface SweepReport {
    timedOut: number;
    unknownRouted: number;
    sessionsEnded: number;
    reservationsFreed: number;
}

export async function sweep(d: DialerDeps): Promise<SweepReport> {
    const report: SweepReport = { timedOut: 0, unknownRouted: 0, sessionsEnded: 0, reservationsFreed: 0 };
    const now = d.now();

    for (const id of await staleSessions(d.db, new Date(now.getTime() - HEARTBEAT_STALE_MS))) {
        if (await endSession(d, id, "heartbeat_lost")) report.sessionsEnded++;
    }
    for (const a of await allLiveAttempts(d.db)) {
        const t = timeoutFor(a, now, { ringTimeoutSec: d.policy.ringTimeoutSec, amdTimeoutSec: d.policy.amdTimeoutSec });
        if (!t) continue;
        if (t.action === "TREAT_AS_UNKNOWN") {
            await onAmd(d, a.id, "unknown");
            report.unknownRouted++;
        } else {
            await release(d, a.id, t.outcome);
            report.timedOut++;
        }
    }
    for (const o of await orphanReservations(d.db)) {
        const to = o.outcome === "CONVERSATION" ? "WRAP_UP" : "READY";
        if (await setAgentState(d.db, o.sessionId, ["RESERVED", "ON_CALL"], to, { attemptId: o.attemptId })) report.reservationsFreed++;
    }
    return report;
}

export type { AttemptEvent };
