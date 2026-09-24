"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { formatDistanceToNowStrict } from "date-fns";
import { fr } from "date-fns/locale";
import {
    BellRing,
    Check,
    ChevronUp,
    Copy,
    ExternalLink,
    Minus,
    Phone,
    PhoneCall,
    PhoneIncoming,
    PhoneMissed,
    PhoneOff,
    X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CallerCandidate, CallerDossier } from "@/lib/incoming-calls/caller-lookup";
import { CallerDossierView, type PhoneHistoryState } from "./CallerDossierView";
import {
    formatClock,
    formatDuration,
    formatPhone,
    isLive,
    patchIncomingCall,
    useIncomingCalls,
    type IncomingCall,
} from "./useIncomingCalls";

const UnifiedActionDrawer = dynamic(
    () => import("@/components/drawers/UnifiedActionDrawer").then((m) => ({ default: m.UnifiedActionDrawer })),
    { ssr: false },
);

const ROLES = new Set(["SDR", "BUSINESS_DEVELOPER", "BOOKER", "MANAGER"]);
const MINIMIZED_KEY = "incoming_calls_minimized";

type Selection = { companyId: string; contactId: string | null };
type DrawerTarget = Selection & { callId: string; missionId?: string; missionName?: string };

function readMinimized(): Set<string> {
    try {
        return new Set(JSON.parse(sessionStorage.getItem(MINIMIZED_KEY) ?? "[]"));
    } catch {
        return new Set();
    }
}

function writeMinimized(ids: Set<string>) {
    try {
        sessionStorage.setItem(MINIMIZED_KEY, JSON.stringify([...ids].slice(-50)));
    } catch {
        /* private mode — minimizing just won't survive a reload */
    }
}

function callerLabel(call: IncomingCall): string {
    return call.callerName ?? call.companyName ?? call.alloPersonName ?? formatPhone(call.fromNumber);
}

function useNow(ticking: boolean) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!ticking) return;
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [ticking]);
    return now;
}

/** Status line for the header/dock: live timers, then duration or age once over. */
function statusText(call: IncomingCall, now: number): string {
    if (call.stale) return "Appel terminé";
    const since = (iso: string) => formatClock((now - new Date(iso).getTime()) / 1000);
    switch (call.status) {
        case "RINGING":
            return `Sonne depuis ${since(call.startedAt)}`;
        case "ANSWERED":
            return `En communication · ${since(call.answeredAt ?? call.startedAt)}`;
        case "COMPLETED":
            return `Terminé · ${formatDuration(call.durationSec)}`;
        case "MISSED":
            return `Manqué ${formatDistanceToNowStrict(new Date(call.startedAt), { addSuffix: true, locale: fr })}`;
        default:
            return "";
    }
}

const HEADER = {
    RINGING: { bg: "from-[#7C5CFC] to-[#5B3FD9]", label: "Appel entrant", Icon: PhoneIncoming },
    ANSWERED: { bg: "from-emerald-500 to-emerald-600", label: "En communication", Icon: PhoneCall },
    COMPLETED: { bg: "from-slate-700 to-slate-800", label: "Appel terminé", Icon: PhoneOff },
    MISSED: { bg: "from-rose-500 to-rose-600", label: "Appel manqué", Icon: PhoneMissed },
} as const;

// ============================================
// ROOT
// ============================================

/**
 * Screen-pop for inbound calls on the user's Allo line. Mounted once in the app
 * shell: polls /api/incoming-calls, blocks the screen with the caller's dossier
 * while the phone rings, and hands off to the UnifiedActionDrawer.
 */
