"use client";

// ============================================
// KAVKOM IN THE CRM — the browser tab registers as the SDR's Kavkom extension (SIP over
// WebRTC, sip.js), so no Kavkom app is needed: the microphone, the headset and the ringing
// are the CRM's. Browser-only; sip.js is downloaded on first use.
//
//   outbound  the server asks Kavkom to ring the extension (active_call/call, auto-answer):
//             that INVITE reaches this tab, which picks it up by itself, then Kavkom bridges
//             the prospect. So the caller id, the CDR and the recording stay Kavkom's.
//   inbound   a prospect calls the extension: the INVITE rings here (Décrocher / Ignorer).
//
// The SIP login comes from POST /api/telephony/kavkom/sip, for this user only, and lives
// in memory for the life of the tab (never in storage).
// ============================================

import type { Invitation, Registerer, Session, UserAgent } from "sip.js";

export interface SipLogin {
    server: string;
    domain: string;
    extension: string;
    password: string;
    displayName: string;
}

export interface IncomingSipCall {
    /** The number or extension calling, as Kavkom shows it. */
    from: string;
    fromName: string | null;
    /** Kavkom asked for auto-answer (its click-to-call leg): Call-Info answer-after / Alert-Info. */
    autoAnswer: boolean;
    invitation: Invitation;
}

export interface KavkomPhoneEvents {
    onIncoming: (call: IncomingSipCall) => void;
    /** Registered or not; `error` says why it is not (wrong password, unreachable server). */
    onLine: (state: { registered: boolean; error: string | null }) => void;
}

export interface SipCallHandlers {
    onEstablished: () => void;
    onEnded: () => void;
    onLevels: (input: number, output: number) => void;
}

/** Kavkom's click-to-call leg asks the phone to pick up on its own. */
export function wantsAutoAnswer(header: (name: string) => string | undefined): boolean {
    const callInfo = header("Call-Info") ?? "";
    const alertInfo = header("Alert-Info") ?? "";
    return /answer-after\s*=\s*0/i.test(callInfo) || /auto[\s_-]?answer|intercom/i.test(alertInfo) || /auto[\s_-]?answer/i.test(header("X-Auto-Answer") ?? "");
}

function rms(analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>): number {
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / buf.length) * 3);
}

export class KavkomPhone {
    private ua: UserAgent | null = null;
    private registerer: Registerer | null = null;
    private audio: HTMLAudioElement | null = null;
    private levelTimer: ReturnType<typeof setInterval> | null = null;
    private audioContext: AudioContext | null = null;
    private stopped = false;
    private sip: typeof import("sip.js") | null = null;

    private constructor(private login: SipLogin, private events: KavkomPhoneEvents) {}

    static async start(login: SipLogin, events: KavkomPhoneEvents): Promise<KavkomPhone> {
        const phone = new KavkomPhone(login, events);
        await phone.connect();
        return phone;
    }

