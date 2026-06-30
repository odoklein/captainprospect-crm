"use client";

import { useState, useEffect, useCallback } from "react";
import { Button, useToast, Card, Badge } from "@/components/ui";
import { FileDown, Share2, Check, Loader2, Calendar, TrendingUp, BarChart3, FileText, Mic, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ReportingSkeleton } from "@/components/client/skeletons";

// Session & CR types (same shape as manager view)
type SessionType = "Kick-Off" | "Onboarding" | "Validation" | "Reporting" | "Suivi" | "Autre";
interface SessionTask {
    id: string;
    label: string;
    assignee?: string;
    assigneeRole?: "SDR" | "MANAGER" | "DEV" | "ALWAYS";
    priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    doneAt?: string | null;
}
interface ClientSession {
    id: string;
    type: SessionType;
    date: string;
    leexiId?: string;
    recordingUrl?: string;
    crMarkdown?: string;
    summaryEmail?: string;
    tasks: SessionTask[];
    createdAt: string;
}
const SESSION_TYPE_COLORS: Record<SessionType, string> = {
    "Kick-Off": "bg-indigo-100 text-indigo-700 border-indigo-200",
    "Onboarding": "bg-emerald-100 text-emerald-700 border-emerald-200",
    "Validation": "bg-pink-100 text-pink-700 border-pink-200",
    "Reporting": "bg-amber-100 text-amber-700 border-amber-200",
    "Suivi": "bg-slate-100 text-slate-600 border-slate-200",
    "Autre": "bg-purple-100 text-purple-700 border-purple-200",
};
const ROLE_BADGE: Record<string, { color: string; bg: string; label: string }> = {
    SDR: { color: "#10B981", bg: "rgba(16,185,129,0.1)", label: "SDR" },
    MANAGER: { color: "#F59E0B", bg: "rgba(245,158,11,0.1)", label: "Manager" },
    DEV: { color: "#3B82F6", bg: "rgba(59,130,246,0.1)", label: "Dev" },
    ALWAYS: { color: "#8B5CF6", bg: "rgba(139,92,246,0.1)", label: "Tous" },
};
const PRIORITY_INDICATOR: Record<string, { color: string; label: string }> = {
    URGENT: { color: "#EF4444", label: "⚡" },
    HIGH: { color: "#F59E0B", label: "↑" },
    MEDIUM: { color: "#3B82F6", label: "→" },
    LOW: { color: "#6B7280", label: "↓" },
};

interface MonthlySummary {
    month: number;
    year: number;
    meetingsBooked: number;
    callsMade: number;
    contactsReached: number;
    objective: number;
}

