"use client";

// ============================================
// CALL ISLAND — the only call surface, top centre, like iOS's Dynamic Island.
//
//   live      compact: who, phase / timer, real audio levels; a new
//             transcribed sentence grows one line. Expanded (click / keyboard):
//             the conversation, Micro, Clavier, Raccrocher.
//   after     the island turns into a light outcome card: Twilio's result,
//             the AI summary, Rappeler / Fermer — and under it, the result to
//             confirm (PostCallSuggestion): « Pas de réponse » at once when
//             nobody answered, the AI's result and note after a conversation.
//   between   a page can show its own status (Mode auto: « Appel de X dans
//             3 s », Annuler, Passer, Arrêter) through useIslandExtra().
//
// Black when it is the call, light when it is something to read. Échap folds.
// ============================================

import { useEffect, useState } from "react";
import { Grid3x3, Mic, MicOff, Phone, PhoneIncoming, PhoneOff, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatClock, formatDuration, formatPhone } from "@/components/incoming-calls/useIncomingCalls";
import { TELEPHONY_STATUS_LABELS } from "@/lib/telephony/status";
import {
    isCallActive,
    useCallLevels,
    useSoftphone,
    type IslandAction,
    type IslandExtra,
    type SoftphoneCall,
} from "./SoftphoneProvider";
import { AiSummaryView, useCallTranscript } from "./CallInsights";
import { PostCallSuggestion } from "./PostCallSuggestion";

/** How long a new sentence keeps its line open in compact mode. */
const LINE_HOLD_MS = 6000;
const BAR_SHAPE = [0.55, 0.9, 1, 0.75, 0.5];
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const;

function useNow(ticking: boolean) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!ticking) return;
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [ticking]);
    return now;
}

function liveText(call: SoftphoneCall, now: number): string {
    switch (call.phase) {
        case "preparing":
        case "connecting":
            return "Connexion…";
        case "ringing":
            return "Ça sonne…";
        case "live":
            return formatClock((now - (call.answeredAt ?? now)) / 1000);
        default:
            return "";
    }
}

/** What happened, in words: Twilio's own outcome when it is known. */
function outcomeText(call: SoftphoneCall): string {
    if (call.phase === "failed") return call.error ?? "Échec de l'appel";
    if (call.direction === "inbound" && !call.answeredAt) return "Appel manqué · messagerie";
    if (call.outcome && call.outcome !== "COMPLETED") return TELEPHONY_STATUS_LABELS[call.outcome];
    const talk = call.durationSec ?? (call.answeredAt && call.endedAt ? Math.round((call.endedAt - call.answeredAt) / 1000) : null);
    if (call.answeredAt && talk != null) return `Terminé · ${formatDuration(talk)}`;
    return call.outcome ? TELEPHONY_STATUS_LABELS[call.outcome] : "Appel terminé";
}

/** Level bars driven by the real call audio (green: the prospect speaks). */
function LevelBars() {
    const { input, output } = useCallLevels();
    const level = Math.max(input, output);
    const prospect = output >= input;
    return (
        <span className="flex h-4 items-center gap-[3px]" aria-hidden>
            {BAR_SHAPE.map((k, i) => (
                <span
                    key={i}
                    className={cn("w-[3px] rounded-full transition-[height] duration-75", prospect ? "bg-emerald-400" : "bg-white/80")}
                    style={{ height: `${Math.max(18, Math.min(100, level * k * 160))}%` }}
                />
            ))}
        </span>
    );
}

function Ring({ seconds }: { seconds: number }) {
    const r = 7;
    const length = 2 * Math.PI * r;
    return (
        <svg className="h-[18px] w-[18px] shrink-0 -rotate-90" viewBox="0 0 18 18" aria-hidden>
            <circle cx="9" cy="9" r={r} fill="none" stroke="rgb(255 255 255 / 0.2)" strokeWidth="2" />
            <circle
                cx="9"
                cy="9"
                r={r}
                fill="none"
                stroke="#34d399"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={length}
                style={{ animation: `cp-ring ${seconds}s linear forwards`, ["--ring-length" as string]: length }}
            />
        </svg>
    );
}

