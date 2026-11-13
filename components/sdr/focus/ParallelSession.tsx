"use client";

// ============================================
// MODE FOCUS · PARALLÈLE — the SDR's view of a parallel dialing session.
//
// The server decides everything (lib/dialer/orchestrator): this screen only
// opens the session, joins its conference, sends a heartbeat every few seconds
// and says « prêt » after qualifying. It shows what is really happening:
// how many lines ring for whom, who is on the line once a conversation is
// confirmed, what remains to qualify, and today's measured numbers.
// ============================================

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Headphones, Loader2, Mic, MicOff, Pause, PhoneOff, Play, Power, Rows3, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSoftphone } from "@/components/telephony/SoftphoneProvider";
import { PostCallSuggestion } from "@/components/telephony/PostCallSuggestion";
import type { SoftphoneCall } from "@/components/telephony/SoftphoneProvider";
import type { SessionView } from "@/lib/dialer/view";

const HEARTBEAT_MS = 4_000;

const LINE_STATE: Record<string, { label: string; tone: string; pulse?: boolean }> = {
    PENDING: { label: "Préparation", tone: "bg-surface-3 text-ink-3" },
    DIALING: { label: "Numérotation", tone: "bg-surface-3 text-ink-2", pulse: true },
    RINGING: { label: "Sonnerie", tone: "bg-accent-50 text-accent-700", pulse: true },
    ANSWERED: { label: "Décroché · détection", tone: "bg-warning-soft text-warning-ink", pulse: true },
    BRIDGING: { label: "Transfert vers vous", tone: "bg-success-soft text-success-ink", pulse: true },
    CONNECTED: { label: "En ligne", tone: "bg-success-soft text-success-ink" },
};

const AGENT: Record<string, { label: string; tone: string }> = {
    JOINING: { label: "Connexion à la session…", tone: "text-ink-3" },
    READY: { label: "Prêt · les lignes sonnent", tone: "text-success-ink" },
    RESERVED: { label: "Un prospect a décroché…", tone: "text-success-ink" },
    ON_CALL: { label: "En conversation", tone: "text-success-ink" },
    WRAP_UP: { label: "À qualifier", tone: "text-warning-ink" },
    OFFLINE: { label: "Hors ligne", tone: "text-ink-3" },
};

async function post<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) throw new Error(json?.error || `Erreur ${res.status}`);
    return json.data as T;
}

