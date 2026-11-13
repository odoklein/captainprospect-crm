"use client";

// ============================================
// POST-CALL SUGGESTION — the card under the call island when a call ends.
//
// « Pas de réponse » right away when nobody picked up (Twilio's outcome);
// for a conversation, the AI's result and its summary as the note once the
// summary is ready. Confirmer saves it as the call's qualification
// (POST /api/actions, linked to this exact call); Modifier edits the note and
// the callback time; Ignorer hides it. Nothing is saved without the click.
//
// Pages follow the save with useCallQualified() (next row in Mode auto, next
// prospect in Mode Focus, refresh of Mes appels).
// ============================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Pencil, Sparkles, PhoneMissed } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CallSuggestion } from "@/lib/telephony/suggestion";
import type { SoftphoneCall } from "./SoftphoneProvider";
import { CallFollowUps, type CallInsight, type FollowUpProposal } from "./CallFollowUps";

export const CALL_QUALIFIED_EVENT = "cp:call-qualified";

export interface CallQualifiedDetail {
    callId: string;
    contactId: string | null;
    companyId: string | null;
    result: string;
}

/** Runs `handler` when a call is qualified from the island. */
export function useCallQualified(handler: (detail: CallQualifiedDetail) => void) {
    const ref = useRef(handler);
    useEffect(() => {
        ref.current = handler;
    });
    useEffect(() => {
        const on = (e: Event) => ref.current((e as CustomEvent<CallQualifiedDetail>).detail);
        window.addEventListener(CALL_QUALIFIED_EVENT, on);
        return () => window.removeEventListener(CALL_QUALIFIED_EVENT, on);
    }, []);
}

type Target = { contactId: string | null; companyId: string | null; campaignId: string | null };
type Loaded = { callId: string; suggestion: CallSuggestion; target: Target; proposals: FollowUpProposal[]; gaps: string[]; insight: CallInsight | null };

const POLL_MS = 2500;
const POLL_FOR_MS = 4 * 60_000;

