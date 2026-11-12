"use client";

// ============================================
// SOFTPHONE — in-app Twilio dialer, mounted once in the app shell.
//
//   const { dial } = useSoftphone();
//   if (!dial({ phone, contactId, companyId, label })) window.location.href = `tel:${phone}`;
//
// dial() returns false when the softphone is off for this user (Twilio not
// configured, no caller id, wrong role): the caller keeps its tel: link, so
// Allo users see no change. The Twilio SDK is only downloaded on the first
// real call, and the microphone is only requested then.
// ============================================

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import type { Call, Device } from "@twilio/voice-sdk";
import { softphoneErrorMessage } from "@/lib/telephony/client-errors";
import { TELEPHONY_ROLES } from "@/lib/telephony/roles";
import { isFinalStatus, type TelephonyStatus } from "@/lib/telephony/status";
import { isCurrentAttempt } from "@/lib/telephony/client-state";
import { CallIsland } from "./CallIsland";

export interface DialTarget {
    phone: string;
    contactId?: string | null;
    companyId?: string | null;
    campaignId?: string | null;
    /** Who is being called, as the SDR knows them ("Marie Durand"). */
    label?: string | null;
    /** Second line ("Acme SAS"). */
    sublabel?: string | null;
    /** Open the outcome (AI summary) by itself when the call ends — Mode auto. */
    showOutcome?: boolean;
}

/** "incoming": a prospect is calling the user's Twilio number, ringing in the browser. */
export type CallPhase = "preparing" | "connecting" | "ringing" | "incoming" | "live" | "ended" | "failed";

export interface SoftphoneCall {
    key: number;
    /** outbound: placed from the CRM; inbound: the prospect called the user's number. */
    direction: "outbound" | "inbound";
    target: DialTarget;
    phase: CallPhase;
    callId: string | null;
    startedAt: number;
    answeredAt: number | null;
    endedAt: number | null;
    muted: boolean;
    /** Final status as Twilio reported it to the server (no answer, busy…). */
    outcome: TelephonyStatus | null;
    durationSec: number | null;
    error: string | null;
    /** False when the server refused the number (country, premium rate…): retrying would fail the same way. */
    retryable: boolean;
    /** The SDR is reading its transcript/summary: the ended call stays on screen. */
    pinned: boolean;
}

interface SoftphoneConfig {
    softphone: boolean;
    callerId?: string;
    edge?: string;
    recording?: boolean;
    transcription?: boolean;
    /** Calls to the user's number ring in the browser (Paramètres → Téléphone). */
    receiveCalls?: boolean;
}

interface SoftphoneContextValue {
    /** True when phone links dial from the browser. */
    enabled: boolean;
    recording: boolean;
    /** Live transcription + AI summary are on for this agency. */
    transcription: boolean;
    /** A transcript, hence an AI summary, can exist after the call: live transcription or recording. */
    insights: boolean;
    callerId: string | null;
    call: SoftphoneCall | null;
    dial: (target: DialTarget) => boolean;
    hangup: () => void;
    /** Picks up the ringing inbound call. */
    answer: () => void;
    /** Sends the ringing inbound call to voicemail. */
    decline: () => void;
    toggleMute: () => void;
    sendDigit: (digit: string) => void;
    dismiss: () => void;
    /** Keeps the current (ended) call on screen until dismissed. */
    pin: () => void;
}

const SoftphoneContext = createContext<SoftphoneContextValue | null>(null);

// ── Island slot ───────────────────────────────────────────────────────────
// A page can put its own status in the Island when no call is on (Mode auto:
// « Appel de X dans 3 s », Passer, Arrêter…), and add actions to the outcome.
export interface IslandAction {
    label: string;
    onClick: () => void;
    tone?: "primary" | "success" | "accent" | "ghost";
}
export interface IslandExtra {
    /** Short tag at the start of the pill (« Auto »). */
    tag: string;
    text: string;
    /** Draws a draining ring; `key` restarts it. */
    countdown?: { seconds: number; key: string } | null;
    actions: IslandAction[];
}
const IslandExtraSetter = createContext<((x: IslandExtra | null) => void) | null>(null);