export function IncomingCallPanel() {
    const { data: session } = useSession();
    const active = ROLES.has(session?.user?.role ?? "");

    const [focusedId, setFocusedId] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    // readMinimized swallows the missing sessionStorage during SSR.
    const [minimized, setMinimized] = useState<Set<string>>(readMinimized);
    const [drawer, setDrawer] = useState<DrawerTarget | null>(null);

    // A new live call takes the screen, even over another one or an open drawer.
    const onArrival = useCallback(
        (call: IncomingCall) => {
            if (!isLive(call) || minimized.has(call.id)) return;
            setFocusedId(call.id);
            setOpen(true);
            desktopAlert(call);
        },
        [minimized],
    );
    const { calls, enabled, refresh, patchLocal } = useIncomingCalls(active, onArrival);

    // Dismissed elsewhere or aged out of the poll: the dialog just stops rendering.
    const focused = useMemo(() => calls.find((c) => c.id === focusedId) ?? null, [calls, focusedId]);
    const dialogCall = open ? focused : null;

    useRingingTitle(calls);

    const minimize = useCallback(() => {
        if (focusedId) {
            setMinimized((prev) => {
                const next = new Set(prev).add(focusedId);
                writeMinimized(next);
                return next;
            });
        }
        setOpen(false);
    }, [focusedId]);

    const dismiss = useCallback(
        (call: IncomingCall) => {
            patchLocal(call.id, null);
            setOpen(false);
            patchIncomingCall(call.id, { dismiss: true }).catch(refresh);
        },
        [patchLocal, refresh],
    );

    const openFiche = useCallback(
        (call: IncomingCall, selection: Selection, dossier: CallerDossier) => {
            const done = !isLive(call);
            // A finished call is handled once its fiche is open; a live one stays in the dock.
            if (done) patchLocal(call.id, null);
            setOpen(false);
            setDrawer({
                ...selection,
                callId: call.id,
                missionId: dossier.mission?.id,
                missionName: dossier.mission?.name,
            });
            patchIncomingCall(call.id, { opened: true, ...(call.status === "MISSED" ? { dismiss: true } : {}) }).catch(
                refresh,
            );
        },
        [patchLocal, refresh],
    );

    const showCall = useCallback((id: string) => {
        setFocusedId(id);
        setOpen(true);
    }, []);

    const dismissAllHandled = useCallback(async () => {
        const handled = calls.filter((c) => !isLive(c));
        handled.forEach((c) => patchLocal(c.id, null));
        await Promise.allSettled([
            fetch("/api/incoming-calls", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dismissMissed: true }),
            }),
            ...handled.filter((c) => c.status !== "MISSED").map((c) => patchIncomingCall(c.id, { dismiss: true })),
        ]);
        refresh();
    }, [calls, patchLocal, refresh]);

    if (!active || enabled === false) return null;

    return (
        <>
            {dialogCall && (
                <IncomingCallDialog
                    key={dialogCall.id}
                    call={dialogCall}
                    onMinimize={minimize}
                    onDismiss={() => dismiss(dialogCall)}
                    onOpenFiche={(selection, dossier) => openFiche(dialogCall, selection, dossier)}
                    onRelinked={refresh}
                />
            )}

            {!dialogCall && calls.length > 0 && (
                <IncomingCallDock calls={calls} onShow={showCall} onClearHandled={dismissAllHandled} />
            )}

            {drawer && (
                <UnifiedActionDrawer
                    isOpen
                    onClose={() => setDrawer(null)}
                    contactId={drawer.contactId}
                    companyId={drawer.companyId}
                    missionId={drawer.missionId}
                    missionName={drawer.missionName}
                    enableGooglePhoneLookup
                    onActionRecorded={refresh}
                />
            )}
        </>
    );
}

function desktopAlert(call: IncomingCall) {
    if (typeof window === "undefined" || !document.hidden) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
        const n = new Notification(call.status === "RINGING" ? "📞 Appel entrant" : "📞 En communication", {
            body: [callerLabel(call), call.callerName ? call.companyName : null].filter(Boolean).join(" · "),
            tag: `incoming-call-${call.id}`,
            requireInteraction: true,
        });
        n.onclick = () => {
            window.focus();
            n.close();
        };
    } catch {
        /* some browsers only allow notifications from a service worker */
    }
}

