"use client";

import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    Brain, Calendar, ChevronDown, ChevronUp, ChevronRight, ChevronLeft,
    AlertTriangle, CheckCircle2, Clock, TrendingUp, TrendingDown,
    Minus, Target, Users, Zap, FileText, MessageSquare, Play, RefreshCw,
    Star, ArrowRight, AlertCircle, Info, BookOpen, Award, Shield,
    Lightbulb, BarChart2, Activity, ThumbsUp, ThumbsDown, Filter,
    History, Loader2, XCircle, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AiMark } from "@/components/ui/AiMark";

// ============================================
// TYPES
// ============================================

interface Recommendation {
    id: string;
    title: string;
    priority: "P1" | "P2" | "P3";
    category: string;
    expectedImpact: string;
    confidenceScore: number;
    rationale: string;
    citations: string[];
    actionSteps: string[];
}

interface TopInsight {
    insight: string;
    evidence: string[];
    impact: "HIGH" | "MEDIUM" | "LOW";
    confidence: number;
}

interface RootCause {
    cause: string;
    evidence: string[];
    affectedArea: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}

interface ScriptImprovement {
    section: string;
    current: string;
    suggested: string;
    rationale: string;
    expectedLift: string;
}

interface IcpRefinement {
    dimension: string;
    finding: string;
    action: string;
    confidence: number;
}

interface ObjectionHandling {
    objection: string;
    frequency: "HIGH" | "MEDIUM" | "LOW";
    currentResponse?: string;
    suggestedResponse: string;
    whyItWorks: string;
    evidence: string[];
}

interface SdrCoachingAction {
    sdrName: string | null;
    issue: string;
    action: string;
    priority: "P1" | "P2" | "P3";
    metric: string;
}

interface ExpectedImpact {
    metric: string;
    current: string;
    projected: string;
    confidence: number;
}

interface TrendAlert {
    metric: string;
    trend: "UP" | "DOWN" | "STABLE" | "VOLATILE";
    severity: "CRITICAL" | "WARNING" | "INFO";
    description: string;
}

interface DeltaInsights {
    improved: string[];
    degraded: string[];
    new: string[];
    resolved: string[];
}

interface WeeklyAnalysis {
    id: string;
    weekStart: string;
    weekEnd: string;
    label: string | null;
    status: "running" | "completed" | "failed";
    executiveSummary: string;
    confidenceScore: number;
    dataQualityScore: number;
    uncertainties: string[];
    topInsights: TopInsight[];
    rootCauses: RootCause[];
    scriptImprovements: ScriptImprovement[];
    icpRefinements: IcpRefinement[];
    objectionHandling: ObjectionHandling[];
    sdrCoachingActions: SdrCoachingAction[];
    recommendations: Recommendation[];
    expectedImpacts: ExpectedImpact[];
    deltaInsights: DeltaInsights | null;
    trendAlerts: TrendAlert[] | null;
    recommendationOutcomes: Array<{
        recommendationId: string;
        status: "applied" | "ignored" | "partial";
        outcome?: string;
        appliedAt?: string;
    }> | null;
    dataSnapshot: any;
    priorAnalysisId: string | null;
    createdAt: string;
    durationMs: number | null;
    tokensUsed: number | null;
}

// ============================================
// HELPERS
// ============================================

function getWeekBounds(offset = 0) {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7) + offset * 7);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return {
        weekStart: monday.toISOString().slice(0, 10),
        weekEnd: sunday.toISOString().slice(0, 10),
    };
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

function formatWeekLabel(start: string, end: string) {
    return `${formatDate(start)} → ${formatDate(end)}`;
}

function pctBar(value: number, max = 1) {
    return Math.min(100, Math.round((value / max) * 100));
}

// ============================================
// SUB-COMPONENTS
// ============================================

function ConfidenceBadge({ score, size = "sm" }: { score: number; size?: "sm" | "md" }) {
    const pct = Math.round(score * 100);
    const color =
        pct >= 75 ? "text-emerald-600 bg-emerald-50 border-emerald-200" :
            pct >= 50 ? "text-amber-600 bg-amber-50 border-amber-200" :
                "text-rose-600 bg-rose-50 border-rose-200";
    return (
        <span className={cn(
            "inline-flex items-center gap-1 rounded-full border font-medium",
            size === "sm" ? "text-xs px-2 py-0.5" : "text-sm px-3 py-1",
            color
        )}>
            <Shield className={cn(size === "sm" ? "w-3 h-3" : "w-4 h-4")} />
            {pct}% confiance
        </span>
    );
}

function PriorityBadge({ priority }: { priority: "P1" | "P2" | "P3" }) {
    const config = {
        P1: { label: "P1 Critique", cls: "bg-rose-100 text-rose-700 border-rose-200" },
        P2: { label: "P2 Important", cls: "bg-amber-100 text-amber-700 border-amber-200" },
        P3: { label: "P3 À planifier", cls: "bg-blue-100 text-blue-700 border-blue-200" },
    };
    const { label, cls } = config[priority];
    return (
        <span className={cn("inline-flex items-center rounded border text-xs font-semibold px-2 py-0.5", cls)}>
            {label}
        </span>
    );
}