function callbackLabel(local: string): string {
    const d = new Date(local);
    if (Number.isNaN(d.getTime())) return local;
    return d.toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function PostCallSuggestion({ call, onDone, onEngage }: { call: SoftphoneCall; onDone: () => void; onEngage: () => void }) {
    const callId = call.callId;
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [dismissedFor, setDismissedFor] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [note, setNote] = useState("");
    const [callbackAt, setCallbackAt] = useState("");
    const [draftFor, setDraftFor] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedLabel, setSavedLabel] = useState<string | null>(null);

    // Poll until the suggestion settles (ready / none / saved).
    useEffect(() => {
        if (!callId) return;
        let stop = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const started = Date.now();
        const tick = async () => {
            try {
                const res = await fetch(`/api/telephony/calls/${callId}/suggestion`, { cache: "no-store" });
                const json = await res.json().catch(() => null);
                if (stop) return;
                if (json?.success) {
                    setLoaded({
                        callId,
                        suggestion: json.data.suggestion,
                        target: json.data.target,
                        proposals: json.data.proposals ?? [],
                        gaps: json.data.gaps ?? [],
                        insight: json.data.insight ?? null,
                    });
                    if (json.data.suggestion.state !== "waiting") return;
                }
            } catch {
                /* network blip: try again */
            }
            if (!stop && Date.now() - started < POLL_FOR_MS) timer = setTimeout(tick, POLL_MS);
        };
        void tick();
        return () => {
            stop = true;
            if (timer) clearTimeout(timer);
        };
    }, [callId]);

    const current = loaded && loaded.callId === callId ? loaded : null;
    const s = current?.suggestion ?? null;

    // A new suggestion fills the draft (render-time, once per suggestion).
    const draftKey = s?.state === "ready" ? `${callId}:${s.status.code}:${s.source}` : null;
    if (draftKey && draftKey !== draftFor && s?.state === "ready") {
        setDraftFor(draftKey);
        setNote(s.note);
        setCallbackAt(s.callbackAt ?? "");
        setEditing(false);
        setError(null);
    }

    // A suggestion on screen keeps the call from auto-dismissing.
    const ready = s?.state === "ready";
    useEffect(() => {
        if (ready) onEngage();
    }, [ready, onEngage]);

    const confirm = useCallback(async () => {
        if (!current || current.suggestion.state !== "ready" || !callId || saving) return;
        const sug = current.suggestion;
        const t = current.target;
        if (!t.companyId || !t.campaignId) return setError("Prospect inconnu : qualifiez depuis la fiche.");
        if (sug.status.requiresNote && !note.trim()) {
            setEditing(true);
            return setError("Une note est requise pour ce résultat.");
        }
        setSaving(true);
        setError(null);
        try {
            const callbackDate = sug.status.triggersCallback && callbackAt ? new Date(callbackAt) : null;
            const res = await fetch("/api/actions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contactId: t.contactId ?? undefined,
                    companyId: t.companyId,
                    campaignId: t.campaignId,
                    channel: "CALL",
                    result: sug.status.code,
                    note: note.trim() || undefined,
                    callbackDate: callbackDate && !Number.isNaN(callbackDate.getTime()) ? callbackDate.toISOString() : undefined,
                    telephonyCallId: callId,
                }),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.success) throw new Error(json?.error || "Enregistrement impossible");
            setSavedLabel(sug.status.label);
            window.dispatchEvent(
                new CustomEvent<CallQualifiedDetail>(CALL_QUALIFIED_EVENT, {
                    detail: { callId, contactId: t.contactId, companyId: t.companyId, result: sug.status.code },
                }),
            );
            setTimeout(onDone, 1200);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Enregistrement impossible");
        } finally {
            setSaving(false);
        }
    }, [current, callId, saving, note, callbackAt, onDone]);

    if (!callId || !s || dismissedFor === callId) return null;

    if (savedLabel) {
        return (
            <Card>
                <div className="flex items-center gap-2.5 px-4 py-3 text-[13px] text-ink">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success text-white">
                        <Check className="h-3.5 w-3.5" />
                    </span>
                    Enregistré · <span className="font-medium">{savedLabel}</span>
                </div>
            </Card>
        );
    }

    if (s.state === "waiting") {
        if (!call.answeredAt) return null; // still settling Twilio's outcome: a second at most
        return (
            <Card>
                <div className="flex items-center gap-2.5 px-4 py-3">
                    <Sparkles className="h-4 w-4 shrink-0 animate-pulse text-accent" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                        <p className="text-[12.5px] text-ink-2">Analyse de l&apos;appel pour proposer un résultat…</p>
                        <div className="cp-shimmer h-2 w-3/4 rounded" />
                    </div>
                </div>
            </Card>
        );
    }

    const followUps = current ? <CallFollowUps proposals={current.proposals} gaps={current.gaps} insight={current.insight} /> : null;

    // No clear result to propose, but the conversation still left follow-ups.
    if (s.state !== "ready") {
        return current && (current.proposals.length > 0 || current.insight) ? <Card>{followUps}</Card> : null;
    }

    const ai = s.source === "ai";
    return (
        <Card>
            <div className="px-4 pb-3 pt-3.5" onKeyDown={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Résultat proposé</span>
                    <span
                        className={cn(
                            "flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                            ai ? "bg-accent-50 text-accent-700" : "bg-surface-3 text-ink-3",
                        )}
                        title={ai ? "Déduit de la conversation par l'IA" : "Issue réelle de l'appel, transmise par Twilio"}
                    >
                        {ai ? <Sparkles className="h-2.5 w-2.5" /> : <PhoneMissed className="h-2.5 w-2.5" />}
                        {ai ? "IA" : "Twilio"}
                    </span>
                </div>

                <div className="mt-2 flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.status.color ?? "var(--ds-line-strong)" }} aria-hidden />
                    <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{s.status.label}</span>
                </div>

                {editing ? (
                    <div className="mt-2.5 space-y-2">
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                    e.preventDefault();
                                    void confirm();
                                }
                            }}
                            maxLength={500}
                            rows={3}
                            autoFocus
                            aria-label="Note"
                            className="w-full resize-none rounded-control border border-line bg-surface-2/50 px-2.5 py-2 text-[13px] leading-relaxed text-ink focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-focus"
                        />
                        {s.status.triggersCallback && (
                            <label className="flex items-center gap-2 text-[12px] text-ink-3">
                                Rappeler le
                                <input
                                    type="datetime-local"
                                    value={callbackAt}
                                    onChange={(e) => setCallbackAt(e.target.value)}
                                    className="h-7 rounded-control border border-line bg-surface px-2 text-[12.5px] text-ink"
                                />
                            </label>
                        )}
                    </div>
                ) : (
                    <>
                        {note && <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-ink-2">{note}</p>}
                        {s.status.triggersCallback && callbackAt && (
                            <p className="mt-1.5 text-[12px] font-medium text-warning-ink">Rappel : {callbackLabel(callbackAt)}</p>
                        )}
                    </>
                )}

                {!s.confirmable && (
                    <p className="mt-2 text-[12px] text-ink-3">Un RDV se planifie depuis la fiche du prospect (créneau, invitation).</p>
                )}
                {error && <p className="mt-2 text-[12px] text-danger-ink">{error}</p>}

                <div className="mt-3 flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => setDismissedFor(callId)}
                        className="cp-press h-8 rounded-full px-3 text-[12.5px] font-medium text-ink-3 hover:bg-surface-2 hover:text-ink"
                    >
                        Ignorer
                    </button>
                    {s.confirmable && !editing && (
                        <button
                            type="button"
                            onClick={() => {
                                onEngage();
                                setEditing(true);
                            }}
                            className="cp-press flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
                        >
                            <Pencil className="h-3.5 w-3.5" /> Modifier
                        </button>
                    )}
                    {s.confirmable && (
                        <button
                            type="button"
                            onClick={() => void confirm()}
                            disabled={saving}
                            className="cp-press ml-auto flex h-8 items-center gap-1.5 rounded-full bg-primary px-4 text-[12.5px] font-semibold text-primary-fg shadow-[0_6px_16px_-8px_var(--ds-primary)] hover:bg-primary-hover disabled:opacity-60"
                        >
                            <Check className="h-3.5 w-3.5" />
                            {saving ? "Enregistrement…" : "Confirmer"}
                        </button>
                    )}
                </div>
            </div>
            {followUps}
        </Card>
    );
}

function Card({ children }: { children: React.ReactNode }) {
    return (
        <div className="cp-pop pointer-events-auto w-[min(420px,calc(100vw-24px))] overflow-hidden rounded-[20px] border border-line bg-surface text-ink shadow-overlay">
            {children}
        </div>
    );
}