function elapsed(iso: string, now: number): string {
    const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function ParallelSession({ missionId, missionName, onExit }: { missionId: string; missionName: string; onExit: () => void }) {
    const { dialerLeg, joinDialer, leaveDialer, toggleDialerMute, openAudioSettings } = useSoftphone();
    const [view, setView] = useState<SessionView | null>(null);
    const [decision, setDecision] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const sessionId = view?.id ?? null;
    const endedRef = useRef(false);

    // Open (or resume) the session, then join its conference.
    useEffect(() => {
        let cancelled = false;
        post<SessionView>("/api/dialer/sessions", { missionId })
            .then(async (v) => {
                if (cancelled) return;
                setView(v);
                const ok = await joinDialer(v.id);
                if (!ok && !cancelled) setError("Impossible de rejoindre la session : vérifiez le micro et la connexion.");
            })
            .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Session impossible"));
        return () => {
            cancelled = true;
        };
    }, [missionId, joinDialer]);

    // Heartbeat: keeps the session alive and the lines topped up; returns the live state.
    useEffect(() => {
        if (!sessionId) return;
        let stop = false;
        const beat = async () => {
            try {
                const v = await post<SessionView & { decision: string | null; notice?: string }>(`/api/dialer/sessions/${sessionId}`, { action: "heartbeat" });
                if (stop) return;
                setView(v);
                setDecision(v.decision);
                if (v.status === "ENDED" && !endedRef.current) {
                    endedRef.current = true;
                    leaveDialer();
                    setError(v.notice ?? "La session est terminée.");
                }
            } catch {
                /* network blip: the next beat retries; the server ends the session after 60 s of silence */
            }
        };
        void beat();
        const t = setInterval(beat, HEARTBEAT_MS);
        const clock = setInterval(() => setNow(Date.now()), 1000);
        return () => {
            stop = true;
            clearInterval(t);
            clearInterval(clock);
        };
    }, [sessionId, leaveDialer]);

    // Closing the tab ends the session cleanly (the sweeper would after 60 s otherwise).
    useEffect(() => {
        if (!sessionId) return;
        const end = () => {
            fetch(`/api/dialer/sessions/${sessionId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "end" }), keepalive: true }).catch(() => undefined);
        };
        window.addEventListener("pagehide", end);
        return () => window.removeEventListener("pagehide", end);
    }, [sessionId]);

    const act = useCallback(
        async (action: "ready" | "hangup" | "pause" | "resume" | "end") => {
            if (!sessionId) return;
            setBusy(action);
            try {
                const v = await post<SessionView>(`/api/dialer/sessions/${sessionId}`, { action });
                setView(v);
                if (action === "end") {
                    endedRef.current = true;
                    leaveDialer();
                    onExit();
                }
            } catch (e) {
                setError(e instanceof Error ? e.message : "Action impossible");
            } finally {
                setBusy(null);
            }
        },
        [sessionId, leaveDialer, onExit],
    );

    // Keyboard: Entrée = prêt pour la suite (after qualifying), P = pause, M = micro.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const el = e.target as HTMLElement | null;
            if (e.metaKey || e.ctrlKey || e.altKey || (el && el.closest("input, textarea, select, [contenteditable=true]"))) return;
            if (e.key === "Enter" && view?.agentState === "WRAP_UP") {
                e.preventDefault();
                void act("ready");
            } else if (e.key.toLowerCase() === "p" && view && view.status !== "ENDED") {
                void act(view.status === "PAUSED" ? "resume" : "pause");
            } else if (e.key.toLowerCase() === "m") {
                toggleDialerMute();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [view, act, toggleDialerMute]);

    const agent = view ? AGENT[view.agentState] ?? AGENT.OFFLINE : AGENT.JOINING;
    const paused = view?.status === "PAUSED";
    const lines = view?.lines ?? [];
    const used = lines.length + (view?.connected ? 1 : 0);
    const stats = view?.stats;
    const qualifyCall: SoftphoneCall | null = view?.toQualify?.telephonyCallId
        ? {
              key: -1, direction: "outbound", target: { phone: "" }, phase: "ended", callId: view.toQualify.telephonyCallId,
              startedAt: now, answeredAt: now, endedAt: now, muted: false, outcome: "COMPLETED", durationSec: null, error: null, retryable: false, pinned: true,
          }
        : null;

    return (
        <div className="flex h-full min-h-0 w-full flex-col bg-canvas">
            {/* Session bar */}
            <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-5 py-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-control bg-primary text-primary-fg">
                    <Rows3 className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                    <p className="text-[13px] font-semibold leading-tight text-ink">Numérotation parallèle</p>
                    <p className="truncate text-[12px] text-ink-3">{missionName}</p>
                </div>
                <p className={cn("flex items-center gap-1.5 text-[12.5px] font-medium", paused ? "text-ink-3" : agent.tone)} aria-live="polite">
                    <span className={cn("h-2 w-2 rounded-full", paused ? "bg-ink-4" : view?.agentState === "READY" ? "animate-pulse bg-success" : "bg-current")} aria-hidden />
                    {paused ? "En pause · aucune nouvelle ligne" : agent.label}
                </p>
                <div className="ml-auto flex items-center gap-1.5">
                    <button type="button" onClick={openAudioSettings} title="Changer de micro ou de casque" aria-label="Réglages audio" className="cp-press flex h-8 w-8 items-center justify-center rounded-full text-ink-2 ring-1 ring-line hover:bg-surface-2">
                        <Headphones className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={toggleDialerMute} disabled={dialerLeg.state !== "connected"} title="Micro (M)" className={cn("cp-press flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium ring-1 ring-line hover:bg-surface-2 disabled:opacity-50", dialerLeg.muted ? "bg-warning-soft text-warning-ink" : "text-ink-2")}>
                        {dialerLeg.muted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                        {dialerLeg.muted ? "Micro coupé" : "Micro"}
                    </button>
                    <button type="button" onClick={() => void act(paused ? "resume" : "pause")} disabled={!view || busy !== null} title="Pause (P)" className="cp-press flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-ink-2 ring-1 ring-line hover:bg-surface-2 disabled:opacity-50">
                        {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                        {paused ? "Reprendre" : "Pause"}
                    </button>
                    <button type="button" onClick={() => void act("end")} disabled={busy !== null} className="cp-press flex h-8 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[12.5px] font-medium text-ink hover:bg-surface-3">
                        <Power className="h-3.5 w-3.5" /> Terminer
                    </button>
                </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto grid max-w-[1040px] gap-5 px-5 py-6 lg:grid-cols-[1fr_300px] lg:px-8">
                    <section className="min-w-0 space-y-4">
                        {error && <p className="rounded-control bg-danger-soft px-3 py-2 text-[12.5px] text-danger-ink">{error}</p>}
                        {dialerLeg.state === "failed" && !error && (
                            <div className="flex items-center gap-3 rounded-control bg-danger-soft px-3 py-2 text-[12.5px] text-danger-ink">
                                {dialerLeg.error ?? "Connexion à la session perdue."}
                                {sessionId && (
                                    <button type="button" onClick={() => void joinDialer(sessionId)} className="ml-auto font-semibold underline">Réessayer</button>
                                )}
                            </div>
                        )}

                        {/* The conversation, once the prospect is really in the conference */}
                        {view?.connected ? (
                            <div className="cp-pop rounded-[20px] border border-success/30 bg-surface p-5 shadow-overlay">
                                <div className="flex items-start gap-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-success-ink">
                                            {view.connected.state === "CONNECTED" ? `En ligne · ${elapsed(view.connected.since, now)}` : "Transfert en cours…"}
                                        </p>
                                        <p className="mt-1 truncate text-[22px] font-semibold tracking-[-0.02em] text-ink">{view.connected.label}</p>
                                        {view.connected.sublabel && <p className="truncate text-[14px] text-ink-2">{view.connected.sublabel}</p>}
                                        {view.connected.headline && (
                                            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent-50 px-2.5 py-1 text-[12px] font-medium text-accent-700">
                                                <Sparkles className="h-3 w-3" aria-hidden /> {view.connected.headline}
                                            </p>
                                        )}
                                    </div>
                                    {view.connected.state === "CONNECTED" && (
                                        <button type="button" onClick={() => void act("hangup")} disabled={busy === "hangup"} className="cp-press flex h-10 items-center gap-2 rounded-full bg-danger px-4 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-60">
                                            <PhoneOff className="h-4 w-4" /> Raccrocher
                                        </button>
                                    )}
                                </div>
                                {view.connected.contactId && (
                                    <Link href={`/sdr/contacts/${view.connected.contactId}`} target="_blank" className="mt-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-primary hover:underline">
                                        Ouvrir la fiche <ArrowRight className="h-3.5 w-3.5" />
                                    </Link>
                                )}
                            </div>
                        ) : view?.agentState === "WRAP_UP" && view.toQualify ? (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-warning-ink">À qualifier</p>
                                        <p className="text-[17px] font-semibold text-ink">{view.toQualify.label}</p>
                                    </div>
                                    <button type="button" onClick={() => void act("ready")} disabled={busy === "ready"} className="cp-press flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-60">
                                        Prêt pour la suite <kbd className="rounded border border-white/25 bg-white/10 px-1 text-[10.5px]">Entrée</kbd>
                                    </button>
                                </div>
                                <p className="text-[12px] text-ink-3">Aucune ligne ne sonne tant que vous n&apos;êtes pas prêt.</p>
                                {qualifyCall && (
                                    <div className="[&>div]:w-full">
                                        <PostCallSuggestion call={qualifyCall} onDone={() => void act("ready")} onEngage={() => undefined} />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="rounded-[20px] border border-dashed border-line px-5 py-8 text-center">
                                {view ? (
                                    <>
                                        <p className="text-[14px] font-medium text-ink">{paused ? "Session en pause" : "En attente d'un décroché"}</p>
                                        <p className="mx-auto mt-1 max-w-[420px] text-[12.5px] leading-relaxed text-ink-3">
                                            {paused
                                                ? "Reprenez quand vous êtes prêt : les lignes recommenceront à sonner."
                                                : "Dès qu'une personne décroche, elle vous est transmise ici. Les messageries et les lignes sans réponse sont écartées automatiquement."}
                                        </p>
                                    </>
                                ) : (
                                    <p className="flex items-center justify-center gap-2 text-[13px] text-ink-3"><Loader2 className="h-4 w-4 animate-spin" /> Ouverture de la session…</p>
                                )}
                            </div>
                        )}

                        {/* Lines */}
                        <div className="rounded-[16px] border border-line bg-surface">
                            <div className="flex items-center justify-between border-b border-line-subtle px-4 py-2.5">
                                <p className="text-[12.5px] font-semibold text-ink">Lignes actives</p>
                                <p className="flex items-center gap-1.5 text-[12px] tabular-nums text-ink-3">
                                    {Array.from({ length: view?.maxLines ?? 2 }, (_, i) => (
                                        <span key={i} className={cn("h-1.5 w-4 rounded-full", i < used ? "bg-primary" : "bg-surface-3")} aria-hidden />
                                    ))}
                                    <span className="ml-1">{used} / {view?.maxLines ?? "–"}</span>
                                </p>
                            </div>
                            {lines.length === 0 ? (
                                <p className="px-4 py-3 text-[12.5px] text-ink-3">{decision ?? "Aucune ligne en cours."}</p>
                            ) : (
                                <ul className="divide-y divide-line-subtle">
                                    {lines.map((l) => {
                                        const st = LINE_STATE[l.state] ?? LINE_STATE.PENDING;
                                        return (
                                            <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-[13px] font-medium text-ink">{l.label}{l.sublabel && <span className="font-normal text-ink-3"> · {l.sublabel}</span>}</p>
                                                    {l.headline && <p className="truncate text-[11.5px] text-ink-3">{l.headline}</p>}
                                                </div>
                                                <span className={cn("flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium", st.tone)}>
                                                    {st.pulse && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden />}
                                                    {st.label}
                                                </span>
                                                <span className="w-10 text-right text-[11px] tabular-nums text-ink-4">{elapsed(l.since, now)}</span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                            {lines.length > 0 && decision && <p className="border-t border-line-subtle px-4 py-2 text-[11.5px] text-ink-4">{decision}</p>}
                        </div>
                    </section>

                    {/* Today, measured */}
                    <aside className="space-y-3">
                        <div className="rounded-[16px] border border-line bg-surface p-4">
                            <p className="text-[12.5px] font-semibold text-ink">Aujourd&apos;hui</p>
                            <dl className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
                                <Metric label="Appels" value={stats?.attempts ?? 0} />
                                <Metric label="Conversations" value={stats?.conversations ?? 0} strong />
                                <Metric label="Messageries" value={stats?.voicemails ?? 0} />
                                <Metric
                                    label="Abandons"
                                    value={stats?.abandoned ?? 0}
                                    hint={stats?.abandonRate != null ? `${Math.round(stats.abandonRate * 1000) / 10} %` : undefined}
                                    warn={(stats?.abandonRate ?? 0) > 0.03}
                                />
                                <Metric label="Décroché → vous" value={stats?.medianBridgeSec != null ? `${stats.medianBridgeSec} s` : "–"} hint="médiane" wide />
                            </dl>
                        </div>
                        <p className="px-1 text-[11.5px] leading-relaxed text-ink-4">
                            Une personne qui décroche sans SDR disponible entend qui l&apos;a appelée et sera rappelée. Au-delà de 3 % d&apos;abandons, la session repasse sur une seule ligne.
                        </p>
                        <p className="px-1 text-[11px] text-ink-4">Raccourcis : <b>Entrée</b> prêt · <b>P</b> pause · <b>M</b> micro</p>
                    </aside>
                </div>
            </div>
        </div>
    );
}

function Metric({ label, value, hint, strong, warn, wide }: { label: string; value: string | number; hint?: string; strong?: boolean; warn?: boolean; wide?: boolean }) {
    return (
        <div className={cn(wide && "col-span-2")}>
            <dt className="text-ink-3">{label}</dt>
            <dd className={cn("mt-0.5 text-[18px] font-semibold tabular-nums tracking-[-0.01em]", strong ? "text-primary" : warn ? "text-danger-ink" : "text-ink")}>
                {value}
                {hint && <span className={cn("ml-1.5 text-[11px] font-medium", warn ? "text-danger-ink" : "text-ink-4")}>{hint}</span>}
            </dd>
        </div>
    );
}
