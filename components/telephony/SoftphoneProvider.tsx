"use client";

// ============================================
// SOFTPHONE — in-app dialer, mounted once in the app shell. Two lines behind one API:
//   twilio  the browser is the phone (microphone, headset, inbound ringing here)
//   kavkom  the server asks Kavkom to ring the SDR's extension, then the prospect; the call
//           bar follows the call from Kavkom's webhooks (lib/kavkom). With `webphone`, THIS TAB
//           is the extension (SIP over WebRTC, ./kavkom-phone): it picks up that leg by itself,
//           rings for inbound calls, and owns mute / keypad / headset. Without it, the audio is
//           in the SDR's Kavkom app.
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
import type { Invitation, Session } from "sip.js";
import { startRingtone, type IncomingSipCall, type KavkomPhone, type SipLogin } from "./kavkom-phone";
import { AudioSettingsDialog } from "./AudioSettingsDialog";
import { AUDIO_PREFS_KEY, EMPTY_AUDIO_PREFS, adoptPluggedDevices, parseAudioPrefs, resolveDevice, type AudioPrefs, type DeviceLike } from "@/lib/telephony/audio-prefs";
import {
    MISSED_IN_A_ROW, MISSED_PAUSE_MINUTES, activePause, lineStatus, pauseLabel, rings,
    type LinePause, type LineSettings, type LineStatus, type PauseReason,
} from "@/lib/telephony/line-state";
import { useToast } from "@/components/ui";

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

export type CallVia = "twilio" | "kavkom";

export interface SoftphoneCall {
    key: number;
    /** Which line carries it. */
    via: CallVia;
    /** The audio is in the CRM (Twilio, or Kavkom's in-CRM phone): mute, keypad and headset work here. */
    inApp: boolean;
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
    provider?: CallVia;
    /** Kavkom: the user's extension, and whether their app picks up by itself. */
    extension?: string;
    autoAnswer?: boolean;
    /** A Twilio line is also there (parallel dialer, inbound in the browser). */
    twilio?: boolean;
    /** Kavkom: the CRM tab is the phone (SIP over WebRTC). */
    webphone?: boolean;
    callerId?: string | null;
    edge?: string;
    recording?: boolean;
    transcription?: boolean;
    /** Calls to the user's number ring in the browser (Paramètres → Ma ligne). */
    receiveCalls?: boolean;
    /** Voicemail until a time (press and hold the sidebar avatar), epoch ms. */
    pause?: LinePause | null;
}

interface SoftphoneContextValue {
    /** True when phone links dial from the CRM. */
    enabled: boolean;
    /** The line « Appeler » uses. */
    provider: CallVia | null;
    /** Kavkom: the extension that rings first. */
    extension: string | null;
    /** Kavkom's in-CRM phone: null when not used, else whether it is registered (and why not). */
    kavkomLine: { registered: boolean; error: string | null } | null;
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
    /** Parallel dialer: the SDR's leg in their session's conference (lib/dialer). Independent of `call`. */
    dialerLeg: DialerLeg;
    joinDialer: (sessionId: string) => Promise<boolean>;
    leaveDialer: () => void;
    toggleDialerMute: () => void;
    /** Opens « Réglages audio » (micro, casque, sonnerie, tests). */
    openAudioSettings: () => void;
    audioPrefs: AudioPrefs;
    /** Whether calls to the user's number ring here (lib/telephony/line-state); meaningful when `enabled`. */
    line: LineStatus;
    lineSettings: LineSettings;
    setReceiveCalls: (on: boolean) => Promise<void>;
    /** Voicemail for `minutes`, then the line is on again by itself. */
    pauseLine: (minutes: number, reason?: PauseReason) => Promise<void>;
    /** Calls ring here again (ends a pause, and voicemail mode). */
    resumeLine: () => Promise<void>;
}

export interface DialerLeg {
    state: "idle" | "connecting" | "connected" | "failed";
    sessionId: string | null;
    muted: boolean;
    error: string | null;
}

const IDLE_LEG: DialerLeg = { state: "idle", sessionId: null, muted: false, error: null };

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

// ── Audio devices (Réglages audio) ────────────────────────────────────────
async function listAudioDevices(): Promise<DeviceLike[]> {
    try {
        const list = (await navigator.mediaDevices?.enumerateDevices()) ?? [];
        return list.map((d) => ({ deviceId: d.deviceId, label: d.label, kind: d.kind }));
    } catch {
        return [];
    }
}

