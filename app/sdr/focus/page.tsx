"use client";

// ============================================
// MODE FOCUS — a calling session on the smart queue.
//
// One prospect at a time from /api/actions/next (callbacks first, then
// follow-ups, new, retries — the queue's own ranking): read the context,
// the call starts by itself (integrated phone, cancellable countdown),
// pick the outcome with a key, save, the next prospect is already there.
// Everything else (booking an RDV, the full record) opens the existing
// action drawer instead of a second implementation.
// ============================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
    AlertTriangle, CalendarClock, ChevronDown, Crosshair, ExternalLink, FileText, History, Keyboard,
    LogOut, Pause, Phone, PhoneOff, Play, RefreshCw, SkipForward, X,
} from "lucide-react";
import { Kbd, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { isCallActive, useSoftphone } from "@/components/telephony/SoftphoneProvider";
import { matchesCallTarget } from "@/lib/telephony/client-state";
import { formatPhone } from "@/components/incoming-calls/useIncomingCalls";
import { AiSummaryView, useCallTranscript } from "@/components/telephony/CallInsights";
import { useCallQualified } from "@/components/telephony/PostCallSuggestion";
import { PrecallBrief } from "@/components/sdr/PrecallBrief";
import { ProspectIdentity } from "@/components/sdr/workspace/ProspectIdentity";
import { DockList } from "@/components/layout/FloatingDock";
import {
    EMPTY_STATS, callbackPresets, connectRate, dispositionKeys, isTypingTarget, parseLocalCallback, type SessionStats,
} from "@/lib/focus/focus";

const UnifiedActionDrawer = dynamic(
    () => import("@/components/drawers/UnifiedActionDrawer").then((m) => ({ default: m.UnifiedActionDrawer })),
    { ssr: false },
);

// ── data shapes (from existing APIs) ────────────────────────────────────────

interface Mission {
    id: string;
    name: string;
    channel?: string;
    channels?: string[];
    client?: { name: string } | null;
}

interface Status {
    code: string;
    label: string;
    color: string | null;
    sortOrder: number;
    requiresNote: boolean;
    triggersCallback: boolean;
}

interface LastAction {
    result: string;
    note?: string | null;
    createdAt?: string;
    callbackDate?: string | null;
    scope?: "CONTACT" | "COMPANY" | null;
}

interface NextProspect {
    hasNext: true;
    priority: string;
    missionName: string;
    contact: { id: string; firstName: string | null; lastName: string | null; title: string | null; email: string | null; phone: string | null; linkedin: string | null } | null;
    company: { id: string; name: string; industry: string | null; website: string | null; country: string | null; phone: string | null };
    campaignId: string;
    strategyName?: string | null;
    sourceListName?: string | null;
    script: string | null;
    scriptAdditional?: string;
    scriptAiEnhanced?: string;
    clientBookingUrl?: string | null;
    clientInterlocuteurs?: unknown[];
    preferredInterlocuteurId?: string | null;
    preferredInterlocuteurIds?: string[] | null;
    lastAction: LastAction | null;
    lastActionBy: { id: string; name: string | null } | null;
    companyLastAction: (LastAction & { sdrName?: string | null }) | null;
    sharedPhoneCall: { sdrName?: string | null; createdAt?: string; targetName?: string | null } | null;
}

type Phase = "setup" | "loading" | "ready" | "empty" | "error";

const PRIORITY: Record<string, { label: string; tone: string }> = {
    ABSENT_RDV: { label: "RDV manqué à recaler", tone: "text-danger-ink bg-danger-soft border-danger-line" },
    CALLBACK: { label: "Rappel prévu", tone: "text-warning-ink bg-warning-soft border-warning-line" },
    FOLLOW_UP: { label: "Relance", tone: "text-info-ink bg-info-soft border-info-line" },
    NEW: { label: "Jamais contacté", tone: "text-ink-2 bg-surface-2 border-line" },
    RETRY: { label: "Nouvelle tentative", tone: "text-ink-2 bg-surface-2 border-line" },
};

const AUTO_DIAL_SECONDS = 3;
const LS_MISSION = "focus_mission";
const LS_AUTODIAL = "focus_autodial";

function readLS(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}
function writeLS(key: string, value: string) {
    try {
        localStorage.setItem(key, value);
    } catch {
        /* private mode */
    }
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) throw new Error(json?.error || `Erreur ${res.status}`);
    return json.data as T;
}

function personName(n: NextProspect): string {
    const c = n.contact;
    const name = c ? [c.firstName, c.lastName].filter(Boolean).join(" ").trim() : "";
    return name || n.company.name;
}

