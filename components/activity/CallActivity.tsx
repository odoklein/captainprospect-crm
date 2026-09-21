"use client";

/**
 * Call-activity building blocks, shared by the client portal ("Activité") and
 * the manager's client drawer.
 *
 * They live here rather than in the portal page because the two surfaces must
 * look and behave identically: a manager reading a client's activity should see
 * exactly what the client sees, instead of switching between two dashboards to
 * compare. Anything rendered differently for the back office is composed around
 * these, never forked from them.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Briefcase, ChevronDown, Clock, Mail, Phone, Sparkles } from "lucide-react";
import { ACTION_RESULT_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ResultMeta = Record<string, { label: string; color: string; bg: string; border: string }>;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface CallItem {
    id: string;
    createdAt: string;
    callbackDate?: string | null;
    result: string;
    note?: string | null;
    duration?: number | null;
    company?: { name: string; industry?: string | null; country?: string | null } | null;
    contact?: {
        firstName?: string | null;
        lastName?: string | null;
        title?: string | null;
        email?: string | null;
        phone?: string | null;
        company?: { name: string; industry?: string | null; country?: string | null } | null;
    } | null;
    campaign: { name: string; mission: { name: string } };
}
export interface NormalizedCall extends CallItem {
    contact: NonNullable<CallItem["contact"]> & { company: { name: string } };
}
export interface StatusDef {
    code: string; label: string; color: string | null; sortOrder: number; resultCategoryCode: string | null;
}
export interface ResultCategoryDef {
    id: string; code: string; label: string; color: string | null; sortOrder: number;
}

export function buildResultMeta(
    statuses: StatusDef[],
    categories: ResultCategoryDef[]
): Record<string, { label: string; color: string; bg: string; border: string }> {
    const catByCode = Object.fromEntries(categories.map((c) => [c.code, c]));
    const meta: Record<string, { label: string; color: string; bg: string; border: string }> = {};
    for (const s of statuses) {
        const color = s.color ?? catByCode[s.resultCategoryCode ?? ""]?.color ?? "#64748b";
        meta[s.code] = { label: s.label, color, bg: `${color}18`, border: `${color}44` };
    }
    return meta;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function fmtDuration(s: number | null | undefined): string | null {
    if (!s || s <= 0) return null;
    const m = Math.floor(s / 60), sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}
export function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
export function dayKey(iso: string): string {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function getInitials(first?: string | null, last?: string | null): string {
    return `${(first?.[0] ?? "").toUpperCase()}${(last?.[0] ?? "").toUpperCase()}`;
}

export const RESULT_META_FALLBACK: Record<string, { label: string; color: string; bg: string; border: string }> = {
    MEETING_BOOKED: { label: "RDV pris", color: "#059669", bg: "#ecfdf5", border: "#6ee7b7" },
    CALLBACK_REQUESTED: { label: "Rappel demandé", color: "#d97706", bg: "#fffbeb", border: "#fcd34d" },
    INTERESTED: { label: "Intéressé", color: "#4f46e5", bg: "#eef2ff", border: "#c7d2fe" },
    NO_RESPONSE: { label: "Pas de réponse", color: "#64748b", bg: "#f8fafc", border: "#e2e8f0" },
    DISQUALIFIED: { label: "Disqualifié", color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
};

// Avatar gradient palettes keyed by first letter
export const AVATAR_GRADIENTS: Record<string, string> = {
    A: "from-violet-500 to-indigo-600", B: "from-indigo-500 to-blue-600",
    C: "from-blue-500 to-cyan-600",     D: "from-cyan-500 to-teal-600",
    E: "from-teal-500 to-emerald-600",  F: "from-emerald-500 to-green-600",
    G: "from-green-500 to-lime-600",    H: "from-amber-500 to-orange-600",
    I: "from-orange-500 to-red-600",    J: "from-rose-500 to-pink-600",
    K: "from-pink-500 to-fuchsia-600",  L: "from-fuchsia-500 to-violet-600",
};
export function avatarGradient(name: string): string {
    const letter = name.trim().toUpperCase()[0] ?? "A";
    return AVATAR_GRADIENTS[letter] ?? "from-violet-500 to-indigo-600";
}

// ─── Result Badge ─────────────────────────────────────────────────────────────
export function ResultBadge({ result, resultMeta }: {
    result: string;
    resultMeta: Record<string, { label: string; color: string; bg: string; border: string }>;
}) {
    const meta = resultMeta[result] ?? { label: ACTION_RESULT_LABELS[result] ?? result, color: "#64748b", bg: "#f8fafc", border: "#e2e8f0" };
    return (
        <span
            style={{ background: meta.bg, borderColor: meta.border, color: meta.color }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border leading-none whitespace-nowrap"
        >
            <span style={{ background: meta.color }} className="w-1.5 h-1.5 rounded-full flex-shrink-0" />
            {meta.label}
        </span>
    );
}

// ─── Mini stacked bar ─────────────────────────────────────────────────────────
export function MiniBar({ counts, total, statusOrder, resultMeta }: {
    counts: Record<string, number>; total: number; statusOrder: string[];
    resultMeta: Record<string, { label: string; color: string; bg: string; border: string }>;
}) {
    return (
        <div className="flex h-2 rounded-full overflow-hidden w-full bg-[#EEF0F8]">
            {statusOrder.map((k) => {
                const pct = total ? ((counts[k] || 0) / total) * 100 : 0;
                return pct > 0 ? (
                    <div key={k} style={{ width: `${pct}%`, background: resultMeta[k]?.color ?? "#64748b" }} className="transition-all duration-700" />
                ) : null;
            })}
        </div>
    );
}

// ─── Call Card ────────────────────────────────────────────────────────────────
export function CallCard({ call, resultMeta, index, extra }: {
    call: NormalizedCall;
    resultMeta: Record<string, { label: string; color: string; bg: string; border: string }>;
    index: number;
    /** Back-office-only content (e.g. which SDR made the call). The client
     *  portal passes nothing, so its card stays exactly as it was. */
    extra?: ReactNode;
}) {
    const [noteOpen, setNoteOpen] = useState(false);
    const name = [call.contact?.firstName, call.contact?.lastName].filter(Boolean).join(" ") || "—";
    const co = call.contact?.company?.name ?? "—";
    const dur = fmtDuration(call.duration ?? null);
    const meta = resultMeta[call.result] ?? { color: "#64748b", bg: "#f8fafc", border: "#e2e8f0", label: "" };
    const initials = getInitials(call.contact?.firstName, call.contact?.lastName);
    const grad = avatarGradient(name);
    const delay = `${index * 40}ms`;

    return (
        <div
            className="group relative bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200"
            style={{
                borderLeft: `3px solid ${meta.color}`,
                border: `1px solid #E8EBF0`,
                borderLeftWidth: 3,
                borderLeftColor: meta.color,
                animation: `dashFadeUp 0.3s ease both ${delay}`,
            }}
        >
            <div className="flex items-start gap-3 p-3.5">
                {/* Gradient avatar */}
                <div
                    className={cn(
                        "flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br flex items-center justify-center text-[12px] font-black text-white select-none shadow-sm",
                        grad
                    )}
                >
                    {initials || "?"}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-[#12122A]">{name}</p>
                            <div className="flex items-center gap-1 text-xs text-[#8B8DAF] mt-0.5">
                                <Briefcase className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{call.contact?.title ?? "—"} · {co}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <ResultBadge result={call.result} resultMeta={resultMeta} />
                            <span className="text-[10px] text-[#B0B3C8] tabular-nums font-medium">
                                {fmtTime(call.createdAt)}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                        {extra}
                        {dur && (
                            <span className="flex items-center gap-1 text-[11px] text-[#8B8DAF]">
                                <Clock className="w-3 h-3" />{dur}
                            </span>
                        )}
                        {call.note && (
                            <button
                                type="button"
                                onClick={() => setNoteOpen((o) => !o)}
                                className="flex items-center gap-1 text-[11px] text-[#7C5CFC] hover:text-violet-700 font-semibold transition-colors"
                            >
                                <ChevronDown className={cn("w-3 h-3 transition-transform duration-200", noteOpen && "rotate-180")} />
                                Note de l&apos;agent
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Contact links strip */}
            {(call.contact?.email || call.contact?.phone) && (
                <div className="flex flex-wrap gap-x-5 gap-y-1 px-3.5 py-2 bg-[#F8F7FF] border-t border-[#EEF0F8]">
                    {call.contact?.email && (
                        <a href={`mailto:${call.contact.email}`} className="flex items-center gap-1.5 text-[11px] text-[#8B8DAF] hover:text-[#7C5CFC] transition-colors">
                            <Mail className="w-3 h-3" />{call.contact.email}
                        </a>
                    )}
                    {call.contact?.phone && (
                        <a href={`tel:${call.contact.phone}`} className="flex items-center gap-1.5 text-[11px] text-[#8B8DAF] hover:text-[#7C5CFC] transition-colors">
                            <Phone className="w-3 h-3" />{call.contact.phone}
                        </a>
                    )}
                </div>
            )}

            {/* Collapsible note */}
            {call.note && noteOpen && (
                <div className="px-3.5 py-3 border-t border-[#EEF0F8]">
                    <div className="rounded-xl border border-[#E8EBF0] bg-gradient-to-br from-violet-50/80 to-indigo-50/60 px-3 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#7C5CFC] mb-1">Note agent</p>
                        <p className="text-xs text-[#4B4D7A] italic leading-relaxed">&quot;{call.note}&quot;</p>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Day Block ────────────────────────────────────────────────────────────────
export function DayBlock({ dateKey: dk, calls, statusOrder, resultMeta, defaultOpen = false, renderCallExtra }: {
    dateKey: string; calls: NormalizedCall[]; statusOrder: string[];
    resultMeta: Record<string, { label: string; color: string; bg: string; border: string }>;
    defaultOpen?: boolean;
    renderCallExtra?: (call: NormalizedCall) => ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    const [resultFilter, setResultFilter] = useState<string | null>(null);

    useEffect(() => {
        if (!open) setResultFilter(null);
    }, [open]);

    const counts: Record<string, number> = {};
    statusOrder.forEach((c) => { counts[c] = 0; });
    calls.forEach((c) => { counts[c.result] = (counts[c.result] ?? 0) + 1; });
    const meetings = counts["MEETING_BOOKED"] ?? 0;

    const chipCodes = useMemo(() => {
        const cts: Record<string, number> = {};
        statusOrder.forEach((c) => { cts[c] = 0; });
        calls.forEach((c) => { cts[c.result] = (cts[c.result] ?? 0) + 1; });
        const ordered = statusOrder.filter((k) => (cts[k] ?? 0) > 0);
        const rest = Object.keys(cts)
            .filter((k) => !statusOrder.includes(k) && (cts[k] ?? 0) > 0)
            .sort();
        return [...ordered, ...rest];
    }, [calls, statusOrder]);

    const sortedCalls = useMemo(
        () => [...calls].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
        [calls]
    );

    const displayedCalls = useMemo(() => {
        if (!resultFilter) return sortedCalls;
        return sortedCalls.filter((c) => c.result === resultFilter);
    }, [sortedCalls, resultFilter]);

    const d = new Date(dk + "T12:00:00");
    const weekday = d.toLocaleDateString("fr-FR", { weekday: "short" });
    const dayNum = d.getDate();
    const month = d.toLocaleDateString("fr-FR", { month: "short" });

    return (
        <div className="rounded-xl border border-[#E8EBF0] overflow-hidden bg-white">
            <div className="flex items-center gap-2 px-4 py-3 hover:bg-[#F8F7FF] transition-colors">
                <button
                    type="button"
                    onClick={() => setOpen((o) => !o)}
                    className="flex flex-1 min-w-0 items-center gap-4 text-left"
                >
                    {/* Date chip – matching BreakdownCharts gradient style */}
                    <div className="flex-shrink-0 w-[52px] rounded-xl overflow-hidden text-center shadow-sm"
                        style={{ background: "linear-gradient(135deg, #7C5CFC 0%, #4338CA 100%)" }}>
                        <p className="text-[8px] font-bold uppercase tracking-widest text-white/60 pt-1.5 leading-none">{weekday}</p>
                        <p className="text-[22px] font-black text-white leading-tight">{dayNum}</p>
                        <p className="text-[8px] font-bold uppercase tracking-widest text-white/60 pb-1.5 leading-none">{month}</p>
                    </div>

                    <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-[#12122A]">
                                {calls.length} appel{calls.length > 1 ? "s" : ""}
                            </span>
                            {meetings > 0 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-[11px] font-bold text-emerald-700">
                                    <Sparkles className="w-2.5 h-2.5" />
                                    {meetings} RDV
                                </span>
                            )}
                            {/* Summary chips (non-interactive) */}
                            <div className="flex flex-wrap gap-1 ml-1">
                                {statusOrder.map((k) => {
                                    const v = counts[k] ?? 0;
                                    if (!v || k === "MEETING_BOOKED") return null;
                                    return (
                                        <span key={k}
                                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                                            style={{ background: `${resultMeta[k]?.color ?? "#64748b"}15`, color: resultMeta[k]?.color ?? "#64748b" }}
                                        >
                                            {v} {resultMeta[k]?.label ?? ACTION_RESULT_LABELS[k] ?? k}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                        <MiniBar counts={counts} total={calls.length} statusOrder={statusOrder} resultMeta={resultMeta} />
                    </div>
                </button>

                <button
                    type="button"
                    onClick={() => setOpen((o) => !o)}
                    className="flex-shrink-0 p-1 rounded-lg text-[#B0B3C8] hover:bg-white/80 hover:text-[#7C5CFC] transition-colors"
                    aria-expanded={open}
                    aria-label={open ? "Replier le jour" : "Déplier le jour"}
                >
                    <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", open && "rotate-180")} />
                </button>
            </div>

            {open && (
                <>
                    {chipCodes.length > 0 && (
                        <div className="border-t border-[#EEF0F8] bg-white px-4 py-2.5">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-[#A0A3BD] mb-2">
                                Filtrer par résultat
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setResultFilter(null)}
                                    className={cn(
                                        "inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all",
                                        resultFilter === null
                                            ? "bg-[#7C5CFC] text-white border-[#7C5CFC] shadow-sm shadow-violet-500/20"
                                            : "bg-[#F4F5FA] text-[#8B8DAF] border-[#E8EBF0] hover:border-[#7C5CFC]/35"
                                    )}
                                >
                                    Tous ({calls.length})
                                </button>
                                {chipCodes.map((k) => {
                                    const v = counts[k] ?? 0;
                                    const col = resultMeta[k]?.color ?? "#64748b";
                                    const active = resultFilter === k;
                                    return (
                                        <button
                                            key={k}
                                            type="button"
                                            onClick={() => setResultFilter(active ? null : k)}
                                            className={cn(
                                                "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all",
                                                active
                                                    ? "text-white shadow-sm"
                                                    : "hover:brightness-95"
                                            )}
                                            style={
                                                active
                                                    ? { background: col, borderColor: col }
                                                    : {
                                                        background: `${col}12`,
                                                        borderColor: `${col}40`,
                                                        color: col,
                                                    }
                                            }
                                        >
                                            {v} {resultMeta[k]?.label ?? ACTION_RESULT_LABELS[k] ?? k}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    <div className="border-t border-[#EEF0F8] bg-[#F8F7FF]/60 px-4 py-3 space-y-2">
                        {displayedCalls.length === 0 ? (
                            <p className="text-center text-xs font-medium text-[#8B8DAF] py-6">
                                Aucun appel pour ce résultat sur ce jour.
                            </p>
                        ) : (
                            displayedCalls.map((c, i) => (
                                <CallCard
                                    key={c.id}
                                    call={c}
                                    resultMeta={resultMeta}
                                    index={i}
                                    extra={renderCallExtra?.(c)}
                                />
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );
}



/**
 * Resolves the palette and status ordering both surfaces render with. Having
 * one hook rather than a copy per page is what makes "the manager sees what the
 * client sees" a property of the code instead of a convention.
 */
export function useActionStatusConfig() {
    const [statusConfig, setStatusConfig] = useState<{
        statuses: StatusDef[];
        categories: ResultCategoryDef[];
    } | null>(null);

    useEffect(() => {
        fetch("/api/client/action-status-config")
            .then((r) => r.json())
            .then((json) => {
                if (json.success && json.data?.statuses) {
                    setStatusConfig({ statuses: json.data.statuses, categories: json.data.categories ?? [] });
                }
            })
            .catch(() => {
                // Falls back to RESULT_META_FALLBACK below — never blocks the view.
            });
    }, []);

    const resultMeta = useMemo(() => {
        if (statusConfig?.statuses?.length && statusConfig?.categories?.length) {
            return buildResultMeta(statusConfig.statuses, statusConfig.categories);
        }
        return RESULT_META_FALLBACK;
    }, [statusConfig]);

    const statusOrder = useMemo(() => {
        if (statusConfig?.statuses?.length) return statusConfig.statuses.map((s) => s.code);
        return ["MEETING_BOOKED", "CALLBACK_REQUESTED", "INTERESTED", "NO_RESPONSE", "DISQUALIFIED"];
    }, [statusConfig]);

    return { resultMeta, statusOrder };
}
