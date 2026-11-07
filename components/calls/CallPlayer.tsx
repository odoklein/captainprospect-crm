"use client";

// ============================================
// CALL PLAYER — a recording with its real waveform.
//
// Audio streams from the authenticated recording route straight away; the
// waveform is computed from the same file in the background (Web Audio
// decode → RMS per bar). If the browser cannot decode it, a plain progress
// track is shown: the shape is never invented.
// ============================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

const BARS = 96;
const SPEEDS = [1, 1.25, 1.5, 2] as const;

function clock(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) return "0:00";
    const s = Math.floor(sec);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** RMS of each slice of the first channel, normalised to 0..1. */
export function waveformPeaks(samples: Float32Array, bars: number): number[] {
    const size = Math.max(1, Math.floor(samples.length / bars));
    const out: number[] = [];
    for (let b = 0; b < bars; b++) {
        let sum = 0;
        const start = b * size;
        const end = Math.min(samples.length, start + size);
        for (let i = start; i < end; i++) sum += samples[i] * samples[i];
        out.push(Math.sqrt(sum / Math.max(1, end - start)));
    }
    const max = Math.max(...out, 1e-6);
    return out.map((v) => Math.max(0.06, v / max));
}

function useWaveform(src: string): number[] | null | "failed" {
    const [peaks, setPeaks] = useState<number[] | null | "failed">(null);
    useEffect(() => {
        let cancelled = false;
        const ctrl = new AbortController();
        (async () => {
            try {
                const res = await fetch(src, { signal: ctrl.signal });
                if (!res.ok) throw new Error(String(res.status));
                const buf = await res.arrayBuffer();
                const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
                const ctx = new Ctx();
                const audio = await ctx.decodeAudioData(buf);
                void ctx.close();
                if (!cancelled) setPeaks(waveformPeaks(audio.getChannelData(0), BARS));
            } catch {
                if (!cancelled) setPeaks("failed");
            }
        })();
        return () => {
            cancelled = true;
            ctrl.abort();
        };
    }, [src]);
    return peaks;
}

export function CallPlayer({ src, className, durationHint }: { src: string; className?: string; durationHint?: number | null }) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const [playing, setPlaying] = useState(false);
    const [time, setTime] = useState(0);
    const [duration, setDuration] = useState(durationHint ?? 0);
    const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
    const [hover, setHover] = useState<number | null>(null);
    const [error, setError] = useState(false);
    const peaks = useWaveform(src);

    useEffect(() => {
        const a = audioRef.current;
        if (!a) return;
        let raf = 0;
        const loop = () => {
            setTime(a.currentTime);
            raf = requestAnimationFrame(loop);
        };
        if (playing) raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [playing]);

    useEffect(() => {
        if (audioRef.current) audioRef.current.playbackRate = speed;
    }, [speed]);

    const toggle = useCallback(() => {
        const a = audioRef.current;
        if (!a) return;
        if (a.paused) void a.play().catch(() => setError(true));
        else a.pause();
    }, []);

    const seekTo = useCallback(
        (ratio: number) => {
            const a = audioRef.current;
            if (!a || !duration) return;
            a.currentTime = Math.min(duration, Math.max(0, ratio * duration));
            setTime(a.currentTime);
        },
        [duration],
    );

    const ratioAt = (clientX: number) => {
        const r = trackRef.current?.getBoundingClientRect();
        return r ? Math.min(1, Math.max(0, (clientX - r.left) / r.width)) : 0;
    };

    const progress = duration ? time / duration : 0;

    return (
        <div
            className={cn("rounded-panel border border-line bg-surface p-3", className)}
            tabIndex={0}
            role="group"
            aria-label="Lecteur d'enregistrement"
            onKeyDown={(e) => {
                if (e.key === " " || e.key === "k") {
                    e.preventDefault();
                    toggle();
                } else if (e.key === "ArrowRight") {
                    e.preventDefault();
                    seekTo((time + 5) / (duration || 1));
                } else if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    seekTo((time - 5) / (duration || 1));
                }
            }}
        >
            <audio
                ref={audioRef}
                src={src}
                preload="metadata"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration;
                    if (Number.isFinite(d) && d > 0) setDuration(d);
                }}
                onDurationChange={(e) => {
                    const d = e.currentTarget.duration;
                    if (Number.isFinite(d) && d > 0) setDuration(d);
                }}
                onError={() => setError(true)}
            />
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={toggle}
                    disabled={error}
                    aria-label={playing ? "Pause" : "Lire l'enregistrement"}
                    style={{ ["--halo" as string]: "var(--ds-primary)" }}
                    className={cn("cp-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-40", playing && "cp-halo")}
                >
                    {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
                </button>

                <div
                    ref={trackRef}
                    className="relative flex h-10 min-w-0 flex-1 cursor-pointer items-center"
                    onPointerDown={(e) => {
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                        seekTo(ratioAt(e.clientX));
                    }}
                    onPointerMove={(e) => {
                        setHover(ratioAt(e.clientX));
                        if (e.buttons === 1) seekTo(ratioAt(e.clientX));
                    }}
                    onPointerLeave={() => setHover(null)}
                    role="slider"
                    aria-label="Position dans l'enregistrement"
                    aria-valuemin={0}
                    aria-valuemax={Math.round(duration)}
                    aria-valuenow={Math.round(time)}
                    aria-valuetext={`${clock(time)} sur ${clock(duration)}`}
                >
                    {Array.isArray(peaks) ? (
                        <div className="flex h-full w-full items-center gap-[2px]" aria-hidden>
                            {peaks.map((p, i) => {
                                const played = (i + 0.5) / peaks.length <= progress;
                                return (
                                    <span
                                        key={i}
                                        className={cn("cp-grow-y min-w-[1px] flex-1 rounded-full transition-colors duration-150", played ? "bg-primary" : "bg-line-strong")}
                                        style={{ height: `${Math.round(p * 100)}%`, ["--i" as string]: i }}
                                    />
                                );
                            })}
                        </div>
                    ) : (
                        <div className={cn("relative h-1 w-full overflow-hidden rounded-full bg-surface-3", peaks === null && "cp-shimmer")} aria-hidden>
                            <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${progress * 100}%` }} />
                        </div>
                    )}
                    {hover !== null && duration > 0 && (
                        <span
                            className="pointer-events-none absolute -top-6 -translate-x-1/2 rounded bg-inverse px-1.5 py-0.5 text-[10px] tabular-nums text-inverse-ink"
                            style={{ left: `${hover * 100}%` }}
                        >
                            {clock(hover * duration)}
                        </span>
                    )}
                </div>

                <span className="shrink-0 text-[12px] tabular-nums text-ink-3">
                    {clock(time)} <span className="text-ink-4">/ {clock(duration)}</span>
                </span>
                <button
                    type="button"
                    onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])}
                    className="cp-press h-7 shrink-0 rounded-control border border-line px-1.5 text-[11px] font-semibold tabular-nums text-ink-2 hover:bg-surface-2"
                    aria-label={`Vitesse de lecture ${speed}×`}
                    title="Vitesse de lecture"
                >
                    {speed}×
                </button>
            </div>
            {error && <p className="mt-2 text-[12px] text-danger-ink">Enregistrement illisible ou indisponible.</p>}
        </div>
    );
}