/** Flashes the tab title while a call rings and the CRM tab is in the background. */
function useRingingTitle(calls: IncomingCall[]) {
    const ringing = calls.find((c) => c.status === "RINGING" && !c.stale);
    const label = ringing ? callerLabel(ringing) : null;
    useEffect(() => {
        if (!label) return;
        const original = document.title;
        let flip = false;
        const t = setInterval(() => {
            flip = !flip;
            document.title = document.hidden && flip ? `📞 ${label} vous appelle` : original;
        }, 1000);
        return () => {
            clearInterval(t);
            document.title = original;
        };
    }, [label]);
}

// ============================================
// DIALOG
// ============================================

function IncomingCallDialog({
    call,
    onMinimize,
    onDismiss,
    onOpenFiche,
    onRelinked,
}: {
    call: IncomingCall;
    onMinimize: () => void;
    onDismiss: () => void;
    onOpenFiche: (selection: Selection, dossier: CallerDossier) => void;
    onRelinked: () => void;
}) {
    const live = isLive(call);
    const now = useNow(live || call.status === "MISSED");
    const [candidates, setCandidates] = useState<CallerCandidate[] | null>(null);
    const [selection, setSelection] = useState<Selection | null>(null);
    const [dossier, setDossier] = useState<CallerDossier | null>(null);
    const [dossierLoading, setDossierLoading] = useState(true);
    const [history, setHistory] = useState<PhoneHistoryState>({ loading: true, available: true, calls: [] });
    const [copied, setCopied] = useState(false);
    // Only ever rendered client-side (it needs a polled call), so window is safe here.
    const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">(() =>
        "Notification" in window ? Notification.permission : "unsupported",
    );
    const primaryRef = useRef<HTMLButtonElement>(null);

    // The ring-time match may land a second after the row — refetch once it does,
    // keeping the current dossier on screen meanwhile.
    const resolvedKey = `${call.companyId ?? ""}:${call.contactId ?? ""}`;
    useEffect(() => {
        let cancelled = false;
        fetch(`/api/incoming-calls/${call.id}`, { cache: "no-store" })
            .then((r) => r.json())
            .then((json) => {
                if (cancelled || !json?.success) return;
                setCandidates(json.data.candidates);
                setSelection(json.data.selection);
                setDossier(json.data.dossier);
            })
            .catch(() => undefined)
            .finally(() => !cancelled && setDossierLoading(false));
        return () => {
            cancelled = true;
        };
    }, [call.id, resolvedKey]);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/incoming-calls/${call.id}/phone-history`, { cache: "no-store" })
            .then((r) => r.json())
            .then((json) => {
                if (cancelled) return;
                setHistory({
                    loading: false,
                    available: Boolean(json?.success && json.data.available),
                    calls: json?.success ? json.data.calls : [],
                });
            })
            .catch(() => !cancelled && setHistory({ loading: false, available: false, calls: [] }));
        return () => {
            cancelled = true;
        };
    }, [call.id]);

    useEffect(() => {
        primaryRef.current?.focus();
    }, []);

    const selectCandidate = useCallback(
        (c: CallerCandidate) => {
            const next = { companyId: c.companyId, contactId: c.contactId };
            setSelection(next);
            setDossierLoading(true);
            const qs = new URLSearchParams({ companyId: c.companyId, candidates: "0" });
            if (c.contactId) qs.set("contactId", c.contactId);
            fetch(`/api/incoming-calls/${call.id}?${qs}`, { cache: "no-store" })
                .then((r) => r.json())
                .then((json) => json?.success && setDossier(json.data.dossier))
                .finally(() => setDossierLoading(false));
            // Persist so the dock and the missed-call reminder show the right name.
            patchIncomingCall(call.id, { link: next }).then(onRelinked).catch(() => undefined);
        },
        [call.id, onRelinked],
    );

    const canOpen = Boolean(selection && dossier);
    const open = useCallback(() => {
        if (selection && dossier) onOpenFiche(selection, dossier);
    }, [selection, dossier, onOpenFiche]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onMinimize();
            } else if (e.key === "Enter" && canOpen) {
                const target = e.target as HTMLElement | null;
                if (target?.closest("button, a, input, textarea, select")) return;
                e.preventDefault();
                open();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [canOpen, open, onMinimize]);

    const header = call.stale ? HEADER.COMPLETED : HEADER[call.status];
    const HeaderIcon = header.Icon;

    const copyNumber = () => {
        navigator.clipboard?.writeText(call.fromNumber).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    return (
        <div
            className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-[#12122A]/50 backdrop-blur-sm animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            aria-labelledby="incoming-call-title"
        >
            <div className="w-full max-w-[760px] max-h-[92vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className={cn("relative px-6 py-4 text-white bg-gradient-to-r", header.bg)}>
                    <div className="flex items-center gap-4">
                        <div className="relative w-12 h-12 shrink-0">
                            {call.status === "RINGING" && !call.stale && (
                                <span className="absolute inset-0 rounded-full bg-white/40 animate-ping" />
                            )}
                            <span className="relative w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                                <HeaderIcon className="w-6 h-6" />
                            </span>
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/80">{header.label}</p>
                            <p className="text-2xl font-bold tracking-tight tabular-nums">{formatPhone(call.fromNumber)}</p>
                            <p className="text-[12px] text-white/85 tabular-nums">
                                {statusText(call, now)} · sur votre ligne {formatPhone(call.toNumber)}
                            </p>
                        </div>
                        <div className="flex items-center gap-1 self-start">
                            <button
                                type="button"
                                onClick={copyNumber}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15"
                                title="Copier le numéro"
                            >
                                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            </button>
                            <button
                                type="button"
                                onClick={onMinimize}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15"
                                title="Réduire (Échap)"
                            >
                                <Minus className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={onDismiss}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15"
                                title="Ignorer cet appel"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5">
                    <CallerDossierView
                        call={call}
                        candidates={candidates}
                        selection={selection}
                        dossier={dossier}
                        dossierLoading={dossierLoading}
                        history={history}
                        onSelectCandidate={selectCandidate}
                    />
                </div>

                {/* Footer */}
                <div className="px-6 py-3.5 border-t border-[#E8EBF0] bg-[#FAFAFC] flex flex-wrap items-center gap-2">
                    {notifPermission === "default" ? (
                        <button
                            type="button"
                            onClick={() => Notification.requestPermission().then(setNotifPermission)}
                            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#7C5CFC] hover:underline"
                        >
                            <BellRing className="w-3.5 h-3.5" /> Être alerté même hors de l&apos;onglet
                        </button>
                    ) : (
                        <span className="text-[11px] text-[#8B8BA7] hidden sm:inline">
                            Entrée : ouvrir la fiche · Échap : réduire
                        </span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                        {call.status === "MISSED" && (
                            <a
                                href={`tel:${call.fromNumber}`}
                                className="h-9 px-3.5 rounded-lg border border-[#E8EBF0] bg-white text-[13px] font-semibold text-[#12122A] hover:bg-slate-50 inline-flex items-center gap-1.5"
                            >
                                <Phone className="w-4 h-4" /> Rappeler
                            </a>
                        )}
                        <button
                            type="button"
                            onClick={onMinimize}
                            className="h-9 px-3.5 rounded-lg border border-[#E8EBF0] bg-white text-[13px] font-semibold text-[#5A5A7A] hover:text-[#12122A] hover:bg-slate-50"
                        >
                            Réduire
                        </button>
                        <button
                            ref={primaryRef}
                            type="button"
                            onClick={open}
                            disabled={!canOpen}
                            className="h-9 px-4 rounded-lg bg-[#7C5CFC] text-white text-[13px] font-semibold hover:bg-[#6B4BEB] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                            title={canOpen ? "Ouvrir la fiche dans le panneau d'action" : "Aucune fiche CRM pour ce numéro"}
                        >
                            <ExternalLink className="w-4 h-4" />
                            {canOpen ? (call.status === "MISSED" ? "Ouvrir la fiche pour rappeler" : "Ouvrir la fiche") : "Aucune fiche"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================
// DOCK
// ============================================

/** Floating reminder while the dialog is closed: the live call, then calls left to handle. */
function IncomingCallDock({
    calls,
    onShow,
    onClearHandled,
}: {
    calls: IncomingCall[];
    onShow: (id: string) => void;
    onClearHandled: () => void;
}) {
    const live = calls.find(isLive) ?? null;
    const pending = calls.filter((c) => !isLive(c));
    const now = useNow(Boolean(live) || pending.length > 0);
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="fixed bottom-20 left-6 z-[90] flex flex-col items-start gap-2 max-w-[340px]">
            {expanded && pending.length > 0 && (
                <div className="w-[320px] rounded-2xl border border-[#E8EBF0] bg-white shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150">
                    <div className="px-4 py-2.5 border-b border-[#E8EBF0] flex items-center justify-between">
                        <p className="text-[12px] font-bold text-[#12122A]">Appels à traiter</p>
                        <button
                            type="button"
                            onClick={() => {
                                setExpanded(false);
                                onClearHandled();
                            }}
                            className="text-[11px] font-semibold text-[#7C5CFC] hover:underline"
                        >
                            Tout marquer traité
                        </button>
                    </div>
                    <ul className="max-h-72 overflow-y-auto divide-y divide-[#F1F2F6]">
                        {pending.map((c) => (
                            <li key={c.id}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setExpanded(false);
                                        onShow(c.id);
                                    }}
                                    className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-3"
                                >
                                    {c.status === "MISSED" ? (
                                        <PhoneMissed className="w-4 h-4 text-rose-500 shrink-0" />
                                    ) : (
                                        <PhoneOff className="w-4 h-4 text-slate-400 shrink-0" />
                                    )}
                                    <span className="min-w-0">
                                        <span className="block text-[12px] font-semibold text-[#12122A] truncate">{callerLabel(c)}</span>
                                        <span className="block text-[11px] text-[#8B8BA7] truncate">{statusText(c, now)}</span>
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="flex items-center gap-2">
                {live && (
                    <button
                        type="button"
                        onClick={() => onShow(live.id)}
                        className={cn(
                            "flex items-center gap-2.5 pl-2 pr-3.5 py-2 rounded-full text-white shadow-lg hover:shadow-xl transition-shadow",
                            live.status === "RINGING" ? "bg-[#7C5CFC]" : "bg-emerald-600",
                        )}
                        title="Afficher l'appel"
                    >
                        <span className="relative flex w-7 h-7 items-center justify-center rounded-full bg-white/20">
                            {live.status === "RINGING" && <span className="absolute inset-0 rounded-full bg-white/40 animate-ping" />}
                            <PhoneCall className="relative w-3.5 h-3.5" />
                        </span>
                        <span className="text-left">
                            <span className="block text-[12px] font-bold leading-tight max-w-[180px] truncate">{callerLabel(live)}</span>
                            <span className="block text-[10px] text-white/85 leading-tight tabular-nums">{statusText(live, now)}</span>
                        </span>
                    </button>
                )}
                {pending.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white border border-rose-200 text-rose-600 text-[12px] font-bold shadow-lg hover:bg-rose-50"
                    >
                        <PhoneMissed className="w-3.5 h-3.5" />
                        {pending.length} appel{pending.length > 1 ? "s" : ""} à traiter
                        <ChevronUp className={cn("w-3.5 h-3.5 transition-transform", !expanded && "rotate-180")} />
                    </button>
                )}
            </div>
        </div>
    );
}
