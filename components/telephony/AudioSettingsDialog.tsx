"use client";

// ============================================
// RÉGLAGES AUDIO — choose and test the microphone, the headset/speakers and the
// ringtone output, like the audio settings of a desktop softphone.
//
//   Micro        live level meter on the selected device (same processing as a
//                call: echo cancellation, noise suppression), a warning when it
//                stays silent, and « S'enregistrer 3 s » played back on the
//                selected output — the honest test of what a prospect will hear.
//   Écoute       « Tester le son » plays a chime on the selected output.
//   Sonnerie     where incoming calls ring (e.g. laptop speakers while the
//                headset is on the desk).
//
// Choices are kept on this computer (lib/telephony/audio-prefs) and applied to
// calls by SoftphoneProvider, immediately if a call is in progress.
// ============================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BellRing, CircleAlert, Headphones, Mic, Play, Square, Volume2 } from "lucide-react";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import {
    SILENCE_LEVEL, chimeWav, deviceOptions, levelFromSamples, resolveDevice,
    type AudioPrefs, type DeviceLike, type DevicePick,
} from "@/lib/telephony/audio-prefs";

type Permission = "pending" | "granted" | "denied" | "unavailable";
type MicTest = { phase: "idle" } | { phase: "recording"; left: number } | { phase: "playing" };

const RECORD_SECONDS = 3;
const SILENCE_AFTER_MS = 4_000;
const SEGMENTS = 24;
const SELECT = "h-9 w-full min-w-0 rounded-control border border-line bg-surface px-2.5 text-[13px] text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-focus disabled:opacity-60";
const GHOST = "cp-press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-ink-2 ring-1 ring-line hover:bg-surface-2 hover:text-ink disabled:opacity-50";

function sinkSupported(): boolean {
    return typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
}

async function playOn(el: HTMLAudioElement, outputId: string) {
    if (sinkSupported() && outputId) {
        await (el as HTMLAudioElement & { setSinkId(id: string): Promise<void> }).setSinkId(outputId).catch(() => undefined);
    }
    await el.play();
}

