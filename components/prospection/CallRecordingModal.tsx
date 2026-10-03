"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui";
import { cn } from "@/lib/utils";

function TranscriptionReveal({
    text,
    progress,
    active,
}: {
    text: string;
    progress: number;
    active: boolean;
}) {
    if (!active) {
        return (
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-600">
                {text}
            </p>
        );
    }
    const safe = Math.min(1, Math.max(0, progress));
    const cut = Math.floor(text.length * safe);
    return (
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
            <span className="text-slate-900 font-medium transition-colors duration-100">
                {text.slice(0, cut)}
            </span>
            {cut < text.length && (
                <span
                    className="inline-block w-px h-4 ml-px align-middle bg-primary-500 animate-pulse"
                    aria-hidden
                />
            )}
            <span className="text-slate-300 transition-colors duration-100">{text.slice(cut)}</span>
        </p>
    );
}

export interface CallRecordingModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Action id — audio is streamed via /api/actions/[id]/recording (adds Allo API auth server-side). */
    actionId: string;
    transcription?: string | null;
    subtitle?: string;
}

export function CallRecordingModal({
    isOpen,
    onClose,
    actionId,
    transcription,
    subtitle,
}: CallRecordingModalProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const rafRef = useRef<number | null>(null);
    const [t, setT] = useState(0);
    const [dur, setDur] = useState(0);
    const [playing, setPlaying] = useState(false);

    const tick = useCallback(() => {
        const el = audioRef.current;
        if (el) setT(el.currentTime);
        rafRef.current = requestAnimationFrame(tick);
    }, []);

    useEffect(() => {
        if (!isOpen) {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
            setT(0);
            setDur(0);
            setPlaying(false);
            const el = audioRef.current;
            if (el) {
                el.pause();
                el.currentTime = 0;
            }
            return;
        }
        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        };
    }, [isOpen, tick]);

    const prog = dur > 0 && Number.isFinite(dur) ? t / dur : 0;
    const trans = transcription?.trim() ?? "";
    const streamSrc = `/api/actions/${actionId}/recording`;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Enregistrement d'appel"
            description={subtitle}
            size="lg"
        >
            <audio
                ref={audioRef}
                key={streamSrc}
                src={streamSrc}
                controls
                className="w-full rounded-xl border border-slate-200 bg-slate-50"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onLoadedMetadata={() => {
                    const d = audioRef.current?.duration;
                    if (d && Number.isFinite(d)) setDur(d);
                }}
                onDurationChange={() => {
                    const d = audioRef.current?.duration;
                    if (d && Number.isFinite(d)) setDur(d);
                }}
            />
            {trans ? (
                <div
                    className={cn(
                        "mt-5 max-h-[min(45vh,420px)] overflow-y-auto rounded-2xl border border-slate-100",
                        "bg-slate-50 p-5 shadow-inner"
                    )}
                >
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                        Transcription
                    </p>
                    <TranscriptionReveal
                        text={trans}
                        progress={prog}
                        active={playing || prog > 0.002}
                    />
                </div>
            ) : (
                <p className="mt-4 text-sm text-slate-400 italic">
                    Aucune transcription disponible pour cet appel.
                </p>
            )}
        </Modal>
    );
}