function Pill({ action, dark }: { action: IslandAction; dark: boolean }) {
    const tone = action.tone ?? "ghost";
    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                action.onClick();
            }}
            className={cn(
                "cp-press relative z-20 h-7 shrink-0 rounded-full px-2.5 text-[12px] font-semibold",
                tone === "success" && "bg-emerald-500 text-white hover:bg-emerald-600",
                tone === "primary" && "bg-primary text-primary-fg hover:bg-primary-hover",
                tone === "accent" && "bg-accent text-white hover:brightness-110",
                tone === "ghost" && (dark ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-ink-2 hover:bg-surface-2 hover:text-ink"),
            )}
        >
            {action.label}
        </button>
    );
}

/** The island's body: one element that morphs (width, radius, colour). */
function IslandShell({
    dark,
    width,
    radius,
    children,
    label,
    onClick,
    expanded,
    keypad = false,
    below,
}: {
    dark: boolean;
    width: string;
    radius: string;
    children: React.ReactNode;
    label: string;
    onClick?: () => void;
    expanded?: boolean;
    keypad?: boolean;
    /** Hangs under the island (the post-call suggestion). */
    below?: React.ReactNode;
}) {
    return (
        // Centred over the page, not over a docked pane (--cp-pane-w).
        <div className="pointer-events-none cp-call-island-position fixed inset-x-0 top-14 z-[126] flex flex-col items-center gap-2 px-3" style={{ right: "var(--cp-pane-w, 0px)" }}>
            <div
                role="region"
                data-call-keypad={keypad || undefined}
                aria-label={label}
                className={cn(
                    "cp-island relative pointer-events-auto overflow-hidden transition-colors duration-300",
                    onClick && "cursor-pointer",
                    dark ? "bg-black text-white shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)]" : "border border-line bg-surface text-ink shadow-overlay",
                    width,
                    radius,
                )}
            >
                {onClick && (
                    <button type="button" onClick={onClick} aria-expanded={expanded}
                        aria-label={expanded ? "Réduire les détails de l’appel" : "Afficher les détails de l’appel"}
                        className="absolute inset-x-0 top-0 z-10 h-10 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400" />
                )}
                {children}
            </div>
            {below}
        </div>
    );
}