    private async connect() {
        this.sip = await import("sip.js");
        const { UserAgent, Registerer, RegistererState } = this.sip;
        const uri = UserAgent.makeURI(`sip:${this.login.extension}@${this.login.domain}`);
        if (!uri) throw new Error("Adresse SIP Kavkom invalide");
        const ua = new UserAgent({
            uri,
            transportOptions: { server: this.login.server, keepAliveInterval: 25, connectionTimeout: 8 },
            authorizationUsername: this.login.extension,
            authorizationPassword: this.login.password,
            displayName: this.login.displayName,
            userAgentString: "Suzalink CRM",
            logBuiltinEnabled: false,
            reconnectionAttempts: 20,
            reconnectionDelay: 4,
            sessionDescriptionHandlerFactoryOptions: {
                peerConnectionConfiguration: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] },
                iceGatheringTimeout: 1500,
            },
            delegate: {
                onInvite: (invitation) => {
                    const req = invitation.request;
                    this.events.onIncoming({
                        from: req.from.uri.user ?? "inconnu",
                        fromName: req.from.displayName?.trim() || null,
                        autoAnswer: wantsAutoAnswer((n) => req.getHeader(n)),
                        invitation,
                    });
                },
                onDisconnect: (error) => {
                    if (this.stopped) return;
                    this.events.onLine({ registered: false, error: error ? "Connexion à Kavkom perdue, reconnexion…" : null });
                    // sip.js retries the WebSocket itself; register again once it is back.
                },
                onConnect: () => {
                    if (!this.stopped) void this.registerer?.register().catch(() => undefined);
                },
            },
        });
        this.ua = ua;
        const registerer = new Registerer(ua, { expires: 300 });
        this.registerer = registerer;
        registerer.stateChange.addListener((state) => {
            if (this.stopped) return;
            this.events.onLine({ registered: state === RegistererState.Registered, error: null });
        });
        await ua.start();
        await registerer.register({
            requestDelegate: {
                onReject: (response) => {
                    const code = response.message.statusCode;
                    this.events.onLine({
                        registered: false,
                        error: code === 401 || code === 403 ? "Kavkom refuse l'identifiant SIP de l'extension" : `Kavkom refuse l'enregistrement (${code})`,
                    });
                },
            },
        });
    }

    /** Picks up, with the chosen microphone; audio goes to the chosen output. */
    async accept(invitation: Invitation, handlers: SipCallHandlers, devices: { input: string | null; output: string | null }) {
        this.follow(invitation, handlers, devices.output);
        await invitation.accept({
            sessionDescriptionHandlerOptions: {
                constraints: { audio: devices.input ? { deviceId: { exact: devices.input } } : true, video: false },
            },
        });
    }

    /** Watches a call that ends before being picked up (the caller hangs up while it rings). */
    watchRinging(invitation: Invitation, onGone: () => void) {
        const SessionState = this.sip!.SessionState;
        invitation.stateChange.addListener((state) => {
            if (state === SessionState.Terminated) onGone();
        });
    }

    /** Sends the call to Kavkom's next step (voicemail, another agent): 486 Busy Here. */
    async decline(invitation: Invitation) {
        await invitation.reject({ statusCode: 486 }).catch(() => undefined);
    }

    async hangup(session: Session) {
        const SessionState = this.sip!.SessionState;
        if (session.state === SessionState.Established) await session.bye().catch(() => undefined);
        else if ("reject" in session && session.state === SessionState.Initial) await (session as Invitation).reject().catch(() => undefined);
        else await session.dispose().catch(() => undefined);
    }

    setMuted(session: Session, muted: boolean) {
        const pc = this.peer(session);
        pc?.getSenders().forEach((s) => {
            if (s.track?.kind === "audio") s.track.enabled = !muted;
        });
    }

    sendDigit(session: Session, digit: string): boolean {
        const sdh = session.sessionDescriptionHandler as unknown as { sendDtmf?: (t: string) => boolean } | undefined;
        if (sdh?.sendDtmf?.(digit)) return true;
        // No RFC 2833 on this call: SIP INFO, which FreeSWITCH understands.
        void session.info({ requestOptions: { body: { contentDisposition: "render", contentType: "application/dtmf-relay", content: `Signal=${digit}\r\nDuration=160` } } }).catch(() => undefined);
        return true;
    }

    async setOutput(deviceId: string | null) {
        const el = this.audio as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
        if (el?.setSinkId) await el.setSinkId(deviceId ?? "default").catch(() => undefined);
    }

    async stop() {
        this.stopped = true;
        this.stopLevels();
        try {
            await this.registerer?.unregister();
        } catch {
            /* already gone */
        }
        await this.ua?.stop().catch(() => undefined);
        this.ua = null;
        this.registerer = null;
    }

    // ── media ────────────────────────────────────────────────────────────
    private peer(session: Session): RTCPeerConnection | undefined {
        return (session.sessionDescriptionHandler as unknown as { peerConnection?: RTCPeerConnection } | undefined)?.peerConnection;
    }

    private follow(session: Session, handlers: SipCallHandlers, output: string | null) {
        const SessionState = this.sip!.SessionState;
        this.levelHandler = handlers.onLevels;
        session.stateChange.addListener((state) => {
            if (state === SessionState.Established) {
                this.playRemote(session, output);
                handlers.onEstablished();
            } else if (state === SessionState.Terminated) {
                this.stopLevels();
                if (this.audio) this.audio.srcObject = null;
                handlers.onEnded();
            }
        });
    }

    private levelHandler: ((input: number, output: number) => void) | null = null;

    private playRemote(session: Session, output: string | null) {
        const pc = this.peer(session);
        if (!pc) return;
        const remote = new MediaStream();
        pc.getReceivers().forEach((r) => r.track && remote.addTrack(r.track));
        if (!this.audio) {
            this.audio = new Audio();
            this.audio.autoplay = true;
        }
        this.audio.srcObject = remote;
        void this.setOutput(output);
        void this.audio.play().catch(() => undefined);

        // Level bars: the SDR's microphone and the prospect's voice, like the Twilio line.
        try {
            const local = new MediaStream();
            pc.getSenders().forEach((s) => s.track && local.addTrack(s.track));
            this.audioContext ??= new AudioContext();
            const ctx = this.audioContext;
            const inA = ctx.createAnalyser();
            const outA = ctx.createAnalyser();
            inA.fftSize = outA.fftSize = 512;
            if (local.getAudioTracks().length) ctx.createMediaStreamSource(local).connect(inA);
            if (remote.getAudioTracks().length) ctx.createMediaStreamSource(remote).connect(outA);
            const buf = new Uint8Array(new ArrayBuffer(inA.fftSize));
            this.stopLevels();
            this.levelTimer = setInterval(() => this.levelHandler?.(rms(inA, buf), rms(outA, buf)), 50);
        } catch {
            /* no Web Audio: no bars, the call works */
        }
    }

    private stopLevels() {
        if (this.levelTimer) clearInterval(this.levelTimer);
        this.levelTimer = null;
        this.levelHandler?.(0, 0);
    }
}

