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
    AlertTriangle, Building2, CalendarClock, ChevronDown, Crosshair, ExternalLink, Globe, Keyboard,
    Pause, Phone, PhoneOff, Play, RefreshCw, SkipForward, X,
} from "lucide-react";
import { Kbd, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { isCallActive, useSoftphone } from "@/components/telephony/SoftphoneProvider";
import { formatPhone } from "@/components/incoming-calls/useIncomingCalls";
import { AiSummaryView, useCallTranscript } from "@/components/telephony/CallInsights";
import { PrecallBrief } from "@/components/sdr/PrecallBrief";
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

function initials(label: string): string {
    return label.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
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
    const [drawer, setDrawer] = useState<{ initialResult?: string } | null>(null);
    const [helpOpen, setHelpOpen] = useState(false);
    const [scriptOpen, setScriptOpen] = useState(true);

    // The integrated-phone call placed to the prospect on screen (kept after the dock is closed).
    const [ourCallId, setOurCallId] = useState<string | null>(null);
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
        getJson<{ statuses: Status[] }>(`/api/config/action-statuses?missionId=${encodeURIComponent(missionId)}`)
            .then((c) => setStatuses(c.statuses))
            .catch(() => setStatuses([]));
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
    const callIsOurs = Boolean(call && prospect && call.target.companyId === prospect.company.id);
    if (callIsOurs && call?.callId && call.callId !== ourCallId) setOurCallId(call.callId);
    const insights = useCallTranscript(insightsOn ? ourCallId : null, insightsOn && Boolean(ourCallId));
    const suggestedStatus = insights.summary.status === "done" ? insights.summary.data.suggestedStatus : null;

    // ── queue ──────────────────────────────────────────────────────────────
    const loadNext = useCallback(
        async (skip = skipped) => {
            if (!missionId) return;
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
                const data = await getJson<NextProspect | { hasNext: false; message?: string }>(`/api/actions/next?${qs}`);
                if (!data.hasNext) {
                    setProspect(null);
                    setEmptyMessage(data.message || "Plus personne à appeler sur cette mission pour le moment.");
                    setPhase("empty");
                    return;
                }
                setProspect(data);
                setPhase("ready");
            } catch (e) {
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
        if (!prospect || !phone) return;
        setCountdown(null);
        dialedFor.current = prospectKey;
        const handled = dial({
            phone,
            contactId: phoneChoice === "company" ? null : prospect.contact?.id ?? null,
            companyId: prospect.company.id,
            campaignId: prospect.campaignId,
            label: personName(prospect),
            sublabel: prospect.contact ? prospect.company.name : null,
        });
        if (!handled) window.location.href = `tel:${phone}`;
        setStats((s) => ({ ...s, dials: s.dials + 1 }));
    }, [prospect, phone, phoneChoice, prospectKey, dial]);

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
        if (!prospect || inCall) return;
        const next = prospect.contact
            ? { ...skipped, contacts: [...skipped.contacts, prospect.contact.id] }
            : { ...skipped, companies: [...skipped.companies, prospect.company.id] };
        setSkipped(next);
        setStats((s) => ({ ...s, skipped: s.skipped + 1 }));
        void loadNext(next);
    }, [prospect, inCall, skipped, loadNext]);

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
        if (!prospect || !selected || saving) return;
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
            if (!callbackDate) {
                setFormError("Choisissez quand rappeler (une date à venir).");
                return;
            }
        }
        if (inCall && callIsOurs) hangup();

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
            setSaving(false);
        }
    }, [prospect, selected, saving, statusOf, note, presets, callbackChoice, customCallback, inCall, callIsOurs, hangup, success, loadNext]);

    // ── keyboard ───────────────────────────────────────────────────────────
    useEffect(() => {
        if (phase !== "ready" && phase !== "empty") return;
        const onKey = (e: KeyboardEvent) => {
            if (drawer) return;
            if (helpOpen) {
                if (e.key === "Escape" || e.key === "?") setHelpOpen(false);
                return;
            }
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

    return (
        <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-4 px-1 pb-6">
            {/* ── Session bar ── */}
            <header className="cp-glass sticky top-[56px] z-30 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-panel px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-control bg-primary text-primary-fg">
                        <Crosshair className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                        <p className="text-[13px] font-semibold leading-tight text-ink">Mode Focus</p>
                        <button
                            type="button"
                            onClick={() => setPhase("setup")}
                            className="flex max-w-[260px] items-center gap-1 truncate text-[12px] text-ink-3 hover:text-ink"
                            title="Changer de mission"
                        >
                            <span className="truncate">{mission?.name ?? prospect?.missionName ?? "Mission"}</span>
                            <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
                        </button>
                    </div>
                </div>

                <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px]">
                    <Stat label="Session" value={clock(elapsed)} />
                    <Stat label="Appels" value={stats.dials} />
                    <Stat label="Joints" value={rate === null ? "—" : `${stats.connected} · ${rate} %`} />
                    <Stat label="Traités" value={stats.saved} />
                    <Stat label="RDV" value={stats.meetings} strong={stats.meetings > 0} />
                </dl>

                <div className="ml-auto flex items-center gap-2">
                    <label className={cn("flex items-center gap-2 text-[12px] text-ink-2", !softphoneOn && "opacity-50")} title={softphoneOn ? undefined : "Nécessite le téléphone intégré"}>
                        <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-[var(--ds-primary)]"
                            checked={autoDial && softphoneOn}
                            disabled={!softphoneOn}
                            onChange={(e) => {
                                setAutoDial(e.target.checked);
                                writeLS(LS_AUTODIAL, e.target.checked ? "1" : "0");
                            }}
                        />
                        Appel automatique
                    </label>
                    <button
                        type="button"
                        onClick={() => setPaused((v) => !v)}
                        className={cn(
                            "inline-flex h-8 items-center gap-1.5 rounded-control border px-2.5 text-[12px] font-medium",
                            paused ? "border-warning-line bg-warning-soft text-warning-ink" : "border-line text-ink-2 hover:bg-surface-2",
                        )}
                        title="Pause (P)"
                    >
                        {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                        {paused ? "Reprendre" : "Pause"}
                    </button>
                    <button
                        type="button"
                        onClick={() => setHelpOpen(true)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-control border border-line text-ink-2 hover:bg-surface-2"
                        aria-label="Raccourcis clavier (?)"
                        title="Raccourcis clavier (?)"
                    >
                        <Keyboard className="h-4 w-4" />
                    </button>
                    <Link href="/sdr/action" className="inline-flex h-8 items-center rounded-control px-2.5 text-[12px] font-medium text-ink-3 hover:bg-surface-2 hover:text-ink">
                        Quitter
                    </Link>
                </div>
            </header>

            {(phase === "loading" || (phase === "ready" && !prospect)) && <LoadingCard />}

            {(phase === "empty" || phase === "error") && (
                <div className="rounded-panel border border-line bg-surface px-6 py-14 text-center shadow-card">
                    <p className="text-[15px] font-semibold text-ink">{phase === "empty" ? "File terminée pour le moment" : "Problème de chargement"}</p>
                    <p className="mx-auto mt-1.5 max-w-md text-[13px] text-ink-3">{emptyMessage}</p>
                    {stats.saved > 0 && (
                        <p className="mt-4 text-[13px] text-ink-2">
                            Session : {stats.saved} prospect{stats.saved > 1 ? "s" : ""} traité{stats.saved > 1 ? "s" : ""}, {stats.meetings} RDV, en {clock(elapsed)}.
                        </p>
                    )}
                    <div className="mt-6 flex justify-center gap-2">
                        <button type="button" onClick={() => void loadNext()} className="inline-flex h-9 items-center gap-1.5 rounded-control border border-line px-3 text-[13px] font-medium text-ink-2 hover:bg-surface-2">
                            <RefreshCw className="h-3.5 w-3.5" /> Réessayer
                        </button>
                        <button type="button" onClick={() => setPhase("setup")} className="inline-flex h-9 items-center rounded-control bg-primary px-3 text-[13px] font-semibold text-primary-fg hover:bg-primary-hover">
                            Changer de mission
                        </button>
                    </div>
                </div>
            )}

            {phase === "ready" && prospect && (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
                    {/* ── Prospect ── */}
                    <section key={prospectKey ?? ""} className="cp-stagger flex min-w-0 flex-col gap-4">
                        <div className="rounded-panel border border-line bg-surface shadow-card">
                            <div className="flex items-start gap-4 p-5">
                                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[15px] font-semibold text-primary-soft-ink">
                                    {initials(personName(prospect))}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h1 className="truncate text-[20px] font-semibold tracking-tight text-ink">{personName(prospect)}</h1>
                                        {PRIORITY[prospect.priority] && (
                                            <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", PRIORITY[prospect.priority].tone)}>
                                                {PRIORITY[prospect.priority].label}
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-ink-2">
                                        {prospect.contact?.title && <span>{prospect.contact.title}</span>}
                                        {prospect.contact?.title && <span className="text-ink-4">·</span>}
                                        <Building2 className="h-3.5 w-3.5 text-ink-3" aria-hidden />
                                        <span>{prospect.company.name}</span>
                                        {prospect.company.industry && <span className="text-ink-3">· {prospect.company.industry}</span>}
                                        {prospect.company.website && (
                                            <a
                                                href={prospect.company.website.startsWith("http") ? prospect.company.website : `https://${prospect.company.website}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-0.5 text-link hover:underline"
                                            >
                                                <Globe className="h-3 w-3" /> site
                                            </a>
                                        )}
                                    </p>
                                    <p className="mt-1 text-[12px] text-ink-3">
                                        {prospect.strategyName ? `${prospect.strategyName}` : prospect.missionName}
                                        {prospect.sourceListName ? ` · ${prospect.sourceListName}` : ""}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setDrawer({})}
                                    className="hidden h-8 shrink-0 items-center gap-1.5 rounded-control border border-line px-2.5 text-[12px] font-medium text-ink-2 hover:bg-surface-2 sm:inline-flex"
                                    title="Fiche complète (F)"
                                >
                                    <ExternalLink className="h-3.5 w-3.5" /> Fiche <Kbd>F</Kbd>
                                </button>
                            </div>

                            {/* Call block */}
                            <div className="flex flex-wrap items-center gap-3 border-t border-line-subtle bg-surface-2/60 px-5 py-3.5">
                                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
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
                                            Appel dans <span className="tabular-nums font-semibold text-ink">{countdown}</span>
                                            <button type="button" onClick={cancelAutoDial} className="rounded-control px-1.5 py-0.5 text-ink-3 hover:bg-surface-3 hover:text-ink">
                                                Annuler <Kbd className="ml-1">Échap</Kbd>
                                            </button>
                                        </span>
                                    )}
                                    {inCall && callIsOurs ? (
                                        <button type="button" onClick={hangup} className="cp-press inline-flex h-10 items-center gap-2 rounded-control bg-danger px-4 text-[13px] font-semibold text-white hover:bg-red-700">
                                            <PhoneOff className="h-4 w-4" /> Raccrocher <Kbd className="border-white/30 bg-white/10 text-white">H</Kbd>
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={placeCall}
                                            disabled={!phone || inCall}
                                            className="cp-press inline-flex h-10 items-center gap-2 rounded-control bg-success px-4 text-[13px] font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <Phone className="h-4 w-4" /> Appeler <Kbd className="border-white/30 bg-white/10 text-white">Espace</Kbd>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {missionId && (
                            <PrecallBrief
                                key={prospectKey ?? ""}
                                companyId={prospect.company.id}
                                contactId={prospect.contact?.id ?? null}
                                missionId={missionId}
                            />
                        )}

                        {/* Context: what to know before dialling */}
                        <ContextCard prospect={prospect} statusLabel={(code) => statusOf.get(code)?.label ?? code} />

                        {/* Script */}
                        {(prospect.script || prospect.scriptAdditional || prospect.scriptAiEnhanced) && (
                            <ScriptCard prospect={prospect} open={scriptOpen} onToggle={() => setScriptOpen((v) => !v)} />
                        )}
                    </section>

                    {/* ── Outcome ── */}
                    <aside className="flex flex-col gap-3 self-start rounded-panel border border-line bg-surface p-4 shadow-card lg:sticky lg:top-[136px]">
                        {ourCallId && insightsOn && !(inCall && callIsOurs) && insights.summary.status !== "none" && (
                            <div className="-mx-4 -mt-4 mb-1 border-b border-line-subtle bg-surface-2/50 px-4 py-4">
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
                        <div className="flex items-center justify-between">
                            <h2 className="text-[13px] font-semibold text-ink">Résultat de l&apos;appel</h2>
                            <span className="text-[11px] text-ink-3">touches 1–9</span>
                        </div>
                        <div className="grid grid-cols-1 gap-1.5">
                            {keyed.map(({ status, key }) => {
                                const active = selected === status.code;
                                return (
                                    <button
                                        key={status.code}
                                        type="button"
                                        onClick={() => choose(status.code)}
                                        aria-pressed={active}
                                        className={cn(
                                            "cp-press flex h-9 items-center gap-2.5 rounded-control border px-2.5 text-left text-[13px] transition-colors duration-150",
                                            active
                                                ? "cp-flash border-primary bg-primary-soft text-primary-soft-ink"
                                                : "border-line text-ink-2 hover:border-line-strong hover:bg-surface-2 hover:text-ink",
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
                            <fieldset className="cp-pop rounded-control border border-line-subtle bg-surface-2/60 p-2.5">
                                <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Rappeler</legend>
                                <div className="flex flex-wrap gap-1.5">
                                    {presets.map((p) => (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => setCallbackChoice(p.id)}
                                            aria-pressed={callbackChoice === p.id}
                                            className={cn(
                                                "rounded-full border px-2.5 py-1 text-[12px]",
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
                                            "rounded-full border px-2.5 py-1 text-[12px]",
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

                        <div>
                            <label htmlFor="focus-note" className="mb-1 flex items-center justify-between text-[12px] font-medium text-ink-2">
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
                                rows={3}
                                placeholder="Ce qu'il faut retenir…"
                                className="w-full resize-none rounded-control border border-line bg-surface px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-4 focus:border-primary focus:outline-none focus:ring-2 focus:ring-focus"
                            />
                        </div>

                        {formError && (
                            <p className="flex items-start gap-1.5 text-[12px] text-danger-ink">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {formError}
                            </p>
                        )}

                        <button
                            type="button"
                            onClick={() => void save()}
                            disabled={!selected || saving}
                            className="cp-press inline-flex h-10 items-center justify-center gap-2 rounded-control bg-primary px-4 text-[13px] font-semibold text-primary-fg hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
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
                        <button
                            type="button"
                            onClick={skip}
                            disabled={inCall}
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-control text-[12px] font-medium text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-40"
                        >
                            <SkipForward className="h-3.5 w-3.5" /> Passer ce prospect <Kbd>S</Kbd>
                        </button>
                        {paused && <p className="text-center text-[11px] text-warning-ink">En pause : pas d&apos;appel automatique.</p>}
                    </aside>
                </div>
            )}

            {helpOpen && <ShortcutsSheet onClose={() => setHelpOpen(false)} />}

            {drawer && prospect && (
                <UnifiedActionDrawer
                    isOpen
                    onClose={() => setDrawer(null)}
                    contactId={prospect.contact?.id ?? null}
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

function Stat({ label, value, strong }: { label: string; value: string | number; strong?: boolean }) {
    return (
        <div className="flex items-baseline gap-1.5">
            <dt className="text-ink-3">{label}</dt>
            <dd className={cn("font-semibold tabular-nums", strong ? "text-success-ink" : "text-ink")}>{value}</dd>
        </div>
    );
}

function PhoneChip({ label, number, active, onClick }: { label: string; number: string; active: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                "flex items-baseline gap-1.5 rounded-control border px-2.5 py-1.5 text-left",
                active ? "border-line-strong bg-surface text-ink" : "border-transparent text-ink-3 hover:text-ink",
            )}
        >
            <span className="text-[11px] uppercase tracking-wide">{label}</span>
            <span className="font-mono text-[14px] tabular-nums">{formatPhone(number)}</span>
        </button>
    );
}

function ContextCard({ prospect, statusLabel }: { prospect: NextProspect; statusLabel: (code: string) => string }) {
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
        <div className="rounded-panel border border-line bg-surface p-5 shadow-card">
            <h2 className="mb-3 text-[13px] font-semibold text-ink">À savoir avant d&apos;appeler</h2>
            {items.length === 0 ? (
                <p className="text-[13px] text-ink-3">Premier contact : aucun échange enregistré avec ce prospect.</p>
            ) : (
                <ul className="space-y-3">
                    {items.map((it, i) => (
                        <li key={i} className={cn("border-l-2 pl-3 text-[13px]", it.tone === "warn" ? "border-warning" : "border-line-strong")}>
                            <p className={cn("font-medium", it.tone === "warn" ? "text-warning-ink" : "text-ink")}>{it.title}</p>
                            <p className="mt-0.5 leading-relaxed">{it.body}</p>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function ScriptCard({ prospect, open, onToggle }: { prospect: NextProspect; open: boolean; onToggle: () => void }) {
    const tabs = [
        { id: "base", label: "Script", text: prospect.script },
        { id: "additional", label: "Complément", text: prospect.scriptAdditional },
        { id: "ai", label: "Version IA", text: prospect.scriptAiEnhanced },
    ].filter((t) => t.text && t.text.trim());
    const [tab, setTab] = useState(tabs[0]?.id ?? "base");
    const current = tabs.find((t) => t.id === tab) ?? tabs[0];

    return (
        <div className="rounded-panel border border-line bg-surface shadow-card">
            <div className="flex items-center gap-1 px-4 py-2.5">
                <button type="button" onClick={onToggle} className="mr-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink" aria-expanded={open}>
                    <ChevronDown className={cn("h-4 w-4 text-ink-3 transition-transform", !open && "-rotate-90")} />
                    Script
                </button>
                {open &&
                    tabs.length > 1 &&
                    tabs.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setTab(t.id)}
                            aria-pressed={tab === t.id}
                            className={cn("h-7 rounded-control px-2 text-[12px] font-medium", tab === t.id ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink")}
                        >
                            {t.label}
                        </button>
                    ))}
            </div>
            {open && current && (
                <div className="max-h-[42vh] overflow-y-auto border-t border-line-subtle px-5 py-4">
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">{current.text}</p>
                </div>
            )}
        </div>
    );
}

function LoadingCard() {
    return (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]" aria-busy="true">
            <div className="space-y-4">
                <div className="h-40 animate-pulse rounded-panel border border-line bg-surface" />
                <div className="h-28 animate-pulse rounded-panel border border-line bg-surface" />
            </div>
            <div className="h-96 animate-pulse rounded-panel border border-line bg-surface" />
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
        <div className="mx-auto w-full max-w-[640px] py-6">
            <div className="rounded-panel border border-line bg-surface p-6 shadow-card">
                <div className="mb-5 flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-control bg-primary text-primary-fg">
                        <Crosshair className="h-5 w-5" />
                    </span>
                    <div>
                        <h1 className="text-[18px] font-semibold tracking-tight text-ink">Mode Focus</h1>
                        <p className="text-[13px] text-ink-3">Un prospect à la fois, dans l&apos;ordre de votre file : rappels d&apos;abord.</p>
                    </div>
                </div>

                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-3">Mission du jour</p>
                {missions === null ? (
                    <div className="h-24 animate-pulse rounded-control bg-surface-2" />
                ) : missions.length === 0 ? (
                    <p className="rounded-control border border-line bg-surface-2 px-3 py-4 text-[13px] text-ink-3">
                        Aucune mission d&apos;appel dans votre planning du jour.
                    </p>
                ) : (
                    <ul className="space-y-1.5" role="radiogroup" aria-label="Mission">
                        {missions.map((m) => (
                            <li key={m.id}>
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={missionId === m.id}
                                    onClick={() => onMission(m.id)}
                                    className={cn(
                                        "flex w-full items-center gap-3 rounded-control border px-3 py-2.5 text-left",
                                        missionId === m.id ? "border-primary bg-primary-soft" : "border-line hover:bg-surface-2",
                                    )}
                                >
                                    <span className={cn("h-3.5 w-3.5 rounded-full border-2", missionId === m.id ? "border-primary bg-primary" : "border-line-strong")} />
                                    <span className="min-w-0">
                                        <span className="block truncate text-[13px] font-semibold text-ink">{m.name}</span>
                                        {m.client?.name && <span className="block truncate text-[12px] text-ink-3">{m.client.name}</span>}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                <label className={cn("mt-5 flex items-start gap-2.5 text-[13px] text-ink-2", !softphoneOn && "opacity-60")}>
                    <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-[var(--ds-primary)]"
                        checked={autoDial && softphoneOn}
                        disabled={!softphoneOn}
                        onChange={(e) => onAutoDial(e.target.checked)}
                    />
                    <span>
                        <span className="font-medium text-ink">Appel automatique</span>
                        <span className="block text-[12px] text-ink-3">
                            {softphoneOn
                                ? `Chaque prospect est appelé ${AUTO_DIAL_SECONDS} s après son affichage (Échap pour annuler).`
                                : "Nécessite le téléphone intégré : les numéros s'ouvriront dans votre application d'appel."}
                        </span>
                    </span>
                </label>

                <button
                    type="button"
                    onClick={onStart}
                    disabled={!missionId}
                    className="mt-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded-control bg-primary text-[14px] font-semibold text-primary-fg hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Play className="h-4 w-4" /> Démarrer la session
                </button>
            </div>
            <p className="mt-3 text-center text-[12px] text-ink-3">
                Appuyez sur <Kbd>?</Kbd> pendant la session pour voir les raccourcis.
            </p>
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