/** Shows `extra` in the Island while the calling component is mounted (null clears it). */
export function useIslandExtra(extra: IslandExtra | null) {
    const set = useContext(IslandExtraSetter);
    useEffect(() => {
        set?.(extra);
    });
    useEffect(() => () => set?.(null), [set]);
}

// ── Live audio levels ─────────────────────────────────────────────────────
// Twilio emits the microphone (input) and speaker (output) levels every 50 ms.
// They live outside React context so 20 updates a second only re-render the
// components that draw them (the Island's level bars), never the pages.
export interface CallLevels {
    /** The SDR's microphone, 0..1. */
    input: number;
    /** The prospect's voice, 0..1. */
    output: number;
}
const levelListeners = new Set<() => void>();
let levels: CallLevels = { input: 0, output: 0 };
let levelFrame: number | null = null;
function pushLevels(next: CallLevels) {
    levels = next;
    if (levelFrame !== null) return;
    levelFrame = requestAnimationFrame(() => {
        levelFrame = null;
        levelListeners.forEach((l) => l());
    });
}
const ZERO_LEVELS: CallLevels = { input: 0, output: 0 };

/** Live microphone / speaker levels of the current call (zero when no call). */
export function useCallLevels(): CallLevels {
    return useSyncExternalStore(
        (cb) => {
            levelListeners.add(cb);
            return () => levelListeners.delete(cb);
        },
        () => levels,
        () => ZERO_LEVELS,
    );
}

const LIVE_PHASES = new Set<CallPhase>(["preparing", "connecting", "ringing", "incoming", "live"]);
const AUTO_DISMISS_MS = 60_000;

export function isCallActive(call: SoftphoneCall | null): boolean {
    return Boolean(call && LIVE_PHASES.has(call.phase));
}

class ApiError extends Error {
    constructor(message: string, public status: number) {
        super(message);
    }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) throw new ApiError(json?.error || `Erreur ${res.status}`, res.status);
    return json.data as T;
}