export function AudioSettingsDialog({
    open,
    onClose,
    prefs,
    onSave,
    inCall,
}: {
    open: boolean;
    onClose: () => void;
    prefs: AudioPrefs;
    onSave: (prefs: AudioPrefs) => void;
    inCall: boolean;
}) {
    const [devices, setDevices] = useState<DeviceLike[]>([]);
    const [permission, setPermission] = useState<Permission>("pending");
    const [input, setInput] = useState("");
    const [output, setOutput] = useState("");
    const [ringtone, setRingtone] = useState("");
    const [level, setLevel] = useState(0);
    const [silent, setSilent] = useState(false);
    const [micTest, setMicTest] = useState<MicTest>({ phase: "idle" });
    const [chiming, setChiming] = useState<"output" | "ringtone" | null>(null);
    const [unplugged, setUnplugged] = useState<string | null>(null);

    const streamRef = useRef<MediaStream | null>(null);
    const ctxRef = useRef<AudioContext | null>(null);
    const rafRef = useRef<number | null>(null);
    const playerRef = useRef<HTMLAudioElement | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const canRoute = useMemo(sinkSupported, []);
    const canRecord = typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined";

    const refreshDevices = useCallback(async () => {
        const list = (await navigator.mediaDevices?.enumerateDevices().catch(() => [])) ?? [];
        setDevices(list.map((d) => ({ deviceId: d.deviceId, label: d.label, kind: d.kind })));
        return list;
    }, []);

    const stopPlayer = useCallback(() => {
        playerRef.current?.pause();
        if (playerRef.current?.src.startsWith("blob:")) URL.revokeObjectURL(playerRef.current.src);
        playerRef.current = null;
        setChiming(null);
    }, []);

    const stopMic = useCallback(() => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        if (recorderRef.current?.state === "recording") recorderRef.current.stop();
        recorderRef.current = null;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        void ctxRef.current?.close().catch(() => undefined);
        ctxRef.current = null;
        setLevel(0);
    }, []);

    // Opening: fill the selects from the saved choices (resolved against what is plugged in now).
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setPermission("pending");
        setMicTest({ phase: "idle" });
        setUnplugged(null);
        void (async () => {
            if (!navigator.mediaDevices?.getUserMedia) {
                setPermission("unavailable");
                return;
            }
            // Ask once so device names are visible; the meter stream is opened below.
            try {
                const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
                probe.getTracks().forEach((t) => t.stop());
                if (cancelled) return;
                setPermission("granted");
            } catch (err) {
                if (!cancelled) setPermission((err as DOMException)?.name === "NotAllowedError" ? "denied" : "unavailable");
            }
            const list = (await refreshDevices()).map((d) => ({ deviceId: d.deviceId, label: d.label, kind: d.kind }));
            if (cancelled) return;
            setInput(resolveDevice(prefs.input, list, "audioinput") ?? "");
            setOutput(resolveDevice(prefs.output, list, "audiooutput") ?? "");
            setRingtone(resolveDevice(prefs.ringtone, list, "audiooutput") ?? "");
            const missing = [prefs.input, prefs.output].find((p, i) => p && !resolveDevice(p, list, i === 0 ? "audioinput" : "audiooutput"));
            if (missing) setUnplugged(missing.label || "L'appareil enregistré");
        })();
        return () => {
            cancelled = true;
        };
    }, [open, prefs, refreshDevices]);

    // Live meter on the selected microphone.
    useEffect(() => {
        if (!open || permission !== "granted") return;
        let cancelled = false;
        stopMic();
        setSilent(false);
        void (async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: { deviceId: input ? { exact: input } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                });
                if (cancelled) return stream.getTracks().forEach((t) => t.stop());
                streamRef.current = stream;
                const ctx = new AudioContext();
                ctxRef.current = ctx;
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 512;
                ctx.createMediaStreamSource(stream).connect(analyser);
                const buf = new Uint8Array(analyser.fftSize);
                const started = performance.now();
                let peak = 0;
                let frame = 0;
                const tick = () => {
                    analyser.getByteTimeDomainData(buf);
                    const l = levelFromSamples(buf);
                    peak = Math.max(peak, l);
                    if (++frame % 2 === 0) setLevel(l);
                    if (performance.now() - started > SILENCE_AFTER_MS) setSilent(peak < SILENCE_LEVEL);
                    rafRef.current = requestAnimationFrame(tick);
                };
                tick();
            } catch {
                if (!cancelled) setSilent(true);
            }
        })();
        return () => {
            cancelled = true;
            stopMic();
        };
    }, [open, permission, input, stopMic]);

    // A headset plugged in or pulled out while the window is open.
    useEffect(() => {
        if (!open || !navigator.mediaDevices) return;
        const onChange = () => {
            void refreshDevices().then((list) => {
                const ids = new Set(list.map((d) => d.deviceId));
                if (input && !ids.has(input)) {
                    setUnplugged(devices.find((d) => d.deviceId === input)?.label || "Le micro choisi");
                    setInput("");
                }
                if (output && !ids.has(output)) setOutput("");
                if (ringtone && !ids.has(ringtone)) setRingtone("");
            });
        };
        navigator.mediaDevices.addEventListener("devicechange", onChange);
        return () => navigator.mediaDevices.removeEventListener("devicechange", onChange);
    }, [open, input, output, ringtone, devices, refreshDevices]);

    // Closing releases the microphone and stops any sound.
    useEffect(() => {
        if (open) return;
        stopMic();
        stopPlayer();
    }, [open, stopMic, stopPlayer]);

    const chime = async (target: "output" | "ringtone") => {
        stopPlayer();
        const url = URL.createObjectURL(new Blob([chimeWav().slice().buffer], { type: "audio/wav" }));
        const el = new Audio(url);
        playerRef.current = el;
        setChiming(target);
        el.onended = () => stopPlayer();
        await playOn(el, target === "output" ? output : ringtone || output).catch(() => stopPlayer());
    };

    const recordAndPlay = () => {
        const stream = streamRef.current;
        if (!stream || !canRecord) return;
        stopPlayer();
        const chunks: Blob[] = [];
        const rec = new MediaRecorder(stream);
        recorderRef.current = rec;
        rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        rec.onstop = () => {
            recorderRef.current = null;
            if (!chunks.length) return setMicTest({ phase: "idle" });
            const url = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
            const el = new Audio(url);
            playerRef.current = el;
            setMicTest({ phase: "playing" });
            el.onended = () => {
                stopPlayer();
                setMicTest({ phase: "idle" });
            };
            void playOn(el, output).catch(() => setMicTest({ phase: "idle" }));
        };
        rec.start();
        setMicTest({ phase: "recording", left: RECORD_SECONDS });
        let left = RECORD_SECONDS;
        const timer = setInterval(() => {
            left -= 1;
            if (left > 0) return setMicTest({ phase: "recording", left });
            clearInterval(timer);
            if (rec.state === "recording") rec.stop();
        }, 1000);
    };

    const save = () => {
        const label = (id: string) => devices.find((d) => d.deviceId === id)?.label ?? "";
        const toPick = (id: string): DevicePick | null => (id ? { id, label: label(id) } : null);
        onSave({ input: toPick(input), output: toPick(output), ringtone: toPick(ringtone) });
        onClose();
    };

    const inputs = deviceOptions(devices, "audioinput");
    const outputs = deviceOptions(devices, "audiooutput");
    const lit = Math.round(level * SEGMENTS);

    return (
        <Modal
            isOpen={open}
            onClose={onClose}
            title="Réglages audio"
            description="Choisissez et testez votre micro et votre casque. Ces réglages restent sur cet ordinateur."
            size="md"
        >
            <div className="space-y-4" onKeyDown={(e) => e.stopPropagation()}>
                {permission === "denied" && (
                    <p className="flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2.5 text-[12.5px] text-danger-ink">
                        <CircleAlert className="mt-[1px] h-4 w-4 shrink-0" aria-hidden />
                        Le micro est bloqué pour ce site. Cliquez sur l&apos;icône du cadenas dans la barre d&apos;adresse, autorisez le micro, puis rouvrez cette fenêtre.
                    </p>
                )}
                {permission === "unavailable" && (
                    <p className="flex items-start gap-2 rounded-control bg-warning-soft px-3 py-2.5 text-[12.5px] text-warning-ink">
                        <CircleAlert className="mt-[1px] h-4 w-4 shrink-0" aria-hidden />
                        Aucun micro n&apos;est accessible. Branchez un casque, ou vérifiez qu&apos;aucune autre application ne l&apos;utilise.
                    </p>
                )}
                {unplugged && (
                    <p className="rounded-control bg-surface-2 px-3 py-2 text-[12px] text-ink-2">
                        <span className="font-medium">{unplugged}</span> n&apos;est pas branché : l&apos;appareil par défaut du système est utilisé.
                    </p>
                )}
                {inCall && <p className="rounded-control bg-accent-50 px-3 py-2 text-[12px] text-accent-700">Appel en cours : vos choix s&apos;appliquent dès l&apos;enregistrement.</p>}

                {/* Micro */}
                <section className="rounded-[14px] border border-line p-3.5">
                    <div className="flex items-center gap-2">
                        <Mic className="h-4 w-4 text-ink-3" aria-hidden />
                        <label htmlFor="audio-input" className="text-[13px] font-semibold text-ink">Micro</label>
                    </div>
                    <select id="audio-input" className={cn(SELECT, "mt-2")} value={input} onChange={(e) => { setUnplugged(null); setInput(e.target.value); }} disabled={permission !== "granted"}>
                        {inputs.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    <div className="mt-3 flex items-center gap-3">
                        <div className="flex h-3 flex-1 items-end gap-[3px]" role="meter" aria-label="Niveau du micro" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
                            {Array.from({ length: SEGMENTS }, (_, i) => (
                                <span
                                    key={i}
                                    className={cn(
                                        "h-full flex-1 rounded-[2px] transition-colors duration-75",
                                        i < lit ? (i >= SEGMENTS - 3 ? "bg-warning" : "bg-success") : "bg-surface-3",
                                    )}
                                />
                            ))}
                        </div>
                        {canRecord && (
                            <button type="button" onClick={recordAndPlay} disabled={permission !== "granted" || micTest.phase !== "idle"} className={cn(GHOST, "min-w-[148px] justify-center", micTest.phase === "recording" && "text-danger-ink ring-danger/40 disabled:opacity-100")}>
                                {micTest.phase === "recording" ? <Square className="h-3.5 w-3.5 text-danger" /> : <Play className="h-3.5 w-3.5" />}
                                {micTest.phase === "recording" ? `Parlez… ${micTest.left}` : micTest.phase === "playing" ? "Écoute…" : `S'enregistrer ${RECORD_SECONDS} s`}
                            </button>
                        )}
                    </div>
                    <p className={cn("mt-2 text-[12px]", silent ? "text-warning-ink" : "text-ink-3")} aria-live="polite">
                        {silent
                            ? "Aucun son capté. Vérifiez que c'est le bon micro et qu'il n'est pas coupé (bouton sur le casque ou le câble)."
                            : micTest.phase === "recording"
                              ? "Parlez normalement, comme en appel…"
                              : micTest.phase === "playing"
                                ? "Voici ce que votre prospect entendra."
                              : "Parlez : la barre doit bouger. Enregistrez-vous pour entendre ce que le prospect entendra."}
                    </p>
                </section>

                {/* Écoute */}
                <section className="rounded-[14px] border border-line p-3.5">
                    <div className="flex items-center gap-2">
                        <Headphones className="h-4 w-4 text-ink-3" aria-hidden />
                        <label htmlFor="audio-output" className="text-[13px] font-semibold text-ink">Casque ou haut-parleurs</label>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                        {canRoute ? (
                            <select id="audio-output" className={SELECT} value={output} onChange={(e) => setOutput(e.target.value)} disabled={permission !== "granted"}>
                                {outputs.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                            </select>
                        ) : (
                            <p id="audio-output" className="flex-1 text-[12.5px] text-ink-3">Sortie audio du système (ce navigateur ne permet pas de la choisir ; utilisez Chrome ou Edge, ou changez-la dans les réglages de l&apos;ordinateur).</p>
                        )}
                        <button type="button" onClick={() => void chime("output")} className={GHOST}>
                            <Volume2 className={cn("h-3.5 w-3.5", chiming === "output" && "animate-pulse text-primary")} /> Tester le son
                        </button>
                    </div>
                </section>

                {/* Sonnerie */}
                {canRoute && (
                    <section className="rounded-[14px] border border-line p-3.5">
                        <div className="flex items-center gap-2">
                            <BellRing className="h-4 w-4 text-ink-3" aria-hidden />
                            <label htmlFor="audio-ringtone" className="text-[13px] font-semibold text-ink">Sonnerie des appels entrants</label>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                            <select id="audio-ringtone" className={SELECT} value={ringtone} onChange={(e) => setRingtone(e.target.value)} disabled={permission !== "granted"}>
                                {outputs.map((o) => <option key={o.id} value={o.id}>{o.id ? o.label : "Comme le casque"}</option>)}
                            </select>
                            <button type="button" onClick={() => void chime("ringtone")} className={GHOST}>
                                <Volume2 className={cn("h-3.5 w-3.5", chiming === "ringtone" && "animate-pulse text-primary")} /> Tester
                            </button>
                        </div>
                        <p className="mt-2 text-[12px] text-ink-3">Pratique pour entendre sonner sur les haut-parleurs quand le casque est posé.</p>
                    </section>
                )}
            </div>

            <ModalFooter>
                <button type="button" onClick={onClose} className="cp-press h-9 rounded-full px-4 text-[13px] font-medium text-ink-2 hover:bg-surface-2">
                    Annuler
                </button>
                <button type="button" onClick={save} disabled={permission === "pending"} className="cp-press h-9 rounded-full bg-primary px-5 text-[13px] font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-60">
                    Enregistrer
                </button>
            </ModalFooter>
        </Modal>
    );
}
