"use client";

// ============================================
// SOFTPHONE DOCK — the call gets its own band of the screen.
//
// While a call is on screen, a full-width band is docked at the bottom of the
// app, on the sidebar's surface (it is app chrome, not page content). The
// layout makes room for it through --softphone-dock-h: the page, the sidebar,
// drawers, modals and toasts all end above it, so the SDR keeps qualifying in
// the action drawer and reading the script during the call — nothing is
// covered. « Réduire » folds it into a pill and gives the space back.
//
// Every control is a real Twilio operation (mute, DTMF, hang up); after the
// call it shows Twilio's own outcome and offers a redial.
// ============================================

import { useEffect, useLayoutEffect, useState } from "react";
import { Captions, ChevronDown, Grid3x3, Maximize2, Mic, MicOff, Phone, PhoneOff, RotateCcw, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatClock, formatDuration, formatPhone } from "@/components/incoming-calls/useIncomingCalls";
import { TELEPHONY_STATUS_LABELS } from "@/lib/telephony/status";
import { isCallActive, useSoftphone, type SoftphoneCall } from "./SoftphoneProvider";
import { AiSummaryView, TranscriptView, useCallTranscript } from "./CallInsights";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const;
const DOCK_HEIGHT = "56px";
const DOCK_VAR = "--softphone-dock-h";

function useNow(ticking: boolean) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!ticking) return;
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [ticking]);
    return now;
}

/** Reserves (or frees) the dock's band in the app layout. */
function useDockSpace(reserved: boolean) {
    useLayoutEffect(() => {
        const root = document.documentElement;
        root.style.setProperty(DOCK_VAR, reserved ? DOCK_HEIGHT : "0px");
        return () => {
            root.style.setProperty(DOCK_VAR, "0px");
        };
    }, [reserved]);
}

function statusLine(call: SoftphoneCall, now: number): string {
    switch (call.phase) {
        case "preparing":
        case "connecting":
            return "Connexion…";
        case "ringing":
            return `Sonnerie · ${formatClock((now - call.startedAt) / 1000)}`;
        case "live":
            return `En ligne · ${formatClock((now - (call.answeredAt ?? now)) / 1000)}`;
        case "failed":
            return call.error ?? "Échec de l'appel";
        case "ended": {
            if (call.outcome && call.outcome !== "COMPLETED") return TELEPHONY_STATUS_LABELS[call.outcome];
            const talk =
                call.durationSec ??
                (call.answeredAt && call.endedAt ? Math.round((call.endedAt - call.answeredAt) / 1000) : null);
            if (talk != null && call.answeredAt) return `Terminé · ${formatDuration(talk)}`;
            return call.outcome ? TELEPHONY_STATUS_LABELS[call.outcome] : "Appel terminé";
        }
    }
}

function isTypingTarget(el: EventTarget | null): boolean {
    const node = el as HTMLElement | null;
    if (!node) return false;
    return node.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(node.tagName);
}