export function SoftphoneProvider({ children }: { children: ReactNode }) {
    const { data: session } = useSession();
    const role = session?.user?.role as string | undefined;
    const eligible = Boolean(role && (TELEPHONY_ROLES as readonly string[]).includes(role));

    const [config, setConfig] = useState<SoftphoneConfig | null>(null);
    const [call, setCall] = useState<SoftphoneCall | null>(null);

    const deviceRef = useRef<Device | null>(null);
    const devicePromiseRef = useRef<Promise<Device> | null>(null);
    const lifetimeRef = useRef(0);
    const twilioCallRef = useRef<Call | null>(null);
    /** Handles a call ringing in (set every render, read by the Device listener). */
    const incomingRef = useRef<((incoming: Call) => void) | null>(null);
    const ringNoticeRef = useRef<Notification | null>(null);
    /** Routes Device "error" events to the call being placed. */
    const deviceErrorRef = useRef<((e: { code?: number; message?: string }) => void) | null>(null);
    const keyRef = useRef(0);
    /** Calls the SDR hung up on before Twilio connected them. */
    const cancelledRef = useRef(new Set<number>());
    const callRef = useRef<SoftphoneCall | null>(null);
    callRef.current = call;

    // ── config ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!eligible) {
            setConfig(null);
            return;
        }
        let cancelled = false;
        fetchJson<SoftphoneConfig>("/api/telephony/config")
            .then((c) => !cancelled && setConfig(c))
            .catch(() => !cancelled && setConfig({ softphone: false }));
        return () => {
            cancelled = true;
        };
    }, [eligible, session?.user?.id]);

    useEffect(() => () => {
        keyRef.current++;
        lifetimeRef.current++;
        deviceErrorRef.current = null;
        twilioCallRef.current = null;
        deviceRef.current?.destroy();
        deviceRef.current = null;
    }, []);

    const enabled = Boolean(config?.softphone);

    // ── helpers ────────────────────────────────────────────────────────────
    const patch = useCallback((key: number, update: Partial<SoftphoneCall> | ((c: SoftphoneCall) => Partial<SoftphoneCall>)) => {
        setCall((current) => {
            if (!current || current.key !== key) return current;
            const next = typeof update === "function" ? update(current) : update;
            return { ...current, ...next };
        });
    }, []);

    const fetchToken = useCallback(async () => (await fetchJson<{ token: string }>("/api/telephony/token", { method: "POST" })).token, []);

    const getDevice = useCallback(async (): Promise<Device> => {
        const existing = deviceRef.current;
        if (existing && existing.state !== "destroyed") return existing;

        if (devicePromiseRef.current) return devicePromiseRef.current;
        const lifetime = lifetimeRef.current;
        const pending = (async () => {
        const [{ Device: TwilioDevice, Call: TwilioCall }, token] = await Promise.all([import("@twilio/voice-sdk"), fetchToken()]);
        if (lifetime !== lifetimeRef.current) throw new Error("Téléphone fermé");
        const device = new TwilioDevice(token, {
            edge: config?.edge ?? "dublin",
            codecPreferences: [TwilioCall.Codec.Opus, TwilioCall.Codec.PCMU],
            closeProtection: "Un appel est en cours. Quitter la page raccrochera l'appel.",
        });
        device.on("tokenWillExpire", () => {
            fetchToken().then((t) => device.updateToken(t)).catch(() => undefined);
        });
        // Device-level failures (signalling blocked, network, token): without a
        // listener the SDK throws them uncaught and the bar would hang on « Connexion… ».
        device.on("error", (e: { code?: number; message?: string }) => {
            deviceErrorRef.current?.(e);
        });
        device.on("incoming", (incoming: Call) => incomingRef.current?.(incoming));
        deviceRef.current = device;
        return device;
        })();
        devicePromiseRef.current = pending;
        try { return await pending; } finally {
            if (devicePromiseRef.current === pending) devicePromiseRef.current = null;
        }
    }, [config?.edge, fetchToken]);

    /** After hang-up, ask the server what Twilio recorded as the outcome (busy, no answer…). */
    const settledRef = useRef(new Set<number>());
    const settleOutcome = useCallback((key: number, callId: string) => {
        if (settledRef.current.has(key)) return; // "error" and "disconnect" can both fire
        settledRef.current.add(key);
        const delays = [1500, 4000, 9000];
        let attempt = 0;
        const tick = () => {
            if (key !== keyRef.current) return;
            fetchJson<{ status: TelephonyStatus; durationSec: number | null }>(`/api/telephony/calls/${callId}`)
                .then((view) => {
                    if (isFinalStatus(view.status)) {
                        patch(key, { outcome: view.status, durationSec: view.durationSec });
                        return;
                    }
                    if (++attempt < delays.length) setTimeout(tick, delays[attempt]);
                })
                .catch(() => undefined);
        };
        setTimeout(tick, delays[0]);
    }, [patch]);

    const finish = useCallback((key: number, phase: "ended" | "failed", error: string | null = null, callId?: string | null) => {
        if (key !== keyRef.current) return;
        twilioCallRef.current = null;
        deviceErrorRef.current = null;
        pushLevels(ZERO_LEVELS);
        patch(key, (c) => (LIVE_PHASES.has(c.phase) ? { phase, endedAt: Date.now(), error, muted: false } : {}));
        if (callId) settleOutcome(key, callId);
    }, [patch, settleOutcome]);

    // ── actions ────────────────────────────────────────────────────────────
    const start = useCallback(async (key: number, target: DialTarget) => {
        let callId: string;
        try {
            const created = await fetchJson<{ id: string }>("/api/telephony/calls", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    to: target.phone,
                    contactId: target.contactId ?? null,
                    companyId: target.companyId ?? null,
                    campaignId: target.campaignId ?? null,
                }),
            });
            callId = created.id;
        } catch (err) {
            if (!isCurrentAttempt(key, keyRef.current, cancelledRef.current)) return;
            const refused = err instanceof ApiError && [403, 404, 409, 422].includes(err.status);
            patch(key, {
                phase: "failed",
                endedAt: Date.now(),
                error: err instanceof Error ? err.message : "Appel impossible",
                retryable: !refused,
            });
            return;
        }
        if (!isCurrentAttempt(key, keyRef.current, cancelledRef.current)) return;
        patch(key, { callId, phase: "connecting" });

        // A Device failure while this call is being placed ends it with a readable
        // message; the broken Device is dropped so the next call starts clean.
        deviceErrorRef.current = (e) => {
            if (!isCurrentAttempt(key, keyRef.current, cancelledRef.current)) return;
            cancelledRef.current.add(key);
            twilioCallRef.current?.disconnect();
            deviceRef.current?.destroy();
            deviceRef.current = null;
            finish(key, "failed", softphoneErrorMessage(e?.code, e?.message), callId);
        };

        try {
            const device = await getDevice();
            if (!isCurrentAttempt(key, keyRef.current, cancelledRef.current)) return;
            const twilioCall = await device.connect({ params: { callId } });
            if (!isCurrentAttempt(key, keyRef.current, cancelledRef.current)) {
                twilioCall.disconnect();
                return;
            }
            twilioCallRef.current = twilioCall;

            twilioCall.on("ringing", () => patch(key, (c) => (c.phase === "connecting" ? { phase: "ringing" } : {})));
            twilioCall.on("accept", () => {
                if (!isCurrentAttempt(key, keyRef.current, cancelledRef.current)) return;
                patch(key, (c) => LIVE_PHASES.has(c.phase) ? { phase: "live", answeredAt: Date.now() } : {});
            });
            twilioCall.on("mute", (muted: boolean) => patch(key, { muted }));
            twilioCall.on("volume", (input: number, output: number) => {
                if (isCurrentAttempt(key, keyRef.current, cancelledRef.current)) pushLevels({ input, output });
            });
            twilioCall.on("disconnect", () => finish(key, "ended", null, callId));
            twilioCall.on("cancel", () => finish(key, "ended", null, callId));
            twilioCall.on("reject", () => finish(key, "ended", null, callId));
            twilioCall.on("error", (e: { code?: number; message?: string }) => {
                finish(key, "failed", softphoneErrorMessage(e?.code, e?.message), callId);
            });
        } catch (err) {
            if (!isCurrentAttempt(key, keyRef.current, cancelledRef.current)) return;
            const e = err as { code?: number; message?: string };
            finish(key, "failed", softphoneErrorMessage(e?.code, e?.message), callId);
        }
    }, [finish, getDevice, patch]);

    const dial = useCallback((target: DialTarget): boolean => {
        if (!enabled || !target.phone?.trim()) return false;
        if (isCallActive(callRef.current)) {
            // Keep the SDR on the call they are in; the bar already shows it.
            return true;
        }
        const key = ++keyRef.current;
        cancelledRef.current.clear();
        const next: SoftphoneCall = {
            key,
            direction: "outbound",
            target,
            phase: "preparing",
            callId: null,
            startedAt: Date.now(),
            answeredAt: null,
            endedAt: null,
            muted: false,
            outcome: null,
            durationSec: null,
            error: null,
            retryable: true,
            pinned: false,
        };
        callRef.current = next;
        setCall(next);
        void start(key, target);
        return true;
    }, [enabled, start]);

    const closeRingNotice = useCallback(() => {
        ringNoticeRef.current?.close();
        ringNoticeRef.current = null;
    }, []);

    // ── inbound ────────────────────────────────────────────────────────────
    // A prospect calls the user's number: the webhook rings this browser with
    // who is calling as parameters (lib/telephony/inbound). One call at a time:
    // a call ringing in during another goes to voicemail.
    useEffect(() => {
        incomingRef.current = (incoming: Call) => {
            if (isCallActive(callRef.current)) {
                incoming.reject();
                return;
            }
            const param = (name: string) => incoming.customParameters?.get(name) || null;
            const key = ++keyRef.current;
            cancelledRef.current.clear();
            const callId = param("callId");
            const target: DialTarget = {
                phone: incoming.parameters?.From ?? "",
                label: param("callerName"),
                sublabel: param("companyName"),
                contactId: param("contactId"),
                companyId: param("companyId"),
                campaignId: param("campaignId"),
            };
            const next: SoftphoneCall = {
                key,
                direction: "inbound",
                target,
                phase: "incoming",
                callId,
                startedAt: Date.now(),
                answeredAt: null,
                endedAt: null,
                muted: false,
                outcome: null,
                durationSec: null,
                error: null,
                retryable: true,
                pinned: false,
            };
            callRef.current = next;
            setCall(next);
            twilioCallRef.current = incoming;

            // Another tab or app in front: a desktop notification brings the SDR back.
            if (typeof document !== "undefined" && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
                const n = new Notification("Appel entrant", {
                    body: [target.label, target.sublabel].filter(Boolean).join(" · ") || target.phone,
                    tag: "cp-incoming-call",
                    requireInteraction: true,
                });
                n.onclick = () => {
                    window.focus();
                    n.close();
                };
                ringNoticeRef.current = n;
            }

            const missed = () => {
                if (key !== keyRef.current) return;
                closeRingNotice();
                twilioCallRef.current = null;
                patch(key, (c) => (c.phase === "incoming" ? { phase: "ended", endedAt: Date.now(), outcome: "NO_ANSWER" } : {}));
            };
            incoming.on("accept", () => {
                closeRingNotice();
                patch(key, { phase: "live", answeredAt: Date.now() });
            });
            incoming.on("mute", (muted: boolean) => patch(key, { muted }));
            incoming.on("volume", (input: number, output: number) => {
                if (key === keyRef.current) pushLevels({ input, output });
            });
            incoming.on("cancel", missed); // the caller hung up, or the ring time ran out
            incoming.on("reject", missed);
            incoming.on("disconnect", () => finish(key, "ended", null, callId));
            incoming.on("error", (e: { code?: number; message?: string }) => {
                closeRingNotice();
                finish(key, "failed", softphoneErrorMessage(e?.code, e?.message), callId);
            });
        };
    });

    // Registered while the user receives calls; re-registers after a Device was
    // dropped (network error) or the token was refreshed into a new Device.
    const receive = enabled && Boolean(config?.receiveCalls);
    useEffect(() => {
        if (!receive) return;
        let stopped = false;
        const ensure = () => {
            if (stopped) return;
            getDevice()
                .then((device) => {
                    if (!stopped && device.state === "unregistered") return device.register();
                })
                .catch(() => undefined);
        };
        ensure();
        const t = setInterval(ensure, 30_000);
        return () => {
            stopped = true;
            clearInterval(t);
            const device = deviceRef.current;
            if (device?.state === "registered") device.unregister().catch(() => undefined);
        };
    }, [receive, getDevice]);

    const answer = useCallback(() => {
        const current = callRef.current;
        if (current?.phase !== "incoming") return;
        twilioCallRef.current?.accept();
    }, []);

    const decline = useCallback(() => {
        const current = callRef.current;
        if (current?.phase !== "incoming") return;
        twilioCallRef.current?.reject(); // → the caller hears the voicemail greeting
    }, []);

    const hangup = useCallback(() => {
        const current = callRef.current;
        if (!current) return;
        if (current.phase === "incoming") {
            twilioCallRef.current?.reject();
            return;
        }
        if (!LIVE_PHASES.has(current.phase)) return;
        cancelledRef.current.add(current.key);
        const twilioCall = twilioCallRef.current;
        finish(current.key, "ended", null, current.callId);
        twilioCall?.disconnect();
    }, [finish]);

    const toggleMute = useCallback(() => {
        const twilioCall = twilioCallRef.current;
        if (twilioCall && callRef.current?.phase === "live") twilioCall.mute(!twilioCall.isMuted());
    }, []);

    const sendDigit = useCallback((digit: string) => {
        if (!/^[0-9*#]$/.test(digit)) return;
        const twilioCall = twilioCallRef.current;
        if (twilioCall && callRef.current?.phase === "live") twilioCall.sendDigits(digit);
    }, []);

    const dismiss = useCallback(() => {
        if (isCallActive(callRef.current)) return;
        callRef.current = null;
        setCall(null);
    }, []);

    // Every plain tel: link in the app dials in-app once the softphone is on.
    // Capture phase, so links whose onClick stops propagation are caught too.
    // Links marked data-softphone="managed" call dial() themselves with the
    // record's context; the rest optionally carry data-contact-id / data-company-id,
    // and the server matches the call to the next qualification by number anyway.
    useEffect(() => {
        if (!enabled) return;
        const onClick = (e: MouseEvent) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const anchor = (e.target as Element | null)?.closest?.('a[href^="tel:"]') as HTMLAnchorElement | null;
            if (!anchor || anchor.closest('[data-softphone="managed"]') || anchor.dataset.softphone === "off") return;
            const phone = decodeURIComponent(anchor.getAttribute("href")!.slice(4)).trim();
            if (!phone) return;
            const scope = anchor.closest<HTMLElement>("[data-contact-id],[data-company-id]");
            if (dial({ phone, contactId: scope?.dataset.contactId ?? null, companyId: scope?.dataset.companyId ?? null })) {
                e.preventDefault();
            }
        };
        document.addEventListener("click", onClick, true);
        return () => document.removeEventListener("click", onClick, true);
    }, [enabled, dial]);

    // A finished call stays on screen long enough to read its outcome.
    useEffect(() => {
        if (!call || isCallActive(call) || call.pinned) return;
        const key = call.key;
        const t = setTimeout(() => setCall((c) => (c && c.key === key && !isCallActive(c) ? null : c)), AUTO_DISMISS_MS);
        return () => clearTimeout(t);
    }, [call]);

    const pin = useCallback(() => {
        setCall((c) => (c && !c.pinned ? { ...c, pinned: true } : c));
    }, []);

    const [islandExtra, setIslandExtra] = useState<IslandExtra | null>(null);

    const value = useMemo<SoftphoneContextValue>(
        () => ({
            enabled,
            recording: Boolean(config?.recording),
            transcription: Boolean(config?.transcription),
            insights: Boolean(config?.transcription || config?.recording),
            callerId: config?.callerId ?? null,
            call,
            dial,
            hangup,
            answer,
            decline,
            toggleMute,
            sendDigit,
            dismiss,
            pin,
        }),
        [enabled, config?.recording, config?.transcription, config?.callerId, call, dial, hangup, answer, decline, toggleMute, sendDigit, dismiss, pin],
    );

    return (
        <SoftphoneContext.Provider value={value}>
            <IslandExtraSetter.Provider value={setIslandExtra}>
                {children}
                {(call || islandExtra) && <CallIsland key={call ? `call-${call.key}` : "idle"} extra={islandExtra} />}
            </IslandExtraSetter.Provider>
        </SoftphoneContext.Provider>
    );
}

const DISABLED: SoftphoneContextValue = {
    enabled: false,
    recording: false,
    transcription: false,
    insights: false,
    callerId: null,
    call: null,
    dial: () => false,
    hangup: () => undefined,
    answer: () => undefined,
    decline: () => undefined,
    toggleMute: () => undefined,
    sendDigit: () => undefined,
    dismiss: () => undefined,
    pin: () => undefined,
};

/** Safe outside the provider (portals, public pages): behaves as "softphone off". */
export function useSoftphone(): SoftphoneContextValue {
    return useContext(SoftphoneContext) ?? DISABLED;
}

/**
 * onClick for a tel: link: dials in-app when the softphone is on, otherwise
 * lets the browser follow the tel: href as before.
 */
export function useTelLinkHandler() {
    const { dial } = useSoftphone();
    return useCallback(
        (e: { preventDefault: () => void; stopPropagation: () => void }, target: DialTarget) => {
            e.stopPropagation();
            if (dial(target)) e.preventDefault();
        },
        [dial],
    );
}
