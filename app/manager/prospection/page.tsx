"use client";

import {
    Fragment, useState, useEffect, useCallback, useMemo, useRef
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
    Phone, Mail, Linkedin, Building2, User, CheckCircle2,
    XCircle, Ban, Loader2, Clock, Calendar, Sparkles, RotateCcw,
    RefreshCw, ArrowLeft, BarChart3, TrendingUp, TrendingDown,
    Search, CalendarPlus, ChevronRight, ChevronUp, ChevronDown,
    Activity, Target, Send, PhoneMissed, ThumbsUp, PhoneOff,
    CalendarX, RotateCw, SlidersHorizontal, Download, Columns3,
    X, Minus, Radio, Zap, Users, Filter, ArrowUpDown,
    Eye, EyeOff, MoreHorizontal, Maximize2, Mic, History,
} from "lucide-react";
import dynamic from "next/dynamic";
import { Card, Button, useToast } from "@/components/ui";
import { ManagerCallEnrichmentSyncModal } from "@/components/prospection/ManagerCallEnrichmentSyncModal";
import { ACTION_RESULT_LABELS } from "@/lib/types";

const UnifiedActionDrawer = dynamic(
    () => import("@/components/drawers/UnifiedActionDrawer").then((m) => ({ default: m.UnifiedActionDrawer })),
    { ssr: false }
);
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

const CHANNEL_TABS = [
    { value: "CALL" as const, label: "Appels", icon: Phone },
    { value: "EMAIL" as const, label: "Email", icon: Mail },
    { value: "LINKEDIN" as const, label: "LinkedIn", icon: Linkedin },
] as const;
type ChannelTabValue = (typeof CHANNEL_TABS)[number]["value"];

type SortKey = "createdAt" | "result" | "sdr" | "name" | "duration";
type SortDir = "asc" | "desc";
type Density = "compact" | "default" | "comfortable";
type ViewMode = "latest_per_contact" | "all_actions";

interface MissionItem {
    id: string;
    name: string;
    channel: string;
    channels?: string[];
    client: { id: string; name: string };
    _count?: { actions: number; campaigns: number };
    sdrAssignments?: { sdrId: string; sdr: { id: string; name: string } }[];
}

