"use client";

// ============================================
// CALL ISLAND — the call, at the top of the screen, like iOS's Dynamic Island.
//
// Compact: who, the call's phase and timer, live level bars (real Twilio
// input/output levels, green when the prospect speaks). When a new sentence
// is transcribed the island grows a line to show it, then settles back.
// Hover or click: expanded — the last lines of the conversation, mute and
// hang up. Échap folds it. After the call it shows the outcome, then retracts.
// ============================================

import { useEffect, useState } from "react";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatClock, formatDuration, formatPhone } from "@/components/incoming-calls/useIncomingCalls";
import { isCallActive, useCallLevels, useSoftphone, type SoftphoneCall } from "./SoftphoneProvider";
import { useCallTranscript } from "./CallInsights";

/** How long a new sentence keeps the island open in compact mode. */
const LINE_HOLD_MS = 6000;
/** How long the outcome stays visible after hang-up. */
const ENDED_HOLD_MS = 3500;
const BAR_SHAPE = [0.55, 0.9, 1, 0.75, 0.5];

function useNow(ticking: boolean) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!ticking) return;
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [ticking]);
    return now;
}

function phaseText(call: SoftphoneCall, now: number): string {
    switch (call.phase) {
        case "preparing":
        case "connecting":
            return "Connexion…";
        case "ringing":
            return "Ça sonne…";
        case "live":
            return formatClock((now - (call.answeredAt ?? now)) / 1000);
        case "failed":
            return "Échec";
        case "ended":
            return call.answeredAt && call.endedAt ? `Terminé · ${formatDuration(Math.round((call.endedAt - call.answeredAt) / 1000))}` : "Terminé";
    }
}

/** Level bars driven by the real call audio. */
function LevelBars({ live }: { live: boolean }) {
    const { input, output } = useCallLevels();
    const level = live ? Math.max(input, output) : 0;
    const prospect = output >= input;
    return (
        <span className="flex h-4 items-center gap-[3px]" aria-hidden>
            {BAR_SHAPE.map((k, i) => (
                <span
                    key={i}
                    className={cn("w-[3px] rounded-full transition-[height] duration-75", prospect ? "bg-emerald-400" : "bg-white/80")}
                    style={{ height: `${Math.max(18, Math.min(100, level * k * 160)) }%` }}
                />
            ))}
        </span>
    );
}

export function CallIsland() {
    const { call, insights, transcription, hangup, toggleMute } = useSoftphone();
    const active = isCallActive(call);
    const now = useNow(active);
    const [expanded, setExpanded] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [gone, setGone] = useState(false);

    const followed = Boolean(insights && call?.callId && call.phase !== "failed");
    const { lines } = useCallTranscript(followed ? call!.callId : null, followed && transcription);
    const last = lines[lines.length - 1] ?? null;
    // "New" is measured on this browser's clock, from the moment a sentence first
    // shows up — never against the server's timestamps (clocks can disagree).
    const [seen, setSeen] = useState<{ id: string | null; at: number }>({ id: null, at: 0 });
    if (last && last.id !== seen.id) setSeen({ id: last.id, at: Date.now() });
    const showLine = Boolean(last && active && now - seen.at < LINE_HOLD_MS);

    // Retract a moment after the call ends.
    useEffect(() => {
        if (!call || active) return;
        const t = setTimeout(() => setGone(true), ENDED_HOLD_MS);
        return () => clearTimeout(t);
    }, [call, active]);

    useEffect(() => {
        if (!expanded) return;
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [expanded]);

    if (!call || gone) return null;

    const open = (expanded || hovered) && active;
    const live = call.phase === "live";
    const name = call.target.label?.trim() || formatPhone(call.target.phone);
    const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
    const speaker = (l: { speaker: string }) => (l.speaker === "sdr" ? "Vous" : l.speaker === "mixed" ? "Conversation" : name.split(/\s+/)[0]);

    return (
        <div className="pointer-events-none fixed inset-x-0 top-2 z-[126] flex justify-center px-3">
            <div
                role="status"
                aria-live="polite"
                aria-label={`Appel avec ${name}`}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onClick={() => active && setExpanded((v) => !v)}
                className={cn(
                    "cp-island pointer-events-auto cursor-pointer overflow-hidden bg-black text-white shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)]",
                    open ? "w-[min(460px,calc(100vw-24px))] rounded-[28px]" : showLine ? "w-[min(420px,calc(100vw-24px))] rounded-[24px]" : "w-[min(300px,calc(100vw-24px))] rounded-[22px]",
                )}
            >
                {/* Compact row */}
                <div className="flex h-10 items-center gap-2.5 pl-1.5 pr-3.5">
                    <span
                        className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                            live ? "bg-emerald-500/20 text-emerald-300" : call.phase === "failed" ? "bg-red-500/20 text-red-300" : "bg-white/15 text-white/80",
                        )}
                    >
                        {initials}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{name}</span>
                    <span className={cn("shrink-0 text-[12px] tabular-nums", live ? "text-emerald-300" : "text-white/60")}>{phaseText(call, now)}</span>
                    {active && <LevelBars live={live} />}
                </div>

                {/* What is being said (compact: last sentence only) */}
                <div className={cn("cp-island-reveal px-4", showLine && !open ? "max-h-12 pb-2.5 opacity-100" : "max-h-0 opacity-0")}>
                    {last && (
                        <p className="truncate text-[12px] text-white/75">
                            <span className="font-semibold text-white/90">{speaker(last)} · </span>
                            {last.text}
                        </p>
                    )}
                </div>

                {/* Expanded: conversation + controls */}
                <div className={cn("cp-island-reveal", open ? "max-h-[360px] opacity-100" : "max-h-0 opacity-0")}>
                    <div className="border-t border-white/10 px-4 py-3">
                        {call.target.sublabel && <p className="mb-2 truncate text-[11px] text-white/50">{call.target.sublabel}</p>}
                        {transcription ? (
                            lines.length ? (
                                <ol className="max-h-[200px] space-y-2 overflow-y-auto pr-1">
                                    {lines.slice(-6).map((l) => (
                                        <li key={l.id} className="cp-rise text-[12.5px] leading-snug">
                                            <span className={cn("font-semibold", l.speaker === "sdr" ? "text-sky-300" : "text-emerald-300")}>{speaker(l)} </span>
                                            <span className="text-white/80">{l.text}</span>
                                        </li>
                                    ))}
                                </ol>
                            ) : (
                                <p className="text-[12px] text-white/50">{live ? "La transcription apparaît dès les premiers mots." : "En attente de la conversation."}</p>
                            )
                        ) : (
                            <p className="text-[12px] text-white/50">
                                Transcription en direct désactivée{insights ? " : le résumé arrive après l'appel." : "."}
                            </p>
                        )}
                        <div className="mt-3 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleMute();
                                }}
                                disabled={!live}
                                aria-pressed={call.muted}
                                className={cn(
                                    "cp-press flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-medium disabled:opacity-40",
                                    call.muted ? "bg-white text-black" : "bg-white/15 text-white hover:bg-white/25",
                                )}
                            >
                                {call.muted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                                {call.muted ? "Micro coupé" : "Micro"}
                            </button>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    hangup();
                                }}
                                className="cp-press flex h-9 items-center gap-1.5 rounded-full bg-red-500 px-3.5 text-[12px] font-semibold text-white hover:bg-red-600"
                            >
                                <PhoneOff className="h-3.5 w-3.5" /> Raccrocher
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
