"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { formatClock } from "./call-model";

const BARS = 64;
const SPEEDS = [1, 1.25, 1.5, 2] as const;
/** Beyond this the waveform isn't worth a second download. */
const MAX_WAVEFORM_BYTES = 30 * 1024 * 1024;

/** Real peaks of the recording, decoded in the browser. null while loading / when unavailable. */
function useWaveform(src: string): number[] | null {
  const [wave, setWave] = useState<{ src: string; peaks: number[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(src, { signal: ctrl.signal });
        if (!res.ok) return;
        const len = Number(res.headers.get("Content-Length") ?? 0);
        if (len > MAX_WAVEFORM_BYTES) return;
        const buf = await res.arrayBuffer();
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const audio = await ctx.decodeAudioData(buf);
        void ctx.close();
        const data = audio.getChannelData(0);
        const step = Math.max(1, Math.floor(data.length / BARS));
        const out: number[] = [];
        for (let i = 0; i < BARS; i++) {
          let sum = 0;
          const start = i * step;
          for (let j = start; j < start + step && j < data.length; j += 16) sum += Math.abs(data[j]!);
          out.push(sum / Math.max(1, step / 16));
        }
        const max = Math.max(...out, 1e-6);
        if (!cancelled) setWave({ src, peaks: out.map((v) => Math.max(0.08, v / max)) });
      } catch {
        /* the flat track stays: playback does not depend on it */
      }
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [src]);
  return wave?.src === src ? wave.peaks : null;
}

/** One recording. Rendered with `key={src}` so a new recording starts from a fresh state. */
export function CallPlayer({ src, downloadName }: { src: string; downloadName: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const peaks = useWaveform(src);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => setError("Lecture impossible : l'enregistrement n'a pas pu être chargé."));
    else a.pause();
  }, []);

  const seekTo = useCallback((sec: number) => {
    const a = audioRef.current;
    if (!a || !Number.isFinite(a.duration)) return;
    a.currentTime = Math.min(Math.max(0, sec), a.duration);
    setCurrent(a.currentTime);
  }, []);

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el || !duration) return;
      const r = el.getBoundingClientRect();
      seekTo(((clientX - r.left) / r.width) * duration);
    },
    [duration, seekTo],
  );

  const onTrackKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); seekTo(current + 5); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); seekTo(current - 5); }
    else if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
    else if (e.key === "Home") { e.preventDefault(); seekTo(0); }
    else if (e.key === "End") { e.preventDefault(); seekTo(duration); }
  };

  const progress = duration ? current / duration : 0;
  const bufferedRatio = duration ? buffered / duration : 0;
  const bars = peaks ?? Array.from({ length: BARS }, () => 0.22);

  return (
    <div className="rdv-player">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d)) setDuration(d);
          setReady(true);
        }}
        onDurationChange={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d)) setDuration(d);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onProgress={(e) => {
          const b = e.currentTarget.buffered;
          if (b.length) setBuffered(b.end(b.length - 1));
        }}
        onError={() => setError("L'enregistrement est introuvable ou n'est plus accessible chez le fournisseur.")}
      />
      <div className="rdv-player-row">
        <button
          type="button"
          className="rdv-player-play"
          onClick={toggle}
          disabled={!!error}
          aria-label={playing ? "Mettre en pause" : "Écouter l'appel"}
        >
          {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />}
        </button>
        <div className="rdv-player-main">
          <div
            ref={trackRef}
            className="rdv-player-track"
            role="slider"
            tabIndex={0}
            aria-label="Position dans l'enregistrement"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(current)}
            aria-valuetext={`${formatClock(current)} sur ${formatClock(duration)}`}
            onKeyDown={onTrackKey}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              seekFromPointer(e.clientX);
            }}
            onPointerMove={(e) => {
              if (e.buttons === 1) seekFromPointer(e.clientX);
            }}
          >
            <div className="rdv-player-bars" aria-hidden="true">
              {bars.map((h, i) => {
                const pos = (i + 0.5) / BARS;
                return (
                  <span
                    key={i}
                    className="rdv-player-bar"
                    data-played={pos <= progress}
                    data-buffered={pos <= bufferedRatio}
                    style={{ height: `${Math.round(18 + h * 82)}%` }}
                  />
                );
              })}
            </div>
            {duration > 0 && <span className="rdv-player-head" style={{ left: `${progress * 100}%` }} />}
          </div>
          <div className="rdv-player-times">
            <span>{formatClock(current)}</span>
            <span>{ready ? formatClock(duration) : "…"}</span>
          </div>
        </div>
      </div>
      <div className="rdv-player-ctls">
        <button type="button" className="rdv-player-ctl" onClick={() => seekTo(current - 10)} aria-label="Reculer de 10 secondes">
          <RotateCcw size={12} /> 10 s
        </button>
        <button type="button" className="rdv-player-ctl" onClick={() => seekTo(current + 10)} aria-label="Avancer de 10 secondes">
          10 s <RotateCw size={12} />
        </button>
        <button
          type="button"
          className="rdv-player-ctl"
          data-active={speed !== 1}
          onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!)}
          aria-label={`Vitesse de lecture ${speed}x`}
          title="Vitesse de lecture"
        >
          {speed.toLocaleString("fr-FR")}×
        </button>
        <a className="rdv-player-ctl" href={src} download={downloadName} style={{ marginLeft: "auto" }} title="Télécharger l'enregistrement">
          <Download size={12} /> Télécharger
        </a>
      </div>
      {error && <p className="rdv-player-error">{error}</p>}
    </div>
  );
}