export function CallBar() {
    const { call, recording, transcription, callerId, hangup, toggleMute, sendDigit, dismiss, dial, pin } = useSoftphone();
    const active = isCallActive(call);
    const now = useNow(active);
    // The provider keys this component by call: keypad and minimized state start fresh each call.
    const [keypadOpen, setKeypadOpen] = useState(false);
    const [typed, setTyped] = useState("");
    const [minimized, setMinimized] = useState(false);
    const [insights, setInsights] = useState<"transcript" | "summary" | null>(null);

    // Transcript and summary follow the call from the moment Twilio connects it.
    const followed = transcription && Boolean(call?.callId) && call?.phase !== "failed";
    const { lines, summary } = useCallTranscript(followed ? call!.callId : null, followed);

    const live = call?.phase === "live";
    const ended = call?.phase === "ended";
    const openInsights = (tab: "transcript" | "summary") => {
        setInsights((cur) => (cur === tab ? null : tab));
        if (!isCallActive(call)) pin();
    };
    const showKeypad = keypadOpen && live && !minimized;

    useDockSpace(Boolean(call) && !minimized);

    // Physical keys feed DTMF while the keypad is open (IVR menus, extensions).
    useEffect(() => {
        if (!showKeypad) return;
        const onKey = (e: KeyboardEvent) => {
            if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key === "Escape") {
                e.stopPropagation();
                setKeypadOpen(false);
                return;
            }
            if (/^[0-9*#]$/.test(e.key)) {
                e.preventDefault();
                sendDigit(e.key);
                setTyped((t) => (t + e.key).slice(-16));
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [showKeypad, sendDigit]);

    if (!call) return null;

    const { target } = call;
    const name = target.label?.trim() || formatPhone(target.phone);
    const company = target.sublabel?.trim() || null;
    const number = target.label?.trim() ? formatPhone(target.phone) : null;
    const failed = call.phase === "failed";
    const status = statusLine(call, now);
    const prospectName = target.label?.trim().split(/\s+/)[0] || "Prospect";
    const summaryReady = summary.status === "done";

    const press = (digit: string) => {
        sendDigit(digit);
        setTyped((t) => (t + digit).slice(-16));
    };
    const redial = () => {
        dismiss();
        dial(target);
    };

    // ── Minimized: a pill that keeps the call one click away ──────────────
    if (minimized) {
        return (
            <div
                role="region"
                aria-label="Appel téléphonique (réduit)"
                className="cp-glass-dark cp-pop fixed bottom-3 left-1/2 z-[125] flex -translate-x-1/2 items-center gap-1 rounded-full py-1 pl-1 pr-1 text-inverse-ink"
            >
                <button
                    type="button"
                    onClick={() => setMinimized(false)}
                    className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    aria-label="Agrandir l'appel"
                    title="Agrandir"
                >
                    <StatusGlyph call={call} small />
                    <span className="max-w-[160px] truncate text-[12px] font-semibold">{name}</span>
                    <span className={cn("text-[11px] tabular-nums", failed ? "text-red-200" : "text-inverse-ink-2")}>
                        {call.phase === "live" ? formatClock((now - (call.answeredAt ?? now)) / 1000) : status}
                    </span>
                    <Maximize2 className="h-3.5 w-3.5 text-inverse-ink-3" aria-hidden />
                </button>
                {active ? (
                    <button
                        type="button"
                        onClick={hangup}
                        aria-label="Raccrocher"
                        title="Raccrocher"
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-danger text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    >
                        <PhoneOff className="h-4 w-4" />
                    </button>
                ) : (
                    <DockIcon label="Fermer" onClick={dismiss} round>
                        <X className="h-4 w-4" />
                    </DockIcon>
                )}
            </div>
        );
    }

    // ── Docked band ───────────────────────────────────────────────────────
    return (
        <div
            role="region"
            aria-label="Appel téléphonique"
            className="fixed inset-x-0 bottom-0 z-[125] text-inverse-ink"
            style={{ height: DOCK_HEIGHT }}
        >
            {showKeypad && (
                <div className="cp-glass-dark cp-pop absolute bottom-full left-1/2 mb-2 w-[216px] -translate-x-1/2 rounded-panel p-3">
                    <div
                        className="mb-2 h-7 truncate rounded-control bg-inverse-raised px-2 text-center font-mono text-[15px] leading-7 tracking-[0.2em] tabular-nums"
                        aria-live="polite"
                    >
                        {typed || <span className="font-sans text-[12px] tracking-normal text-inverse-ink-3">Touches envoyées</span>}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                        {KEYS.map((k) => (
                            <button
                                key={k}
                                type="button"
                                onClick={() => press(k)}
                                className="cp-press h-10 rounded-control bg-white/[0.07] font-mono text-[15px] font-semibold hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                            >
                                {k}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {insights && followed && (
                <div className="absolute bottom-full right-3 mb-2 flex max-h-[min(520px,calc(100vh-120px))] w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-panel border border-line bg-surface text-ink shadow-overlay cp-pop">
                    <div className="flex items-center gap-1 border-b border-line-subtle px-2 py-1.5">
                        {(
                            [
                                ["transcript", "Transcription", Captions],
                                ["summary", "Résumé IA", Sparkles],
                            ] as const
                        ).map(([id, label, Icon]) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setInsights(id)}
                                disabled={id === "summary" && !ended}
                                aria-pressed={insights === id}
                                title={id === "summary" && !ended ? "Disponible à la fin de l'appel" : undefined}
                                className={cn(
                                    "flex h-8 items-center gap-1.5 rounded-control px-2.5 text-[12px] font-semibold",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-40",
                                    insights === id ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink",
                                )}
                            >
                                <Icon className="h-3.5 w-3.5" aria-hidden />
                                {label}
                                {id === "transcript" && live && <span className="h-1.5 w-1.5 rounded-full bg-danger animate-pulse" aria-label="en direct" />}
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => setInsights(null)}
                            aria-label="Fermer le panneau"
                            className="ml-auto flex h-8 w-8 items-center justify-center rounded-control text-ink-3 hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    {insights === "transcript" ? (
                        <TranscriptView
                            lines={lines}
                            names={{ sdr: "Vous", prospect: prospectName }}
                            live={live}
                            className="min-h-[140px] flex-1 px-3 py-3"
                            emptyText={live ? "La transcription s'affiche ici dès que la conversation démarre." : "Aucune transcription pour cet appel."}
                        />
                    ) : (
                        <div className="min-h-[120px] flex-1 overflow-y-auto px-4 py-4">
                            <AiSummaryView state={summary.status === "none" && ended ? { status: "pending" } : summary} />
                        </div>
                    )}
                </div>
            )}

            <div className="flex h-full items-center gap-3 border-t border-inverse-line bg-inverse px-3 shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.35)] animate-in slide-in-from-bottom-full duration-200 sm:gap-4 sm:px-4">
                {/* Who and where the call is */}
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <StatusGlyph call={call} />
                    <div className="min-w-0">
                        <p className="flex min-w-0 items-baseline gap-2 text-[13px] leading-tight">
                            <span className="truncate font-semibold">{name}</span>
                            {company && <span className="hidden truncate text-inverse-ink-2 md:inline">{company}</span>}
                            {recording && live && (
                                <span className="shrink-0 self-center rounded-sm border border-inverse-line px-1 text-[10px] font-medium uppercase tracking-wide text-inverse-ink-2">
                                    Enregistré
                                </span>
                            )}
                        </p>
                        <p
                            className={cn("truncate text-[12px] leading-tight tabular-nums", failed ? "text-red-200" : "text-inverse-ink-2")}
                            aria-live="polite"
                        >
                            {status}
                            {number && !failed && <span className="hidden text-inverse-ink-3 sm:inline"> · {number}</span>}
                        </p>
                    </div>
                </div>

                {/* In-call controls */}
                {active && (
                    <div className="flex shrink-0 items-center gap-1">
                        <DockToggle
                            label={call.muted ? "Réactiver le micro" : "Couper le micro"}
                            text={call.muted ? "Micro coupé" : "Micro"}
                            pressed={call.muted}
                            disabled={!live}
                            onClick={toggleMute}
                        >
                            {call.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                        </DockToggle>
                        <DockToggle
                            label={showKeypad ? "Masquer le clavier" : "Clavier (touches 0-9, *, #)"}
                            text="Clavier"
                            pressed={showKeypad}
                            disabled={!live}
                            onClick={() => setKeypadOpen((v) => !v)}
                        >
                            <Grid3x3 className="h-4 w-4" />
                        </DockToggle>
                        {followed && (
                            <DockToggle
                                label={insights === "transcript" ? "Masquer la transcription" : "Transcription en direct"}
                                text="Transcription"
                                pressed={insights === "transcript"}
                                onClick={() => openInsights("transcript")}
                            >
                                <Captions className="h-4 w-4" />
                            </DockToggle>
                        )}
                    </div>
                )}
                {ended && followed && (
                    <DockToggle
                        label={summaryReady ? "Résumé IA prêt" : "Résumé IA"}
                        text="Résumé IA"
                        pressed={insights === "summary"}
                        onClick={() => openInsights("summary")}
                    >
                        <span className="relative">
                            <Sparkles className="h-4 w-4" />
                            {summaryReady && insights !== "summary" && (
                                <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-accent ring-2 ring-inverse" aria-hidden />
                            )}
                        </span>
                    </DockToggle>
                )}

                {/* Primary action, line, fold */}
                <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                    {callerId && (
                        <span className="hidden text-[11px] tabular-nums text-inverse-ink-3 xl:inline" title="Numéro présenté au prospect">
                            Votre ligne {formatPhone(callerId.replace(/^\+33(?=\d{9}$)/, "0"))}
                        </span>
                    )}
                    {active ? (
                        <button
                            type="button"
                            onClick={hangup}
                            aria-label="Raccrocher"
                            className="cp-press inline-flex h-9 items-center gap-1.5 rounded-control bg-danger px-3 text-[12px] font-semibold text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 sm:px-4"
                        >
                            <PhoneOff className="h-4 w-4" />
                            <span className="hidden sm:inline">Raccrocher</span>
                        </button>
                    ) : (
                        <>
                            {call.retryable && (
                                <button
                                    type="button"
                                    onClick={redial}
                                    className="cp-press inline-flex h-9 items-center gap-1.5 rounded-control border border-inverse-line px-3 text-[12px] font-semibold hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    {failed ? "Réessayer" : "Rappeler"}
                                </button>
                            )}
                            <DockIcon label="Fermer" onClick={dismiss}>
                                <X className="h-4 w-4" />
                            </DockIcon>
                        </>
                    )}
                    {active && (
                        <DockIcon label="Réduire (libère l'écran)" onClick={() => setMinimized(true)}>
                            <ChevronDown className="h-4 w-4" />
                        </DockIcon>
                    )}
                </div>
            </div>
        </div>
    );
}

function StatusGlyph({ call, small }: { call: SoftphoneCall; small?: boolean }) {
    const live = call.phase === "live";
    const waiting = call.phase === "preparing" || call.phase === "connecting" || call.phase === "ringing";
    const failed = call.phase === "failed" || (call.phase === "ended" && call.outcome && call.outcome !== "COMPLETED");
    return (
        <span
            className={cn(
                "relative flex shrink-0 items-center justify-center rounded-full bg-inverse-raised",
                small ? "h-6 w-6" : "h-8 w-8",
            )}
            aria-hidden
        >
            {waiting && <span className="absolute inset-0 rounded-full bg-white/15 animate-ping" />}
            {live ? (
                <span className="cp-halo h-2.5 w-2.5 rounded-full bg-emerald-400" />
            ) : failed ? (
                <PhoneOff className="h-3.5 w-3.5 text-red-200" />
            ) : (
                <Phone className={cn("relative h-3.5 w-3.5", waiting ? "text-inverse-ink" : "text-inverse-ink-3")} />
            )}
        </span>
    );
}

function DockToggle({
    label,
    text,
    pressed,
    disabled,
    onClick,
    children,
}: {
    label: string;
    text: string;
    pressed?: boolean;
    disabled?: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            aria-pressed={pressed}
            title={label}
            className={cn(
                "cp-press inline-flex h-9 items-center gap-1.5 rounded-control px-2.5 text-[12px] font-medium text-inverse-ink-2 hover:bg-white/10 hover:text-inverse-ink",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:pointer-events-none disabled:opacity-40",
                pressed && "bg-white/15 text-inverse-ink",
            )}
        >
            {children}
            <span className="hidden lg:inline">{text}</span>
        </button>
    );
}

function DockIcon({
    label,
    onClick,
    round,
    children,
}: {
    label: string;
    onClick: () => void;
    round?: boolean;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            title={label}
            className={cn(
                "flex h-9 w-9 items-center justify-center text-inverse-ink-2 hover:bg-white/10 hover:text-inverse-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
                round ? "h-8 w-8 rounded-full" : "rounded-control",
            )}
        >
            {children}
        </button>
    );
}
