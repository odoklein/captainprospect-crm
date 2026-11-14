"use client";

// Reusable tutorial player: native, keyboard-accessible video controls, French captions,
// and a chapter transcript that reads on its own (and seeks the video).
// Nothing autoplays; the video file is only requested once the viewer presses play.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Captions, ListVideo, VolumeX } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { FOCUS_RING } from "@/components/ui/recipes";
import { cn } from "@/lib/utils";
import { tutorialAsset, type TutorialEntry, type TutorialMeta } from "@/lib/tutorials/types";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (cb: () => void) => {
    const mq = window.matchMedia(REDUCED);
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
};
const usePrefersReducedMotion = () =>
    useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches, () => false);

export default function TutorialPlayer({ tutorial, onClose }: { tutorial: TutorialEntry; onClose: () => void }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [meta, setMeta] = useState<TutorialMeta | null>(null);
    const [failed, setFailed] = useState(false);
    const [time, setTime] = useState(0);
    const reducedMotion = usePrefersReducedMotion();

    useEffect(() => {
        let cancelled = false;
        fetch(tutorialAsset(tutorial, "json"))
            .then((r) => (r.ok ? (r.json() as Promise<TutorialMeta>) : Promise.reject(new Error(String(r.status)))))
            .then((m) => !cancelled && setMeta(m))
            .catch(() => !cancelled && setFailed(true));
        return () => {
            cancelled = true;
        };
    }, [tutorial]);

    const chapters = meta?.chapters ?? [];
    const current = chapters.reduce((acc, ch, i) => (time + 0.05 >= ch.start ? i : acc), -1);

    const seek = (s: number) => {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = s;
        setTime(s);
        void v.play().catch(() => {});
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            title={`Tutoriel · ${tutorial.title}`}
            description={meta?.purpose}
            size="full"
            className="max-w-6xl"
            contentClassName="p-0 overflow-y-auto"
        >
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="p-4 sm:p-5 lg:pr-4">
                    {reducedMotion && (
                        <p className="mb-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">
                            Cette vidéo contient des zooms et des déplacements à l&apos;écran. La transcription décrit chaque étape si vous préférez lire.
                        </p>
                    )}
                    <div className="relative overflow-hidden rounded-xl bg-[#06103A] aspect-video">
                        <video
                            ref={videoRef}
                            className="absolute inset-0 size-full"
                            controls
                            playsInline
                            preload="none"
                            poster={tutorialAsset(tutorial, "jpg")}
                            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
                            aria-describedby="tutorial-transcript"
                        >
                            <source src={tutorialAsset(tutorial, "mp4")} type="video/mp4" />
                            <track kind="captions" srcLang="fr" label="Français" src={tutorialAsset(tutorial, "vtt")} />
                        </video>
                    </div>
                    <p className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-3">
                        <span className="inline-flex items-center gap-1.5"><VolumeX className="size-3.5" aria-hidden /> Sans son : tout est écrit à l&apos;écran</span>
                        <span className="inline-flex items-center gap-1.5"><Captions className="size-3.5" aria-hidden /> Sous-titres en français</span>
                        <span>{clock(tutorial.durationSec)}</span>
                    </p>
                </div>

                <section
                    id="tutorial-transcript"
                    aria-label="Transcription"
                    className={cn(
                        "border-t border-line-subtle lg:border-t-0 lg:border-l p-4 sm:p-5 lg:pl-4 lg:max-h-[70vh] lg:overflow-y-auto",
                        reducedMotion && "order-first lg:order-none",
                    )}
                >
                    <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-3">
                        <ListVideo className="size-3.5" aria-hidden /> Transcription
                    </h3>
                    {failed && <p className="text-sm text-ink-3">La transcription n&apos;a pas pu être chargée.</p>}
                    {!meta && !failed && <div className="space-y-2" aria-hidden>{[0, 1, 2, 3].map((i) => <div key={i} className="h-12 rounded-lg bg-surface-2" />)}</div>}
                    <ol className="space-y-1">
                        {chapters.map((ch, i) => (
                            <li key={ch.start}>
                                <button
                                    type="button"
                                    onClick={() => seek(ch.start)}
                                    aria-current={i === current ? "step" : undefined}
                                    className={cn(
                                        "w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-2",
                                        i === current && "bg-accent-50/70 hover:bg-accent-50",
                                        FOCUS_RING,
                                    )}
                                >
                                    <span className="flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                                        <span className="tabular-nums">{clock(ch.start)}</span>
                                        <span className={cn(i === current && "text-accent-700")}>{ch.label}</span>
                                    </span>
                                    <span className="mt-0.5 block text-[13.5px] font-semibold text-ink">{ch.title}</span>
                                    <span className="block text-[12.5px] leading-snug text-ink-2">{ch.detail}</span>
                                </button>
                            </li>
                        ))}
                    </ol>
                </section>
            </div>
        </Modal>
    );
}