interface ActionRecord {
    id: string;
    contactId: string | null;
    companyId: string | null;
    contact: {
        id: string;
        firstName?: string | null;
        lastName?: string | null;
        company: { id: string; name: string };
    } | null;
    company: { id: string; name: string } | null;
    sdr: { id: string; name: string } | null;
    channel: string;
    result: string;
    note?: string;
    callSummary?: string | null;
    callTranscription?: string | null;
    callRecordingUrl?: string | null;
    duration?: number;
    createdAt: string;
    callbackDate?: string | null;
    _searchKey?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULT CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const RESULT_CFG: Record<string, {
    label: string; icon: React.ElementType;
    text: string; bg: string; border: string; dot: string;
}> = {
    NO_RESPONSE: { label: "Pas de réponse", icon: PhoneMissed, text: "text-slate-500", bg: "bg-slate-100", border: "border-slate-200", dot: "bg-slate-400" },
    BAD_CONTACT: { label: "Mauvais contact", icon: PhoneOff, text: "text-red-600", bg: "bg-red-50", border: "border-red-200", dot: "bg-red-400" },
    INTERESTED: { label: "Intéressé", icon: ThumbsUp, text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500" },
    CALLBACK_REQUESTED: { label: "Rappel demandé", icon: RotateCw, text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500" },
    MEETING_BOOKED: { label: "RDV planifié", icon: CalendarPlus, text: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200", dot: "bg-indigo-500" },
    MEETING_CANCELLED: { label: "RDV annulé", icon: CalendarX, text: "text-red-600", bg: "bg-red-50", border: "border-red-200", dot: "bg-red-400" },
    DISQUALIFIED: { label: "Disqualifié", icon: Ban, text: "text-slate-500", bg: "bg-slate-100", border: "border-slate-200", dot: "bg-slate-300" },
    ENVOIE_MAIL: { label: "Mail à envoyer", icon: Send, text: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", dot: "bg-blue-400" },
    MAIL_ENVOYE: { label: "Mail envoyé", icon: Send, text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500" },
    CONNECTION_SENT: { label: "Connexion envoyée", icon: Linkedin, text: "text-sky-700", bg: "bg-sky-50", border: "border-sky-200", dot: "bg-sky-400" },
    MESSAGE_SENT: { label: "Message envoyé", icon: Linkedin, text: "text-sky-700", bg: "bg-sky-50", border: "border-sky-200", dot: "bg-sky-400" },
    REPLIED: { label: "A répondu", icon: CheckCircle2, text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500" },
    NOT_INTERESTED: { label: "Pas intéressé", icon: XCircle, text: "text-red-600", bg: "bg-red-50", border: "border-red-200", dot: "bg-red-400" },
};
function getCfg(r: string) {
    return RESULT_CFG[r] ?? { label: r, icon: Target, text: "text-slate-500", bg: "bg-slate-100", border: "border-slate-200", dot: "bg-slate-400" };
}

const CHANNEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    CALL: Phone, EMAIL: Mail, LINKEDIN: Linkedin,
};

// ─────────────────────────────────────────────────────────────────────────────
// MINI SPARKLINE
// ─────────────────────────────────────────────────────────────────────────────

function Sparkline({ data, color = "#6366f1" }: { data: number[]; color?: string }) {
    if (data.length < 2) return null;
    const max = Math.max(...data, 1);
    const W = 56, H = 20;
    const pts = data
        .map((v, i) => `${(i / (data.length - 1)) * W},${H - (v / max) * (H - 2) + 1}`)
        .join(" ");
    return (
        <svg width={W} height={H} className="shrink-0">
            <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE PULSE
// ─────────────────────────────────────────────────────────────────────────────

function LivePulse({ label }: { label: string }) {
    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700 select-none">
            <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            {label}
        </span>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// STAT CARD
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({
    label, value, icon: Icon, text, bg, border, trend, sparkData, sparkColor,
}: {
    label: string; value: string | number; icon: React.ElementType;
    text: string; bg: string; border: string;
    trend?: number; sparkData?: number[]; sparkColor?: string;
}) {
    return (
        <div className={cn(
            "relative overflow-hidden rounded-2xl border bg-white p-5 transition-all duration-200",
            "hover:shadow-md hover:-translate-y-0.5 cursor-default group",
            border
        )}>
            <div className="flex items-start justify-between mb-3">
                <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", bg)}>
                    <Icon className={cn("w-4 h-4", text)} aria-hidden />
                </div>
                {trend !== undefined && (
                    <span className={cn(
                        "flex items-center gap-0.5 text-[11px] font-bold tabular-nums",
                        trend > 0 ? "text-emerald-600" : trend < 0 ? "text-red-500" : "text-slate-400"
                    )}>
                        {trend > 0 ? <TrendingUp className="w-3 h-3" /> : trend < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                        {Math.abs(trend)}%
                    </span>
                )}
            </div>
            <p className="text-2xl font-black text-slate-900 tabular-nums leading-none">{value}</p>
            <p className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wider">{label}</p>
            {sparkData && sparkData.length > 1 && (
                <div className="absolute right-4 bottom-4 opacity-40 group-hover:opacity-70 transition-opacity">
                    <Sparkline data={sparkData} color={sparkColor} />
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULT BADGE (table cell)
// ─────────────────────────────────────────────────────────────────────────────

function ResultBadge({ result }: { result: string }) {
    const c = getCfg(result);
    const Icon = c.icon;
    return (
        <span className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold whitespace-nowrap",
            c.bg, c.text, c.border
        )}>
            <Icon className="w-3 h-3 shrink-0" aria-hidden />
            {c.label}
        </span>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// LAST ACTION STORY — narrative, channel-aware, past-tense badge
// ─────────────────────────────────────────────────────────────────────────────

interface ActionStory {
    label: string;
    icon: React.ElementType;
    text: string;
    bg: string;
    border: string;
}

function getLastActionStory(row: ActionRecord): ActionStory {
    const ch = row.channel;
    const r = row.result;

    if (ch === "CALL") {
        switch (r) {
            case "NO_RESPONSE":
                return { label: "Appelé, ne répond pas", icon: PhoneMissed, text: "text-slate-600", bg: "bg-slate-100", border: "border-slate-200" };
            case "BAD_CONTACT":
                return { label: "Numéro erroné", icon: PhoneOff, text: "text-red-700", bg: "bg-red-50", border: "border-red-200" };
            case "CALLBACK_REQUESTED":
                return { label: "Rappel à programmer", icon: RotateCw, text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" };
            case "INTERESTED":
                return { label: "Conversation positive", icon: ThumbsUp, text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" };
            case "MEETING_BOOKED":
                return { label: "RDV décroché au tél.", icon: CalendarPlus, text: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200" };
            case "MEETING_CANCELLED":
                return { label: "RDV annulé", icon: CalendarX, text: "text-red-600", bg: "bg-red-50", border: "border-red-200" };
            case "NOT_INTERESTED":
                return { label: "Pas intéressé (tél.)", icon: XCircle, text: "text-red-600", bg: "bg-red-50", border: "border-red-200" };
            case "DISQUALIFIED":
                return { label: "Disqualifié", icon: Ban, text: "text-slate-500", bg: "bg-slate-100", border: "border-slate-200" };
        }
    }

    if (ch === "EMAIL") {
        switch (r) {
            case "ENVOIE_MAIL":
                return { label: "Mail à envoyer", icon: Send, text: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" };
            case "MAIL_ENVOYE":
                return { label: "Mail envoyé", icon: Mail, text: "text-sky-700", bg: "bg-sky-50", border: "border-sky-200" };
            case "REPLIED":
                return { label: "A répondu au mail", icon: CheckCircle2, text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" };
            case "NO_RESPONSE":
                return { label: "Mail sans réponse", icon: PhoneMissed, text: "text-slate-600", bg: "bg-slate-100", border: "border-slate-200" };
            case "NOT_INTERESTED":
                return { label: "A décliné par mail", icon: XCircle, text: "text-red-600", bg: "bg-red-50", border: "border-red-200" };
            case "INTERESTED":
                return { label: "Intérêt manifesté (mail)", icon: ThumbsUp, text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" };
            case "MEETING_BOOKED":
                return { label: "RDV pris par mail", icon: CalendarPlus, text: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200" };
            case "BAD_CONTACT":
                return { label: "Mail invalide", icon: PhoneOff, text: "text-red-700", bg: "bg-red-50", border: "border-red-200" };
        }
    }

    if (ch === "LINKEDIN") {
        switch (r) {
            case "CONNECTION_SENT":
                return { label: "Invitation envoyée", icon: Linkedin, text: "text-sky-700", bg: "bg-sky-50", border: "border-sky-200" };
            case "MESSAGE_SENT":
                return { label: "Message LinkedIn envoyé", icon: Send, text: "text-sky-700", bg: "bg-sky-50", border: "border-sky-200" };
            case "REPLIED":
                return { label: "A répondu sur LinkedIn", icon: CheckCircle2, text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" };
            case "NO_RESPONSE":
                return { label: "Aucune réaction LinkedIn", icon: PhoneMissed, text: "text-slate-600", bg: "bg-slate-100", border: "border-slate-200" };
            case "NOT_INTERESTED":
                return { label: "Refus sur LinkedIn", icon: XCircle, text: "text-red-600", bg: "bg-red-50", border: "border-red-200" };
            case "INTERESTED":
                return { label: "Intérêt LinkedIn", icon: ThumbsUp, text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" };
            case "MEETING_BOOKED":
                return { label: "RDV pris via LinkedIn", icon: CalendarPlus, text: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200" };
        }
    }

    const c = getCfg(r);
    return { label: c.label, icon: c.icon, text: c.text, bg: c.bg, border: c.border };
}

function getCallbackContext(callbackDate: string | null | undefined): { text: string; tone: "ok" | "soon" | "overdue" } | null {
    if (!callbackDate) return null;
    const cb = new Date(callbackDate);
    if (Number.isNaN(cb.getTime())) return null;
    const dayMs = 86_400_000;
    const ms = cb.getTime() - Date.now();
    const days = Math.round(ms / dayMs);
    if (ms < -dayMs) return { text: `En retard de ${Math.abs(days)}j`, tone: "overdue" };
    if (ms < 0) return { text: "Rappel à faire (auj.)", tone: "overdue" };
    if (days === 0) return { text: "Rappel aujourd'hui", tone: "soon" };
    if (days === 1) return { text: "Rappel demain", tone: "soon" };
    if (days < 7) return { text: `Rappel dans ${days}j`, tone: "ok" };
    return { text: `Rappel ${cb.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}`, tone: "ok" };
}

function timeAgoShort(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 0 || Number.isNaN(ms)) return "";
    const m = Math.floor(ms / 60_000);
    if (m < 1) return "à l'instant";
    if (m < 60) return `il y a ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `il y a ${h}h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `il y a ${d}j`;
    const w = Math.floor(d / 7);
    if (w < 5) return `il y a ${w}sem`;
    const mo = Math.floor(d / 30);
    return `il y a ${mo}mois`;
}

function LastActionBadge({ row }: { row: ActionRecord }) {
    const story = getLastActionStory(row);
    const Icon = story.icon;
    const cbCtx = row.result === "CALLBACK_REQUESTED" ? getCallbackContext(row.callbackDate) : null;
    const ago = timeAgoShort(row.createdAt);

    return (
        <div className="flex flex-col gap-1 items-start">
            <span className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold whitespace-nowrap",
                story.bg, story.text, story.border
            )}>
                <Icon className="w-3 h-3 shrink-0" aria-hidden />
                {story.label}
            </span>
            {cbCtx ? (
                <span className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums whitespace-nowrap",
                    cbCtx.tone === "overdue" ? "bg-red-100 text-red-700 animate-pulse" :
                    cbCtx.tone === "soon" ? "bg-amber-100 text-amber-700" :
                    "bg-slate-100 text-slate-500"
                )}>
                    <Clock className="w-2.5 h-2.5" aria-hidden />
                    {cbCtx.text}
                </span>
            ) : ago && (
                <span className="text-[10px] text-slate-400 font-medium tabular-nums whitespace-nowrap pl-0.5">
                    {ago}
                </span>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// SORT HEADER
// ─────────────────────────────────────────────────────────────────────────────

function Th({
    label, sortKey, currentKey, dir, onSort, className,
}: {
    label: string; sortKey: SortKey; currentKey: SortKey; dir: SortDir;
    onSort: (k: SortKey) => void; className?: string;
}) {
    const active = currentKey === sortKey;
    return (
        <th className={cn("px-4 py-3 text-left", className)}>
            <button
                type="button"
                onClick={() => onSort(sortKey)}
                className={cn(
                    "flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400 rounded",
                    active ? "text-indigo-600" : "text-slate-400 hover:text-slate-700"
                )}
            >
                {label}
                <span className="text-current opacity-60">
                    {active ? (
                        dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-40" />
                    )}
                </span>
            </button>
        </th>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// COLUMN TOGGLE POPOVER
// ─────────────────────────────────────────────────────────────────────────────

const ALL_COLS = [
    { key: "date", label: "Créée le" },
    { key: "name", label: "Contact / Société" },
    { key: "sdr", label: "Effectué par" },
    { key: "result", label: "Résultat" },
    { key: "note", label: "Résumé / Note" },
    { key: "duration", label: "Durée" },
] as const;
type ColKey = (typeof ALL_COLS)[number]["key"];

function ColToggle({
    visible, onToggle,
}: {
    visible: Set<ColKey>;
    onToggle: (k: ColKey) => void;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-label="Colonnes visibles"
                className={cn(
                    "h-9 px-3 flex items-center gap-1.5 rounded-xl border text-xs font-semibold transition-all",
                    open
                        ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                )}
            >
                <Columns3 className="w-3.5 h-3.5" aria-hidden />
                Colonnes
            </button>
            {open && (
                <div className="absolute right-0 top-11 z-30 w-52 rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60 p-3 space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 pb-1">Afficher / Masquer</p>
                    {ALL_COLS.map(col => (
                        <label
                            key={col.key}
                            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer"
                        >
                            <span className={cn(
                                "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors shrink-0",
                                visible.has(col.key)
                                    ? "bg-indigo-600 border-indigo-600"
                                    : "bg-white border-slate-300"
                            )}>
                                {visible.has(col.key) && (
                                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
                                        <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                )}
                            </span>
                            <input type="checkbox" className="sr-only" checked={visible.has(col.key)}
                                onChange={() => onToggle(col.key)} />
                            <span className="text-xs font-medium text-slate-700">{col.label}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// DENSITY TOGGLE
// ─────────────────────────────────────────────────────────────────────────────

const DENSITY_OPTIONS: { value: Density; label: string; rows: number }[] = [
    { value: "compact", label: "Compact", rows: 3 },
    { value: "default", label: "Normal", rows: 4 },
    { value: "comfortable", label: "Confortable", rows: 5 },
];

function DensityToggle({ value, onChange }: { value: Density; onChange: (d: Density) => void }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, []);
    const current = DENSITY_OPTIONS.find(d => d.value === value)!;
    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-label="Densité du tableau"
                className={cn(
                    "h-9 px-3 flex items-center gap-1.5 rounded-xl border text-xs font-semibold transition-all",
                    "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                )}
            >
                <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden />
                {current.label}
            </button>
            {open && (
                <div className="absolute right-0 top-11 z-30 w-44 rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60 p-2 space-y-1">
                    {DENSITY_OPTIONS.map(opt => (
                        <button key={opt.value} type="button"
                            onClick={() => { onChange(opt.value); setOpen(false); }}
                            className={cn(
                                "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors",
                                value === opt.value ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"
                            )}
                        >
                            {opt.label}
                            <span className="flex flex-col gap-px opacity-40">
                                {Array.from({ length: opt.rows }).map((_, i) => (
                                    <span key={i} className="block w-5 h-0.5 bg-current rounded-full" />
                                ))}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULT FILTER CHIPS
// ─────────────────────────────────────────────────────────────────────────────

function ResultFilterBar({
    results, active, onToggle, counts,
}: {
    results: string[]; active: Set<string>;
    onToggle: (r: string) => void; counts: Record<string, number>;
}) {
    return (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par résultat">
            {results.map(r => {
                const c = getCfg(r);
                const Icon = c.icon;
                const isActive = active.has(r);
                const count = counts[r] ?? 0;
                return (
                    <button
                        key={r}
                        type="button"
                        onClick={() => onToggle(r)}
                        aria-pressed={isActive}
                        className={cn(
                            "flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded-xl border text-[11px] font-bold transition-all duration-150",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
                            isActive
                                ? cn(c.bg, c.text, c.border, "shadow-sm")
                                : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                        )}
                    >
                        <Icon className="w-3 h-3 shrink-0" aria-hidden />
                        {c.label}
                        <span className={cn(
                            "ml-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-black tabular-nums",
                            isActive ? "bg-white/60" : "bg-slate-100 text-slate-500"
                        )}>
                            {count}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV EXPORT
// ─────────────────────────────────────────────────────────────────────────────

function exportCSV(rows: ActionRecord[], mission: string) {
    const headers = ["Date (création action)", "Contact", "Société", "SDR", "Résultat", "Résumé / Note", "Durée (s)"];
    const lines = rows.map(r => {
        const name = getContactName(r);
        const company = getCompanyName(r);
        const note = (r.callSummary?.trim() || r.note || "").replace(/"/g, '""');
        const dateKey = r.createdAt;
        return [
            new Date(dateKey).toLocaleString("fr-FR"),
            name, company,
            r.sdr?.name ?? "",
            getCfg(r.result).label,
            `"${note}"`,
            r.duration ?? "",
        ].join(",");
    });
    const blob = new Blob([headers.join(",") + "\n" + lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `prospection_${mission}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
}

function getContactName(action: ActionRecord): string {
    const full = `${action.contact?.firstName || ""} ${action.contact?.lastName || ""}`.trim();
    if (full) return full;
    return "";
}

function getCompanyName(action: ActionRecord): string {
    return action.company?.name || action.contact?.company?.name || "";
}

function getActionDisplaySummary(action: ActionRecord): string {
    return action.callSummary?.trim() || action.note?.trim() || "";
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function ManagerProspectionPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const channelParam = (searchParams.get("channel") || "CALL").toUpperCase();
    const channel: ChannelTabValue = CHANNEL_TABS.some(t => t.value === channelParam)
        ? (channelParam as ChannelTabValue) : "CALL";

    const setChannel = useCallback((ch: ChannelTabValue) => {
        router.replace(`/manager/prospection?channel=${ch}`, { scroll: false });
    }, [router]);

    // ── data ────────────────────────────────────────────────────────────────
    const [missions, setMissions] = useState<MissionItem[]>([]);
    const [missionsLoading, setMissionsLoading] = useState(true);
    const [selectedMission, setSelectedMission] = useState<MissionItem | null>(null);
    const [actions, setActions] = useState<ActionRecord[]>([]);
    const [stats, setStats] = useState<Record<string, any> | null>(null);
    const [loadingData, setLoadingData] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const [newCount, setNewCount] = useState(0); // rows added since last manual refresh
    const { error: showError, success: showSuccess } = useToast();
    const [sdrOptions, setSdrOptions] = useState<{ id: string; name: string }[]>([]);
    /** Mission picker (avant ouverture d'une mission) */
    const [pickerMissionSearch, setPickerMissionSearch] = useState("");
    const [pickerClientId, setPickerClientId] = useState("");
    const [pickerSdrId, setPickerSdrId] = useState("");
    const [drawerAction, setDrawerAction] = useState<ActionRecord | null>(null);
    const [callSyncModalOpen, setCallSyncModalOpen] = useState(false);
    const [bulkCallSyncOpen, setBulkCallSyncOpen] = useState(false);
    const [drawerClientBookingUrl, setDrawerClientBookingUrl] = useState<string>("");
    const [drawerClientInterlocuteurs, setDrawerClientInterlocuteurs] = useState<Array<{
        id: string; firstName: string; lastName: string; title?: string;
        emails: Array<{ value: string; label: string; isPrimary: boolean }>;
        phones: Array<{ value: string; label: string; isPrimary: boolean }>;
        bookingLinks: Array<{ label: string; url: string; durationMinutes: number }>;
        isActive: boolean;
    }>>([]);
    const liveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── table state ─────────────────────────────────────────────────────────
    const [search, setSearch] = useState("");
    const [sdrFilter, setSdrFilter] = useState("");
    /** Filtre canal sur les lignes d'historique (toutes missions / une mission) */
    const [actionChannelFilter, setActionChannelFilter] = useState<"" | ChannelTabValue>("");
    const [resultFilters, setResultFilters] = useState<Set<string>>(new Set());
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [sortKey, setSortKey] = useState<SortKey>("createdAt");
    const [sortDir, setSortDir] = useState<SortDir>("desc");
    const [density, setDensity] = useState<Density>("default");
    /** "Dernier statut par contact" (default): one row per contact/company, its most recent action.
     *  "Historique complet": every action row, as recorded. */
    const [viewMode, setViewMode] = useState<ViewMode>("latest_per_contact");
    const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(
        new Set(["date", "name", "sdr", "result", "note", "duration"])
    );
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(100);
    const [liveRefresh, setLiveRefresh] = useState(true);
    const [exporting, setExporting] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);
    const prevActionsRef = useRef<ActionRecord[]>([]);

    // ── init SDR list ───────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        fetch("/api/users?role=SDR,BUSINESS_DEVELOPER")
            .then(r => r.json())
            .then(j => { if (!cancelled && j.success) setSdrOptions(Array.isArray(j.data) ? j.data : []); });
        return () => { cancelled = true; };
    }, []);

    // ── missions catalogue (par canal) — filtres mission / client / SDR en local ──
    const reloadMissionsCatalog = useCallback(() => {
        setMissionsLoading(true);
        const p = new URLSearchParams({ isActive: "true", limit: "100", channel });
        fetch(`/api/missions?${p}`)
            .then(r => r.json())
            .then(j => { if (j.success) setMissions(j.data); })
            .finally(() => setMissionsLoading(false));
    }, [channel]);

    useEffect(() => {
        reloadMissionsCatalog();
    }, [reloadMissionsCatalog]);

    // Row set changes drastically between view modes — go back to page 1
    useEffect(() => {
        setPage(1);
    }, [viewMode]);

    // ── keyboard shortcut: "/" focuses search ────────────────────────────────
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
                e.preventDefault();
                searchRef.current?.focus();
            }
            if (e.key === "Escape") {
                setSearch("");
                setResultFilters(new Set());
                setSdrFilter("");
                setActionChannelFilter("");
                setDateFrom("");
                setDateTo("");
                setPickerMissionSearch("");
                setPickerClientId("");
                setPickerSdrId("");
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    // ── fetch client booking URL + interlocuteurs when drawer opens (for MEETING_BOOKED flow) ──
    useEffect(() => {
        if (!drawerAction || !selectedMission?.id) {
            setDrawerClientBookingUrl("");
            setDrawerClientInterlocuteurs([]);
            return;
        }
        let cancelled = false;
        fetch(`/api/missions/${selectedMission.id}/client-booking`)
            .then(r => r.json())
            .then(j => {
                if (cancelled) return;
                if (j.success) {
                    setDrawerClientBookingUrl(j.data?.bookingUrl || "");
                    setDrawerClientInterlocuteurs(Array.isArray(j.data?.interlocuteurs) ? j.data.interlocuteurs : []);
                } else {
                    setDrawerClientBookingUrl("");
                    setDrawerClientInterlocuteurs([]);
                }
            })
            .catch(() => {
                if (cancelled) return;
                setDrawerClientBookingUrl("");
                setDrawerClientInterlocuteurs([]);
            });
        return () => { cancelled = true; };
    }, [drawerAction, selectedMission?.id]);

    const fetchMissionStats = useCallback(async (missionId: string) => {
        const qs = new URLSearchParams();
        if (sdrFilter) qs.set("sdrId", sdrFilter);
        if (actionChannelFilter) qs.set("channel", actionChannelFilter);
        if (dateFrom) qs.set("from", `${dateFrom}T00:00:00`);
        if (dateTo) qs.set("to", `${dateTo}T23:59:59.999`);
        const suffix = qs.toString() ? `?${qs}` : "";
        const statsJson = await fetch(`/api/missions/${missionId}/action-stats${suffix}`).then(r => r.json());
        if (statsJson.success) setStats(statsJson.data);
    }, [sdrFilter, actionChannelFilter, dateFrom, dateTo]);

    const fetchMissionData = useCallback(async (missionId: string, silent = false) => {
        if (!silent) setLoadingData(true);
        try {
            const actionsJson = await fetch(`/api/actions?missionId=${missionId}&limit=2000`).then(r => r.json());
            if (actionsJson.success) {
                const next: ActionRecord[] = (actionsJson.data || []).map((a: ActionRecord) => ({
                    ...a,
                    _searchKey: [
                        getContactName(a),
                        getCompanyName(a),
                        a.note,
                        a.callSummary,
                        a.callTranscription,
                    ]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase(),
                }));
                setActions(prev => {
                    const added = next.filter(n => !prev.some(p => p.id === n.id)).length;
                    if (added > 0) setNewCount(c => c + added);
                    return next;
                });
                setLastRefresh(new Date());
            }
        } finally {
            if (!silent) setLoadingData(false);
        }
    }, []);

    const fetchAllForExport = useCallback(async (missionId: string): Promise<ActionRecord[]> => {
        const EXPORT_LIMIT = 5000;
        const all: ActionRecord[] = [];
        let pg = 1;
        let hasMore = true;
        while (hasMore) {
            const qs = new URLSearchParams({ missionId, limit: String(EXPORT_LIMIT), page: String(pg) });
            if (sdrFilter) qs.set("sdrId", sdrFilter);
            if (dateFrom)  qs.set("from", `${dateFrom}T00:00:00`);
            if (dateTo)    qs.set("to", `${dateTo}T23:59:59.999`);
            const json = await fetch(`/api/actions?${qs}`).then(r => r.json());
            if (!json.success) break;
            all.push(...(json.data || []));
            hasMore = json.pagination?.hasMore ?? false;
            pg++;
        }
        return all;
    }, [sdrFilter, dateFrom, dateTo]);

    const handleExportAll = useCallback(async () => {
        if (!selectedMission || exporting) return;
        setExporting(true);
        try {
            const raw = await fetchAllForExport(selectedMission.id);
            const filtered = raw.filter(a => {
                if (resultFilters.size && !resultFilters.has(a.result)) return false;
                if (search) {
                    const key = [getContactName(a), getCompanyName(a), a.note, a.callSummary, a.callTranscription]
                        .filter(Boolean).join(" ").toLowerCase();
                    if (!key.includes(search.toLowerCase())) return false;
                }
                return true;
            });
            exportCSV(filtered, selectedMission.name);
        } finally {
            setExporting(false);
        }
    }, [selectedMission, exporting, fetchAllForExport, resultFilters, search]);

    useEffect(() => {
        if (!selectedMission) return;
        fetchMissionData(selectedMission.id);
    }, [selectedMission, fetchMissionData]);

    useEffect(() => {
        if (!selectedMission) return;
        fetchMissionStats(selectedMission.id);
    }, [selectedMission, fetchMissionStats]);

    // ── live auto-refresh every 30s ──────────────────────────────────────────
    useEffect(() => {
        if (!selectedMission || !liveRefresh) {
            if (liveTimerRef.current) clearInterval(liveTimerRef.current);
            return;
        }
        liveTimerRef.current = setInterval(() => {
            fetchMissionData(selectedMission.id, true);
            fetchMissionStats(selectedMission.id);
        }, 30_000);
        return () => { if (liveTimerRef.current) clearInterval(liveTimerRef.current); };
    }, [selectedMission, liveRefresh, fetchMissionData, fetchMissionStats]);

    // ── derived: missions by channel puis filtres sélection ─────────────────
    const missionsForChannel = useMemo(() =>
        missions.filter(m => m.channels?.includes(channel) ?? m.channel === channel),
        [missions, channel]);

    const clientPickerOptions = useMemo(() => {
        const map = new Map<string, string>();
        missionsForChannel.forEach(m => {
            if (m.client?.id) map.set(m.client.id, m.client.name);
        });
        return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));
    }, [missionsForChannel]);

    const missionsForPicker = useMemo(() => {
        let list = missionsForChannel;
        if (pickerClientId) list = list.filter(m => m.client.id === pickerClientId);
        if (pickerSdrId) list = list.filter(m =>
            m.sdrAssignments?.some(a => a.sdrId === pickerSdrId));
        const q = pickerMissionSearch.trim().toLowerCase();
        if (q) {
            list = list.filter(
                m =>
                    m.name.toLowerCase().includes(q) ||
                    m.client.name.toLowerCase().includes(q)
            );
        }
        return list;
    }, [missionsForChannel, pickerClientId, pickerSdrId, pickerMissionSearch]);

    const pickerHasFilters = !!(pickerMissionSearch.trim() || pickerClientId || pickerSdrId);

    // ── latest action per contact/company — lets a manager "clean" the base:
    // once a prospect is re-qualified (e.g. PROJET_A_SUIVRE → HORS_CIBLE), it
    // shows and counts under its new status only, not both. ─────────────────
    const latestActionPerContact = useMemo(() => {
        const map = new Map<string, ActionRecord>();
        for (const a of actions) {
            const key = a.contactId ? `contact:${a.contactId}` : a.companyId ? `company:${a.companyId}` : `action:${a.id}`;
            const existing = map.get(key);
            if (!existing || new Date(a.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
                map.set(key, a);
            }
        }
        return Array.from(map.values());
    }, [actions]);

    const displayActions = viewMode === "latest_per_contact" ? latestActionPerContact : actions;

    // ── result counts ────────────────────────────────────────────────────────
    const resultCounts = useMemo(() => {
        const map: Record<string, number> = {};
        displayActions.forEach(a => { map[a.result] = (map[a.result] || 0) + 1; });
        return map;
    }, [displayActions]);

    // ── unique results present in data ───────────────────────────────────────
    const uniqueResults = useMemo(() =>
        Array.from(new Set(displayActions.map(a => a.result))).sort(),
        [displayActions]);

    // ── sort handler ─────────────────────────────────────────────────────────
    const handleSort = useCallback((key: SortKey) => {
        setSortKey(prev => {
            if (prev === key) setSortDir(d => d === "asc" ? "desc" : "asc");
            else setSortDir("desc");
            return key;
        });
        setPage(1);
    }, []);

    // ── result filter toggle ─────────────────────────────────────────────────
    const toggleResult = useCallback((r: string) => {
        setResultFilters(prev => {
            const next = new Set(prev);
            if (next.has(r)) next.delete(r); else next.add(r);
            return next;
        });
        setPage(1);
    }, []);

    // ── column toggle ─────────────────────────────────────────────────────────
    const toggleCol = useCallback((k: ColKey) => {
        setVisibleCols(prev => {
            const next = new Set(prev);
            if (next.has(k)) next.delete(k); else next.add(k);
            return next;
        });
    }, []);

    // ── filtered + sorted ─────────────────────────────────────────────────────
    const processed = useMemo(() => {
        const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
        const toTs = dateTo ? new Date(dateTo + "T23:59:59").getTime() : null;
        const rows = displayActions.filter(a => {
            if (sdrFilter && a.sdr?.id !== sdrFilter) return false;
            if (resultFilters.size && !resultFilters.has(a.result)) return false;
            if (search && !a._searchKey?.includes(search.toLowerCase())) return false;
            if (fromTs || toTs) {
                const ts = new Date((a.callbackDate as string | null) || a.createdAt).getTime();
                if (fromTs && ts < fromTs) return false;
                if (toTs && ts > toTs) return false;
            }
            return true;
        });

        rows.sort((a, b) => {
            let cmp = 0;
            if (sortKey === "createdAt") {
                const ak = (a.callbackDate as string | null) || a.createdAt;
                const bk = (b.callbackDate as string | null) || b.createdAt;
                cmp = new Date(ak).getTime() - new Date(bk).getTime();
            }
            else if (sortKey === "result") cmp = a.result.localeCompare(b.result);
            else if (sortKey === "sdr") cmp = (a.sdr?.name || "").localeCompare(b.sdr?.name || "");
            else if (sortKey === "duration") cmp = (a.duration || 0) - (b.duration || 0);
            else if (sortKey === "name") {
                const na = getContactName(a) || getCompanyName(a);
                const nb = getContactName(b) || getCompanyName(b);
                cmp = na.localeCompare(nb);
            }
            return sortDir === "asc" ? cmp : -cmp;
        });
        return rows;
    }, [displayActions, sdrFilter, resultFilters, search, dateFrom, dateTo, sortKey, sortDir]);

    const totalPages = Math.max(1, Math.ceil(processed.length / pageSize));
    const pageRows = processed.slice((page - 1) * pageSize, page * pageSize);

    // ── bulk selection ────────────────────────────────────────────────────────
    const allPageSelected = pageRows.length > 0 && pageRows.every(r => selectedIds.has(r.id));
    const togglePageSelect = () => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (allPageSelected) pageRows.forEach(r => next.delete(r.id));
            else pageRows.forEach(r => next.add(r.id));
            return next;
        });
    };
    const toggleRow = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    // ── stats ─────────────────────────────────────────────────────────────────
    const sc = {
        total: stats?.total ?? 0,
        rdv: stats?.resultBreakdown?.MEETING_BOOKED ?? 0,
        interested: stats?.resultBreakdown?.INTERESTED ?? 0,
        callbacks: stats?.resultBreakdown?.CALLBACK_REQUESTED ?? 0,
        rate: parseFloat(stats?.conversionRate ?? "0").toFixed(1),
    };

    // sparkline: last-7-hour buckets
    const missionSupportsCall = useMemo(() => {
        if (!selectedMission) return false;
        const ch = selectedMission.channels?.length
            ? selectedMission.channels
            : [selectedMission.channel];
        return ch.includes("CALL");
    }, [selectedMission]);

    const hourlySparkData = useMemo(() => {
        const buckets = Array(8).fill(0);
        const now = Date.now();
        actions.forEach(a => {
            const ago = (now - new Date(a.createdAt).getTime()) / 3600000;
            const idx = Math.min(7, Math.floor(ago));
            if (idx >= 0) buckets[7 - idx]++;
        });
        return buckets;
    }, [actions]);

    // row padding by density
    const rowPy = density === "compact" ? "py-2" : density === "comfortable" ? "py-4" : "py-3";
    const hasFilters = !!(search || sdrFilter || resultFilters.size || dateFrom || dateTo);

    // ─────────────────────────────────────────────────────────────────────────
    // MISSION PICKER VIEW
    // ─────────────────────────────────────────────────────────────────────────

    if (!selectedMission) {
        const ChannelIcon = CHANNEL_TABS.find(t => t.value === channel)?.icon ?? Phone;
        const channelLabel = CHANNEL_TABS.find(t => t.value === channel)?.label ?? "";
        return (
            <Fragment>
            <div className="max-w-7xl mx-auto pb-12 space-y-8">
                {/* Page header */}
                <div className="flex items-start justify-between gap-4 pt-2 flex-wrap">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center shadow-sm">
                            <ChannelIcon className="w-6 h-6 text-indigo-700" aria-hidden />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                                Prospection — {channelLabel}
                            </h1>
                            <p className="text-sm text-slate-500 mt-0.5">
                                Sélectionnez une mission pour accéder au centre de contrôle
                            </p>
                        </div>
                    </div>
                    {channel === "CALL" && (
                        <button
                            type="button"
                            onClick={() => setBulkCallSyncOpen(true)}
                            aria-label="Synchroniser les appels Allo pour toutes les missions"
                            className="h-10 px-4 flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 text-violet-900 text-sm font-bold hover:bg-violet-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 shrink-0"
                        >
                            <Mic className="w-4 h-4 shrink-0" aria-hidden />
                            Sync Allo (toutes les missions)
                        </button>
                    )}
                </div>

                {/* Channel tabs */}
                <div
                    role="tablist"
                    aria-label="Canal"
                    className="flex gap-1 p-1.5 bg-slate-100 rounded-2xl w-fit"
                >
                    {CHANNEL_TABS.map(tab => {
                        const Icon = tab.icon;
                        const active = channel === tab.value;
                        return (
                            <button
                                key={tab.value}
                                role="tab"
                                aria-selected={active}
                                onClick={() => setChannel(tab.value)}
                                className={cn(
                                    "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-150",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
                                    active
                                        ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5"
                                        : "text-slate-500 hover:text-slate-800"
                                )}
                            >
                                <Icon className="w-4 h-4" aria-hidden />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Filtres de sélection de mission */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Filtrer les missions
                    </p>
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="flex-1 min-w-[200px]">
                            <label htmlFor="picker-mission-search" className="sr-only">
                                Rechercher une mission
                            </label>
                            <div className="relative">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden />
                                <input
                                    id="picker-mission-search"
                                    type="text"
                                    value={pickerMissionSearch}
                                    onChange={e => setPickerMissionSearch(e.target.value)}
                                    placeholder="Nom de mission ou client…"
                                    className="w-full h-9 pl-10 pr-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400"
                                />
                            </div>
                        </div>
                        <div className="min-w-[180px]">
                            <label htmlFor="picker-client" className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                                Client
                            </label>
                            <select
                                id="picker-client"
                                value={pickerClientId}
                                onChange={e => setPickerClientId(e.target.value)}
                                className="w-full h-9 px-3 text-sm font-semibold bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-indigo-400 cursor-pointer"
                            >
                                <option value="">Tous les clients</option>
                                {clientPickerOptions.map(([id, name]) => (
                                    <option key={id} value={id}>{name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="min-w-[180px]">
                            <label htmlFor="picker-sdr" className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                                SDR assigné
                            </label>
                            <select
                                id="picker-sdr"
                                value={pickerSdrId}
                                onChange={e => setPickerSdrId(e.target.value)}
                                className="w-full h-9 px-3 text-sm font-semibold bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-indigo-400 cursor-pointer"
                            >
                                <option value="">Tous les SDR</option>
                                {sdrOptions.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>
                        {pickerHasFilters && (
                            <button
                                type="button"
                                onClick={() => {
                                    setPickerMissionSearch("");
                                    setPickerClientId("");
                                    setPickerSdrId("");
                                }}
                                className="h-9 px-3 flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:bg-slate-50"
                            >
                                <RotateCcw className="w-3.5 h-3.5" aria-hidden />
                                Effacer
                            </button>
                        )}
                    </div>
                    <p className="text-xs text-slate-400">
                        {missionsForPicker.length} mission{missionsForPicker.length !== 1 ? "s" : ""}
                        {pickerHasFilters && missionsForChannel.length > 0
                            ? ` sur ${missionsForChannel.length}` : ""}
                    </p>
                </div>

                {/* Mission grid */}
                {missionsLoading ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-3">
                        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                        <p className="text-sm font-medium text-slate-500">Chargement des missions…</p>
                    </div>
                ) : missionsForChannel.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-3 border-2 border-dashed border-slate-200 rounded-3xl">
                        <Target className="w-10 h-10 text-slate-300" />
                        <p className="text-base font-bold text-slate-600">Aucune mission {channelLabel}</p>
                        <p className="text-sm text-slate-400">Créez une mission avec ce canal pour la voir ici.</p>
                    </div>
                ) : missionsForPicker.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-3 border-2 border-dashed border-slate-200 rounded-3xl">
                        <Filter className="w-10 h-10 text-slate-300" />
                        <p className="text-base font-bold text-slate-600">Aucune mission ne correspond</p>
                        <p className="text-sm text-slate-400">Élargissez ou réinitialisez les filtres ci-dessus.</p>
                        <button
                            type="button"
                            onClick={() => {
                                setPickerMissionSearch("");
                                setPickerClientId("");
                                setPickerSdrId("");
                            }}
                            className="mt-1 px-4 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold hover:bg-indigo-100 transition-colors"
                        >
                            Réinitialiser les filtres
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {missionsForPicker.map((mission, i) => {
                            const channelList = mission.channels?.length ? mission.channels : [mission.channel];
                            const isMultiCanal = channelList.length > 1;
                            const ChannelIconCard = CHANNEL_ICONS[mission.channel] ?? Phone;
                            return (
                                <button
                                    key={mission.id}
                                    type="button"
                                    onClick={() => setSelectedMission(mission)}
                                    style={{ animationDelay: `${i * 40}ms` }}
                                    className={cn(
                                        "group text-left relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6",
                                        "hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-500/8",
                                        "transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                                    )}
                                >
                                    {/* decorative blob */}
                                    <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-indigo-50 group-hover:bg-indigo-100 transition-colors duration-300" aria-hidden />

                                    <div className="flex items-start justify-between mb-5 relative">
                                        <div className="flex items-center gap-2">
                                            {isMultiCanal ? (
                                                channelList.map((ch) => {
                                                    const Icon = CHANNEL_ICONS[ch] ?? Phone;
                                                    const badgeStyles: Record<string, string> = {
                                                        CALL: "bg-blue-100 text-blue-600",
                                                        EMAIL: "bg-amber-100 text-amber-600",
                                                        LINKEDIN: "bg-sky-100 text-sky-600",
                                                    };
                                                    const style = badgeStyles[ch] ?? "bg-indigo-100 text-indigo-600";
                                                    return (
                                                        <div
                                                            key={ch}
                                                            className={cn(
                                                                "w-9 h-9 rounded-xl flex items-center justify-center shadow-sm group-hover:-translate-y-0.5 transition-transform",
                                                                style
                                                            )}
                                                        >
                                                            <Icon className="w-4 h-4" aria-hidden />
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center shadow-sm group-hover:-translate-y-0.5 transition-transform">
                                                    <ChannelIconCard className="w-5 h-5 text-indigo-600" aria-hidden />
                                                </div>
                                            )}
                                        </div>
                                        <div className="w-7 h-7 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center group-hover:bg-indigo-50 group-hover:border-indigo-200 transition-colors">
                                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 transition-colors" aria-hidden />
                                        </div>
                                    </div>

                                    <div className="relative">
                                        <p className="text-base font-black text-slate-900 group-hover:text-indigo-700 transition-colors leading-snug">
                                            {mission.name}
                                        </p>
                                        <p className="text-xs font-semibold text-slate-400 mt-1.5 flex items-center gap-1">
                                            <Building2 className="w-3 h-3" aria-hidden />
                                            {mission.client?.name ?? "Sans client"}
                                        </p>
                                    </div>

                                    <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between relative">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                            Ouvrir le tableau de bord
                                        </span>
                                        <Activity className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-400 transition-colors" aria-hidden />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {channel === "CALL" && (
                <ManagerCallEnrichmentSyncModal
                    isOpen={bulkCallSyncOpen}
                    onClose={() => setBulkCallSyncOpen(false)}
                    onSynced={reloadMissionsCatalog}
                    onToast={(kind, title, message) => {
                        if (kind === "success") showSuccess(title, message);
                        else showError(title, message);
                    }}
                />
            )}
            </Fragment>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CONTROL CENTER VIEW
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div className="max-w-7xl mx-auto pb-12 space-y-5">

            {/* ── Header ────────────────────────────────────────────────── */}
            <div className="flex flex-col gap-3 pt-2">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedMission(null);
                                setActions([]);
                                setStats(null);
                                setSearch("");
                                setSdrFilter("");
                                setActionChannelFilter("");
                                setResultFilters(new Set());
                                setDateFrom("");
                                setDateTo("");
                                setPage(1);
                                setSelectedIds(new Set());
                                setNewCount(0);
                            }}
                            aria-label="Retour aux missions"
                            className="w-9 h-9 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                        >
                            <ArrowLeft className="w-4 h-4 text-slate-600" aria-hidden />
                        </button>
                        <div>
                            <h1 className="text-xl font-black text-slate-900 leading-tight">{selectedMission.name}</h1>
                            <p className="text-xs font-semibold text-slate-400 flex items-center gap-1 mt-0.5">
                                <Building2 className="w-3 h-3" aria-hidden />
                                {selectedMission.client.name}
                            </p>
                        </div>
                        {liveRefresh && <LivePulse label="Actualisation auto" />}
                        {newCount > 0 && (
                            <button
                                type="button"
                                onClick={() => { setNewCount(0); setPage(1); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600 text-white text-xs font-bold shadow hover:bg-indigo-700 transition-colors animate-bounce"
                            >
                                <Zap className="w-3 h-3" aria-hidden />
                                +{newCount} nouvelles
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Live toggle */}
                        <button
                            type="button"
                            onClick={() => setLiveRefresh(v => !v)}
                            aria-pressed={liveRefresh}
                            aria-label={liveRefresh ? "Désactiver l'actualisation automatique" : "Activer l'actualisation automatique"}
                            className={cn(
                                "h-9 px-3 flex items-center gap-1.5 rounded-xl border text-xs font-bold transition-all",
                                liveRefresh
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                            )}
                        >
                            <Radio className={cn("w-3.5 h-3.5", liveRefresh && "animate-pulse")} aria-hidden />
                            Live
                        </button>

                        {/* Manual refresh */}
                        <button
                            type="button"
                            onClick={() => {
                                fetchMissionData(selectedMission.id);
                                fetchMissionStats(selectedMission.id);
                                setNewCount(0);
                            }}
                            disabled={loadingData}
                            aria-label="Actualiser les données"
                            className="h-9 px-3 flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:bg-slate-50 transition-all disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                        >
                            <RefreshCw className={cn("w-3.5 h-3.5", loadingData && "animate-spin")} aria-hidden />
                            Actualiser
                        </button>

                        {missionSupportsCall && (
                            <button
                                type="button"
                                onClick={() => setCallSyncModalOpen(true)}
                                aria-label="Synchroniser les appels Allo"
                                className="h-9 px-3 flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 text-violet-800 text-xs font-bold hover:bg-violet-100 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                            >
                                <Mic className="w-3.5 h-3.5" aria-hidden />
                                Sync appels
                            </button>
                        )}

                        {/* Export */}
                        <button
                            type="button"
                            onClick={handleExportAll}
                            disabled={exporting}
                            aria-label="Exporter en CSV"
                            className="h-9 px-3 flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:bg-slate-50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Download className="w-3.5 h-3.5" aria-hidden />}
                            {exporting ? "Export en cours…" : "Export CSV"}
                        </button>
                    </div>
                </div>

                {/* Channel tabs */}
                <div role="tablist" aria-label="Canal" className="flex gap-1 p-1.5 bg-slate-100 rounded-2xl w-fit">
                    {CHANNEL_TABS.map(tab => {
                        const Icon = tab.icon;
                        const active = channel === tab.value;
                        return (
                            <button
                                key={tab.value}
                                role="tab"
                                aria-selected={active}
                                onClick={() => { setChannel(tab.value); setSelectedMission(null); }}
                                className={cn(
                                    "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
                                    active ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5" : "text-slate-500 hover:text-slate-800"
                                )}
                            >
                                <Icon className="w-4 h-4" aria-hidden />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Last refresh timestamp */}
                {lastRefresh && (
                    <p className="text-[11px] text-slate-400 font-medium">
                        Dernière mise à jour :{" "}
                        <time dateTime={lastRefresh.toISOString()}>
                            {lastRefresh.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </time>
                    </p>
                )}
            </div>

            {/* ── Stat cards ────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <StatCard label="Actions totales" value={sc.total} icon={BarChart3} text="text-slate-600" bg="bg-slate-100" border="border-slate-200" sparkData={hourlySparkData} sparkColor="#64748b" />
                <StatCard label="RDV planifiés" value={sc.rdv} icon={CalendarPlus} text="text-indigo-600" bg="bg-indigo-50" border="border-indigo-200" sparkData={hourlySparkData.map(() => Math.floor(Math.random() * 3))} sparkColor="#6366f1" />
                <StatCard label="Intéressés" value={sc.interested} icon={ThumbsUp} text="text-emerald-600" bg="bg-emerald-50" border="border-emerald-200" sparkData={hourlySparkData.map(v => Math.round(v * 0.4))} sparkColor="#10b981" />
                <StatCard label="Rappels demandés" value={sc.callbacks} icon={Clock} text="text-amber-600" bg="bg-amber-50" border="border-amber-200" sparkData={hourlySparkData.map(v => Math.round(v * 0.2))} sparkColor="#f59e0b" />
                <StatCard label="Taux conv. RDV" value={`${sc.rate}%`} icon={TrendingUp} text="text-violet-600" bg="bg-violet-50" border="border-violet-200" />
            </div>

            {/* ── Filter & search bar ───────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                    {/* Search */}
                    <div className="flex-1 min-w-[220px] relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden />
                        <input
                            ref={searchRef}
                            type="text"
                            placeholder='Rechercher…  ( / )'
                            value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1); }}
                            className="w-full h-9 pl-10 pr-8 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-400 transition-all placeholder:text-slate-400"
                            aria-label="Rechercher un contact ou une société"
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => setSearch("")}
                                aria-label="Effacer la recherche"
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                            >
                                <X className="w-3.5 h-3.5" aria-hidden />
                            </button>
                        )}
                    </div>

                    <div className="w-px h-7 bg-slate-100 shrink-0 hidden sm:block" aria-hidden />

                    {/* SDR filter */}
                    <select
                        value={sdrFilter}
                        onChange={e => { setSdrFilter(e.target.value); setPage(1); }}
                        aria-label="Filtrer par utilisateur (auteur de l'action)"
                        className="h-9 px-3 text-sm font-semibold bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-indigo-400 min-w-[160px] cursor-pointer"
                    >
                        <option value="">Tous les utilisateurs</option>
                        {sdrOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>

                    <div className="w-px h-7 bg-slate-100 shrink-0 hidden sm:block" aria-hidden />

                    <select
                        value={actionChannelFilter}
                        onChange={e => {
                            setActionChannelFilter((e.target.value || "") as "" | ChannelTabValue);
                            setPage(1);
                        }}
                        aria-label="Filtrer par canal de l'action"
                        className="h-9 px-3 text-sm font-semibold bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-indigo-400 min-w-[140px] cursor-pointer"
                    >
                        <option value="">Tous canaux</option>
                        <option value="CALL">Appels</option>
                        <option value="EMAIL">Email</option>
                        <option value="LINKEDIN">LinkedIn</option>
                    </select>

                    <div className="w-px h-7 bg-slate-100 shrink-0 hidden sm:block" aria-hidden />

                    {/* Date range filter (création de l'action) */}
                    <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden />
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                            aria-label="Date de début (création de l'action)"
                            className="h-9 px-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-indigo-400 cursor-pointer"
                        />
                        <span className="text-xs text-slate-400 font-medium">→</span>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={e => { setDateTo(e.target.value); setPage(1); }}
                            aria-label="Date de fin (création de l'action)"
                            className="h-9 px-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-indigo-400 cursor-pointer"
                        />
                    </div>

                    <div className="ml-auto flex items-center gap-2">
                        {hasFilters && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSearch("");
                                    setSdrFilter("");
                                    setActionChannelFilter("");
                                    setResultFilters(new Set());
                                    setDateFrom("");
                                    setDateTo("");
                                    setPage(1);
                                }}
                                className="h-9 px-3 flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                                aria-label="Réinitialiser tous les filtres"
                            >
                                <RotateCcw className="w-3.5 h-3.5" aria-hidden />
                                Réinitialiser
                            </button>
                        )}
                        <ColToggle visible={visibleCols} onToggle={toggleCol} />
                        <DensityToggle value={density} onChange={setDensity} />

                        {/* Page Size Select */}
                        <div className="flex items-center gap-1.5 h-9 px-2 bg-slate-50 border border-slate-200 rounded-xl">
                            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Lignes :</span>
                            <select
                                value={pageSize}
                                onChange={(e) => {
                                    setPageSize(Number(e.target.value));
                                    setPage(1);
                                }}
                                className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer pr-1"
                            >
                                {[25, 50, 100, 200, 500].map(size => (
                                    <option key={size} value={size}>{size}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* View mode: one row per contact (cleanable base) vs full call log */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vue</span>
                    <div role="tablist" aria-label="Mode d'affichage" className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={viewMode === "latest_per_contact"}
                            onClick={() => setViewMode("latest_per_contact")}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
                                viewMode === "latest_per_contact"
                                    ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5"
                                    : "text-slate-500 hover:text-slate-800"
                            )}
                        >
                            <Users className="w-3.5 h-3.5" aria-hidden />
                            Dernier statut par contact
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={viewMode === "all_actions"}
                            onClick={() => setViewMode("all_actions")}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
                                viewMode === "all_actions"
                                    ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5"
                                    : "text-slate-500 hover:text-slate-800"
                            )}
                        >
                            <History className="w-3.5 h-3.5" aria-hidden />
                            Historique complet
                        </button>
                    </div>
                    {viewMode === "latest_per_contact" && (
                        <span className="text-[11px] text-slate-400 font-medium">
                            {latestActionPerContact.length} prospect{latestActionPerContact.length !== 1 ? "s" : ""} · {actions.length} action{actions.length !== 1 ? "s" : ""} au total
                        </span>
                    )}
                </div>

                {/* Result filter chips */}
                {uniqueResults.length > 0 && (
                    <ResultFilterBar
                        results={uniqueResults}
                        active={resultFilters}
                        onToggle={toggleResult}
                        counts={resultCounts}
                    />
                )}

                {/* Active filter summary */}
                <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-semibold text-slate-400">
                        {processed.length} ligne{processed.length !== 1 ? "s" : ""}
                        {hasFilters && ` sur ${displayActions.length}`}
                    </p>
                    {selectedIds.size > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold">
                            {selectedIds.size} sélectionné{selectedIds.size > 1 ? "s" : ""}
                        </span>
                    )}
                </div>
            </div>

            {/* ── Bulk action bar ───────────────────────────────────────── */}
            {selectedIds.size > 0 && (
                <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200 animate-in slide-in-from-bottom-2 duration-200">
                    <span className="text-sm font-bold">{selectedIds.size} action{selectedIds.size > 1 ? "s" : ""} sélectionnée{selectedIds.size > 1 ? "s" : ""}</span>
                    <div className="flex-1" />
                    <button
                        type="button"
                        onClick={() => exportCSV(processed.filter(r => selectedIds.has(r.id)), selectedMission.name + "_selection")}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-xs font-bold transition-colors"
                    >
                        <Download className="w-3.5 h-3.5" aria-hidden />
                        Exporter la sélection
                    </button>
                    <button
                        type="button"
                        onClick={() => setSelectedIds(new Set())}
                        aria-label="Désélectionner tout"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-xs font-bold transition-colors"
                    >
                        <X className="w-3.5 h-3.5" aria-hidden />
                        Désélectionner
                    </button>
                </div>
            )}

            {/* ── Table ─────────────────────────────────────────────────── */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                {loadingData && actions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-3">
                        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                        <p className="text-sm font-medium text-slate-500">Chargement des données…</p>
                    </div>
                ) : processed.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-3">
                        <Filter className="w-9 h-9 text-slate-200" />
                        <p className="text-sm font-bold text-slate-600">Aucun résultat</p>
                        <p className="text-xs text-slate-400">Modifiez vos filtres pour voir des données.</p>
                        <button
                            type="button"
                            onClick={() => {
                                setSearch("");
                                setSdrFilter("");
                                setActionChannelFilter("");
                                setResultFilters(new Set());
                                setDateFrom("");
                                setDateTo("");
                            }}
                            className="mt-1 px-4 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold hover:bg-indigo-100 transition-colors"
                        >
                            Réinitialiser les filtres
                        </button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse" role="grid" aria-label="Historique des actions">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/80">
                                    {/* Checkbox */}
                                    <th className="w-10 px-4 py-3">
                                        <input
                                            type="checkbox"
                                            checked={allPageSelected}
                                            onChange={togglePageSelect}
                                            aria-label="Sélectionner toute la page"
                                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 accent-indigo-600 cursor-pointer"
                                        />
                                    </th>
                                    {visibleCols.has("date") && (
                                        <Th label="Créée le" sortKey="createdAt" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                                    )}
                                    {visibleCols.has("name") && (
                                        <Th label="Contact / Société" sortKey="name" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="min-w-[200px]" />
                                    )}
                                    {visibleCols.has("sdr") && (
                                        <Th label="Effectué par" sortKey="sdr" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                                    )}
                                    {visibleCols.has("result") && (
                                        <Th label="Résultat" sortKey="result" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                                    )}
                                    {visibleCols.has("note") && (
                                        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 min-w-[220px]">
                                            Résumé / Note
                                        </th>
                                    )}
                                    {visibleCols.has("duration") && (
                                        <Th label="Durée" sortKey="duration" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                                    )}
                                    {/* Row action */}
                                    <th className="w-10 px-2 py-3" aria-hidden />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {pageRows.map((row, idx) => {
                                    const cfg = getCfg(row.result);
                                    const isSelected = selectedIds.has(row.id);
                                    const displaySummary = getActionDisplaySummary(row);
                                    const contactName = getContactName(row);
                                    const companyName = getCompanyName(row);
                                    const name = contactName || companyName || "—";
                                    const showCompany = companyName && companyName !== name;

                                    return (
                                        <tr
                                            key={row.id}
                                            onClick={() => toggleRow(row.id)}
                                            className={cn(
                                                "group cursor-pointer transition-colors duration-100",
                                                isSelected
                                                    ? "bg-indigo-50/70 hover:bg-indigo-50"
                                                    : "hover:bg-slate-50/70"
                                            )}
                                            aria-selected={isSelected}
                                            style={{ animationDelay: `${idx * 20}ms` }}
                                        >
                                            {/* Checkbox */}
                                            <td
                                                className={cn("px-4 text-center", rowPy)}
                                                onClick={e => e.stopPropagation()}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleRow(row.id)}
                                                    aria-label={`Sélectionner ${name}`}
                                                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 accent-indigo-600 cursor-pointer"
                                                />
                                            </td>

                                            {/* Date */}
                                            {visibleCols.has("date") && (
                                                <td className={cn("px-4 whitespace-nowrap", rowPy)}>
                                                    {(() => {
                                                        const d = new Date(row.createdAt);
                                                        const cb = row.callbackDate
                                                            ? new Date(row.callbackDate as string)
                                                            : null;
                                                        return (
                                                            <>
                                                                <p className="text-sm font-semibold text-slate-800 tabular-nums">
                                                                    {d.toLocaleDateString("fr-FR", {
                                                                        day: "2-digit",
                                                                        month: "short",
                                                                    })}
                                                                </p>
                                                                <p className="text-[11px] text-slate-400 font-medium tabular-nums">
                                                                    {d.toLocaleTimeString("fr-FR", {
                                                                        hour: "2-digit",
                                                                        minute: "2-digit",
                                                                    })}
                                                                </p>
                                                                {cb && !Number.isNaN(cb.getTime()) && (
                                                                    <p className="text-[10px] text-amber-700 font-semibold mt-0.5 tabular-nums">
                                                                        Rappel :{" "}
                                                                        {cb.toLocaleDateString("fr-FR", {
                                                                            day: "2-digit",
                                                                            month: "short",
                                                                        })}
                                                                    </p>
                                                                )}
                                                            </>
                                                        );
                                                    })()}
                                                </td>
                                            )}

                                            {/* Name */}
                                            {visibleCols.has("name") && (
                                                <td className={cn("px-4", rowPy)}>
                                                    <div className="flex items-center gap-3">
                                                        <div className={cn(
                                                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-xs",
                                                            "bg-slate-100 text-slate-600"
                                                        )} aria-hidden>
                                                            {row.contactId ? (
                                                                (row.contact?.firstName?.[0] || row.contact?.lastName?.[0] || "?").toUpperCase()
                                                            ) : (
                                                                (row.company?.name?.[0] || "?").toUpperCase()
                                                            )}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-semibold text-slate-900 truncate max-w-[180px]">{name}</p>
                                                            {showCompany && (
                                                                <p className="text-[11px] text-slate-400 font-medium truncate max-w-[180px]">{companyName}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                            )}

                                            {/* SDR */}
                                            {visibleCols.has("sdr") && (
                                                <td className={cn("px-4", rowPy)}>
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-black text-slate-600 shrink-0" aria-hidden>
                                                            {(row.sdr?.name?.[0] || "?").toUpperCase()}
                                                        </div>
                                                        <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">{row.sdr?.name || "—"}</span>
                                                    </div>
                                                </td>
                                            )}

                                            {/* Result — narrative "last action" badge (channel-aware) */}
                                            {visibleCols.has("result") && (
                                                <td className={cn("px-4", rowPy)}>
                                                    <LastActionBadge row={row} />
                                                </td>
                                            )}

                                            {/* Résumé (callSummary) + note */}
                                            {visibleCols.has("note") && (
                                                <td className={cn("px-4 max-w-[320px]", rowPy)}>
                                                    <div className="min-w-0 flex-1">
                                                        {displaySummary ? (
                                                            <p
                                                                className="text-xs text-slate-600 line-clamp-2"
                                                                title={displaySummary}
                                                            >
                                                                {displaySummary}
                                                            </p>
                                                        ) : (
                                                            <span className="text-[11px] text-slate-300 italic">—</span>
                                                        )}
                                                    </div>
                                                </td>
                                            )}

                                            {/* Duration */}
                                            {visibleCols.has("duration") && (
                                                <td className={cn("px-4 whitespace-nowrap", rowPy)}>
                                                    {row.duration ? (
                                                        <span className="text-xs font-semibold text-slate-600 tabular-nums">
                                                            {Math.floor(row.duration / 60)}:{String(row.duration % 60).padStart(2, "0")}
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-300 text-xs">—</span>
                                                    )}
                                                </td>
                                            )}

                                            {/* Open drawer chevron */}
                                            <td className={cn("pr-3 text-right", rowPy)} onClick={e => e.stopPropagation()}>
                                                <button
                                                    type="button"
                                                    onClick={() => setDrawerAction(row)}
                                                    aria-label={`Ouvrir les détails de ${name}`}
                                                    className="rounded p-1 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400"
                                                >
                                                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors" aria-hidden />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* ── Pagination ───────────────────────────────────────── */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50/50">
                        <p className="text-xs font-semibold text-slate-400">
                            Page {page} / {totalPages} — {processed.length} résultat{processed.length !== 1 ? "s" : ""}
                        </p>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => setPage(1)}
                                disabled={page === 1}
                                aria-label="Première page"
                                className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-bold"
                            >
                                «
                            </button>
                            <button
                                type="button"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                aria-label="Page précédente"
                                className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronUp className="w-3.5 h-3.5 -rotate-90" aria-hidden />
                            </button>

                            {/* Page number buttons */}
                            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                                let p: number;
                                if (totalPages <= 7) p = i + 1;
                                else if (page <= 4) p = i + 1;
                                else if (page >= totalPages - 3) p = totalPages - 6 + i;
                                else p = page - 3 + i;
                                return (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => setPage(p)}
                                        aria-label={`Page ${p}`}
                                        aria-current={page === p ? "page" : undefined}
                                        className={cn(
                                            "h-8 w-8 flex items-center justify-center rounded-lg text-xs font-bold transition-colors",
                                            page === p
                                                ? "bg-indigo-600 text-white shadow-sm"
                                                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                        )}
                                    >
                                        {p}
                                    </button>
                                );
                            })}

                            <button
                                type="button"
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                aria-label="Page suivante"
                                className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronDown className="w-3.5 h-3.5 -rotate-90" aria-hidden />
                            </button>
                            <button
                                type="button"
                                onClick={() => setPage(totalPages)}
                                disabled={page === totalPages}
                                aria-label="Dernière page"
                                className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-bold"
                            >
                                »
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Keyboard hints ────────────────────────────────────────── */}
            <div className="flex items-center gap-4 px-1" role="note" aria-label="Raccourcis clavier">
                {[
                    ["  /  ", "Rechercher"],
                    ["Esc", "Effacer filtres"],
                    ["Clic rangée", "Ouvrir le contact"],
                ].map(([key, label]) => (
                    <span key={key} className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                        <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-500 font-mono text-[10px]">{key}</kbd>
                        {label}
                    </span>
                ))}
            </div>

            {/* ── Unified Action Drawer ────────────────────────────────── */}
            {missionSupportsCall && (
                <ManagerCallEnrichmentSyncModal
                    isOpen={callSyncModalOpen}
                    onClose={() => setCallSyncModalOpen(false)}
                    missionId={selectedMission.id}
                    missionName={selectedMission.name}
                    onSynced={() => {
                        fetchMissionData(selectedMission.id, true);
                        fetchMissionStats(selectedMission.id);
                    }}
                    onToast={(kind, title, message) => {
                        if (kind === "success") showSuccess(title, message);
                        else showError(title, message);
                    }}
                />
            )}

            {drawerAction && (
                <UnifiedActionDrawer
                    isOpen={!!drawerAction}
                    onClose={() => setDrawerAction(null)}
                    contactId={drawerAction.contactId || null}
                    companyId={drawerAction.companyId || drawerAction.contact?.company?.id || ""}
                    missionId={selectedMission.id}
                    missionName={selectedMission.name}
                    clientBookingUrl={drawerClientBookingUrl || undefined}
                    clientInterlocuteurs={drawerClientInterlocuteurs}
                    onActionRecorded={() => {
                        fetchMissionData(selectedMission.id, true);
                        fetchMissionStats(selectedMission.id);
                    }}
                    onContactSelect={(newContactId) => {
                        // Switch drawer context to the new contact
                        setDrawerAction({
                            ...drawerAction,
                            contactId: newContactId,
                        });
                    }}
                />
            )}
        </div>
    );
}