/** Speakers and ringtone: cheap to set, never open the microphone. */
async function applyOutputs(device: Device, prefs: AudioPrefs): Promise<void> {
    const audio = device.audio;
    if (!audio?.isOutputSelectionSupported) return;
    const devices = await listAudioDevices();
    const out = resolveDevice(prefs.output, devices, "audiooutput") ?? "default";
    const ring = resolveDevice(prefs.ringtone, devices, "audiooutput") ?? out;
    await audio.speakerDevices.set(out).catch(() => undefined);
    await audio.ringtoneDevices.set(ring).catch(() => undefined);
}

/**
 * The chosen microphone for the next (or current) call. setInputDevice keeps the mic
 * open, so it is only called around calls and released after (releaseInput).
 * Returns true when a device was set. A device that fails falls back to the default.
 */
async function applyInput(device: Device, prefs: AudioPrefs, live: boolean): Promise<boolean> {
    const audio = device.audio;
    if (!audio) return false;
    const devices = await listAudioDevices();
    const id = resolveDevice(prefs.input, devices, "audioinput") ?? (live && devices.some((d) => d.kind === "audioinput" && d.deviceId === "default") ? "default" : null);
    if (!id) return false;
    try {
        await audio.setInputDevice(id);
        return true;
    } catch {
        return false;
    }
}