function ImpactBadge({ impact }: { impact: "HIGH" | "MEDIUM" | "LOW" }) {
    const config = {
        HIGH: { label: "Impact élevé", cls: "bg-rose-50 text-rose-700 border-rose-200" },
        MEDIUM: { label: "Impact moyen", cls: "bg-amber-50 text-amber-700 border-amber-200" },
        LOW: { label: "Impact faible", cls: "bg-slate-50 text-slate-600 border-slate-200" },
    };
    const { label, cls } = config[impact];
    return (
        <span className={cn("inline-flex items-center rounded border text-xs font-medium px-2 py-0.5", cls)}>
            {label}
        </span>
    );
}

function SeverityBadge({ severity }: { severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" }) {
    const config = {
        CRITICAL: "bg-rose-100 text-rose-700 border-rose-300",
        HIGH: "bg-orange-100 text-orange-700 border-orange-200",
        MEDIUM: "bg-amber-100 text-amber-600 border-amber-200",
        LOW: "bg-slate-100 text-slate-600 border-slate-200",
    };
    return (
        <span className={cn("inline-flex items-center rounded border text-xs font-medium px-2 py-0.5", config[severity])}>
            {severity}
        </span>
    );
}

function TrendIcon({ trend }: { trend: "UP" | "DOWN" | "STABLE" | "VOLATILE" }) {
    if (trend === "UP") return <ArrowUpRight className="w-4 h-4 text-emerald-500" />;
    if (trend === "DOWN") return <ArrowDownRight className="w-4 h-4 text-rose-500" />;
    if (trend === "VOLATILE") return <Activity className="w-4 h-4 text-amber-500" />;
    return <Minus className="w-4 h-4 text-slate-400" />;
}

function CitationList({ citations }: { citations: string[] }) {
    if (!citations?.length) return null;
    return (
        <div className="mt-3 border-l-2 border-primary-200 pl-3 space-y-1">
            {citations.map((c, i) => (
                <p key={i} className="text-xs text-slate-500 italic">"{c}"</p>
            ))}
        </div>
    );
}

function ScoreBar({ value, max = 1, colorClass = "bg-primary-500" }: { value: number; max?: number; colorClass?: string }) {
    return (
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden w-full">
            <div
                className={cn("h-full rounded-full transition-all", colorClass)}
                style={{ width: `${pctBar(value, max)}%` }}
            />
        </div>
    );
}

function CollapsibleCard({
    title, icon: Icon, children, defaultOpen = false, badge
}: {
    title: string;
    icon: React.ElementType;
    children: React.ReactNode;
    defaultOpen?: boolean;
    badge?: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 text-primary-500" />
                    <span className="font-semibold text-slate-800">{title}</span>
                    {badge}
                </div>
                {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>
            {open && <div className="border-t border-slate-100 px-5 py-4">{children}</div>}
        </div>
    );
}

// ============================================
// SECTION RENDERERS
// ============================================

function ExecutiveSummarySection({ analysis }: { analysis: WeeklyAnalysis }) {
    const snap = analysis.dataSnapshot || {};
    return (
        <div className="space-y-5">
            {/* KPI Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: "Total actions", value: snap.actionCount ?? "–", icon: Activity, color: "text-primary-600" },
                    { label: "RDV obtenus", value: snap.meetingCount ?? "–", icon: Calendar, color: "text-emerald-600" },
                    { label: "Taux conversion", value: snap.conversionRate != null ? `${snap.conversionRate}%` : "–", icon: TrendingUp, color: "text-amber-600" },
                    { label: "Appels", value: snap.callCount ?? "–", icon: BarChart2, color: "text-blue-600" },
                ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                        <Icon className={cn("w-4 h-4 mb-1", color)} />
                        <div className="text-xl font-bold text-slate-800">{value}</div>
                        <div className="text-xs text-slate-500">{label}</div>
                    </div>
                ))}
            </div>

            {/* Confidence meters */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>Confiance analyse</span>
                        <span>{Math.round(analysis.confidenceScore * 100)}%</span>
                    </div>
                    <ScoreBar
                        value={analysis.confidenceScore}
                        colorClass={
                            analysis.confidenceScore >= 0.7 ? "bg-emerald-500" :
                                analysis.confidenceScore >= 0.4 ? "bg-amber-500" : "bg-rose-500"
                        }
                    />
                </div>
                <div>
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>Qualité des données</span>
                        <span>{Math.round(analysis.dataQualityScore * 100)}%</span>
                    </div>
                    <ScoreBar
                        value={analysis.dataQualityScore}
                        colorClass={
                            analysis.dataQualityScore >= 0.7 ? "bg-blue-500" :
                                analysis.dataQualityScore >= 0.4 ? "bg-amber-500" : "bg-rose-500"
                        }
                    />
                </div>
            </div>

            {/* Summary text */}
            <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed whitespace-pre-line">
                {analysis.executiveSummary}
            </div>

            {/* Uncertainties */}
            {analysis.uncertainties?.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span className="text-sm font-semibold text-amber-700">Incertitudes explicites</span>
                    </div>
                    <ul className="space-y-1">
                        {analysis.uncertainties.map((u, i) => (
                            <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                                <span className="text-amber-400 mt-0.5">•</span>
                                {u}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

function TopInsightsSection({ insights }: { insights: TopInsight[] }) {
    const [expanded, setExpanded] = useState<number | null>(null);
    if (!insights?.length) return <p className="text-sm text-slate-400">Aucun insight disponible.</p>;
    return (
        <div className="space-y-3">
            {insights.map((ins, i) => (
                <div key={i} className="border border-slate-200 rounded-lg overflow-hidden">
                    <button
                        onClick={() => setExpanded(expanded === i ? null : i)}
                        className="w-full flex items-start gap-3 p-4 hover:bg-slate-50 text-left transition-colors"
                    >
                        <div className={cn(
                            "shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                            ins.impact === "HIGH" ? "bg-rose-100 text-rose-700" :
                                ins.impact === "MEDIUM" ? "bg-amber-100 text-amber-700" :
                                    "bg-slate-100 text-slate-600"
                        )}>{i + 1}</div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800">{ins.insight}</p>
                            <div className="flex items-center gap-2 mt-1">
                                <ImpactBadge impact={ins.impact} />
                                <ConfidenceBadge score={ins.confidence} />
                            </div>
                        </div>
                        {expanded === i ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />}
                    </button>
                    {expanded === i && ins.evidence?.length > 0 && (
                        <div className="border-t border-slate-100 px-4 pb-4">
                            <CitationList citations={ins.evidence} />
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

function RootCausesSection({ causes }: { causes: RootCause[] }) {
    if (!causes?.length) return <p className="text-sm text-slate-400">Aucune cause racine identifiée.</p>;
    return (
        <div className="space-y-4">
            {causes.map((rc, i) => (
                <div key={i} className="border border-slate-200 rounded-lg p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-800">{rc.cause}</p>
                        <div className="flex gap-2 shrink-0">
                            <SeverityBadge severity={rc.severity} />
                            <span className="text-xs bg-slate-100 text-slate-600 rounded px-2 py-0.5 border border-slate-200">
                                {rc.affectedArea}
                            </span>
                        </div>
                    </div>
                    <CitationList citations={rc.evidence} />
                </div>
            ))}
        </div>
    );
}

function ScriptImprovementsSection({ improvements }: { improvements: ScriptImprovement[] }) {
    const [activeIdx, setActiveIdx] = useState(0);
    const sectionLabels: Record<string, string> = {
        intro: "Introduction", discovery: "Découverte", objection: "Objections", closing: "Closing",
    };
    if (!improvements?.length) return <p className="text-sm text-slate-400">Aucune amélioration de script suggérée.</p>;
    const imp = improvements[activeIdx];
    return (
        <div className="space-y-4">
            {/* Section tabs */}
            <div className="flex flex-wrap gap-2">
                {improvements.map((imp, i) => (
                    <button
                        key={i}
                        onClick={() => setActiveIdx(i)}
                        className={cn(
                            "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
                            activeIdx === i
                                ? "bg-primary-600 text-white border-primary-600"
                                : "bg-white text-slate-600 border-slate-200 hover:border-primary-300"
                        )}
                    >
                        {sectionLabels[imp.section] || imp.section}
                    </button>
                ))}
            </div>
            {/* Diff view */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
                    <p className="text-xs font-semibold text-rose-600 mb-2 flex items-center gap-1.5">
                        <XCircle className="w-3.5 h-3.5" /> Version actuelle
                    </p>
                    <p className="text-sm text-rose-800 whitespace-pre-line">{imp.current || "Non spécifié"}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                    <p className="text-xs font-semibold text-emerald-600 mb-2 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Version améliorée
                    </p>
                    <p className="text-sm text-emerald-800 whitespace-pre-line">{imp.suggested}</p>
                </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                <p className="text-xs font-semibold text-blue-600">Justification</p>
                <p className="text-sm text-blue-800">{imp.rationale}</p>
                <p className="text-xs text-blue-600 font-medium mt-2">
                    <span className="font-semibold">Impact attendu :</span> {imp.expectedLift}
                </p>
            </div>
        </div>
    );
}

function IcpRefinementsSection({ refinements }: { refinements: IcpRefinement[] }) {
    if (!refinements?.length) return <p className="text-sm text-slate-400">Aucun affinement ICP suggéré.</p>;
    return (
        <div className="space-y-3">
            {refinements.map((ref, i) => (
                <div key={i} className="border border-slate-200 rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-primary-500">{ref.dimension}</span>
                        <ConfidenceBadge score={ref.confidence} />
                    </div>
                    <p className="text-sm text-slate-700"><span className="font-medium">Observation :</span> {ref.finding}</p>
                    <div className="bg-primary-50 border border-primary-100 rounded p-2">
                        <p className="text-sm text-primary-700"><span className="font-medium">Action :</span> {ref.action}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}

function ObjectionHandlingSection({ objections }: { objections: ObjectionHandling[] }) {
    const [expanded, setExpanded] = useState<number | null>(null);
    if (!objections?.length) return <p className="text-sm text-slate-400">Aucune objection analysée.</p>;
    const freqOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    const sorted = [...objections].sort((a, b) => freqOrder[a.frequency] - freqOrder[b.frequency]);
    return (
        <div className="space-y-2">
            {sorted.map((obj, i) => (
                <div key={i} className="border border-slate-200 rounded-lg overflow-hidden">
                    <button
                        onClick={() => setExpanded(expanded === i ? null : i)}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 text-left transition-colors"
                    >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                            <MessageSquare className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-slate-800">"{obj.objection}"</p>
                                <div className="flex gap-2 mt-1">
                                    <span className={cn(
                                        "text-xs px-2 py-0.5 rounded border font-medium",
                                        obj.frequency === "HIGH" ? "bg-rose-50 text-rose-600 border-rose-200" :
                                            obj.frequency === "MEDIUM" ? "bg-amber-50 text-amber-600 border-amber-200" :
                                                "bg-slate-50 text-slate-500 border-slate-200"
                                    )}>
                                        {obj.frequency === "HIGH" ? "Fréquente" : obj.frequency === "MEDIUM" ? "Modérée" : "Rare"}
                                    </span>
                                </div>
                            </div>
                        </div>
                        {expanded === i ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                    </button>
                    {expanded === i && (
                        <div className="border-t border-slate-100 p-4 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {obj.currentResponse && (
                                    <div className="bg-slate-50 rounded p-3 border border-slate-200">
                                        <p className="text-xs font-semibold text-slate-500 mb-1">Réponse actuelle</p>
                                        <p className="text-sm text-slate-700">{obj.currentResponse}</p>
                                    </div>
                                )}
                                <div className="bg-emerald-50 rounded p-3 border border-emerald-200">
                                    <p className="text-xs font-semibold text-emerald-600 mb-1">Réponse suggérée</p>
                                    <p className="text-sm text-emerald-800">{obj.suggestedResponse}</p>
                                </div>
                            </div>
                            <p className="text-xs text-slate-500 italic">{obj.whyItWorks}</p>
                            <CitationList citations={obj.evidence} />
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

function SdrCoachingSection({ actions }: { actions: SdrCoachingAction[] }) {
    if (!actions?.length) return <p className="text-sm text-slate-400">Aucune action de coaching identifiée.</p>;
    return (
        <div className="space-y-3">
            {actions.map((action, i) => (
                <div key={i} className="border border-slate-200 rounded-lg p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            {action.sdrName && (
                                <p className="text-xs font-semibold text-primary-500 mb-0.5 flex items-center gap-1">
                                    <Users className="w-3 h-3" /> {action.sdrName}
                                </p>
                            )}
                            <p className="text-sm font-medium text-slate-800">{action.issue}</p>
                        </div>
                        <PriorityBadge priority={action.priority} />
                    </div>
                    <div className="bg-blue-50 border border-blue-100 rounded p-3">
                        <p className="text-sm text-blue-800">
                            <span className="font-medium">Action :</span> {action.action}
                        </p>
                    </div>
                    <p className="text-xs text-slate-500">
                        <span className="font-medium">Indicateur à suivre :</span> {action.metric}
                    </p>
                </div>
            ))}
        </div>
    );
}

function RecommendationsSection({
    recommendations,
    outcomes,
    onUpdateOutcome,
}: {
    recommendations: Recommendation[];
    outcomes: WeeklyAnalysis["recommendationOutcomes"];
    onUpdateOutcome: (recId: string, status: "applied" | "ignored" | "partial", outcome?: string) => void;
}) {
    const [expanded, setExpanded] = useState<string | null>(null);
    if (!recommendations?.length) return <p className="text-sm text-slate-400">Aucune recommandation générée.</p>;

    const getOutcome = (id: string) => outcomes?.find(o => o.recommendationId === id);

    return (
        <div className="space-y-3">
            {recommendations.map((rec) => {
                const outcome = getOutcome(rec.id);
                return (
                    <div key={rec.id} className={cn(
                        "border rounded-xl overflow-hidden transition-all",
                        outcome?.status === "applied" ? "border-emerald-200 bg-emerald-50/30" :
                            outcome?.status === "ignored" ? "border-slate-200 opacity-60" :
                                "border-slate-200 bg-white"
                    )}>
                        <button
                            onClick={() => setExpanded(expanded === rec.id ? null : rec.id)}
                            className="w-full flex items-start gap-3 p-4 hover:bg-slate-50/50 text-left transition-colors"
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <PriorityBadge priority={rec.priority} />
                                    <span className="text-xs bg-slate-100 text-slate-600 rounded px-2 py-0.5 border border-slate-200">
                                        {rec.category}
                                    </span>
                                    <ConfidenceBadge score={rec.confidenceScore} />
                                    {outcome?.status && (
                                        <span className={cn(
                                            "text-xs rounded px-2 py-0.5 border font-medium",
                                            outcome.status === "applied" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                                                outcome.status === "partial" ? "bg-amber-100 text-amber-700 border-amber-200" :
                                                    "bg-slate-100 text-slate-500 border-slate-200"
                                        )}>
                                            {outcome.status === "applied" ? "Appliqué" :
                                                outcome.status === "partial" ? "Partiel" : "Ignoré"}
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm font-semibold text-slate-800">{rec.title}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{rec.expectedImpact}</p>
                            </div>
                            {expanded === rec.id ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                        </button>

                        {expanded === rec.id && (
                            <div className="border-t border-slate-100 px-4 pb-5 space-y-4">
                                <div>
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Justification</p>
                                    <p className="text-sm text-slate-700">{rec.rationale}</p>
                                    <CitationList citations={rec.citations} />
                                </div>
                                {rec.actionSteps?.length > 0 && (
                                    <div>
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Plan d'action</p>
                                        <ol className="space-y-1.5">
                                            {rec.actionSteps.map((step, i) => (
                                                <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                                                    <span className="shrink-0 w-5 h-5 bg-primary-100 text-primary-600 rounded-full text-xs font-bold flex items-center justify-center mt-0.5">
                                                        {i + 1}
                                                    </span>
                                                    {step}
                                                </li>
                                            ))}
                                        </ol>
                                    </div>
                                )}
                                {/* Feedback buttons */}
                                <div className="pt-2 border-t border-slate-100">
                                    <p className="text-xs text-slate-500 mb-2">Marquer comme :</p>
                                    <div className="flex gap-2 flex-wrap">
                                        {(["applied", "partial", "ignored"] as const).map((status) => (
                                            <button
                                                key={status}
                                                onClick={() => onUpdateOutcome(rec.id, status)}
                                                className={cn(
                                                    "text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors",
                                                    outcome?.status === status
                                                        ? status === "applied" ? "bg-emerald-500 text-white border-emerald-500" :
                                                            status === "partial" ? "bg-amber-500 text-white border-amber-500" :
                                                                "bg-slate-400 text-white border-slate-400"
                                                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                                                )}
                                            >
                                                {status === "applied" ? "Appliqué" :
                                                    status === "partial" ? "Partiel" : "Ignoré"}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function TrendSection({ analysis }: { analysis: WeeklyAnalysis }) {
    const { deltaInsights, trendAlerts } = analysis;
    return (
        <div className="space-y-5">
            {trendAlerts && trendAlerts.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Alertes tendance</p>
                    {trendAlerts.map((alert, i) => (
                        <div key={i} className={cn(
                            "flex items-start gap-3 p-3 rounded-lg border",
                            alert.severity === "CRITICAL" ? "bg-rose-50 border-rose-200" :
                                alert.severity === "WARNING" ? "bg-amber-50 border-amber-200" :
                                    "bg-slate-50 border-slate-200"
                        )}>
                            <TrendIcon trend={alert.trend} />
                            <div>
                                <p className="text-sm font-medium text-slate-800">{alert.metric}</p>
                                <p className="text-xs text-slate-600">{alert.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {deltaInsights && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                        { key: "improved", label: "Améliorations", icon: TrendingUp, cls: "text-emerald-600 bg-emerald-50 border-emerald-200" },
                        { key: "degraded", label: "Dégradations", icon: TrendingDown, cls: "text-rose-600 bg-rose-50 border-rose-200" },
                        { key: "new", label: "Nouvelles problématiques", icon: AlertCircle, cls: "text-amber-600 bg-amber-50 border-amber-200" },
                        { key: "resolved", label: "Problèmes résolus", icon: CheckCircle2, cls: "text-blue-600 bg-blue-50 border-blue-200" },
                    ].map(({ key, label, icon: Icon, cls }) => {
                        const items = (deltaInsights as any)[key] as string[];
                        if (!items?.length) return null;
                        return (
                            <div key={key} className={cn("border rounded-lg p-4", cls.split(" ").filter(c => c.startsWith("bg-") || c.startsWith("border-")).join(" "))}>
                                <p className={cn("text-xs font-semibold mb-2 flex items-center gap-1.5", cls.split(" ").filter(c => c.startsWith("text-")).join(" "))}>
                                    <Icon className="w-3.5 h-3.5" /> {label}
                                </p>
                                <ul className="space-y-1">
                                    {items.map((item, i) => (
                                        <li key={i} className="text-sm text-slate-700 flex items-start gap-1.5">
                                            <span className="mt-1">•</span> {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        );
                    })}
                </div>
            )}

            {!deltaInsights && !trendAlerts?.length && (
                <p className="text-sm text-slate-400">Aucune analyse précédente disponible pour comparer les tendances.</p>
            )}
        </div>
    );
}

function ExpectedImpactsSection({ impacts }: { impacts: ExpectedImpact[] }) {
    if (!impacts?.length) return <p className="text-sm text-slate-400">Aucun impact projeté.</p>;
    return (
        <div className="space-y-3">
            {impacts.map((imp, i) => (
                <div key={i} className="border border-slate-200 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                        <p className="text-sm font-semibold text-slate-800">{imp.metric}</p>
                        <ConfidenceBadge score={imp.confidence} />
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                        <span className="text-slate-500">Actuel : <strong className="text-slate-700">{imp.current}</strong></span>
                        <ArrowRight className="w-4 h-4 text-primary-400" />
                        <span className="text-emerald-600">Projeté : <strong>{imp.projected}</strong></span>
                    </div>
                    <ScoreBar value={imp.confidence} colorClass="bg-primary-400" />
                </div>
            ))}
        </div>
    );
}

// ============================================
// HISTORY PANEL
// ============================================

function HistoryPanel({
    analyses,
    onSelect,
    selectedId,
}: {
    analyses: WeeklyAnalysis[];
    onSelect: (a: WeeklyAnalysis) => void;
    selectedId: string | null;
}) {
    return (
        <div className="space-y-2">
            {analyses.map((a) => (
                <button
                    key={a.id}
                    onClick={() => onSelect(a)}
                    className={cn(
                        "w-full text-left p-3 rounded-lg border transition-all hover:border-primary-300",
                        selectedId === a.id
                            ? "border-primary-400 bg-primary-50"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                    )}
                >
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-700">
                            {a.label || formatWeekLabel(a.weekStart, a.weekEnd)}
                        </span>
                        <span className={cn(
                            "inline-flex items-center text-xs px-1.5 py-0.5 rounded",
                            a.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                                a.status === "running" ? "bg-blue-100 text-blue-700" :
                                    "bg-rose-100 text-rose-700"
                        )}>
                            {a.status === "completed" ? <CheckCircle2 className="w-3.5 h-3.5" /> : a.status === "running" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                        </span>
                    </div>
                    {a.status === "completed" && (
                        <div className="flex items-center gap-3">
                            <div className="flex-1">
                                <div className="text-xs text-slate-400 mb-0.5">Confiance</div>
                                <ScoreBar value={a.confidenceScore} colorClass="bg-primary-400" />
                            </div>
                            <span className="text-xs text-slate-500 shrink-0">
                                {(a.dataSnapshot as any)?.meetingCount ?? "?"} RDV
                            </span>
                        </div>
                    )}
                </button>
            ))}
        </div>
    );
}

// ============================================
// MAIN PAGE
// ============================================

const TABS = [
    { key: "summary", label: "Résumé", icon: BookOpen },
    { key: "insights", label: "Insights", icon: Lightbulb },
    { key: "causes", label: "Causes", icon: Target },
    { key: "script", label: "Script", icon: FileText },
    { key: "icp", label: "ICP", icon: Users },
    { key: "objections", label: "Objections", icon: MessageSquare },
    { key: "coaching", label: "Coaching", icon: Award },
    { key: "recommendations", label: "Reco.", icon: Star },
    { key: "trends", label: "Tendances", icon: TrendingUp },
    { key: "impact", label: "Impact", icon: Zap },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function AnalyseIAPage() {
    const qc = useQueryClient();
    const [weekOffset, setWeekOffset] = useState(0);
    const [activeTab, setActiveTab] = useState<TabKey>("summary");
    const [selectedAnalysis, setSelectedAnalysis] = useState<WeeklyAnalysis | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [runLabel, setRunLabel] = useState("");

    const { weekStart, weekEnd } = getWeekBounds(weekOffset);

    // Fetch history
    const { data: historyData, isLoading: historyLoading } = useQuery({
        queryKey: ["analyse-ia-history"],
        queryFn: async () => {
            const res = await fetch("/api/analyse-ia/history?limit=20&status=completed");
            const json = await res.json();
            return json.data as { analyses: WeeklyAnalysis[]; pagination: any };
        },
        staleTime: 30_000,
    });
    const analyses = historyData?.analyses || [];

    // Run analysis mutation
    const runMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch("/api/analyse-ia/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    weekStart,
                    weekEnd,
                    label: runLabel || undefined,
                    missionIds: [],
                    clientIds: [],
                    sdrIds: [],
                }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || "Erreur lors de l'analyse");
            return json.data.analysis as WeeklyAnalysis;
        },
        onSuccess: (analysis) => {
            setSelectedAnalysis(analysis);
            setActiveTab("summary");
            qc.invalidateQueries({ queryKey: ["analyse-ia-history"] });
        },
    });

    // Feedback mutation
    const feedbackMutation = useMutation({
        mutationFn: async ({
            id,
            outcomes,
        }: {
            id: string;
            outcomes: WeeklyAnalysis["recommendationOutcomes"];
        }) => {
            const res = await fetch(`/api/analyse-ia/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recommendationOutcomes: outcomes }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            return json.data.analysis as WeeklyAnalysis;
        },
        onSuccess: (updated) => {
            setSelectedAnalysis(updated);
            qc.invalidateQueries({ queryKey: ["analyse-ia-history"] });
        },
    });

    const handleUpdateOutcome = useCallback(
        (recId: string, status: "applied" | "ignored" | "partial", outcomeText?: string) => {
            if (!selectedAnalysis) return;
            const existing = selectedAnalysis.recommendationOutcomes || [];
            const updated = [
                ...existing.filter((o) => o.recommendationId !== recId),
                {
                    recommendationId: recId,
                    status,
                    outcome: outcomeText,
                    appliedAt: new Date().toISOString(),
                },
            ];
            feedbackMutation.mutate({ id: selectedAnalysis.id, outcomes: updated });
        },
        [selectedAnalysis, feedbackMutation]
    );

    const displayedAnalysis = selectedAnalysis;
    const isRunning = runMutation.isPending;

    return (
        <div className="min-h-screen bg-slate-50">
            {/* ── Header ── */}
            <div className="bg-white border-b border-slate-200 px-6 py-5">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Brain className="w-6 h-6 text-primary-600" />
                                <h1 className="text-xl font-bold text-slate-900">Analyse IA</h1>
                                <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full font-semibold border border-primary-200">
                                    Hebdomadaire
                                </span>
                            </div>
                            <p className="text-sm text-slate-500">
                                Analyse de la semaine à partir des transcriptions, notes, RDV, ICP et scripts.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowHistory(h => !h)}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                                    showHistory
                                        ? "bg-primary-50 border-primary-300 text-primary-700"
                                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"
                                )}
                            >
                                <History className="w-4 h-4" />
                                Historique ({analyses.length})
                            </button>
                        </div>
                    </div>

                    {/* Week selector + Run button */}
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                            <button
                                onClick={() => setWeekOffset(o => o - 1)}
                                className="p-1.5 rounded hover:bg-white hover:shadow-sm transition-all"
                            >
                                <ChevronLeft className="w-4 h-4 text-slate-600" />
                            </button>
                            <div className="flex items-center gap-2 px-3">
                                <Calendar className="w-4 h-4 text-slate-500" />
                                <span className="text-sm font-medium text-slate-700 min-w-[200px] text-center">
                                    {formatWeekLabel(weekStart, weekEnd)}
                                    {weekOffset === 0 && (
                                        <span className="ml-2 text-xs bg-primary-100 text-primary-600 px-1.5 py-0.5 rounded">
                                            Cette semaine
                                        </span>
                                    )}
                                </span>
                            </div>
                            <button
                                onClick={() => setWeekOffset(o => Math.min(0, o + 1))}
                                disabled={weekOffset === 0}
                                className="p-1.5 rounded hover:bg-white hover:shadow-sm transition-all disabled:opacity-30"
                            >
                                <ChevronRight className="w-4 h-4 text-slate-600" />
                            </button>
                        </div>

                        <input
                            type="text"
                            placeholder="Label optionnel (ex: Mission Alpha S.15)"
                            value={runLabel}
                            onChange={(e) => setRunLabel(e.target.value)}
                            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white w-64 focus:outline-none focus:ring-2 focus:ring-primary-300"
                        />

                        <button
                            onClick={() => runMutation.mutate()}
                            disabled={isRunning}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm",
                                isRunning
                                    ? "bg-primary-400 text-white cursor-not-allowed"
                                    : "bg-primary-600 hover:bg-primary-700 text-white hover:shadow"
                            )}
                        >
                            {isRunning ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Analyse en cours…
                                </>
                            ) : (
                                <>
                                    <AiMark className="w-4 h-4" />
                                    Lancer l'analyse
                                </>
                            )}
                        </button>

                        {runMutation.isError && (
                            <span className="text-sm text-rose-600 flex items-center gap-1">
                                <AlertTriangle className="w-4 h-4" />
                                {(runMutation.error as Error)?.message || "Erreur"}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Body ── */}
            <div className="max-w-7xl mx-auto px-4 py-6">
                <div className={cn("flex gap-6", showHistory ? "" : "")}>
                    {/* History Sidebar */}
                    {showHistory && (
                        <div className="w-72 shrink-0">
                            <div className="bg-white border border-slate-200 rounded-xl p-4 sticky top-6">
                                <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                                    <History className="w-4 h-4 text-primary-500" />
                                    Historique des analyses
                                </p>
                                {historyLoading ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                                    </div>
                                ) : analyses.length === 0 ? (
                                    <p className="text-sm text-slate-400 text-center py-6">
                                        Aucune analyse pour le moment.
                                        <br />Lancez la première depuis le bouton ci-dessus.
                                    </p>
                                ) : (
                                    <HistoryPanel
                                        analyses={analyses}
                                        onSelect={setSelectedAnalysis}
                                        selectedId={displayedAnalysis?.id || null}
                                    />
                                )}
                            </div>
                        </div>
                    )}

                    {/* Main Content */}
                    <div className="flex-1 min-w-0">
                        {/* Loading state */}
                        {isRunning && (
                            <div className="bg-white border border-primary-200 rounded-xl p-8 text-center mb-6">
                                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Brain className="w-8 h-8 text-primary-600" />
                                </div>
                                <h3 className="text-lg font-semibold text-slate-800 mb-2">Analyse en cours…</h3>
                                <p className="text-sm text-slate-500 max-w-md mx-auto">
                                    Ingestion des données terrain → Vérification de cohérence → Analyse causale →
                                    Comparaison semaine précédente → Génération des recommandations
                                </p>
                                <div className="mt-4 space-y-2 max-w-xs mx-auto">
                                    {[
                                        "Collecte des actions, transcriptions, notes…",
                                        "Raisonnement multi-étapes en cours…",
                                        "Génération des recommandations…",
                                    ].map((step, i) => (
                                        <div key={i} className="flex items-center gap-2 text-sm text-slate-500">
                                            <Loader2 className="w-3 h-3 animate-spin text-primary-400 shrink-0" />
                                            {step}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* No analysis selected */}
                        {!displayedAnalysis && !isRunning && (
                            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
                                <div className="w-20 h-20 bg-primary-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
                                    <Brain className="w-10 h-10 text-primary-400" />
                                </div>
                                <h3 className="text-lg font-semibold text-slate-800 mb-2">
                                    Aucune analyse sélectionnée
                                </h3>
                                <p className="text-sm text-slate-500 max-w-lg mx-auto mb-6">
                                    Lancez une analyse hebdomadaire pour obtenir des recommandations priorisées
                                    basées sur vos transcriptions d'appels, notes d'action, fiches RDV et contexte ICP.
                                </p>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto text-left">
                                    {[
                                        { icon: Lightbulb, label: "Insights", desc: "Patterns & signaux faibles" },
                                        { icon: Target, label: "Causes racines", desc: "Pourquoi ça bloque" },
                                        { icon: FileText, label: "Script amélioré", desc: "Suggestions avec lift" },
                                        { icon: Shield, label: "Objections", desc: "Réponses proposées" },
                                    ].map(({ icon: Icon, label, desc }) => (
                                        <div key={label} className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                                            <Icon className="w-5 h-5 text-primary-500 mb-1.5" />
                                            <p className="text-sm font-semibold text-slate-700">{label}</p>
                                            <p className="text-xs text-slate-400">{desc}</p>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    onClick={() => runMutation.mutate()}
                                    className="mt-8 flex items-center gap-2 px-6 py-3 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-semibold transition-all shadow mx-auto"
                                >
                                    <AiMark className="w-4 h-4" />
                                    Lancer ma première analyse
                                </button>
                            </div>
                        )}

                        {/* Analysis Display */}
                        {displayedAnalysis && displayedAnalysis.status === "completed" && !isRunning && (
                            <div className="space-y-5">
                                {/* Analysis header */}
                                <div className="bg-primary-600 rounded-xl p-5 text-white">
                                    <div className="flex items-start justify-between gap-4 flex-wrap">
                                        <div>
                                            <p className="text-primary-200 text-xs font-semibold uppercase tracking-wider mb-1">Analyse hebdomadaire</p>
                                            <h2 className="text-lg font-bold">
                                                {displayedAnalysis.label || formatWeekLabel(displayedAnalysis.weekStart, displayedAnalysis.weekEnd)}
                                            </h2>
                                            <p className="text-primary-200 text-sm mt-0.5">
                                                {(displayedAnalysis.dataSnapshot as any)?.actionCount || 0} actions analysées ·{" "}
                                                {displayedAnalysis.durationMs ? `${Math.round(displayedAnalysis.durationMs / 1000)}s` : ""} ·{" "}
                                                {displayedAnalysis.tokensUsed ? `${displayedAnalysis.tokensUsed.toLocaleString()} tokens` : ""}
                                            </p>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-primary-200 text-xs">Confiance</span>
                                                <span className="text-lg font-bold">
                                                    {Math.round(displayedAnalysis.confidenceScore * 100)}%
                                                </span>
                                            </div>
                                            <div className="w-32 h-1.5 bg-primary-400/40 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-white rounded-full"
                                                    style={{ width: `${displayedAnalysis.confidenceScore * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Tabs */}
                                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                    <div className="flex overflow-x-auto border-b border-slate-200 scrollbar-hide">
                                        {TABS.map(({ key, label, icon: Icon }) => (
                                            <button
                                                key={key}
                                                onClick={() => setActiveTab(key)}
                                                className={cn(
                                                    "flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors shrink-0",
                                                    activeTab === key
                                                        ? "border-primary-600 text-primary-600 bg-primary-50/50"
                                                        : "border-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-50"
                                                )}
                                            >
                                                <Icon className="w-3.5 h-3.5" />
                                                {label}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="p-5">
                                        {activeTab === "summary" && (
                                            <ExecutiveSummarySection analysis={displayedAnalysis} />
                                        )}
                                        {activeTab === "insights" && (
                                            <TopInsightsSection insights={displayedAnalysis.topInsights} />
                                        )}
                                        {activeTab === "causes" && (
                                            <RootCausesSection causes={displayedAnalysis.rootCauses} />
                                        )}
                                        {activeTab === "script" && (
                                            <ScriptImprovementsSection improvements={displayedAnalysis.scriptImprovements} />
                                        )}
                                        {activeTab === "icp" && (
                                            <IcpRefinementsSection refinements={displayedAnalysis.icpRefinements} />
                                        )}
                                        {activeTab === "objections" && (
                                            <ObjectionHandlingSection objections={displayedAnalysis.objectionHandling} />
                                        )}
                                        {activeTab === "coaching" && (
                                            <SdrCoachingSection actions={displayedAnalysis.sdrCoachingActions} />
                                        )}
                                        {activeTab === "recommendations" && (
                                            <RecommendationsSection
                                                recommendations={displayedAnalysis.recommendations}
                                                outcomes={displayedAnalysis.recommendationOutcomes}
                                                onUpdateOutcome={handleUpdateOutcome}
                                            />
                                        )}
                                        {activeTab === "trends" && (
                                            <TrendSection analysis={displayedAnalysis} />
                                        )}
                                        {activeTab === "impact" && (
                                            <ExpectedImpactsSection impacts={displayedAnalysis.expectedImpacts} />
                                        )}
                                    </div>
                                </div>

                                {/* Next 7 days quick wins (from recommendations) */}
                                {displayedAnalysis.recommendations?.filter(r => r.priority === "P1").length > 0 && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                                        <p className="text-sm font-semibold text-amber-700 flex items-center gap-2 mb-3">
                                            <Zap className="w-4 h-4" />
                                            Actions prioritaires cette semaine
                                        </p>
                                        <div className="space-y-2">
                                            {displayedAnalysis.recommendations
                                                .filter(r => r.priority === "P1")
                                                .slice(0, 3)
                                                .map((rec) => (
                                                    <button
                                                        key={rec.id}
                                                        onClick={() => setActiveTab("recommendations")}
                                                        className="w-full flex items-center gap-3 text-left p-3 bg-white rounded-lg border border-amber-200 hover:border-amber-400 transition-colors"
                                                    >
                                                        <Star className="w-4 h-4 text-amber-500 shrink-0" />
                                                        <span className="text-sm text-slate-700 font-medium">{rec.title}</span>
                                                        <ArrowRight className="w-4 h-4 text-slate-400 ml-auto shrink-0" />
                                                    </button>
                                                ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Failed analysis */}
                        {displayedAnalysis && displayedAnalysis.status === "failed" && (
                            <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-center">
                                <XCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
                                <p className="text-sm font-semibold text-rose-700 mb-1">Analyse échouée</p>
                                <p className="text-xs text-rose-500">{(displayedAnalysis as any).errorMessage || "Erreur inconnue"}</p>
                                <button
                                    onClick={() => runMutation.mutate()}
                                    className="mt-4 px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 transition-colors"
                                >
                                    Réessayer
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