function relativeDay(iso?: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    const days = Math.round((Date.now() - d.getTime()) / 86_400_000);
    const date = d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    if (days <= 0) return `aujourd'hui, ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
    if (days === 1) return "hier";
    return `il y a ${days} j (${date})`;
}

function clock(totalSec: number): string {
    const s = Math.max(0, Math.floor(totalSec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
}

// ════════════════════════════════════════════════════════════════════════════

export default function FocusPage() {
    const { success } = useToast();
    const { enabled: softphoneOn, insights: insightsOn, call, dial, hangup, toggleMute } = useSoftphone();

    const [missions, setMissions] = useState<Mission[] | null>(null);
    const [missionId, setMissionId] = useState<string | null>(null);
    const [statuses, setStatuses] = useState<Status[]>([]);
    const [autoDial, setAutoDial] = useState(true);
    const [paused, setPaused] = useState(false);

    const [phase, setPhase] = useState<Phase>("setup");
    const [prospect, setProspect] = useState<NextProspect | null>(null);
    const [emptyMessage, setEmptyMessage] = useState<string>("");
    const [skipped, setSkipped] = useState<{ contacts: string[]; companies: string[] }>({ contacts: [], companies: [] });

    const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);
    const [sessionStart, setSessionStart] = useState<number | null>(null);
    const [now, setNow] = useState(() => Date.now());

    const [selected, setSelected] = useState<string | null>(null);
    const [note, setNote] = useState("");
    const [callbackChoice, setCallbackChoice] = useState<string | null>(null);
    const [customCallback, setCustomCallback] = useState("");
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const [countdown, setCountdown] = useState<number | null>(null);
    const [phoneChoice, setPhoneChoice] = useState<"contact" | "company">("contact");
    const [drawer, setDrawer] = useState<{ initialResult?: string; contactId?: string } | null>(null);
    const [helpOpen, setHelpOpen] = useState(false);

    // The integrated-phone call placed to the prospect on screen (kept after the dock is closed).
    const [ourCallId, setOurCallId] = useState<string | null>(null);
    const nextRequest = useRef<AbortController | null>(null);
    const saveLock = useRef(false);
    useEffect(() => () => nextRequest.current?.abort(), []);
    const noteRef = useRef<HTMLTextAreaElement>(null);
    // Prospect whose automatic call is used up: dialled, or cancelled by the SDR.
    // Only a new prospect re-arms the countdown (closing the fiche or the help never does).
    const dialedFor = useRef<string | null>(null);
    const countedConnect = useRef<number | null>(null); // softphone call key already counted as connected

    // ── setup ──────────────────────────────────────────────────────────────
    useEffect(() => {
        setAutoDial(readLS(LS_AUTODIAL) !== "0");
        getJson<Mission[]>("/api/sdr/missions")
            .then((list) => {
                const callable = list.filter((m) => (m.channels?.length ? m.channels.includes("CALL") : m.channel === "CALL"));
                setMissions(callable);
                const saved = readLS(LS_MISSION);
                if (saved && callable.some((m) => m.id === saved)) setMissionId(saved);
                else if (callable.length === 1) setMissionId(callable[0].id);
            })
            .catch(() => setMissions([]));
    }, []);

    useEffect(() => {
        if (!missionId) return;
        const controller = new AbortController();
        setStatuses([]);
        getJson<{ statuses: Status[] }>(`/api/config/action-statuses?missionId=${encodeURIComponent(missionId)}`, { signal: controller.signal })
            .then((c) => { if (!controller.signal.aborted) setStatuses(c.statuses); })
            .catch(() => { if (!controller.signal.aborted) setStatuses([]); });
        return () => controller.abort();
    }, [missionId]);

    useEffect(() => {
        if (!sessionStart) return;
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [sessionStart]);

    const mission = missions?.find((m) => m.id === missionId) ?? null;
    const keyed = useMemo(() => dispositionKeys(statuses), [statuses]);
    const statusOf = useMemo(() => new Map(statuses.map((s) => [s.code, s])), [statuses]);
    const selectedStatus = selected ? statusOf.get(selected) ?? null : null;
    const presets = useMemo(() => (selectedStatus?.triggersCallback ? callbackPresets() : []), [selectedStatus]);

    const prospectKey = prospect ? `${prospect.contact?.id ?? ""}|${prospect.company.id}` : null;
    const contactPhone = prospect?.contact?.phone?.trim() || null;
    const companyPhone = prospect?.company.phone?.trim() || null;
    const phone = phoneChoice === "company" ? companyPhone ?? contactPhone : contactPhone ?? companyPhone;
    const inCall = isCallActive(call);
    const callIsOurs = Boolean(call && prospect && matchesCallTarget(call.target, {
        companyId: prospect.company.id,
        contactId: phoneChoice === "company" || !contactPhone ? null : prospect.contact?.id,
    }));
    useEffect(() => {
        if (callIsOurs && call?.callId) setOurCallId(call.callId);
    }, [callIsOurs, call?.callId]);
    const insights = useCallTranscript(insightsOn ? ourCallId : null, insightsOn && Boolean(ourCallId));
    const suggestedStatus = insights.summary.status === "done" ? insights.summary.data.suggestedStatus : null;

    // ── queue ──────────────────────────────────────────────────────────────
    const loadNext = useCallback(
        async (skip = skipped) => {
            if (!missionId) return;
            nextRequest.current?.abort();
            const controller = new AbortController();
            nextRequest.current = controller;
            setProspect(null);
            setPhase("loading");
            setSelected(null);
            setNote("");
            setCallbackChoice(null);
            setCustomCallback("");
            setFormError(null);
            setCountdown(null);
            setPhoneChoice("contact");
            setOurCallId(null);
            const qs = new URLSearchParams({ missionId, channel: "CALL" });
            skip.contacts.forEach((id) => qs.append("skipContact", id));
            skip.companies.forEach((id) => qs.append("skipCompany", id));
            try {
                const data = await getJson<NextProspect | { hasNext: false; message?: string }>(`/api/actions/next?${qs}`, { signal: controller.signal });
                if (controller.signal.aborted) return;
                if (!data.hasNext) {
                    setProspect(null);
                    setEmptyMessage(data.message || "Plus personne à appeler sur cette mission pour le moment.");
                    setPhase("empty");
                    return;
                }
                setProspect(data);
                setPhase("ready");
            } catch (e) {
                if (controller.signal.aborted) return;
                setEmptyMessage(e instanceof Error ? e.message : "Impossible de charger le prochain prospect");
                setPhase("error");
            }
        },
        [missionId, skipped],
    );

    const start = () => {
        if (!missionId) return;
        writeLS(LS_MISSION, missionId);
        setSessionStart(Date.now());
        setStats(EMPTY_STATS);
        setSkipped({ contacts: [], companies: [] });
        void loadNext({ contacts: [], companies: [] });
    };

    const placeCall = useCallback(() => {
        if (!prospect || !phone || inCall || saving || phase !== "ready") return;
        setCountdown(null);
        dialedFor.current = prospectKey;
        const handled = dial({
            phone,
            contactId: phoneChoice === "company" || !contactPhone ? null : prospect.contact?.id ?? null,
            companyId: prospect.company.id,
            campaignId: prospect.campaignId,
            label: personName(prospect),
            sublabel: prospect.contact ? prospect.company.name : null,
        });
        if (!handled) window.location.href = `tel:${phone}`;
        setStats((s) => ({ ...s, dials: s.dials + 1 }));
    }, [prospect, phone, phoneChoice, prospectKey, dial, inCall, saving, phase, contactPhone]);

    // Auto-dial: a visible, cancellable countdown once a prospect is on screen.
    useEffect(() => {
        if (phase !== "ready" || !autoDial || paused || !softphoneOn || !phone || inCall || drawer || helpOpen) {
            setCountdown(null);
            return;
        }
        if (dialedFor.current === prospectKey || selected) return;
        setCountdown(AUTO_DIAL_SECONDS);
    }, [phase, autoDial, paused, softphoneOn, phone, inCall, prospectKey, selected, drawer, helpOpen]);

    useEffect(() => {
        if (countdown === null) return;
        if (countdown <= 0) {
            placeCall();
            return;
        }
        const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
        return () => clearTimeout(t);
    }, [countdown, placeCall]);

    // Count a conversation once per call that the prospect answered.
    useEffect(() => {
        if (call?.answeredAt && callIsOurs && countedConnect.current !== call.key) {
            countedConnect.current = call.key;
            setStats((s) => ({ ...s, connected: s.connected + 1 }));
        }
    }, [call?.answeredAt, call?.key, callIsOurs]);

    const skip = useCallback(() => {
        if (!prospect || inCall || saving || phase !== "ready") return;
        const next = prospect.contact
            ? { ...skipped, contacts: [...skipped.contacts, prospect.contact.id] }
            : { ...skipped, companies: [...skipped.companies, prospect.company.id] };
        setSkipped(next);
        setStats((s) => ({ ...s, skipped: s.skipped + 1 }));
        void loadNext(next);
    }, [prospect, inCall, skipped, loadNext, saving, phase]);

    // Result confirmed from the island's suggestion: counted, and the next prospect comes up.
    useCallQualified((q) => {
        if (!prospect || q.companyId !== prospect.company.id) return;
        setStats((st) => ({ ...st, saved: st.saved + 1 }));
        void loadNext();
    });

    const cancelAutoDial = useCallback(() => {
        dialedFor.current = prospectKey;
        setCountdown(null);
    }, [prospectKey]);

    const choose = (code: string) => {
        cancelAutoDial();
        setFormError(null);
        setSelected((cur) => (cur === code ? null : code));
        const s = statusOf.get(code);
        if (s?.triggersCallback) setCallbackChoice((c) => c ?? callbackPresets()[0]?.id ?? "custom");
        if (s?.requiresNote) setTimeout(() => noteRef.current?.focus(), 0);
    };

    const save = useCallback(async () => {
        if (!prospect || !selected || saving || saveLock.current || phase !== "ready") return;
        if (selected === "MEETING_BOOKED") {
            setDrawer({ initialResult: "MEETING_BOOKED" });
            return;
        }
        const s = statusOf.get(selected);
        if (s?.requiresNote && !note.trim()) {
            setFormError("Une note est requise pour ce résultat.");
            noteRef.current?.focus();
            return;
        }
        let callbackDate: string | undefined;
        if (s?.triggersCallback) {
            const preset = presets.find((p) => p.id === callbackChoice);
            callbackDate = preset?.at ?? (callbackChoice === "custom" ? parseLocalCallback(customCallback) ?? undefined : undefined);
            if (!callbackDate || new Date(callbackDate).getTime() <= Date.now()) {
                setFormError("Choisissez quand rappeler (une date à venir).");
                return;
            }
        }
        if (inCall && callIsOurs) hangup();

        saveLock.current = true;
        setSaving(true);
        try {
            await getJson("/api/actions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contactId: prospect.contact?.id ?? undefined,
                    companyId: prospect.company.id,
                    campaignId: prospect.campaignId,
                    channel: "CALL",
                    result: selected,
                    note: note.trim() || undefined,
                    callbackDate,
                }),
            });
            setStats((st) => ({ ...st, saved: st.saved + 1 }));
            success("Enregistré", `${personName(prospect)} · ${s?.label ?? selected}`);
            void loadNext(); // pause only stops the automatic call, not the queue
        } catch (e) {
            setFormError(e instanceof Error ? e.message : "Enregistrement impossible");
        } finally {
            saveLock.current = false;
            setSaving(false);
        }
    }, [prospect, selected, saving, statusOf, note, presets, callbackChoice, customCallback, inCall, callIsOurs, hangup, success, loadNext, phase]);

    // ── keyboard ───────────────────────────────────────────────────────────
    useEffect(() => {
        if (phase !== "ready" && phase !== "empty") return;
        const onKey = (e: KeyboardEvent) => {
            if (drawer || e.defaultPrevented || e.repeat) return;
            if (helpOpen) {
                if (e.key === "Escape" || e.key === "?") setHelpOpen(false);
                return;
            }
            if (document.querySelector('[aria-modal="true"], [data-call-keypad="true"]')) return;
            if ((e.target as HTMLElement | null)?.closest("button, a, [role=button]")) return;
            const typing = isTypingTarget(e.target);
            if (typing) {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void save();
                } else if (e.key === "Escape") {
                    (e.target as HTMLElement).blur();
                }
                return;
            }
            if (e.metaKey || e.ctrlKey || e.altKey) return;

            const k = e.key;
            if (k === "?") return void setHelpOpen(true);
            if (phase !== "ready") return;
            if (k === "Escape" && countdown !== null) return void cancelAutoDial();
            if (/^[1-9]$/.test(k)) {
                const entry = keyed.find((x) => x.key === k);
                if (entry) {
                    e.preventDefault();
                    choose(entry.status.code);
                }
                return;
            }
            switch (k.toLowerCase()) {
                case " ":
                    e.preventDefault();
                    if (!inCall) placeCall();
                    return;
                case "h":
                    if (inCall) hangup();
                    return;
                case "m":
                    if (call?.phase === "live") toggleMute();
                    return;
                case "n":
                    e.preventDefault();
                    noteRef.current?.focus();
                    return;
                case "s":
                    skip();
                    return;
                case "f":
                    setDrawer({});
                    return;
                case "p":
                    setPaused((v) => !v);
                    return;
                case "enter":
                    if (selected) {
                        e.preventDefault();
                        void save();
                    }
                    return;
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, drawer, helpOpen, countdown, keyed, inCall, call?.phase, selected, save, skip, placeCall, hangup, toggleMute, cancelAutoDial]);

    // ════════════════════════════════════════════════════════════════════════
    // RENDER
    // ════════════════════════════════════════════════════════════════════════

    if (phase === "setup") {
        return (
            <SetupScreen
                missions={missions}
                missionId={missionId}
                onMission={setMissionId}
                autoDial={autoDial}
                onAutoDial={(v) => {
                    setAutoDial(v);
                    writeLS(LS_AUTODIAL, v ? "1" : "0");
                }}
                softphoneOn={softphoneOn}
                onStart={start}
            />
        );
    }

    const elapsed = sessionStart ? (now - sessionStart) / 1000 : 0;
    const rate = connectRate(stats);
    const ready = phase === "ready" && prospect !== null;

    // Three panes, each scrolling on its own: the session (rail), the prospect
    // (what to read), the outcome (what to do). Nothing floats over them.
    return (
        <div className="cp-calling-workspace flex h-full min-h-0 w-full flex-col bg-canvas lg:flex-row">
            {/* ── Rail: the session ── */}
            <aside className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2.5 lg:w-[200px] lg:flex-col lg:flex-nowrap lg:items-stretch lg:gap-0 lg:border-b-0 lg:border-r lg:p-0">
                <div className="flex min-w-0 items-center gap-2.5 lg:px-4 lg:pb-4 lg:pt-5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-primary text-primary-fg">
                        <Crosshair className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                        <p className="text-[13px] font-semibold leading-tight text-ink">Mode Focus</p>
                        <span className="text-[10px] font-medium uppercase tracking-wider text-ink-4">Session d’appels</span>
                        <button
                            type="button"
                            onClick={() => { nextRequest.current?.abort(); setPhase("setup"); }}
                            disabled={inCall || saving}
                            className="flex max-w-full items-center gap-1 text-[12px] text-ink-3 hover:text-ink"
                            title="Changer de mission"
                        >
                            <span className="truncate">{mission?.name ?? prospect?.missionName ?? "Mission"}</span>
                            <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
                        </button>
                    </div>
                </div>

                <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] lg:grid lg:grid-cols-2 lg:gap-px lg:border-y lg:border-line-subtle lg:bg-line-subtle">
                    <Stat label="Session" value={clock(elapsed)} wide />
                    <Stat label="Appels" value={stats.dials} />
                    <Stat label="Joints" value={stats.connected} hint={rate === null ? undefined : `${rate} %`} />
                    <Stat label="Traités" value={stats.saved} />
                    <Stat label="RDV" value={stats.meetings} strong={stats.meetings > 0} />
                </dl>

                <div className="ml-auto flex items-center gap-1.5 lg:ml-0 lg:flex-col lg:items-stretch lg:gap-0.5 lg:p-2">
                    <Switch
                        label="Appel automatique"
                        checked={autoDial && softphoneOn}
                        disabled={!softphoneOn}
                        title={softphoneOn ? `Appelle ${AUTO_DIAL_SECONDS} s après l'affichage` : "Nécessite le téléphone intégré"}
                        onChange={(v) => {
                            setAutoDial(v);
                            writeLS(LS_AUTODIAL, v ? "1" : "0");
                        }}
                    />
                    <RailButton onClick={() => setPaused((v) => !v)} active={paused} title="Pause (P)" kbd="P">
                        {paused ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
                        {paused ? "Reprendre" : "Pause"}
                    </RailButton>
                    <RailButton onClick={() => setHelpOpen(true)} title="Raccourcis clavier (?)" kbd="?">
                        <Keyboard className="h-3.5 w-3.5" aria-hidden />
                        Raccourcis
                    </RailButton>
                </div>

                <div className="hidden min-h-0 flex-1 lg:block" />
                <DockList className="hidden px-2 pb-2 lg:flex" />
                <div className="lg:border-t lg:border-line-subtle lg:p-2">
                    <Link
                        href="/sdr/action"
                        className="flex h-8 items-center gap-2 rounded-control px-2 text-[12.5px] font-medium text-ink-3 hover:bg-surface-2 hover:text-ink"
                    >
                        <LogOut className="h-3.5 w-3.5" aria-hidden /> Quitter la session
                    </Link>
                </div>
            </aside>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
                {/* ── Prospect: what to read ── */}
                <section className="min-w-0 flex-1 lg:overflow-y-auto" aria-label="Prospect">
                    {(phase === "loading" || (phase === "ready" && !prospect)) && <LoadingProspect />}

                    {(phase === "empty" || phase === "error") && (
                        <div className="flex min-h-full items-center justify-center px-6 py-16">
                            <div className="cp-rise max-w-md text-center">
                                <span className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-surface-3 text-ink-3">
                                    {phase === "empty" ? <Crosshair className="h-5 w-5" aria-hidden /> : <AlertTriangle className="h-5 w-5" aria-hidden />}
                                </span>
                                <p className="text-[16px] font-semibold tracking-tight text-ink">{phase === "empty" ? "File terminée pour le moment" : "Problème de chargement"}</p>
                                <p className="mt-1.5 text-[13px] text-ink-3">{emptyMessage}</p>
                                {stats.saved > 0 && (
                                    <p className="mt-4 text-[13px] text-ink-2">
                                        Session : {stats.saved} prospect{stats.saved > 1 ? "s" : ""} traité{stats.saved > 1 ? "s" : ""}, {stats.meetings} RDV, en {clock(elapsed)}.
                                    </p>
                                )}
                                <div className="mt-6 flex justify-center gap-2">
                                    <button type="button" onClick={() => void loadNext()} className="cp-press inline-flex h-9 items-center gap-1.5 rounded-control border border-line bg-surface px-3 text-[13px] font-medium text-ink-2 hover:bg-surface-2">
                                        <RefreshCw className="h-3.5 w-3.5" /> Réessayer
                                    </button>
                                    <button type="button" onClick={() => setPhase("setup")} className="cp-press inline-flex h-9 items-center rounded-control bg-primary px-3 text-[13px] font-semibold text-primary-fg hover:bg-primary-hover">
                                        Changer de mission
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {ready && prospect && (
                        <div key={prospectKey ?? ""} className="cp-stagger">
                            {/* Who, and the call: stays in view while reading the brief and the script. */}
                            <header className="sticky top-0 z-10 border-b border-line-subtle bg-canvas/85 backdrop-blur-md">
                                <div className="mx-auto flex max-w-[860px] flex-col gap-4 px-6 pb-4 pt-6 lg:px-10">
                                    <div className="flex items-start gap-4">
                                        <div className="min-w-0 flex-1">
                                            <ProspectIdentity heading name={prospect.contact ? personName(prospect) : null} company={prospect.company.name} role={prospect.contact?.title} website={prospect.company.website} />
                                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                                {PRIORITY[prospect.priority] && <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium", PRIORITY[prospect.priority].tone)}>{PRIORITY[prospect.priority].label}</span>}
                                                <span className="text-[11px] text-ink-3">{prospect.sourceListName || prospect.missionName}</span>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setDrawer({})}
                                            className="cp-press hidden h-8 shrink-0 items-center gap-1.5 rounded-control px-2.5 text-[12px] font-medium text-ink-3 hover:bg-surface-3 hover:text-ink sm:inline-flex"
                                            title="Fiche complète (F)"
                                        >
                                            <ExternalLink className="h-3.5 w-3.5" /> Fiche <Kbd>F</Kbd>
                                        </button>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-3">
                                        <div className="flex min-w-0 flex-wrap items-center gap-1">
                                            {contactPhone && (
                                                <PhoneChip label="Direct" number={contactPhone} active={phoneChoice === "contact" || !companyPhone} onClick={() => setPhoneChoice("contact")} />
                                            )}
                                            {companyPhone && companyPhone !== contactPhone && (
                                                <PhoneChip label="Standard" number={companyPhone} active={phoneChoice === "company" || !contactPhone} onClick={() => setPhoneChoice("company")} />
                                            )}
                                            {!phone && <span className="text-[13px] text-ink-3">Aucun numéro : passez ou complétez la fiche.</span>}
                                        </div>
                                        <div className="ml-auto flex items-center gap-2">
                                            {countdown !== null && (
                                                <span className="cp-pop flex items-center gap-2 text-[12px] text-ink-2" aria-live="polite">
                                                    <CountdownRing key={prospectKey ?? ""} seconds={AUTO_DIAL_SECONDS} />
                                                    Appel dans <span className="font-semibold tabular-nums text-ink">{countdown}</span>
                                                    <button type="button" onClick={cancelAutoDial} className="rounded-control px-1.5 py-0.5 text-ink-3 hover:bg-surface-3 hover:text-ink">
                                                        Annuler <Kbd className="ml-1">Échap</Kbd>
                                                    </button>
                                                </span>
                                            )}
                                            {inCall && callIsOurs ? (
                                                <button type="button" onClick={hangup} className="cp-press inline-flex h-10 items-center gap-2 rounded-full bg-danger px-4 text-[13px] font-semibold text-white shadow-[0_6px_16px_-8px_var(--ds-danger)] hover:brightness-110">
                                                    <PhoneOff className="h-4 w-4" /> Raccrocher <Kbd className="border-white/30 bg-white/10 text-white">H</Kbd>
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={placeCall}
                                                    disabled={!phone || inCall}
                                                    className="cp-press inline-flex h-10 items-center gap-2 rounded-full bg-success px-4 text-[13px] font-semibold text-white shadow-[0_6px_16px_-8px_var(--ds-success)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                                                >
                                                    <Phone className="h-4 w-4" /> Appeler <Kbd className="border-white/30 bg-white/10 text-white">Espace</Kbd>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </header>

                            <div className="mx-auto max-w-[860px] divide-y divide-line-subtle px-6 lg:px-10">
                                {missionId && (
                                    <div className="py-6">
                                        <PrecallBrief
                                            key={prospectKey ?? ""}
                                            flat
                                            companyId={prospect.company.id}
                                            contactId={prospect.contact?.id ?? null}
                                            missionId={missionId}
                                        />
                                    </div>
                                )}
                                <ContextSection prospect={prospect} statusLabel={(code) => statusOf.get(code)?.label ?? code} />
                                {(prospect.script || prospect.scriptAdditional || prospect.scriptAiEnhanced) && <ScriptSection prospect={prospect} />}
                                <div className="h-6" aria-hidden />
                            </div>
                        </div>
                    )}
                </section>

                {/* ── Outcome: what to do ── */}
                {(ready || phase === "loading") && (
                    <aside
                        className="flex shrink-0 flex-col border-t border-line bg-surface lg:w-[380px] lg:border-l lg:border-t-0 xl:w-[400px]"
                        aria-label="Résultat de l'appel"
                        aria-busy={!ready}
                    >
                        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line-subtle px-5">
                            <h2 className="text-[13px] font-semibold text-ink">Résultat de l&apos;appel</h2>
                            <span className="text-[11px] text-ink-3">touches 1–9</span>
                        </div>

                        {!ready ? (
                            <div className="space-y-2 px-5 py-4">
                                {[0, 1, 2, 3, 4, 5].map((i) => (
                                    <div key={i} className="cp-shimmer h-9 rounded-control" />
                                ))}
                            </div>
                        ) : (
                            <>
                                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
                                    {ourCallId && insightsOn && !(inCall && callIsOurs) && insights.summary.status !== "none" && (
                                        <div className="cp-rise rounded-panel bg-surface-2/70 p-3.5">
                                            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Résumé de l&apos;appel</p>
                                            <AiSummaryView
                                                state={insights.summary}
                                                resolveStatus={(code) => {
                                                    const st = statusOf.get(code);
                                                    return st ? { label: st.label, color: st.color } : null;
                                                }}
                                                onApplyStatus={(code) => {
                                                    if (statusOf.has(code) && selected !== code) choose(code);
                                                    // No retyping: the call's summary becomes the note (still editable).
                                                    if (!note.trim() && insights.summary.status === "done") setNote(insights.summary.data.summary.slice(0, 500));
                                                }}
                                            />
                                        </div>
                                    )}

                                    <div className="flex flex-col gap-0.5" role="radiogroup" aria-label="Résultat">
                                        {keyed.map(({ status, key }) => {
                                            const active = selected === status.code;
                                            return (
                                                <button
                                                    key={status.code}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={active}
                                                    onClick={() => choose(status.code)}
                                                    className={cn(
                                                        "cp-press flex h-9 items-center gap-2.5 rounded-control px-2.5 text-left text-[13px] transition-colors duration-150",
                                                        active
                                                            ? "cp-flash bg-primary-soft font-medium text-primary-soft-ink ring-1 ring-inset ring-primary/40"
                                                            : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                                                    )}
                                                >
                                                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: status.color ?? "var(--ds-line-strong)" }} aria-hidden />
                                                    <span className="min-w-0 flex-1 truncate">{status.label}</span>
                                                    {suggestedStatus === status.code && (
                                                        <span className="rounded-sm bg-accent-50 px-1 text-[10px] font-semibold uppercase tracking-wide text-accent-700" title="Suggéré par l'IA d'après la conversation">
                                                            IA
                                                        </span>
                                                    )}
                                                    {status.triggersCallback && <CalendarClock className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-label="planifie un rappel" />}
                                                    {key && <Kbd>{key}</Kbd>}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {selectedStatus?.triggersCallback && (
                                        <fieldset className="cp-pop px-1">
                                            <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Rappeler</legend>
                                            <div className="flex flex-wrap gap-1.5">
                                                {presets.map((p) => (
                                                    <button
                                                        key={p.id}
                                                        type="button"
                                                        onClick={() => setCallbackChoice(p.id)}
                                                        aria-pressed={callbackChoice === p.id}
                                                        className={cn(
                                                            "cp-press rounded-full border px-2.5 py-1 text-[12px]",
                                                            callbackChoice === p.id ? "border-primary bg-primary-soft text-primary-soft-ink" : "border-line bg-surface text-ink-2 hover:text-ink",
                                                        )}
                                                    >
                                                        {p.label}
                                                    </button>
                                                ))}
                                                <button
                                                    type="button"
                                                    onClick={() => setCallbackChoice("custom")}
                                                    aria-pressed={callbackChoice === "custom"}
                                                    className={cn(
                                                        "cp-press rounded-full border px-2.5 py-1 text-[12px]",
                                                        callbackChoice === "custom" ? "border-primary bg-primary-soft text-primary-soft-ink" : "border-line bg-surface text-ink-2 hover:text-ink",
                                                    )}
                                                >
                                                    Autre…
                                                </button>
                                            </div>
                                            {callbackChoice === "custom" && (
                                                <input
                                                    type="datetime-local"
                                                    value={customCallback}
                                                    onChange={(e) => setCustomCallback(e.target.value)}
                                                    className="mt-2 h-8 w-full rounded-control border border-line bg-surface px-2 text-[13px] text-ink"
                                                    aria-label="Date et heure du rappel"
                                                />
                                            )}
                                        </fieldset>
                                    )}

                                    <div className="px-1">
                                        <label htmlFor="focus-note" className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                                            <span>
                                                Note {selectedStatus?.requiresNote && <span className="text-danger">*</span>}
                                            </span>
                                            <Kbd>N</Kbd>
                                        </label>
                                        <textarea
                                            id="focus-note"
                                            ref={noteRef}
                                            value={note}
                                            onChange={(e) => setNote(e.target.value)}
                                            maxLength={500}
                                            rows={4}
                                            placeholder="Ce qu'il faut retenir…"
                                            className="w-full resize-none rounded-control border border-line bg-surface-2/50 px-2.5 py-2 text-[13px] leading-relaxed text-ink placeholder:text-ink-4 focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-focus"
                                        />
                                    </div>
                                </div>

                                {/* Always in reach, however long the list. */}
                                <div className="shrink-0 space-y-1.5 border-t border-line-subtle bg-surface px-4 py-3">
                                    {formError && (
                                        <p className="cp-pop flex items-start gap-1.5 pb-1 text-[12px] text-danger-ink">
                                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {formError}
                                        </p>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => void save()}
                                        disabled={!selected || saving}
                                        className="cp-press inline-flex h-10 w-full items-center justify-center gap-2 rounded-control bg-primary px-4 text-[13px] font-semibold text-primary-fg hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {saving
                                            ? "Enregistrement…"
                                            : selected === "MEETING_BOOKED"
                                              ? "Planifier le RDV"
                                              : inCall && callIsOurs
                                                ? "Raccrocher, enregistrer et suivant"
                                                : "Enregistrer et suivant"}
                                        <Kbd className="border-white/30 bg-white/10 text-white">Entrée</Kbd>
                                    </button>
                                    <div className="flex items-center justify-between">
                                        <button
                                            type="button"
                                            onClick={skip}
                                            disabled={inCall}
                                            className="inline-flex h-7 items-center gap-1.5 rounded-control px-1.5 text-[12px] font-medium text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-40"
                                        >
                                            <SkipForward className="h-3.5 w-3.5" /> Passer <Kbd>S</Kbd>
                                        </button>
                                        {paused && <span className="text-[11px] text-warning-ink">En pause : pas d&apos;appel automatique</span>}
                                    </div>
                                </div>
                            </>
                        )}
                    </aside>
                )}
            </div>

            {helpOpen && <ShortcutsSheet onClose={() => setHelpOpen(false)} />}

            {drawer && prospect && (
                <UnifiedActionDrawer
                    isOpen
                    onClose={() => setDrawer(null)}
                    contactId={drawer.contactId ?? prospect.contact?.id ?? null}
                    onContactSelect={(id) => setDrawer(current => current ? { ...current, contactId: id } : null)}
                    companyId={prospect.company.id}
                    missionId={missionId ?? undefined}
                    missionName={prospect.missionName}
                    clientBookingUrl={prospect.clientBookingUrl ?? undefined}
                    clientInterlocuteurs={prospect.clientInterlocuteurs as never}
                    preferredInterlocuteurId={prospect.preferredInterlocuteurId ?? null}
                    preferredInterlocuteurIds={prospect.preferredInterlocuteurIds ?? null}
                    initialResult={drawer.initialResult}
                    enableGooglePhoneLookup
                    onActionRecorded={() => {
                        setDrawer(null);
                        setStats((st) => ({
                            ...st,
                            saved: st.saved + 1,
                            meetings: st.meetings + (drawer.initialResult === "MEETING_BOOKED" ? 1 : 0),
                        }));
                        void loadNext();
                    }}
                />
            )}
        </div>
    );
}

// ── pieces ──────────────────────────────────────────────────────────────────

/** Drains over the auto-dial delay: the call is coming, at a glance. */
function CountdownRing({ seconds }: { seconds: number }) {
    const r = 7;
    const length = 2 * Math.PI * r;
    return (
        <svg className="h-[18px] w-[18px] -rotate-90" viewBox="0 0 18 18" aria-hidden>
            <circle cx="9" cy="9" r={r} fill="none" stroke="var(--ds-line)" strokeWidth="2" />
            <circle
                cx="9"
                cy="9"
                r={r}
                fill="none"
                stroke="var(--ds-success)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={length}
                style={{ animation: `cp-ring ${seconds}s linear forwards`, ["--ring-length" as string]: length }}
            />
        </svg>
    );
}

/** One session number: inline in the narrow top bar, a tile in the rail. */
function Stat({ label, value, hint, strong, wide }: { label: string; value: string | number; hint?: string; strong?: boolean; wide?: boolean }) {
    return (
        <div className={cn("flex items-baseline gap-1.5 lg:flex-col lg:items-start lg:gap-0.5 lg:bg-surface lg:px-4 lg:py-2.5", wide && "lg:col-span-2")}>
            <dt className="text-ink-3 lg:text-[10.5px] lg:font-semibold lg:uppercase lg:tracking-wide">{label}</dt>
            <dd className={cn("font-semibold tabular-nums lg:text-[18px] lg:leading-tight lg:tracking-tight", strong ? "text-success-ink" : "text-ink")}>
                {value}
                {hint && <span className="ml-1 text-[11px] font-medium tracking-normal text-ink-3">{hint}</span>}
            </dd>
        </div>
    );
}

function Switch({
    label,
    checked,
    disabled,
    title,
    onChange,
}: {
    label: string;
    checked: boolean;
    disabled?: boolean;
    title?: string;
    onChange: (v: boolean) => void;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            title={title}
            onClick={() => onChange(!checked)}
            className="flex h-8 items-center gap-2.5 rounded-control px-2 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
            <span className={cn("relative h-4 w-7 shrink-0 rounded-full transition-colors duration-200", checked ? "bg-primary" : "bg-surface-3 ring-1 ring-inset ring-line")}>
                <span
                    className={cn(
                        "absolute left-0 top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-200",
                        checked ? "translate-x-3.5" : "translate-x-0.5",
                    )}
                />
            </span>
            {label}
        </button>
    );
}

function RailButton({
    children,
    onClick,
    active,
    title,
    kbd,
}: {
    children: React.ReactNode;
    onClick: () => void;
    active?: boolean;
    title?: string;
    kbd?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            aria-pressed={active}
            className={cn(
                "cp-press flex h-8 items-center gap-2.5 rounded-control px-2 text-[12.5px] font-medium",
                active ? "bg-warning-soft text-warning-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
        >
            {children}
            {kbd && <Kbd className="ml-auto hidden lg:inline-flex">{kbd}</Kbd>}
        </button>
    );
}

function PhoneChip({ label, number, active, onClick }: { label: string; number: string; active: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                "flex items-baseline gap-1.5 rounded-full px-3 py-1.5 text-left transition-colors",
                active ? "bg-surface text-ink shadow-[0_0_0_1px_var(--ds-line-strong)]" : "text-ink-3 hover:bg-surface-3/60 hover:text-ink",
            )}
        >
            <span className="text-[10.5px] font-semibold uppercase tracking-wide">{label}</span>
            <span className="font-mono text-[14px] tabular-nums">{formatPhone(number)}</span>
        </button>
    );
}

function SectionTitle({ icon: Icon, children }: { icon: typeof History; children: React.ReactNode }) {
    return (
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <Icon className="h-4 w-4 text-ink-3" aria-hidden />
            {children}
        </h2>
    );
}

function ContextSection({ prospect, statusLabel }: { prospect: NextProspect; statusLabel: (code: string) => string }) {
    const items: { title: string; body: React.ReactNode; tone?: "warn" }[] = [];
    if (prospect.sharedPhoneCall) {
        items.push({
            title: "Numéro déjà appelé aujourd'hui",
            tone: "warn",
            body: `Ce numéro a été appelé${prospect.sharedPhoneCall.sdrName ? ` par ${prospect.sharedPhoneCall.sdrName}` : ""}${prospect.sharedPhoneCall.targetName ? ` (fiche ${prospect.sharedPhoneCall.targetName})` : ""}. Vérifiez avant de rappeler.`,
        });
    }
    const la = prospect.lastAction;
    if (la) {
        items.push({
            title: `Dernier échange : ${statusLabel(la.result)}`,
            body: (
                <>
                    <span className="text-ink-3">
                        {relativeDay(la.createdAt)}
                        {prospect.lastActionBy?.name ? ` · ${prospect.lastActionBy.name}` : ""}
                        {la.scope === "COMPANY" ? " · sur la société" : ""}
                        {la.callbackDate ? ` · rappel prévu ${new Date(la.callbackDate).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
                    </span>
                    {la.note && <span className="mt-1 block whitespace-pre-wrap text-ink-2">« {la.note} »</span>}
                </>
            ),
        });
    }
    const cla = prospect.companyLastAction;
    if (cla && (!la || cla.createdAt !== la.createdAt)) {
        items.push({
            title: `Société : ${statusLabel(cla.result)}`,
            body: (
                <>
                    <span className="text-ink-3">
                        {relativeDay(cla.createdAt)}
                        {cla.sdrName ? ` · ${cla.sdrName}` : ""}
                    </span>
                    {cla.note && <span className="mt-1 block whitespace-pre-wrap text-ink-2">« {cla.note} »</span>}
                </>
            ),
        });
    }

    return (
        <section className="py-6">
            <SectionTitle icon={History}>À savoir avant d&apos;appeler</SectionTitle>
            {items.length === 0 ? (
                <p className="mt-2 text-[13px] text-ink-3">Premier contact : aucun échange enregistré avec ce prospect.</p>
            ) : (
                <ul className="mt-3 space-y-3">
                    {items.map((it, i) => (
                        <li key={i} className={cn("border-l-2 pl-3 text-[13px]", it.tone === "warn" ? "border-warning" : "border-line-strong")}>
                            <p className={cn("font-medium", it.tone === "warn" ? "text-warning-ink" : "text-ink")}>{it.title}</p>
                            <p className="mt-0.5 leading-relaxed">{it.body}</p>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

/** The script, at reading size: the pane scrolls, the text never sits in a box. */
function ScriptSection({ prospect }: { prospect: NextProspect }) {
    const tabs = [
        { id: "base", label: "Script", text: prospect.script },
        { id: "additional", label: "Complément", text: prospect.scriptAdditional },
        { id: "ai", label: "Version IA", text: prospect.scriptAiEnhanced },
    ].filter((t) => t.text && t.text.trim());
    const [tab, setTab] = useState(tabs[0]?.id ?? "base");
    const current = tabs.find((t) => t.id === tab) ?? tabs[0];

    return (
        <section className="py-6">
            <div className="flex items-center gap-2">
                <SectionTitle icon={FileText}>Script</SectionTitle>
                {tabs.length > 1 && (
                    <div className="ml-auto flex gap-0.5 rounded-control bg-surface-3/70 p-0.5" role="tablist" aria-label="Version du script">
                        {tabs.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                role="tab"
                                aria-selected={tab === t.id}
                                onClick={() => setTab(t.id)}
                                className={cn(
                                    "h-6 rounded-[6px] px-2 text-[11.5px] font-medium transition-colors",
                                    tab === t.id ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink",
                                )}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            {current && (
                <p key={current.id} className="cp-rise mt-3 max-w-[70ch] whitespace-pre-wrap text-[14px] leading-7 text-ink-2">
                    {current.text}
                </p>
            )}
        </section>
    );
}

function LoadingProspect() {
    return (
        <div className="mx-auto max-w-[860px] px-6 pt-6 lg:px-10" aria-busy="true">
            <div className="flex items-center gap-4">
                <div className="cp-shimmer h-11 w-11 rounded-full" />
                <div className="flex-1 space-y-2">
                    <div className="cp-shimmer h-5 w-56 rounded" />
                    <div className="cp-shimmer h-3 w-80 max-w-full rounded" />
                </div>
            </div>
            <div className="cp-shimmer mt-5 h-10 w-full rounded-full" />
            <div className="mt-10 space-y-2.5">
                {[94, 86, 72, 90, 64].map((w, i) => (
                    <div key={i} className="cp-shimmer h-2.5 rounded" style={{ width: `${w}%` }} />
                ))}
            </div>
        </div>
    );
}

function SetupScreen({
    missions,
    missionId,
    onMission,
    autoDial,
    onAutoDial,
    softphoneOn,
    onStart,
}: {
    missions: Mission[] | null;
    missionId: string | null;
    onMission: (id: string) => void;
    autoDial: boolean;
    onAutoDial: (v: boolean) => void;
    softphoneOn: boolean;
    onStart: () => void;
}) {
    return (
        <div className="flex h-full min-h-0 w-full overflow-y-auto bg-canvas">
            <div className="cp-rise m-auto w-full max-w-[560px] px-4 py-10">
                <div className="mb-6 flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-control bg-primary text-primary-fg">
                        <Crosshair className="h-5 w-5" />
                    </span>
                    <div>
                        <h1 className="text-[20px] font-semibold tracking-[-0.015em] text-ink">Mode Focus</h1>
                        <p className="text-[13px] text-ink-3">Un prospect à la fois, dans l&apos;ordre de votre file : rappels d&apos;abord.</p>
                    </div>
                </div>

                <div className="rounded-panel border border-line bg-surface p-5 shadow-card">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Mission du jour</p>
                    {missions === null ? (
                        <div className="cp-shimmer h-24 rounded-control" />
                    ) : missions.length === 0 ? (
                        <p className="rounded-control bg-surface-2 px-3 py-4 text-[13px] text-ink-3">Aucune mission d&apos;appel dans votre planning du jour.</p>
                    ) : (
                        <ul className="space-y-1" role="radiogroup" aria-label="Mission">
                            {missions.map((m) => (
                                <li key={m.id}>
                                    <button
                                        type="button"
                                        role="radio"
                                        aria-checked={missionId === m.id}
                                        onClick={() => onMission(m.id)}
                                        className={cn(
                                            "cp-press flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left transition-colors",
                                            missionId === m.id ? "bg-primary-soft ring-1 ring-inset ring-primary/40" : "hover:bg-surface-2",
                                        )}
                                    >
                                        <span className={cn("h-3.5 w-3.5 shrink-0 rounded-full border-2", missionId === m.id ? "border-primary bg-primary" : "border-line-strong")} />
                                        <span className="min-w-0">
                                            <span className="block truncate text-[13px] font-semibold text-ink">{m.name}</span>
                                            {m.client?.name && <span className="block truncate text-[12px] text-ink-3">{m.client.name}</span>}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="mt-4 border-t border-line-subtle pt-3">
                        <Switch label="Appel automatique" checked={autoDial && softphoneOn} disabled={!softphoneOn} onChange={onAutoDial} />
                        <p className="pl-[46px] text-[12px] text-ink-3">
                            {softphoneOn
                                ? `Chaque prospect est appelé ${AUTO_DIAL_SECONDS} s après son affichage (Échap pour annuler).`
                                : "Nécessite le téléphone intégré : les numéros s'ouvriront dans votre application d'appel."}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onStart}
                        disabled={!missionId}
                        className="cp-press mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-control bg-primary text-[14px] font-semibold text-primary-fg hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Play className="h-4 w-4" /> Démarrer la session
                    </button>
                </div>
                <p className="mt-3 text-center text-[12px] text-ink-3">
                    Appuyez sur <Kbd>?</Kbd> pendant la session pour voir les raccourcis.
                </p>
            </div>
        </div>
    );
}

const SHORTCUTS: [string, string][] = [
    ["Espace", "Appeler"],
    ["H", "Raccrocher"],
    ["M", "Couper / réactiver le micro"],
    ["1 – 9", "Choisir le résultat"],
    ["N", "Écrire une note"],
    ["Entrée", "Enregistrer et passer au suivant"],
    ["Ctrl + Entrée", "Enregistrer depuis la note"],
    ["S", "Passer ce prospect"],
    ["F", "Ouvrir la fiche complète"],
    ["P", "Pause / reprendre l'appel automatique"],
    ["Échap", "Annuler l'appel automatique"],
    ["?", "Afficher cette aide"],
];

function ShortcutsSheet({ onClose }: { onClose: () => void }) {
    return (
        <div className="fixed inset-x-0 top-0 bottom-[var(--softphone-dock-h,0px)] z-[120] flex items-center justify-center bg-inverse/40 p-4" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Raccourcis clavier"
                className="w-full max-w-md rounded-panel border border-line bg-surface p-5 shadow-overlay"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-[15px] font-semibold text-ink">Raccourcis clavier</h2>
                    <button type="button" onClick={onClose} aria-label="Fermer" className="flex h-8 w-8 items-center justify-center rounded-control text-ink-3 hover:bg-surface-2">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <dl className="divide-y divide-line-subtle">
                    {SHORTCUTS.map(([k, label]) => (
                        <div key={k} className="flex items-center justify-between py-2 text-[13px]">
                            <dt className="text-ink-2">{label}</dt>
                            <dd>
                                <Kbd>{k}</Kbd>
                            </dd>
                        </div>
                    ))}
                </dl>
                <p className="mt-3 text-[12px] text-ink-3">Les raccourcis sont inactifs pendant la saisie d&apos;un texte.</p>
            </div>
        </div>
    );
}