function readAudioPrefs(): AudioPrefs {
    try {
        return parseAudioPrefs(window.localStorage.getItem(AUDIO_PREFS_KEY));
    } catch {
        return EMPTY_AUDIO_PREFS;
    }
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

    const [audioPrefs, setAudioPrefs] = useState<AudioPrefs>(EMPTY_AUDIO_PREFS);
    const [audioOpen, setAudioOpen] = useState(false);
    const audioPrefsRef = useRef<AudioPrefs>(EMPTY_AUDIO_PREFS);
    /** setInputDevice was called for the current call / conference leg: release it afterwards. */
    const inputHeldRef = useRef(false);
    useEffect(() => {
        const saved = readAudioPrefs();
        audioPrefsRef.current = saved;
        setAudioPrefs(saved);
    }, []);

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
    const via: CallVia = config?.provider === "kavkom" ? "kavkom" : "twilio";
    /** The browser has a Twilio line: inbound ringing here, parallel dialer. */
    const twilioOn = enabled && (via === "twilio" || Boolean(config?.twilio));
    const viaRef = useRef<CallVia>(via);
    viaRef.current = via;
    /** Kavkom's in-CRM phone is used for this user. */
    const webphone = enabled && via === "kavkom" && Boolean(config?.webphone);
    const webphoneRef = useRef(webphone);
    webphoneRef.current = webphone;
    const kavkomPhoneRef = useRef<KavkomPhone | null>(null);
    /** The SIP call in progress (in the tab that holds the phone). */
    const sipSessionRef = useRef<Session | null>(null);
    /** An inbound SIP call ringing here, until answered or declined. */
    const sipRingingRef = useRef<Invitation | null>(null);
    /** « Appeler » was just clicked: the next INVITE from Kavkom is that call's own leg. */
    const expectRef = useRef<{ key: number | null; until: number } | null>(null);
    const kavkomChannelRef = useRef<BroadcastChannel | null>(null);
    const [kavkomLine, setKavkomLine] = useState<{ registered: boolean; error: string | null } | null>(null);

    // ── line: on / paused / voicemail ──────────────────────────────────────
    const toast = useToast();
    const [lineSettings, setLineSettings] = useState<LineSettings>({ receiveCalls: true, pause: null });
    const lineRef = useRef(lineSettings);
    lineRef.current = lineSettings;
    useEffect(() => {
        if (config) setLineSettings({ receiveCalls: config.receiveCalls ?? true, pause: activePause(config.pause ?? null, Date.now()) });
    }, [config]);

    // Other tabs follow: each one registers its own Device.
    const lineChannelRef = useRef<BroadcastChannel | null>(null);
    useEffect(() => {
        if (!enabled || typeof BroadcastChannel === "undefined") return;
        const channel = new BroadcastChannel("cp-softphone-line");
        channel.onmessage = (e: MessageEvent<LineSettings>) => {
            if (e.data && typeof e.data.receiveCalls === "boolean") setLineSettings(e.data);
        };
        lineChannelRef.current = channel;
        return () => {
            channel.close();
            lineChannelRef.current = null;
        };
    }, [enabled]);

    // A pause ends on its own: re-render when it runs out so the Device registers again.
    useEffect(() => {
        const until = lineSettings.pause?.until;
        if (!until) return;
        const t = setTimeout(() => setLineSettings((l) => (l.pause?.until === until ? { ...l, pause: null } : l)), Math.max(0, until - Date.now()) + 50);
        return () => clearTimeout(t);
    }, [lineSettings.pause?.until]);

    /** Optimistic: the ring changes now, the server confirms (or the change is undone). */
    const writeLine = useCallback(async (next: LineSettings, body: Record<string, unknown>) => {
        const before = lineRef.current;
        setLineSettings(next);
        lineChannelRef.current?.postMessage(next);
        try {
            const saved = await fetchJson<{ receiveCalls: boolean; pause: LinePause | null }>("/api/telephony/prefs", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const confirmed = { receiveCalls: saved.receiveCalls, pause: activePause(saved.pause, Date.now()) };
            setLineSettings(confirmed);
            lineChannelRef.current?.postMessage(confirmed);
        } catch (e) {
            setLineSettings(before);
            lineChannelRef.current?.postMessage(before);
            throw e;
        }
    }, []);

    const setReceiveCalls = useCallback(
        (on: boolean) =>
            writeLine({ receiveCalls: on, pause: on ? lineRef.current.pause : null }, on ? { receiveCalls: true } : { receiveCalls: false, pause: null }),
        [writeLine],
    );
    const pauseLine = useCallback(
        (minutes: number, reason: PauseReason = "manual") => {
            const now = Date.now();
            return writeLine({ receiveCalls: true, pause: { from: now, until: now + minutes * 60_000, reason } }, { receiveCalls: true, pause: { minutes, reason } });
        },
        [writeLine],
    );
    const resumeLine = useCallback(() => writeLine({ receiveCalls: true, pause: null }, { receiveCalls: true, pause: null }), [writeLine]);

    /** Placing a call ends a pause (not voicemail mode, which the user chose until further notice). */
    const resumeIfPaused = useCallback(() => {
        if (lineRef.current.receiveCalls && activePause(lineRef.current.pause, Date.now())) {
            void resumeLine().then(() => toast.info("Ligne reprise", "Vous appelez : vos rappels sonnent de nouveau ici."), () => undefined);
        }
    }, [resumeLine, toast]);

    /** Callbacks that rang out unanswered, in a row. */
    const missedRef = useRef(0);

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
        void applyOutputs(device, audioPrefsRef.current);
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
        // Give the microphone back (the browser's recording indicator goes off) unless a session still needs it.
        if (inputHeldRef.current && !dialerCallRef.current) {
            inputHeldRef.current = false;
            void deviceRef.current?.audio?.unsetInputDevice().catch(() => undefined);
        }
        patch(key, (c) => (LIVE_PHASES.has(c.phase) ? { phase, endedAt: Date.now(), error, muted: false } : {}));
        if (callId) settleOutcome(key, callId);
    }, [patch, settleOutcome]);

    /**
     * Kavkom calls: the audio is in the Kavkom app, the state comes from Kavkom's webhooks
     * onto the call row. The bar reads that row every 1.5 s while the call is on.
     */
    const followRemote = useCallback((key: number, callId: string) => {
        const startedAt = Date.now();
        let failures = 0;
        const tick = () => {
            if (key !== keyRef.current || cancelledRef.current.has(key)) return;
            const current = callRef.current;
            if (!current || current.key !== key || !LIVE_PHASES.has(current.phase)) return;
            fetchJson<{ status: TelephonyStatus; answeredAt: string | null; durationSec: number | null }>(`/api/telephony/calls/${callId}`)
                .then((view) => {
                    failures = 0;
                    if (key !== keyRef.current) return;
                    if (isFinalStatus(view.status)) {
                        const answeredAt = view.answeredAt ? Date.parse(view.answeredAt) : null;
                        patch(key, (c) => ({ answeredAt: c.answeredAt ?? answeredAt, outcome: view.status, durationSec: view.durationSec }));
                        finish(key, "ended", null, null);
                        return;
                    }
                    if (view.status === "IN_PROGRESS") {
                        const answeredAt = view.answeredAt ? Date.parse(view.answeredAt) : Date.now();
                        patch(key, (c) => (c.phase !== "live" ? { phase: "live", answeredAt: c.answeredAt ?? answeredAt } : {}));
                    }
                    // No word from Kavkom for 3 minutes of ringing: its webhook is not set up. Stop waiting.
                    if (view.status !== "IN_PROGRESS" && !sipSessionRef.current && Date.now() - startedAt > 180_000) {
                        finish(key, "ended", null, callId);
                        return;
                    }
                    setTimeout(tick, 1_500);
                })
                .catch(() => {
                    if (++failures < 6) setTimeout(tick, 3_000);
                });
        };
        setTimeout(tick, 1_200);
    }, [finish, patch]);

    // ── actions ────────────────────────────────────────────────────────────
    const start = useCallback(async (key: number, target: DialTarget) => {
        let callId: string;
        // Kavkom rings the extension while the request below is still running: be ready first.
        if (callRef.current?.key === key && callRef.current.via === "kavkom" && webphoneRef.current) {
            const until = Date.now() + 45_000;
            expectRef.current = { key, until };
            kavkomChannelRef.current?.postMessage({ type: "expect", until });
        }
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
        if (callRef.current?.key === key && callRef.current.via === "kavkom") {
            // Kavkom placed it: the SDR's Kavkom app rings (or answers by itself), then the prospect.
            patch(key, { callId, phase: "ringing" });
            followRemote(key, callId);
            return;
        }
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
            inputHeldRef.current = (await applyInput(device, audioPrefsRef.current, false)) || inputHeldRef.current;
            if (!isCurrentAttempt(key, keyRef.current, cancelledRef.current)) {
                // Hung up while the microphone was being set: give it back.
                if (inputHeldRef.current && !dialerCallRef.current) {
                    inputHeldRef.current = false;
                    void device.audio?.unsetInputDevice().catch(() => undefined);
                }
                return;
            }
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
    }, [finish, followRemote, getDevice, patch]);

    // ── parallel dialer leg ────────────────────────────────────────────────
    // One browser call into the session's conference for the whole session: the
    // server bridges prospects into it. It never goes through `call`, so the
    // island, Mode Focus and inbound calls keep their own behaviour.
    const [dialerLeg, setDialerLeg] = useState<DialerLeg>(IDLE_LEG);
    const dialerCallRef = useRef<Call | null>(null);
    const dialerLegRef = useRef<DialerLeg>(IDLE_LEG);
    dialerLegRef.current = dialerLeg;

    const leaveDialer = useCallback(() => {
        const c = dialerCallRef.current;
        dialerCallRef.current = null;
        c?.disconnect();
        pushLevels(ZERO_LEVELS);
        setDialerLeg(IDLE_LEG);
    }, []);

    const joinDialer = useCallback(async (sessionId: string): Promise<boolean> => {
        // The parallel dialer bridges calls in a Twilio conference: it needs the browser line.
        if (!twilioOn || isCallActive(callRef.current)) return false;
        if (dialerCallRef.current && dialerLegRef.current.sessionId === sessionId) return true;
        dialerCallRef.current?.disconnect();
        resumeIfPaused();
        setDialerLeg({ state: "connecting", sessionId, muted: false, error: null });
        try {
            const device = await getDevice();
            inputHeldRef.current = (await applyInput(device, audioPrefsRef.current, false)) || inputHeldRef.current;
            const leg = await device.connect({ params: { dialerSessionId: sessionId } });
            dialerCallRef.current = leg;
            leg.on("accept", () => setDialerLeg((l) => (l.sessionId === sessionId ? { ...l, state: "connected" } : l)));
            leg.on("mute", (muted: boolean) => setDialerLeg((l) => ({ ...l, muted })));
            leg.on("volume", (input: number, output: number) => pushLevels({ input, output }));
            const ended = (error: string | null) => () => {
                if (dialerCallRef.current !== leg) return;
                dialerCallRef.current = null;
                pushLevels(ZERO_LEVELS);
                if (inputHeldRef.current && !isCallActive(callRef.current)) {
                    inputHeldRef.current = false;
                    void deviceRef.current?.audio?.unsetInputDevice().catch(() => undefined);
                }
                setDialerLeg(error ? { state: "failed", sessionId, muted: false, error } : IDLE_LEG);
            };
            leg.on("disconnect", ended(null));
            leg.on("cancel", ended(null));
            leg.on("error", (e: { code?: number; message?: string }) => ended(softphoneErrorMessage(e?.code, e?.message))());
            return true;
        } catch (err) {
            const e = err as { code?: number; message?: string };
            setDialerLeg({ state: "failed", sessionId, muted: false, error: softphoneErrorMessage(e?.code, e?.message) });
            return false;
        }
    }, [twilioOn, getDevice, resumeIfPaused]);

    const toggleDialerMute = useCallback(() => {
        const c = dialerCallRef.current;
        if (c) c.mute(!c.isMuted());
    }, []);

    const dial = useCallback((target: DialTarget): boolean => {
        if (!enabled || !target.phone?.trim()) return false;
        // A parallel session owns the line: no second call on top of it (and no tel: fallback either).
        if (dialerCallRef.current) return true;
        if (isCallActive(callRef.current)) {
            // Keep the SDR on the call they are in; the bar already shows it.
            return true;
        }
        resumeIfPaused();
        const key = ++keyRef.current;
        cancelledRef.current.clear();
        const next: SoftphoneCall = {
            key,
            via: viaRef.current,
            inApp: viaRef.current === "twilio" || webphoneRef.current,
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
    }, [enabled, start, resumeIfPaused]);

    const closeRingNotice = useCallback(() => {
        ringNoticeRef.current?.close();
        ringNoticeRef.current = null;
    }, []);

    // ── Kavkom in the CRM (SIP over WebRTC) ────────────────────────────────
    // One tab holds the phone (Web Locks): two registered tabs would both ring and
    // both pick up the click-to-call leg. Other tabs send it their commands.
    const stopRingRef = useRef<(() => void) | null>(null);
    const stopRing = useCallback(() => {
        stopRingRef.current?.();
        stopRingRef.current = null;
    }, []);

    const sipHandlers = useCallback((key: number | null, callId: string | null) => ({
        onEstablished: () => {
            if (key === null) return;
            // Inbound: picked up here. Outbound: our leg is up; the prospect may still be ringing (the webhook says when they answer).
            patch(key, (c) => (c.direction === "inbound" && c.phase !== "live" ? { phase: "live", answeredAt: Date.now() } : {}));
        },
        onEnded: () => {
            sipSessionRef.current = null;
            pushLevels(ZERO_LEVELS);
            if (key === null) return;
            const current = callRef.current;
            if (current?.key === key && LIVE_PHASES.has(current.phase)) {
                cancelledRef.current.add(key);
                finish(key, "ended", null, null);
                const id = callId ?? current.callId;
                if (id) settleOutcome(key, id);
            }
        },
        onLevels: (input: number, output: number) => pushLevels({ input, output }),
    }), [finish, patch, settleOutcome]);

    const devicesForCall = useCallback(async () => {
        const devices = await listAudioDevices();
        return {
            input: resolveDevice(audioPrefsRef.current.input, devices, "audioinput"),
            output: resolveDevice(audioPrefsRef.current.output, devices, "audiooutput"),
            ringtone: resolveDevice(audioPrefsRef.current.ringtone, devices, "audiooutput"),
        };
    }, []);

    const onSipIncoming = useCallback(async (sip: IncomingSipCall) => {
        const phone = kavkomPhoneRef.current;
        if (!phone) return;
        const expect = expectRef.current;
        // 1. The leg of a call the SDR just placed (here or in another tab): pick up at once.
        if (expect && Date.now() < expect.until) {
            expectRef.current = null;
            sipSessionRef.current = sip.invitation;
            const local = expect.key !== null && callRef.current?.key === expect.key ? expect.key : null;
            await phone.accept(sip.invitation, sipHandlers(local, local !== null ? callRef.current?.callId ?? null : null), await devicesForCall()).catch(() => {
                sipSessionRef.current = null;
            });
            return;
        }
        // 2. Busy, or the line is paused: Kavkom sends the caller on (voicemail, another agent).
        if (isCallActive(callRef.current) || dialerCallRef.current || sipSessionRef.current || !rings(lineRef.current, Date.now())) {
            void phone.decline(sip.invitation);
            return;
        }
        // 3. A prospect calling in: ring here, with their name from the CRM as soon as the webhook has it.
        const key = ++keyRef.current;
        cancelledRef.current.clear();
        const phoneNumber = /^\d{2,7}$/.test(sip.from) ? sip.from : sip.from.startsWith("+") || sip.from.startsWith("0") ? sip.from : `+${sip.from}`;
        const next: SoftphoneCall = {
            key,
            via: "kavkom",
            inApp: true,
            direction: "inbound",
            target: { phone: phoneNumber, label: sip.fromName },
            phase: "incoming",
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
        sipRingingRef.current = sip.invitation;
        phone.watchRinging(sip.invitation, () => {
            if (sipRingingRef.current !== sip.invitation) return;
            sipRingingRef.current = null;
            stopRing();
            closeRingNotice();
            // The caller hung up first (or Kavkom moved on): a missed call; the webhook notifies it.
            patch(key, (c) => (c.phase === "incoming" ? { phase: "ended", endedAt: Date.now() } : {}));
        });
        stopRing();
        void devicesForCall().then((d) => {
            if (sipRingingRef.current === sip.invitation) stopRingRef.current = startRingtone(d.ringtone ?? d.output);
        });
        if (typeof document !== "undefined" && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
            const n = new Notification("Appel entrant", { body: sip.fromName ?? phoneNumber, tag: "cp-incoming-call", requireInteraction: true });
            n.onclick = () => {
                window.focus();
                n.close();
            };
            ringNoticeRef.current = n;
        }
        fetchJson<{ callId: string; contactId: string | null; companyId: string | null; campaignId: string | null; callerName: string | null; companyName: string | null } | null>(
            `/api/telephony/kavkom/inbound?from=${encodeURIComponent(phoneNumber)}`,
        )
            .then((who) => {
                if (!who) return;
                patch(key, (c) => ({
                    callId: c.callId ?? who.callId,
                    target: { ...c.target, label: who.callerName ?? c.target.label, sublabel: who.companyName, contactId: who.contactId, companyId: who.companyId, campaignId: who.campaignId },
                }));
            })
            .catch(() => undefined);
    }, [closeRingNotice, devicesForCall, patch, sipHandlers, stopRing]);
    const onSipIncomingRef = useRef(onSipIncoming);
    onSipIncomingRef.current = onSipIncoming;

    /** Commands from a tab that does not hold the phone. */
    const sipCommand = useCallback((cmd: { type: string; until?: number; muted?: boolean; digit?: string }) => {
        const phone = kavkomPhoneRef.current;
        if (cmd.type === "expect" && typeof cmd.until === "number") expectRef.current = { key: null, until: cmd.until };
        const session = sipSessionRef.current;
        if (!phone || !session) return;
        if (cmd.type === "hangup") void phone.hangup(session);
        if (cmd.type === "mute") phone.setMuted(session, Boolean(cmd.muted));
        if (cmd.type === "dtmf" && cmd.digit) phone.sendDigit(session, cmd.digit);
    }, []);

    useEffect(() => {
        if (!webphone) {
            setKavkomLine(null);
            return;
        }
        let stopped = false;
        let release: (() => void) | null = null;
        const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("cp-kavkom-phone") : null;
        kavkomChannelRef.current = channel;
        if (channel) channel.onmessage = (e: MessageEvent) => sipCommand(e.data ?? {});

        const run = async () => {
            setKavkomLine({ registered: false, error: null });
            try {
                const [{ KavkomPhone }, login] = await Promise.all([
                    import("./kavkom-phone"),
                    fetchJson<SipLogin>("/api/telephony/kavkom/sip", { method: "POST" }),
                ]);
                if (stopped) return;
                const phone = await KavkomPhone.start(login, {
                    onIncoming: (sip) => void onSipIncomingRef.current(sip),
                    onLine: (state) => !stopped && setKavkomLine(state),
                });
                if (stopped) {
                    void phone.stop();
                    return;
                }
                kavkomPhoneRef.current = phone;
            } catch (err) {
                if (!stopped) setKavkomLine({ registered: false, error: err instanceof Error ? err.message : "Téléphone Kavkom indisponible" });
            }
        };

        const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
        if (locks) {
            // Held for the life of this tab's phone; the next tab takes over when this one closes.
            void locks.request("cp-kavkom-phone", () => new Promise<void>((resolve) => {
                release = resolve;
                if (stopped) return resolve();
                void run();
            })).catch(() => undefined);
        } else {
            void run();
        }

        return () => {
            stopped = true;
            channel?.close();
            kavkomChannelRef.current = null;
            const phone = kavkomPhoneRef.current;
            kavkomPhoneRef.current = null;
            sipSessionRef.current = null;
            sipRingingRef.current = null;
            void phone?.stop().finally(() => release?.());
            if (!phone) release?.();
        };
    }, [webphone, sipCommand]);

    // A registration that fails says so once, not on every retry.
    const lastLineErrorRef = useRef<string | null>(null);
    useEffect(() => {
        const err = kavkomLine?.error ?? null;
        if (err && err !== lastLineErrorRef.current) toast.error("Téléphone Kavkom", `${err}. Vos appels sonnent sur l'application Kavkom en attendant.`);
        lastLineErrorRef.current = err;
    }, [kavkomLine?.error, toast]);

    // ── inbound ────────────────────────────────────────────────────────────
    // A prospect calls the user's number: the webhook rings this browser with
    // who is calling as parameters (lib/telephony/inbound). One call at a time:
    // a call ringing in during another goes to voicemail.
    useEffect(() => {
        incomingRef.current = (incoming: Call) => {
            // In a call, or in a parallel session: the caller goes to voicemail.
            if (isCallActive(callRef.current) || dialerCallRef.current) {
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
                via: "twilio",
                inApp: true,
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
                missedRef.current = 0;
                closeRingNotice();
                patch(key, { phase: "live", answeredAt: Date.now() });
            });
            incoming.on("mute", (muted: boolean) => patch(key, { muted }));
            incoming.on("volume", (input: number, output: number) => {
                if (key === keyRef.current) pushLevels({ input, output });
            });
            // The caller hung up, or the ring time ran out. Twice in a row: the SDR is away,
            // so the line pauses itself and the next callers hear the voicemail at once.
            incoming.on("cancel", () => {
                missed();
                missedRef.current++;
                if (missedRef.current >= MISSED_IN_A_ROW && rings(lineRef.current, Date.now())) {
                    missedRef.current = 0;
                    void pauseLine(MISSED_PAUSE_MINUTES, "missed").then(
                        () => toast.warning("Ligne en pause", `${MISSED_IN_A_ROW} appels sans réponse : messagerie pendant ${pauseLabel(MISSED_PAUSE_MINUTES)}. Votre prochain appel la reprend.`),
                        () => undefined,
                    );
                }
            });
            incoming.on("reject", () => {
                missedRef.current = 0; // declined on purpose
                missed();
            });
            incoming.on("disconnect", () => finish(key, "ended", null, callId));
            incoming.on("error", (e: { code?: number; message?: string }) => {
                closeRingNotice();
                finish(key, "failed", softphoneErrorMessage(e?.code, e?.message), callId);
            });
        };
    });

    // Registered while the user receives calls; re-registers after a Device was
    // dropped (network error) or the token was refreshed into a new Device.
    const receive = twilioOn && rings(lineSettings, Date.now());
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
        if (current.via === "kavkom") {
            const invitation = sipRingingRef.current;
            const phone = kavkomPhoneRef.current;
            if (!invitation || !phone) return;
            sipRingingRef.current = null;
            sipSessionRef.current = invitation;
            stopRing();
            closeRingNotice();
            void devicesForCall().then((d) => phone.accept(invitation, sipHandlers(current.key, current.callId), d)).catch(() => {
                sipSessionRef.current = null;
                finish(current.key, "failed", "Impossible de décrocher (micro refusé ?)", current.callId);
            });
            return;
        }
        const incoming = twilioCallRef.current;
        const device = deviceRef.current;
        if (!incoming) return;
        if (!device) return void incoming.accept();
        // The chosen microphone must be set before accepting (the SDK opens it at accept).
        void applyInput(device, audioPrefsRef.current, false).then((held) => {
            inputHeldRef.current = held || inputHeldRef.current;
            incoming.accept();
        });
    }, [closeRingNotice, devicesForCall, finish, sipHandlers, stopRing]);

    const decline = useCallback(() => {
        const current = callRef.current;
        if (current?.phase !== "incoming") return;
        if (current.via === "kavkom") {
            const invitation = sipRingingRef.current;
            sipRingingRef.current = null;
            stopRing();
            closeRingNotice();
            if (invitation) void kavkomPhoneRef.current?.decline(invitation); // → Kavkom's next step (voicemail)
            patch(current.key, { phase: "ended", endedAt: Date.now() });
            return;
        }
        twilioCallRef.current?.reject(); // → the caller hears the voicemail greeting
    }, [closeRingNotice, patch, stopRing]);

    const hangup = useCallback(() => {
        const current = callRef.current;
        if (!current) return;
        if (current.phase === "incoming") {
            if (current.via === "kavkom") return decline();
            twilioCallRef.current?.reject();
            return;
        }
        if (!LIVE_PHASES.has(current.phase)) return;
        cancelledRef.current.add(current.key);
        if (current.via === "kavkom") {
            // In-CRM phone: hang up our leg (here, or in the tab that holds the phone).
            const session = sipSessionRef.current;
            if (session && kavkomPhoneRef.current) void kavkomPhoneRef.current.hangup(session);
            else if (webphoneRef.current) kavkomChannelRef.current?.postMessage({ type: "hangup" });
            expectRef.current = null;
            // And end the call on Kavkom (the prospect's leg too), then read the final outcome.
            const callId = current.callId;
            finish(current.key, "ended", null, null);
            if (callId && current.direction === "outbound") {
                void fetch(`/api/telephony/calls/${callId}/hangup`, { method: "POST" })
                    .catch(() => undefined)
                    .finally(() => settleOutcome(current.key, callId));
            }
            return;
        }
        const twilioCall = twilioCallRef.current;
        finish(current.key, "ended", null, current.callId);
        twilioCall?.disconnect();
    }, [decline, finish, settleOutcome]);

    const toggleMute = useCallback(() => {
        const current = callRef.current;
        if (current?.via === "kavkom") {
            if (!current.inApp || !LIVE_PHASES.has(current.phase)) return;
            const muted = !current.muted;
            const session = sipSessionRef.current;
            if (session && kavkomPhoneRef.current) kavkomPhoneRef.current.setMuted(session, muted);
            else kavkomChannelRef.current?.postMessage({ type: "mute", muted });
            patch(current.key, { muted });
            return;
        }
        const twilioCall = twilioCallRef.current;
        if (twilioCall && current?.phase === "live") twilioCall.mute(!twilioCall.isMuted());
    }, [patch]);

    const sendDigit = useCallback((digit: string) => {
        if (!/^[0-9*#]$/.test(digit)) return;
        const current = callRef.current;
        if (current?.via === "kavkom") {
            if (!current.inApp || current.phase !== "live") return;
            const session = sipSessionRef.current;
            if (session && kavkomPhoneRef.current) kavkomPhoneRef.current.sendDigit(session, digit);
            else kavkomChannelRef.current?.postMessage({ type: "dtmf", digit });
            return;
        }
        const twilioCall = twilioCallRef.current;
        if (twilioCall && current?.phase === "live") twilioCall.sendDigits(digit);
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

    const openAudioSettings = useCallback(() => setAudioOpen(true), []);
    const saveAudioPrefs = useCallback((next: AudioPrefs) => {
        audioPrefsRef.current = next;
        setAudioPrefs(next);
        try {
            window.localStorage.setItem(AUDIO_PREFS_KEY, JSON.stringify(next));
        } catch {
            /* private mode: applies for this tab only */
        }
        if (kavkomPhoneRef.current) {
            void listAudioDevices().then((devices) => kavkomPhoneRef.current?.setOutput(resolveDevice(next.output, devices, "audiooutput")));
        }
        const device = deviceRef.current;
        if (!device) return;
        void applyOutputs(device, next);
        // In a call or a session: switch the microphone now (the SDK swaps the track live).
        if (isCallActive(callRef.current) || dialerCallRef.current) {
            void applyInput(device, next, true).then((held) => {
                inputHeldRef.current = held || inputHeldRef.current;
            });
        }
    }, []);

    // A headset plugged in becomes the call audio, as on a phone: no trip to the audio settings.
    useEffect(() => {
        const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
        if (!enabled || !media?.enumerateDevices || !media.addEventListener) return;
        let known: DeviceLike[] = [];
        let alive = true;
        const list = () => media.enumerateDevices().then((d) => d.map(({ deviceId, label, kind }) => ({ deviceId, label, kind })));
        void list().then((d) => {
            if (alive) known = d;
        }, () => undefined);
        const onChange = () => {
            void list().then((now) => {
                if (!alive) return;
                const adopted = adoptPluggedDevices(known, now, audioPrefsRef.current);
                known = now;
                if (!adopted) return;
                saveAudioPrefs(adopted.prefs);
                toast.info(`${adopted.name} branché`, "Vos appels passent maintenant par cet appareil.");
            }, () => undefined);
        };
        media.addEventListener("devicechange", onChange);
        return () => {
            alive = false;
            media.removeEventListener("devicechange", onChange);
        };
    }, [enabled, saveAudioPrefs, toast]);

    const line = lineStatus(lineSettings, Date.now());

    const value = useMemo<SoftphoneContextValue>(
        () => ({
            enabled,
            provider: enabled ? via : null,
            extension: config?.extension ?? null,
            kavkomLine,
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
            dialerLeg,
            joinDialer,
            leaveDialer,
            toggleDialerMute,
            openAudioSettings,
            audioPrefs,
            line,
            lineSettings,
            setReceiveCalls,
            pauseLine,
            resumeLine,
        }),
        // `line` is derived from lineSettings and the clock (the pause timer re-renders when it runs out).
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [lineSettings, setReceiveCalls, pauseLine, resumeLine, openAudioSettings, audioPrefs, enabled, via, config?.extension, kavkomLine, config?.recording, config?.transcription, config?.callerId, call, dial, hangup, answer, decline, toggleMute, sendDigit, dismiss, pin, dialerLeg, joinDialer, leaveDialer, toggleDialerMute],
    );

    return (
        <SoftphoneContext.Provider value={value}>
            <IslandExtraSetter.Provider value={setIslandExtra}>
                {children}
                {(call || islandExtra) && <CallIsland key={call ? `call-${call.key}` : "idle"} extra={islandExtra} />}
                {enabled && (
                    <AudioSettingsDialog
                        open={audioOpen}
                        onClose={() => setAudioOpen(false)}
                        prefs={audioPrefs}
                        onSave={saveAudioPrefs}
                        inCall={isCallActive(call) || dialerLeg.state === "connected"}
                    />
                )}
            </IslandExtraSetter.Provider>
        </SoftphoneContext.Provider>
    );
}

const DISABLED: SoftphoneContextValue = {
    enabled: false,
    provider: null,
    extension: null,
    kavkomLine: null,
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
    dialerLeg: IDLE_LEG,
    joinDialer: async () => false,
    leaveDialer: () => undefined,
    toggleDialerMute: () => undefined,
    openAudioSettings: () => undefined,
    audioPrefs: EMPTY_AUDIO_PREFS,
    line: { mode: "on", pause: null, remaining: 0 },
    lineSettings: { receiveCalls: true, pause: null },
    setReceiveCalls: async () => undefined,
    pauseLine: async () => undefined,
    resumeLine: async () => undefined,
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