const MONTH_NAMES = [
    "", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

export default function ClientPortalReportingPage() {
    const toast = useToast();
    const [data, setData] = useState<MonthlySummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [sharingMonth, setSharingMonth] = useState<string | null>(null);
    const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);

    // Sessions & CRs (same data as manager view)
    const [sessions, setSessions] = useState<ClientSession[]>([]);
    const [isLoadingSessions, setIsLoadingSessions] = useState(true);
    const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
    const [showCRTab, setShowCRTab] = useState<"cr" | "email">("cr");
    const [sessionsError, setSessionsError] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/client/reporting/monthly-summary");
                const json = await res.json();
                if (json.success) setData(json.data ?? []);
            } catch (e) {
                console.error("Failed to load reporting data:", e);
            } finally {
                setIsLoading(false);
            }
        })();
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/client/sessions");
                const json = await res.json();
                if (json.success) {
                    setSessions(json.data ?? []);
                } else {
                    setSessionsError(json.error ?? "Erreur lors du chargement des sessions.");
                }
            } catch (e) {
                console.error("Failed to load sessions:", e);
                setSessionsError("Erreur lors du chargement des sessions.");
            } finally {
                setIsLoadingSessions(false);
            }
        })();
    }, []);

    const totalMeetings = data.reduce((sum, d) => sum + d.meetingsBooked, 0);
    const maxMeetings = Math.max(...data.map((d) => d.meetingsBooked), 1);
    const now = new Date();

    const handleShare = useCallback(async (entry: MonthlySummary) => {
        const key = `${entry.year}-${entry.month}`;
        setSharingMonth(key);
        try {
            const dateFrom = new Date(entry.year, entry.month - 1, 1).toISOString();
            const dateTo = new Date(entry.year, entry.month, 0, 23, 59, 59, 999).toISOString();
            const res = await fetch("/api/client/reporting/share", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dateFrom, dateTo }),
            });
            const json = await res.json();
            if (json.success && json.data?.url) {
                await navigator.clipboard.writeText(json.data.url);
                toast.success("Lien copie !", "Valable 30 jours. Collez-le dans un email.");
            } else {
                throw new Error(json.error || "Erreur");
            }
        } catch {
            toast.error("Erreur", "Impossible de generer le lien de partage");
        } finally {
            setSharingMonth(null);
        }
    }, [toast]);

    const handlePdf = useCallback(async (entry: MonthlySummary) => {
        const key = `${entry.year}-${entry.month}`;
        setGeneratingPdf(key);
        try {
            const dateFrom = new Date(entry.year, entry.month - 1, 1).toISOString().split("T")[0];
            const dateTo = new Date(entry.year, entry.month, 0).toISOString().split("T")[0];
            const params = new URLSearchParams({ dateFrom, dateTo, comparePrevious: "false" });
            const res = await fetch(`/api/client/reporting/pdf?${params}`);
            if (!res.ok) {
                const message = "Impossible de generer le rapport PDF";
                toast.error("Erreur", message);
                return;
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `rapport-${MONTH_NAMES[entry.month]}-${entry.year}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            toast.success("Rapport telecharge");
        } catch {
            toast.error("Erreur", "Impossible de generer le rapport PDF");
        } finally {
            setGeneratingPdf(null);
        }
    }, [toast]);

    if (isLoading) return <ReportingSkeleton />;

    return (
        <div className="min-h-full bg-gradient-to-br from-[#F8F9FC] via-[#F4F6F9] to-[#ECEEF4] p-4 md:p-6 space-y-8">
            {/* Header */}
            <div className="animate-fade-up">
                <h1 className="text-2xl font-bold text-[#12122A] tracking-tight">Rapports</h1>
                <p className="text-sm text-[#6B7194] mt-1">Suivez l&apos;evolution de vos missions</p>
            </div>

            {/* Sessions & Comptes Rendus — same view as manager (read-only) */}
            <div className="animate-fade-up space-y-4" style={{ animationDelay: "40ms" }}>
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-sm shadow-indigo-500/20">
                        <FileText className="w-4 h-4 text-white" />
                    </div>
                    <h2 className="text-sm font-bold text-[#12122A] uppercase tracking-wider">
                        Sessions & Comptes Rendus
                    </h2>
                </div>
                {isLoadingSessions ? (
                    <div className="flex items-center justify-center py-12 rounded-2xl border border-[#E8EBF0] bg-white">
                        <Loader2 className="w-8 h-8 animate-spin text-[#6C3AFF]" />
                    </div>
                ) : sessionsError ? (
                    <div className="text-center py-12 rounded-2xl border border-red-200 bg-red-50">
                        <p className="text-sm text-red-600">{sessionsError}</p>
                    </div>
                ) : sessions.length === 0 ? (
                    <div className="text-center py-12 rounded-2xl border border-[#E8EBF0] bg-white">
                        <Mic className="w-12 h-12 text-[#A0A3BD] mx-auto mb-3" />
                        <p className="text-sm text-[#6B7194]">Aucune session pour le moment. Elles apparaîtront ici lorsque votre équipe en ajoutera.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {sessions.map((session) => {
                            const isExpanded = expandedSessionId === session.id;
                            const openTasks = session.tasks.filter((t) => !t.doneAt);
                            const typeKey = session.type as SessionType;
                            const typeColor = SESSION_TYPE_COLORS[typeKey] ?? SESSION_TYPE_COLORS["Autre"];
                            return (
                                <div
                                    key={session.id}
                                    className="premium-card overflow-hidden border border-[#E8EBF0] hover:border-indigo-200/60 transition-all duration-200"
                                >
                                    <button
                                        type="button"
                                        onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                                        className="w-full px-5 py-4 flex items-center justify-between hover:bg-[#F8F7FF]/50 transition-colors text-left"
                                    >
                                        <div className="flex items-center gap-4">
                                            <Badge className={cn("text-xs border shrink-0", typeColor)}>
                                                {session.type}
                                            </Badge>
                                            <div>
                                                <p className="font-semibold text-[#12122A] text-sm">
                                                    Session du {new Date(session.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                                                </p>
                                                {session.crMarkdown && (
                                                    <p className="text-xs text-[#6B7194] mt-0.5 line-clamp-1">
                                                        {session.crMarkdown.split("\n").find((l) => l && !l.startsWith("#"))?.slice(0, 100)}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0 ml-4">
                                            {session.recordingUrl && (
                                                <a
                                                    href={session.recordingUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="flex items-center gap-1 text-xs text-[#6C3AFF] hover:underline font-medium"
                                                >
                                                    <Mic className="w-3.5 h-3.5" /> Enregistrement
                                                </a>
                                            )}
                                            {openTasks.length > 0 && (
                                                <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200">
                                                    {openTasks.length} tâche{openTasks.length > 1 ? "s" : ""}
                                                </Badge>
                                            )}
                                            {isExpanded ? <ChevronUp className="w-4 h-4 text-[#6B7194]" /> : <ChevronDown className="w-4 h-4 text-[#6B7194]" />}
                                        </div>
                                    </button>
                                    {isExpanded && (
                                        <div className="border-t border-[#E8EBF0]">
                                            <div className="flex gap-0 border-b border-[#E8EBF0]">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowCRTab("cr")}
                                                    className={cn(
                                                        "px-5 py-3 text-sm font-semibold border-b-2 transition-colors",
                                                        showCRTab === "cr" ? "border-[#6C3AFF] text-[#6C3AFF]" : "border-transparent text-[#6B7194] hover:text-[#12122A]"
                                                    )}
                                                >
                                                    Compte rendu
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowCRTab("email")}
                                                    className={cn(
                                                        "px-5 py-3 text-sm font-semibold border-b-2 transition-colors",
                                                        showCRTab === "email" ? "border-[#6C3AFF] text-[#6C3AFF]" : "border-transparent text-[#6B7194] hover:text-[#12122A]"
                                                    )}
                                                >
                                                    Mail de synthèse
                                                </button>
                                            </div>
                                            <div className="p-5">
                                                {showCRTab === "cr" &&
                                                    (session.crMarkdown ? (
                                                        <div className="prose prose-sm prose-slate max-w-none">
                                                            <pre className="whitespace-pre-wrap text-sm text-[#12122A] font-sans leading-relaxed">
                                                                {session.crMarkdown}
                                                            </pre>
                                                        </div>
                                                    ) : (
                                                        <p className="text-sm text-[#6B7194] italic">Pas de CR disponible.</p>
                                                    ))}
                                                {showCRTab === "email" &&
                                                    (session.summaryEmail ? (
                                                        <div className="space-y-3">
                                                            <div className="bg-[#F8F9FC] border border-[#E8EBF0] rounded-xl p-4">
                                                                <pre className="whitespace-pre-wrap text-sm text-[#12122A] font-sans leading-relaxed">
                                                                    {session.summaryEmail}
                                                                </pre>
                                                            </div>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="gap-2 rounded-xl border-[#E8EBF0] hover:border-[#7C5CFC]/30 hover:text-[#7C5CFC]"
                                                                onClick={() => {
                                                                    navigator.clipboard.writeText(session.summaryEmail!);
                                                                    toast.success("Copié", "Mail copié dans le presse-papier");
                                                                }}
                                                            >
                                                                <Copy className="w-3.5 h-3.5" />
                                                                Copier le mail
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <p className="text-sm text-[#6B7194] italic">Pas de mail de synthèse disponible.</p>
                                                    ))}
                                                {session.tasks.length > 0 && (
                                                    <div className="mt-5 pt-5 border-t border-[#E8EBF0]">
                                                        <h4 className="text-xs font-bold text-[#6B7194] uppercase tracking-wider mb-3">Tâches d&apos;équipe</h4>
                                                        <div className="space-y-2">
                                                            {session.tasks.map((task) => {
                                                                const roleBadge = ROLE_BADGE[task.assigneeRole || "ALWAYS"] ?? ROLE_BADGE.ALWAYS;
                                                                const priorityInfo = PRIORITY_INDICATOR[task.priority || "MEDIUM"] ?? PRIORITY_INDICATOR.MEDIUM;
                                                                return (
                                                                    <div key={task.id} className="flex items-center gap-3">
                                                                        <div
                                                                            className={cn(
                                                                                "w-4 h-4 rounded-full border-2 shrink-0",
                                                                                task.doneAt ? "bg-emerald-500 border-emerald-500" : "border-[#A0A3BD]"
                                                                            )}
                                                                        />
                                                                        <span className={cn("text-sm flex-1", task.doneAt ? "line-through text-[#6B7194]" : "text-[#12122A]")}>
                                                                            {task.label}
                                                                        </span>
                                                                        <span
                                                                            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                                                            style={{ color: roleBadge.color, background: roleBadge.bg }}
                                                                        >
                                                                            {roleBadge.label}
                                                                        </span>
                                                                        <span className="text-[10px] font-medium" style={{ color: priorityInfo.color }}>
                                                                            {priorityInfo.label}
                                                                        </span>
                                                                        {task.assignee && <span className="text-xs text-[#6B7194]">— {task.assignee}</span>}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Cumulative Timeline */}
            {data.length > 0 && (
                <div className="premium-card overflow-hidden animate-fade-up" style={{ animationDelay: "80ms" }}>
                    {/* Gradient header */}
                    <div
                        className="px-6 py-5 flex items-center justify-between"
                        style={{ background: "linear-gradient(135deg, #1E1B4B 0%, #312E81 50%, #4338CA 100%)" }}
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center">
                                <TrendingUp className="w-4.5 h-4.5 text-white" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                                    Depuis le lancement
                                </h2>
                                <p className="text-xs text-indigo-200/70 mt-0.5">{data.length} mois d&apos;activite</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <span className="text-3xl font-black text-white tabular-nums">
                                <AnimatedNumber value={totalMeetings} />
                            </span>
                            <p className="text-xs text-indigo-200/70">RDV total</p>
                        </div>
                    </div>

                    <div className="p-6 space-y-3">
                        {data.map((entry) => {
                            const isCurrent = entry.month === now.getMonth() + 1 && entry.year === now.getFullYear();
                            return (
                                <div
                                    key={`${entry.year}-${entry.month}`}
                                    className={cn(
                                        "flex items-center gap-4 p-3 rounded-xl transition-all duration-300",
                                        isCurrent
                                            ? "bg-gradient-to-r from-indigo-50 to-violet-50/50 border border-indigo-200/50 shadow-sm"
                                            : "hover:bg-[#F8F7FF] border border-transparent"
                                    )}
                                >
                                    <span className={cn(
                                        "text-sm font-semibold w-24 flex-shrink-0",
                                        isCurrent ? "text-[#6C3AFF]" : "text-[#12122A]"
                                    )}>
                                        {MONTH_NAMES[entry.month]} {entry.year}
                                    </span>
                                    <div className="flex-1">
                                        <ProgressBar value={entry.meetingsBooked} max={maxMeetings} height="sm" />
                                    </div>
                                    <span className="text-sm font-bold text-[#12122A] tabular-nums w-16 text-right">
                                        <AnimatedNumber value={entry.meetingsBooked} /> RDV
                                    </span>
                                    {isCurrent && (
                                        <span className="text-[10px] font-bold text-white bg-gradient-to-r from-[#6C3AFF] to-[#7C5CFC] px-2.5 py-1 rounded-full shadow-sm shadow-[#7C5CFC]/20">
                                            en cours
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Monthly Report Cards */}
            {data.length > 0 && (
                <div>
                    <div className="flex items-center gap-2.5 mb-5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7C5CFC] to-[#A78BFA] flex items-center justify-center shadow-sm shadow-[#7C5CFC]/20">
                            <BarChart3 className="w-4 h-4 text-white" />
                        </div>
                        <h2 className="text-sm font-bold text-[#12122A] uppercase tracking-wider">
                            Rapports mensuels
                        </h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
                        {[...data].reverse().map((entry) => {
                            const key = `${entry.year}-${entry.month}`;
                            const isCurrent = entry.month === now.getMonth() + 1 && entry.year === now.getFullYear();
                            const metObjective = entry.meetingsBooked >= entry.objective;
                            const contactRate = entry.callsMade > 0
                                ? Math.round((entry.contactsReached / entry.callsMade) * 100)
                                : 0;
                            const pct = entry.objective > 0 ? Math.round((entry.meetingsBooked / entry.objective) * 100) : 0;

                            return (
                                <div key={key} className="premium-card overflow-hidden">
                                    {/* Card accent top bar */}
                                    <div className={cn(
                                        "h-1",
                                        metObjective
                                            ? "bg-gradient-to-r from-emerald-400 to-teal-400"
                                            : isCurrent
                                            ? "bg-gradient-to-r from-amber-400 to-orange-400"
                                            : "bg-gradient-to-r from-[#6C3AFF] to-[#A78BFA]"
                                    )} />

                                    <div className="p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="text-lg font-bold text-[#12122A]">
                                                {MONTH_NAMES[entry.month]} {entry.year}
                                            </h3>
                                            {isCurrent ? (
                                                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200/60">
                                                    En cours
                                                </span>
                                            ) : metObjective ? (
                                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/60 flex items-center gap-1">
                                                    <Check className="w-3 h-3" /> Atteint
                                                </span>
                                            ) : null}
                                        </div>

                                        <div className="space-y-3 mb-5">
                                            <div className="flex items-end gap-2">
                                                <span className="text-4xl font-black gradient-text tabular-nums">
                                                    {entry.meetingsBooked}
                                                </span>
                                                <span className="text-sm text-[#6B7194] mb-1.5 font-medium">
                                                    RDV {!isCurrent && entry.objective > 0 && `(${pct}%)`}
                                                </span>
                                            </div>
                                            {entry.objective > 0 && (
                                                <ProgressBar value={entry.meetingsBooked} max={entry.objective} height="sm" />
                                            )}
                                            <div className="flex items-center gap-3 text-sm text-[#6B7194]">
                                                <span className="flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                                                    {entry.callsMade} appels
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                                                    {contactRate}% contact
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 pt-4 border-t border-[#E8EBF0]">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="gap-1.5 rounded-xl text-xs flex-1 hover:border-[#7C5CFC]/30 hover:text-[#7C5CFC] transition-all"
                                                onClick={() => handlePdf(entry)}
                                                disabled={generatingPdf === key}
                                            >
                                                {generatingPdf === key ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <FileDown className="w-3.5 h-3.5" />
                                                )}
                                                PDF
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="gap-1.5 rounded-xl text-xs flex-1 hover:border-[#7C5CFC]/30 hover:text-[#7C5CFC] transition-all"
                                                onClick={() => handleShare(entry)}
                                                disabled={sharingMonth === key}
                                            >
                                                {sharingMonth === key ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <Share2 className="w-3.5 h-3.5" />
                                                )}
                                                Partager
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Empty state */}
            {data.length === 0 && !isLoading && (
                <div className="text-center py-16 bg-white rounded-2xl border border-[#E8EBF0] shadow-sm">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#F4F6F9] to-[#E8EBF0] flex items-center justify-center mx-auto mb-4">
                        <Calendar className="w-7 h-7 text-[#A0A3BD]" />
                    </div>
                    <h3 className="text-lg font-semibold text-[#12122A] mb-1">Aucun rapport disponible</h3>
                    <p className="text-sm text-[#6B7194] max-w-sm mx-auto">
                        Les rapports mensuels apparaitront ici une fois votre mission lancee.
                    </p>
                </div>
            )}
        </div>
    );
}