export function CallIsland({ extra }: { extra: IslandExtra | null }) {
    const { call, insights, transcription, hangup, answer, decline, toggleMute, sendDigit, dismiss, dial, pin } = useSoftphone();
    const active = isCallActive(call);
    const now = useNow(active);
    const [expanded, setExpanded] = useState(false);
    const [keypad, setKeypad] = useState(false);
    const [typed, setTyped] = useState("");

    const followed = Boolean(insights && call?.callId && call.phase !== "failed");
    const { lines, summary } = useCallTranscript(followed ? call!.callId : null, followed);
    const last = lines[lines.length - 1] ?? null;
    const showLine = Boolean(transcription && last?.arrivedAt && active && now - last.arrivedAt < LINE_HOLD_MS);

    const ended = Boolean(call && !active);
    const live = call?.phase === "live";
    const summaryReady = summary.status === "done";

    useEffect(() => {
        document.documentElement.dataset.callIsland = "";
        return () => { delete document.documentElement.dataset.callIsland; };
    }, []);

    // Mode auto: the outcome opens by itself once the call ends.
    const [autoOpened, setAutoOpened] = useState(false);
    if (ended && call?.target.showOutcome && followed && !autoOpened) {
        setAutoOpened(true);
        setExpanded(true);
    }
    // Reading the outcome keeps it on screen.
    useEffect(() => {
        if (ended && expanded) pin();
    }, [ended, expanded, pin]);

    // Ringing: Entrée picks up, Échap sends to voicemail (never while typing).
    const ringing = call?.phase === "incoming";
    useEffect(() => {
        if (!ringing) return;
        const onKey = (e: KeyboardEvent) => {
            const el = e.target as HTMLElement | null;
            if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
            if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                answer();
            } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                decline();
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [ringing, answer, decline]);

    // Échap folds; digits feed DTMF while the keypad is open.
    useEffect(() => {
        if (!expanded && !keypad) return;
        const onKey = (e: KeyboardEvent) => {
            const el = e.target as HTMLElement | null;
            if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setExpanded(false);
                setKeypad(false);
            } else if (keypad && live && /^[0-9*#]$/.test(e.key)) {
                e.preventDefault();
                e.stopPropagation();
                sendDigit(e.key);
                setTyped((t) => (t + e.key).slice(-16));
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [expanded, keypad, live, sendDigit]);

    // ── Between calls: the page's own status (Mode auto) ─────────────────
    if (!call) {
        if (!extra) return null;
        return (
            <IslandShell dark width="w-[min(560px,calc(100vw-24px))]" radius="rounded-[22px]" label={`${extra.tag} : ${extra.text}`}>
                <div className="flex h-10 items-center gap-2.5 pl-2 pr-1.5">
                    <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/90">{extra.tag}</span>
                    {extra.countdown && <Ring key={extra.countdown.key} seconds={extra.countdown.seconds} />}
                    <span className="min-w-0 flex-1 truncate text-[13px] text-white/85">{extra.text}</span>
                    {extra.actions.map((a) => (
                        <Pill key={a.label} action={a} dark />
                    ))}
                </div>
            </IslandShell>
        );
    }

    const name = call.target.label?.trim() || formatPhone(call.target.phone);
    // Only a person or company name makes initials; a bare number gets a handset.
    const initials = call.target.label?.trim()
        ? name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()
        : null;
    const firstName = name.split(/\s+/)[0];
    const speaker = (l: { speaker: string }) => (l.speaker === "sdr" ? "Vous" : l.speaker === "mixed" ? "Conversation" : firstName);

    // ── After the call: the island becomes the outcome card ──────────────
    if (ended) {
        const open = expanded;
        const failed = call.phase === "failed" || Boolean(call.outcome && call.outcome !== "COMPLETED");
        const target = call.target;
        const actions: IslandAction[] = [
            ...(extra?.actions ?? []),
            ...(call.retryable
                ? [
                      {
                          label: call.phase === "failed" ? "Réessayer" : "Rappeler",
                          onClick: () => {
                              dismiss();
                              dial(target);
                          },
                      },
                  ]
                : []),
        ];
        return (
            <IslandShell
                dark={!open}
                width={open ? "w-[min(500px,calc(100vw-24px))]" : "w-[min(400px,calc(100vw-24px))]"}
                radius={open ? "rounded-[24px]" : "rounded-[22px]"}
                label={`Appel avec ${name} : ${outcomeText(call)}`}
                expanded={open}
                keypad={keypad}
                onClick={() => setExpanded((v) => !v)}
                below={<PostCallSuggestion key={call.key} call={call} onDone={dismiss} onEngage={pin} />}
            >
                <div className="flex h-10 items-center gap-2.5 px-1.5">
                    <span
                        className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                            open ? "bg-surface-3 text-ink-2" : failed ? "bg-red-500/20 text-red-300" : "bg-white/15 text-white/80",
                        )}
                    >
                        {initials ?? <Phone className="h-3 w-3" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px]">
                        <span className="font-semibold">{name}</span>
                        <span className={cn("ml-2", open ? (failed ? "text-danger-ink" : "text-ink-3") : failed ? "text-red-300" : "text-white/60")}>
                            {outcomeText(call)}
                        </span>
                    </span>
                    {followed && !open && (summaryReady || summary.status === "pending" || summary.status === "none") && (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/80">
                            <Sparkles className={cn("h-3 w-3", !summaryReady && "animate-pulse")} />
                            {summaryReady ? "Résumé prêt" : "Résumé…"}
                        </span>
                    )}
                    {!open && extra?.actions.slice(0, 2).map((a) => <Pill key={a.label} action={a} dark />)}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            dismiss();
                        }}
                        aria-label="Fermer"
                        className={cn(
                            "relative z-20 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                            open ? "text-ink-3 hover:bg-surface-2 hover:text-ink" : "text-white/60 hover:bg-white/10 hover:text-white",
                        )}
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
                <div inert={!open} className={cn("cp-island-reveal", open ? "max-h-[70vh] opacity-100" : "max-h-0 opacity-0")}>
                    <div className="max-h-[calc(70vh-48px)] overflow-y-auto border-t border-line-subtle px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                        {call.error && <p role="alert" className="mb-3 rounded-lg bg-danger-soft p-3 text-[12px] text-danger-ink">{call.error}</p>}
                        {followed ? (
                            <AiSummaryView state={summary.status === "none" ? { status: "pending" } : summary} />
                        ) : (
                            <p className="text-[12px] text-ink-3">{call.phase === "failed" ? "Aucun résumé disponible pour cet appel." : "Pas de résumé : transcription et enregistrement désactivés."}</p>
                        )}
                        {actions.length > 0 && (
                            <div className="mt-3.5 flex flex-wrap justify-end gap-1.5">
                                {actions.map((a) => (
                                    <Pill key={a.label} action={a} dark={false} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </IslandShell>
        );
    }

    // ── Ringing in: who is calling, pick up or send to voicemail ─────────
    if (call.phase === "incoming") {
        const known = Boolean(call.target.label);
        return (
            <IslandShell dark width="w-[min(460px,calc(100vw-24px))]" radius="rounded-[30px]" label={`Appel entrant de ${name}`}>
                <div className="flex items-center gap-3 py-2.5 pl-2.5 pr-2.5">
                    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center" aria-hidden>
                        <span className="cp-ring-wave absolute inset-0 rounded-full bg-emerald-400/50" />
                        <span className="cp-ring-wave absolute inset-0 rounded-full bg-emerald-400/40 [animation-delay:600ms]" />
                        <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-[13px] font-bold text-white">
                            {known ? initials : <PhoneIncoming className="h-4.5 w-4.5" />}
                        </span>
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[10.5px] font-semibold uppercase tracking-[0.12em] text-emerald-300">Appel entrant</span>
                        <span className="block truncate text-[14.5px] font-semibold leading-tight">{name}</span>
                        <span className="block truncate text-[12px] text-white/55">
                            {call.target.sublabel ?? (known ? formatPhone(call.target.phone) : "Numéro inconnu du CRM")}
                        </span>
                    </span>
                    <button
                        type="button"
                        onClick={decline}
                        aria-label="Refuser : l'appelant tombe sur votre messagerie (Échap)"
                        title="Refuser · messagerie (Échap)"
                        className="cp-press relative z-20 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
                    >
                        <PhoneOff className="h-4.5 w-4.5" />
                    </button>
                    <button
                        type="button"
                        onClick={answer}
                        title="Décrocher (Entrée)"
                        className="cp-press relative z-20 flex h-11 shrink-0 items-center gap-2 rounded-full bg-emerald-500 pl-3.5 pr-4 text-[13px] font-semibold text-white shadow-[0_8px_24px_-8px_rgb(16_185_129)] hover:bg-emerald-400"
                    >
                        <Phone className="cp-ring-wiggle h-4 w-4" /> Décrocher
                    </button>
                </div>
            </IslandShell>
        );
    }

    // ── During the call ──────────────────────────────────────────────────
    const open = expanded;
    return (
        <IslandShell
            dark
            width={open ? "w-[min(480px,calc(100vw-24px))]" : showLine ? "w-[min(440px,calc(100vw-24px))]" : "w-[min(400px,calc(100vw-24px))]"}
            radius={open ? "rounded-[28px]" : showLine ? "rounded-[24px]" : "rounded-[22px]"}
            label={`Appel avec ${name}`}
            expanded={open}
                keypad={keypad}
                onClick={() => setExpanded((v) => !v)}
        >
            <div className="flex h-10 items-center gap-2.5 pl-1.5 pr-3.5">
                <span
                    className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                        live ? "bg-emerald-500/20 text-emerald-300" : "bg-white/15 text-white/80",
                    )}
                >
                    {initials ?? <Phone className="h-3 w-3" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{name}</span>
                {call.muted && <MicOff className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-label="Micro coupé" />}
                <span className={cn("shrink-0 text-[12px] tabular-nums", live ? "text-emerald-300" : "text-white/60")}>{liveText(call, now)}</span>
                {live ? <LevelBars /> : <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-300" aria-hidden />}
                <button type="button" onClick={toggleMute} disabled={!live} aria-pressed={call.muted}
                    aria-label={call.muted ? "Réactiver le microphone" : "Couper le microphone"}
                    className="relative z-20 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40">
                    {call.muted ? <MicOff className="h-3.5 w-3.5 text-amber-300" /> : <Mic className="h-3.5 w-3.5" />}
                </button>
                <button type="button" onClick={hangup} aria-label="Raccrocher"
                    className="relative z-20 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600">
                    <PhoneOff className="h-3.5 w-3.5" />
                </button>
            </div>

            {/* What is being said — the last sentence, compact */}
            <div className={cn("cp-island-reveal px-4", showLine && !open ? "max-h-12 pb-2.5 opacity-100" : "max-h-0 opacity-0")}>
                {last && (
                    <p className="truncate text-[12px] text-white/75">
                        <span className="font-semibold text-white/90">{speaker(last)} · </span>
                        {last.text}
                    </p>
                )}
            </div>

            {/* Expanded: conversation or keypad, then controls */}
            <div inert={!open} className={cn("cp-island-reveal", open ? "max-h-[420px] opacity-100" : "max-h-0 opacity-0")}>
                <div className="border-t border-white/10 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {call.target.sublabel && <p className="mb-2 truncate text-[11px] text-white/50">{call.target.sublabel}</p>}
                    {keypad ? (
                        <div className="mx-auto w-[220px]">
                            <div className="mb-2 h-7 truncate rounded-lg bg-white/10 px-2 text-center font-mono text-[15px] leading-7 tracking-[0.2em] tabular-nums" aria-live="polite">
                                {typed || <span className="font-sans text-[12px] tracking-normal text-white/40">Touches envoyées</span>}
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                                {KEYS.map((k) => (
                                    <button
                                        key={k}
                                        type="button"
                                        disabled={!live}
                                        onClick={() => {
                                            sendDigit(k);
                                            setTyped((t) => (t + k).slice(-16));
                                        }}
                                        className="cp-press h-9 rounded-lg bg-white/[0.08] font-mono text-[15px] font-semibold hover:bg-white/15 disabled:opacity-40"
                                    >
                                        {k}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : transcription ? (
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
                        <p className="text-[12px] text-white/50">{insights ? "Le résumé de l'appel arrive après avoir raccroché." : "Transcription désactivée."}</p>
                    )}
                    <div className="mt-3 flex items-center justify-end gap-1.5">
                        <button
                            type="button"
                            onClick={toggleMute}
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
                            onClick={() => setKeypad((v) => !v)}
                            disabled={!live}
                            aria-pressed={keypad}
                            className={cn(
                                "cp-press flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-medium disabled:opacity-40",
                                keypad ? "bg-white text-black" : "bg-white/15 text-white hover:bg-white/25",
                            )}
                        >
                            <Grid3x3 className="h-3.5 w-3.5" /> Clavier
                        </button>
                        <button
                            type="button"
                            onClick={hangup}
                            className="cp-press flex h-9 items-center gap-1.5 rounded-full bg-red-500 px-3.5 text-[12px] font-semibold text-white hover:bg-red-600"
                        >
                            <PhoneOff className="h-3.5 w-3.5" /> Raccrocher
                        </button>
                    </div>
                </div>
            </div>
        </IslandShell>
    );
}