// ── Ringtone ────────────────────────────────────────────────────────────────
// The Twilio SDK rings by itself; a SIP call needs its own. A French ring
// (440 Hz, 1.5 s on, 3.5 s off), generated once, on the ringtone device chosen
// in « Réglages audio ».

let ringUrl: string | null = null;

function ringWav(): string {
    if (ringUrl) return ringUrl;
    const rate = 8000;
    const seconds = 5;
    const n = rate * seconds;
    const data = new DataView(new ArrayBuffer(44 + n * 2));
    const text = (o: number, s: string) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
    text(0, "RIFF"); data.setUint32(4, 36 + n * 2, true); text(8, "WAVE"); text(12, "fmt ");
    data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
    data.setUint32(24, rate, true); data.setUint32(28, rate * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true);
    text(36, "data"); data.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
        const t = i / rate;
        const on = t < 1.5;
        const fade = Math.min(1, t * 50, (1.5 - t) * 50);
        const v = on ? Math.sin(2 * Math.PI * 440 * t) * 0.35 * Math.max(0, fade) : 0;
        data.setInt16(44 + i * 2, Math.round(v * 32767), true);
    }
    ringUrl = URL.createObjectURL(new Blob([data.buffer], { type: "audio/wav" }));
    return ringUrl;
}

/** Rings until the returned function is called. */
export function startRingtone(deviceId: string | null): () => void {
    if (typeof Audio === "undefined") return () => undefined;
    const el = new Audio(ringWav()) as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    el.loop = true;
    void (deviceId && el.setSinkId ? el.setSinkId(deviceId).catch(() => undefined) : Promise.resolve()).then(() => el.play().catch(() => undefined));
    return () => {
        el.pause();
        el.src = "";
    };
}
