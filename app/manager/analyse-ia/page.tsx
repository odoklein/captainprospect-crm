"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
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
import { Tabs } from "@/components/ui/Tabs";

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
    // Local calendar days: toISOString() would shift them back a day east of UTC.
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { weekStart: iso(monday), weekEnd: iso(sunday) };
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
        pct >= 75 ? "text-success-ink bg-success-soft border-success-line" :
            pct >= 50 ? "text-warning-ink bg-warning-soft border-warning-line" :
                "text-danger-ink bg-danger-soft border-danger-line";
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
        P1: { label: "P1 Critique", cls: "bg-danger-soft text-danger-ink border-danger-line" },
        P2: { label: "P2 Important", cls: "bg-warning-soft text-warning-ink border-warning-line" },
        P3: { label: "P3 À planifier", cls: "bg-info-soft text-info-ink border-info-line" },
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
        HIGH: { label: "Impact élevé", cls: "bg-danger-soft text-danger-ink border-danger-line" },
        MEDIUM: { label: "Impact moyen", cls: "bg-warning-soft text-warning-ink border-warning-line" },
        LOW: { label: "Impact faible", cls: "bg-surface-2 text-ink-2 border-line" },
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
        CRITICAL: "bg-danger-soft text-danger-ink border-danger-line",
        HIGH: "bg-warning-soft text-warning-ink border-warning-line",
        MEDIUM: "bg-warning-soft text-warning-ink border-warning-line",
        LOW: "bg-surface-3 text-ink-2 border-line",
    };
    return (
        <span className={cn("inline-flex items-center rounded border text-xs font-medium px-2 py-0.5", config[severity])}>
            {severity}
        </span>
    );
}

function TrendIcon({ trend }: { trend: "UP" | "DOWN" | "STABLE" | "VOLATILE" }) {
    if (trend === "UP") return <ArrowUpRight className="w-4 h-4 text-success" />;
    if (trend === "DOWN") return <ArrowDownRight className="w-4 h-4 text-danger" />;
    if (trend === "VOLATILE") return <Activity className="w-4 h-4 text-warning" />;
    return <Minus className="w-4 h-4 text-ink-4" />;
}

function CitationList({ citations }: { citations: string[] }) {
    if (!citations?.length) return null;
    return (
        <div className="mt-3 border-l-2 border-primary-200 pl-3 space-y-1">
            {citations.map((c, i) => (
                <p key={i} className="text-xs text-ink-3 italic">"{c}"</p>
            ))}
        </div>
    );
}

function ScoreBar({ value, max = 1, colorClass = "bg-primary-500" }: { value: number; max?: number; colorClass?: string }) {
    return (
        <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden w-full">
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
        <div className="bg-surface border border-line rounded-xl overflow-hidden">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-2 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 text-primary-500" />
                    <span className="font-semibold text-ink">{title}</span>
                    {badge}
                </div>
                {open ? <ChevronUp className="w-4 h-4 text-ink-4" /> : <ChevronDown className="w-4 h-4 text-ink-4" />}
            </button>
            {open && <div className="border-t border-line-subtle px-5 py-4">{children}</div>}
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
                    { label: "RDV obtenus", value: snap.meetingCount ?? "–", icon: Calendar, color: "text-success-ink" },
                    { label: "Taux conversion", value: snap.conversionRate != null ? `${snap.conversionRate}%` : "–", icon: TrendingUp, color: "text-warning-ink" },
                    { label: "Appels", value: snap.callCount ?? "–", icon: BarChart2, color: "text-info-ink" },
                ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="bg-surface-2 rounded-lg p-3 border border-line">
                        <Icon className={cn("w-4 h-4 mb-1", color)} />
                        <div className="text-xl font-bold text-ink">{value}</div>
                        <div className="text-xs text-ink-3">{label}</div>
                    </div>
                ))}
            </div>

            {/* Confidence meters */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <div className="flex justify-between text-xs text-ink-3 mb-1">
                        <span>Confiance analyse</span>
                        <span>{Math.round(analysis.confidenceScore * 100)}%</span>
                    </div>
                    <ScoreBar
                        value={analysis.confidenceScore}
                        colorClass={
                            analysis.confidenceScore >= 0.7 ? "bg-success" :
                                analysis.confidenceScore >= 0.4 ? "bg-warning" : "bg-danger"
                        }
                    />
                </div>
                <div>
                    <div className="flex justify-between text-xs text-ink-3 mb-1">
                        <span>Qualité des données</span>
                        <span>{Math.round(analysis.dataQualityScore * 100)}%</span>
                    </div>
                    <ScoreBar
                        value={analysis.dataQualityScore}
                        colorClass={
                            analysis.dataQualityScore >= 0.7 ? "bg-info" :
                                analysis.dataQualityScore >= 0.4 ? "bg-warning" : "bg-danger"
                        }
                    />
                </div>
            </div>

            {/* Summary text */}
            <div className="prose prose-sm max-w-none text-ink-2 leading-relaxed whitespace-pre-line">
                {analysis.executiveSummary}
            </div>

            {/* Uncertainties */}
            {analysis.uncertainties?.length > 0 && (
                <div className="bg-warning-soft border border-warning-line rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4 text-warning-ink" />
                        <span className="text-sm font-semibold text-warning-ink">Incertitudes explicites</span>
                    </div>
                    <ul className="space-y-1">
                        {analysis.uncertainties.map((u, i) => (
                            <li key={i} className="text-sm text-warning-ink flex items-start gap-2">
                                <span className="text-warning mt-0.5">•</span>
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
    if (!insights?.length) return <p className="text-sm text-ink-4">Aucun insight disponible.</p>;
    return (
        <div className="space-y-3">
            {insights.map((ins, i) => (
                <div key={i} className="border border-line rounded-lg overflow-hidden">
                    <button
                        onClick={() => setExpanded(expanded === i ? null : i)}
                        className="w-full flex items-start gap-3 p-4 hover:bg-surface-2 text-left transition-colors"
                    >
                        <div className={cn(
                            "shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                            ins.impact === "HIGH" ? "bg-danger-soft text-danger-ink" :
                                ins.impact === "MEDIUM" ? "bg-warning-soft text-warning-ink" :
                                    "bg-surface-3 text-ink-2"
                        )}>{i + 1}</div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-ink">{ins.insight}</p>
                            <div className="flex items-center gap-2 mt-1">
                                <ImpactBadge impact={ins.impact} />
                                <ConfidenceBadge score={ins.confidence} />
                            </div>
                        </div>
                        {expanded === i ? <ChevronUp className="w-4 h-4 text-ink-4 shrink-0 mt-0.5" /> : <ChevronDown className="w-4 h-4 text-ink-4 shrink-0 mt-0.5" />}
                    </button>
                    {expanded === i && ins.evidence?.length > 0 && (
                        <div className="border-t border-line-subtle px-4 pb-4">
                            <CitationList citations={ins.evidence} />
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

function RootCausesSection({ causes }: { causes: RootCause[] }) {
    if (!causes?.length) return <p className="text-sm text-ink-4">Aucune cause racine identifiée.</p>;
    return (
        <div className="space-y-4">
            {causes.map((rc, i) => (
                <div key={i} className="border border-line rounded-lg p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-ink">{rc.cause}</p>
                        <div className="flex gap-2 shrink-0">
                            <SeverityBadge severity={rc.severity} />
                            <span className="text-xs bg-surface-3 text-ink-2 rounded px-2 py-0.5 border border-line">
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
    if (!improvements?.length) return <p className="text-sm text-ink-4">Aucune amélioration de script suggérée.</p>;
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
                                : "bg-surface text-ink-2 border-line hover:border-primary-300"
                        )}
                    >
                        {sectionLabels[imp.section] || imp.section}
                    </button>
                ))}
            </div>
            {/* Diff view */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-danger-soft border border-danger-line rounded-lg p-4">
                    <p className="text-xs font-semibold text-danger-ink mb-2 flex items-center gap-1.5">
                        <XCircle className="w-3.5 h-3.5" /> Version actuelle
                    </p>
                    <p className="text-sm text-danger-ink whitespace-pre-line">{imp.current || "Non spécifié"}</p>
                </div>
                <div className="bg-success-soft border border-success-line rounded-lg p-4">
                    <p className="text-xs font-semibold text-success-ink mb-2 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Version améliorée
                    </p>
                    <p className="text-sm text-success-ink whitespace-pre-line">{imp.suggested}</p>
                </div>
            </div>
            <div className="bg-info-soft border border-info-line rounded-lg p-4 space-y-2">
                <p className="text-xs font-semibold text-info-ink">Justification</p>
                <p className="text-sm text-info-ink">{imp.rationale}</p>
                <p className="text-xs text-info-ink font-medium mt-2">
                    <span className="font-semibold">Impact attendu :</span> {imp.expectedLift}
                </p>
            </div>
        </div>
    );
}

function IcpRefinementsSection({ refinements }: { refinements: IcpRefinement[] }) {
    if (!refinements?.length) return <p className="text-sm text-ink-4">Aucun affinement ICP suggéré.</p>;
    return (
        <div className="space-y-3">
            {refinements.map((ref, i) => (
                <div key={i} className="border border-line rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-primary-500">{ref.dimension}</span>
                        <ConfidenceBadge score={ref.confidence} />
                    </div>
                    <p className="text-sm text-ink-2"><span className="font-medium">Observation :</span> {ref.finding}</p>
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
    if (!objections?.length) return <p className="text-sm text-ink-4">Aucune objection analysée.</p>;
    const freqOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    const sorted = [...objections].sort((a, b) => freqOrder[a.frequency] - freqOrder[b.frequency]);
    return (
        <div className="space-y-2">
            {sorted.map((obj, i) => (
                <div key={i} className="border border-line rounded-lg overflow-hidden">
                    <button
                        onClick={() => setExpanded(expanded === i ? null : i)}
                        className="w-full flex items-center justify-between p-4 hover:bg-surface-2 text-left transition-colors"
                    >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                            <MessageSquare className="w-4 h-4 text-ink-4 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-ink">"{obj.objection}"</p>
                                <div className="flex gap-2 mt-1">
                                    <span className={cn(
                                        "text-xs px-2 py-0.5 rounded border font-medium",
                                        obj.frequency === "HIGH" ? "bg-danger-soft text-danger-ink border-danger-line" :
                                            obj.frequency === "MEDIUM" ? "bg-warning-soft text-warning-ink border-warning-line" :
                                                "bg-surface-2 text-ink-3 border-line"
                                    )}>
                                        {obj.frequency === "HIGH" ? "Fréquente" : obj.frequency === "MEDIUM" ? "Modérée" : "Rare"}
                                    </span>
                                </div>
                            </div>
                        </div>
                        {expanded === i ? <ChevronUp className="w-4 h-4 text-ink-4 shrink-0" /> : <ChevronDown className="w-4 h-4 text-ink-4 shrink-0" />}
                    </button>
                    {expanded === i && (
                        <div className="border-t border-line-subtle p-4 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {obj.currentResponse && (
                                    <div className="bg-surface-2 rounded p-3 border border-line">
                                        <p className="text-xs font-semibold text-ink-3 mb-1">Réponse actuelle</p>
                                        <p className="text-sm text-ink-2">{obj.currentResponse}</p>
                                    </div>
                                )}
                                <div className="bg-success-soft rounded p-3 border border-success-line">
                                    <p className="text-xs font-semibold text-success-ink mb-1">Réponse suggérée</p>
                                    <p className="text-sm text-success-ink">{obj.suggestedResponse}</p>
                                </div>
                            </div>
                            <p className="text-xs text-ink-3 italic">{obj.whyItWorks}</p>
                            <CitationList citations={obj.evidence} />
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

function SdrCoachingSection({ actions }: { actions: SdrCoachingAction[] }) {
    if (!actions?.length) return <p className="text-sm text-ink-4">Aucune action de coaching identifiée.</p>;
    return (
        <div className="space-y-3">
            {actions.map((action, i) => (
                <div key={i} className="border border-line rounded-lg p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            {action.sdrName && (
                                <p className="text-xs font-semibold text-primary-500 mb-0.5 flex items-center gap-1">
                                    <Users className="w-3 h-3" /> {action.sdrName}
                                </p>
                            )}
                            <p className="text-sm font-medium text-ink">{action.issue}</p>
                        </div>
                        <PriorityBadge priority={action.priority} />
                    </div>
                    <div className="bg-info-soft border border-info-line rounded p-3">
                        <p className="text-sm text-info-ink">
                            <span className="font-medium">Action :</span> {action.action}
                        </p>
                    </div>
                    <p className="text-xs text-ink-3">
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
    if (!recommendations?.length) return <p className="text-sm text-ink-4">Aucune recommandation générée.</p>;

    const getOutcome = (id: string) => outcomes?.find(o => o.recommendationId === id);

    return (
        <div className="space-y-3">
            {recommendations.map((rec) => {
                const outcome = getOutcome(rec.id);
                return (
                    <div key={rec.id} className={cn(
                        "border rounded-xl overflow-hidden transition-all",
                        outcome?.status === "applied" ? "border-success-line bg-success-soft/30" :
                            outcome?.status === "ignored" ? "border-line opacity-60" :
                                "border-line bg-surface"
                    )}>
                        <button
                            onClick={() => setExpanded(expanded === rec.id ? null : rec.id)}
                            className="w-full flex items-start gap-3 p-4 hover:bg-surface-2 text-left transition-colors"
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <PriorityBadge priority={rec.priority} />
                                    <span className="text-xs bg-surface-3 text-ink-2 rounded px-2 py-0.5 border border-line">
                                        {rec.category}
                                    </span>
                                    <ConfidenceBadge score={rec.confidenceScore} />
                                    {outcome?.status && (
                                        <span className={cn(
                                            "text-xs rounded px-2 py-0.5 border font-medium",
                                            outcome.status === "applied" ? "bg-success-soft text-success-ink border-success-line" :
                                                outcome.status === "partial" ? "bg-warning-soft text-warning-ink border-warning-line" :
                                                    "bg-surface-3 text-ink-3 border-line"
                                        )}>
                                            {outcome.status === "applied" ? "Appliqué" :
                                                outcome.status === "partial" ? "Partiel" : "Ignoré"}
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm font-semibold text-ink">{rec.title}</p>
                                <p className="text-xs text-ink-3 mt-0.5">{rec.expectedImpact}</p>
                            </div>
                            {expanded === rec.id ? <ChevronUp className="w-4 h-4 text-ink-4 shrink-0" /> : <ChevronDown className="w-4 h-4 text-ink-4 shrink-0" />}
                        </button>

                        {expanded === rec.id && (
                            <div className="border-t border-line-subtle px-4 pb-5 space-y-4">
                                <div>
                                    <p className="text-xs font-semibold text-ink-3 uppercase tracking-wider mb-2">Justification</p>
                                    <p className="text-sm text-ink-2">{rec.rationale}</p>
                                    <CitationList citations={rec.citations} />
                                </div>
                                {rec.actionSteps?.length > 0 && (
                                    <div>
                                        <p className="text-xs font-semibold text-ink-3 uppercase tracking-wider mb-2">Plan d'action</p>
                                        <ol className="space-y-1.5">
                                            {rec.actionSteps.map((step, i) => (
                                                <li key={i} className="flex items-start gap-2 text-sm text-ink-2">
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
                                <div className="pt-2 border-t border-line-subtle">
                                    <p className="text-xs text-ink-3 mb-2">Marquer comme :</p>
                                    <div className="flex gap-2 flex-wrap">
                                        {(["applied", "partial", "ignored"] as const).map((status) => (
                                            <button
                                                key={status}
                                                onClick={() => onUpdateOutcome(rec.id, status)}
                                                className={cn(
                                                    "text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors",
                                                    outcome?.status === status
                                                        ? status === "applied" ? "bg-success text-white border-success" :
                                                            status === "partial" ? "bg-warning text-white border-warning" :
                                                                "bg-ink-4 text-white border-ink-4"
                                                        : "bg-surface text-ink-2 border-line hover:border-line-strong"
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
                    {trendAlerts.map((alert, i) => (
                        <div key={i} className={cn(
                            "flex items-start gap-3 p-3 rounded-lg border",
                            alert.severity === "CRITICAL" ? "bg-danger-soft border-danger-line" :
                                alert.severity === "WARNING" ? "bg-warning-soft border-warning-line" :
                                    "bg-surface-2 border-line"
                        )}>
                            <TrendIcon trend={alert.trend} />
                            <div>
                                <p className="text-sm font-medium text-ink">{alert.metric}</p>
                                <p className="text-xs text-ink-2">{alert.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {deltaInsights && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                        { key: "improved", label: "Améliorations", icon: TrendingUp, cls: "text-success-ink bg-success-soft border-success-line" },
                        { key: "degraded", label: "Dégradations", icon: TrendingDown, cls: "text-danger-ink bg-danger-soft border-danger-line" },
                        { key: "new", label: "Nouvelles problématiques", icon: AlertCircle, cls: "text-warning-ink bg-warning-soft border-warning-line" },
                        { key: "resolved", label: "Problèmes résolus", icon: CheckCircle2, cls: "text-info-ink bg-info-soft border-info-line" },
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
                                        <li key={i} className="text-sm text-ink-2 flex items-start gap-1.5">
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
                <p className="text-sm text-ink-4">Aucune analyse précédente disponible pour comparer les tendances.</p>
            )}
        </div>
    );
}

function ExpectedImpactsSection({ impacts }: { impacts: ExpectedImpact[] }) {
    if (!impacts?.length) return <p className="text-sm text-ink-4">Aucun impact projeté.</p>;
    return (
        <div className="space-y-3">
            {impacts.map((imp, i) => (
                <div key={i} className="border border-line rounded-lg p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                        <p className="text-sm font-semibold text-ink">{imp.metric}</p>
                        <ConfidenceBadge score={imp.confidence} />
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                        <span className="text-ink-3">Actuel : <strong className="text-ink-2">{imp.current}</strong></span>
                        <ArrowRight className="w-4 h-4 text-primary-400" />
                        <span className="text-success-ink">Projeté : <strong>{imp.projected}</strong></span>
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
                            : "border-line bg-surface hover:bg-surface-2"
                    )}
                >
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-ink-2">
                            {a.label || formatWeekLabel(a.weekStart, a.weekEnd)}
                        </span>
                        <span className={cn(
                            "inline-flex items-center text-xs px-1.5 py-0.5 rounded",
                            a.status === "completed" ? "bg-success-soft text-success-ink" :
                                a.status === "running" ? "bg-info-soft text-info-ink" :
                                    "bg-danger-soft text-danger-ink"
                        )}>
                            {a.status === "completed" ? <CheckCircle2 className="w-3.5 h-3.5" /> : a.status === "running" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                        </span>
                    </div>
                    {a.status === "completed" && (
                        <div className="flex items-center gap-3">
                            <div className="flex-1">
                                <div className="text-xs text-ink-4 mb-0.5">Confiance</div>
                                <ScoreBar value={a.confidenceScore} colorClass="bg-primary-400" />
                            </div>
                            <span className="text-xs text-ink-3 shrink-0">
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
//
// Five tabs in the order a manager decides in: what happened (Synthèse), what to
// do (Actions), why (Diagnostic), what to say (Script), what changed (Évolution).
// The old page had ten tabs with the actions in eighth place, and opened on an empty
// state even when past analyses existed.
// ============================================

const TABS = [
    { id: "synthese", label: "Synthèse" },
    { id: "actions", label: "Actions" },
    { id: "diagnostic", label: "Diagnostic" },
    { id: "script", label: "Script" },
    { id: "evolution", label: "Évolution" },
] as const;

type TabKey = (typeof TABS)[number]["id"];

function Block({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <section>
            <div className="mb-3">
                <h3 className="text-sm font-extrabold tracking-tight text-ink">{title}</h3>
                {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
            </div>
            {children}
        </section>
    );
}

const CARD = "rounded-3xl border border-line bg-surface shadow-card";
const FIELD = "h-9 rounded-control border border-line bg-surface px-3 text-[13px] font-semibold text-ink shadow-2xs transition-colors hover:border-line-strong focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/15";

export default function AnalyseIAPage() {
    const qc = useQueryClient();
    const [weekOffset, setWeekOffset] = useState(0);
    const [activeTab, setActiveTab] = useState<TabKey>("synthese");
    const [picked, setPicked] = useState<WeeklyAnalysis | null>(null);
    const [runLabel, setRunLabel] = useState("");

    const { weekStart, weekEnd } = getWeekBounds(weekOffset);

    const { data: historyData, isLoading: historyLoading } = useQuery({
        queryKey: ["analyse-ia-history"],
        queryFn: async () => {
            const res = await fetch("/api/analyse-ia/history?limit=20&status=completed");
            const json = await res.json();
            return json.data as { analyses: WeeklyAnalysis[]; pagination: unknown };
        },
        staleTime: 30_000,
    });
    const analyses = historyData?.analyses || [];

    // What is shown: the analysis picked by hand, else the one of the selected week,
    // else the latest one — never an empty page while analyses exist.
    const ofWeek = analyses.find((a) => a.weekStart.slice(0, 10) === weekStart) ?? null;
    const displayed = picked ?? ofWeek ?? analyses[0] ?? null;

    const runMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch("/api/analyse-ia/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ weekStart, weekEnd, label: runLabel || undefined, missionIds: [], clientIds: [], sdrIds: [] }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || "Erreur lors de l'analyse");
            return json.data.analysis as WeeklyAnalysis;
        },
        onSuccess: (analysis) => {
            setPicked(analysis);
            setActiveTab("synthese");
            qc.invalidateQueries({ queryKey: ["analyse-ia-history"] });
        },
    });

    const feedbackMutation = useMutation({
        mutationFn: async ({ id, outcomes }: { id: string; outcomes: WeeklyAnalysis["recommendationOutcomes"] }) => {
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
            setPicked(updated);
            qc.invalidateQueries({ queryKey: ["analyse-ia-history"] });
        },
    });

    const handleUpdateOutcome = useCallback(
        (recId: string, status: "applied" | "ignored" | "partial", outcomeText?: string) => {
            if (!displayed) return;
            const existing = displayed.recommendationOutcomes || [];
            feedbackMutation.mutate({
                id: displayed.id,
                outcomes: [
                    ...existing.filter((o) => o.recommendationId !== recId),
                    { recommendationId: recId, status, outcome: outcomeText, appliedAt: new Date().toISOString() },
                ],
            });
        },
        [displayed, feedbackMutation],
    );

    const isRunning = runMutation.isPending;
    const priorities = (displayed?.recommendations ?? [])
        .filter((r) => r.priority === "P1" || r.priority === "P2")
        .sort((a, b) => a.priority.localeCompare(b.priority))
        .slice(0, 3);

    const changeWeek = (fn: (o: number) => number) => {
        setWeekOffset(fn);
        setPicked(null);
    };

    return (
        <div className="pb-16">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
                <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink-3">Pilotage</p>
                    <h1 className="text-2xl font-bold tracking-tight text-ink">Analyse IA</h1>
                    <p className="mt-1 max-w-2xl text-[13px] font-medium text-ink-3">
                        Bilan de la semaine à partir des transcriptions, notes d&apos;appels, RDV et scripts : ce qui bloque, ce qu&apos;il faut faire.
                        Pour une période libre, la synthèse rapide est dans <Link href="/manager/analytics?tab=ia" className="font-bold text-primary-700 hover:underline">Statistiques</Link>.
                    </p>
                </div>
            </div>

            {/* Controls: which week, which analysis, run */}
            <div className={cn(CARD, "mb-5 flex flex-wrap items-center gap-x-4 gap-y-3 p-4")}>
                <div className="inline-flex items-center gap-1 rounded-control border border-line bg-surface-3 p-1">
                    <button
                        type="button"
                        onClick={() => changeWeek((o) => o - 1)}
                        aria-label="Semaine précédente"
                        className="inline-flex size-7 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                        <ChevronLeft className="size-4" aria-hidden />
                    </button>
                    <span className="min-w-[210px] px-2 text-center text-[13px] font-bold text-ink">
                        {formatWeekLabel(weekStart, weekEnd)}
                        {weekOffset === 0 && <span className="ml-2 rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-bold text-primary-700">En cours</span>}
                    </span>
                    <button
                        type="button"
                        onClick={() => changeWeek((o) => Math.min(0, o + 1))}
                        disabled={weekOffset === 0}
                        aria-label="Semaine suivante"
                        className="inline-flex size-7 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-30"
                    >
                        <ChevronRight className="size-4" aria-hidden />
                    </button>
                </div>

                {analyses.length > 0 && (
                    <label className="flex items-center gap-2 text-xs font-semibold text-ink-3">
                        <History className="size-3.5" aria-hidden />
                        <span className="sr-only sm:not-sr-only">Analyse affichée</span>
                        <select
                            value={displayed?.id ?? ""}
                            onChange={(e) => setPicked(analyses.find((a) => a.id === e.target.value) ?? null)}
                            className={cn(FIELD, "max-w-[260px]")}
                        >
                            {analyses.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {a.label || formatWeekLabel(a.weekStart, a.weekEnd)}
                                </option>
                            ))}
                        </select>
                    </label>
                )}

                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <input
                        type="text"
                        placeholder="Nom de l'analyse (facultatif)"
                        aria-label="Nom de l'analyse"
                        value={runLabel}
                        onChange={(e) => setRunLabel(e.target.value)}
                        className={cn(FIELD, "w-56 font-medium placeholder:text-ink-4")}
                    />
                    <button
                        type="button"
                        onClick={() => runMutation.mutate()}
                        disabled={isRunning}
                        className="inline-flex h-9 items-center gap-2 rounded-control bg-primary px-4 text-[13px] font-bold text-primary-fg shadow-primary transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60"
                    >
                        {isRunning ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <AiMark className="size-4" aria-hidden />}
                        {isRunning ? "Analyse en cours…" : ofWeek ? "Relancer cette semaine" : "Analyser cette semaine"}
                    </button>
                </div>
                {runMutation.isError && (
                    <p className="flex w-full items-center gap-1.5 text-[13px] font-semibold text-danger-ink" role="alert">
                        <AlertTriangle className="size-4" aria-hidden />
                        {(runMutation.error as Error)?.message || "Erreur"}
                    </p>
                )}
            </div>

            {isRunning && (
                <div className={cn(CARD, "mb-5 flex items-center gap-4 p-6")} role="status">
                    <Loader2 className="size-6 shrink-0 animate-spin text-primary-600" aria-hidden />
                    <div>
                        <p className="text-sm font-bold text-ink">Analyse de la semaine en cours</p>
                        <p className="mt-0.5 text-xs text-ink-3">Lecture des appels, notes et RDV, puis comparaison avec la semaine précédente. Cela peut prendre une minute ou plus : la page se met à jour toute seule.</p>
                    </div>
                </div>
            )}

            {historyLoading && !displayed && (
                <div className="space-y-3" aria-busy>
                    <div className="h-28 animate-pulse rounded-3xl bg-surface-3" />
                    <div className="h-72 animate-pulse rounded-3xl bg-surface-3" />
                </div>
            )}

            {!historyLoading && !displayed && !isRunning && (
                <div className={cn(CARD, "px-6 py-14 text-center")}>
                    <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-accent-50 text-accent-700"><AiMark className="size-6" aria-hidden /></span>
                    <h2 className="mt-4 text-base font-extrabold text-ink">Aucune analyse pour le moment</h2>
                    <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-ink-3">
                        Lancez l&apos;analyse de la semaine pour obtenir un diagnostic, des recommandations classées par priorité et des actions de coaching par SDR.
                    </p>
                </div>
            )}

            {displayed?.status === "failed" && (
                <div className="rounded-3xl border border-danger-line bg-danger-soft p-6 text-center" role="alert">
                    <XCircle className="mx-auto size-8 text-danger" aria-hidden />
                    <p className="mt-2 text-sm font-bold text-danger-ink">Analyse échouée</p>
                    <p className="mt-1 text-xs text-danger-ink">{(displayed as unknown as { errorMessage?: string }).errorMessage || "Erreur inconnue"}</p>
                </div>
            )}

            {displayed && displayed.status === "completed" && (
                <div className={cn("space-y-4", isRunning && "opacity-50")}>
                    {/* What am I looking at */}
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-extrabold tracking-tight text-ink">
                                {displayed.label || formatWeekLabel(displayed.weekStart, displayed.weekEnd)}
                            </h2>
                            <p className="mt-0.5 text-xs font-medium text-ink-3">
                                {(displayed.dataSnapshot as { actionCount?: number } | null)?.actionCount ?? 0} actions analysées
                                {displayed.durationMs ? ` · ${Math.round(displayed.durationMs / 1000)} s de calcul` : ""}
                                {" · "}généré le {formatDate(displayed.createdAt)}
                            </p>
                        </div>
                        <ConfidenceBadge score={displayed.confidenceScore} size="md" />
                    </div>

                    <Tabs
                        tabs={TABS.map((t) => ({ id: t.id, label: t.label, badge: t.id === "actions" ? displayed.recommendations?.length || undefined : undefined }))}
                        activeTab={activeTab}
                        onTabChange={(id) => setActiveTab(id as TabKey)}
                    />

                    <div className={cn(CARD, "p-5 sm:p-6")}>
                        {activeTab === "synthese" && (
                            <div className="space-y-7">
                                <ExecutiveSummarySection analysis={displayed} />
                                {priorities.length > 0 && (
                                    <Block title="À faire en priorité" subtitle="Les recommandations les plus urgentes de cette analyse">
                                        <ul className="space-y-2">
                                            {priorities.map((rec) => (
                                                <li key={rec.id}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveTab("actions")}
                                                        className="flex w-full items-center gap-3 rounded-panel border border-line bg-surface-2/60 p-3 text-left transition-colors hover:border-line-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                                                    >
                                                        <PriorityBadge priority={rec.priority} />
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate text-[13px] font-bold text-ink">{rec.title}</span>
                                                            <span className="block truncate text-xs text-ink-3">{rec.expectedImpact}</span>
                                                        </span>
                                                        <ArrowRight className="size-4 shrink-0 text-ink-4" aria-hidden />
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    </Block>
                                )}
                                {displayed.trendAlerts && displayed.trendAlerts.length > 0 && (
                                    <Block title="Alertes de tendance">
                                        <TrendSection analysis={{ ...displayed, deltaInsights: null }} />
                                    </Block>
                                )}
                            </div>
                        )}

                        {activeTab === "actions" && (
                            <div className="space-y-8">
                                <Block title="Recommandations" subtitle="Marquez ce que vous avez appliqué : l'analyse suivante en tiendra compte">
                                    <RecommendationsSection recommendations={displayed.recommendations} outcomes={displayed.recommendationOutcomes} onUpdateOutcome={handleUpdateOutcome} />
                                </Block>
                                <Block title="Coaching par SDR">
                                    <SdrCoachingSection actions={displayed.sdrCoachingActions} />
                                </Block>
                                <Block title="Impact attendu" subtitle="Projection si les recommandations sont appliquées">
                                    <ExpectedImpactsSection impacts={displayed.expectedImpacts} />
                                </Block>
                            </div>
                        )}

                        {activeTab === "diagnostic" && (
                            <div className="space-y-8">
                                <Block title="Constats principaux">
                                    <TopInsightsSection insights={displayed.topInsights} />
                                </Block>
                                <Block title="Causes racines">
                                    <RootCausesSection causes={displayed.rootCauses} />
                                </Block>
                                <Block title="Objections rencontrées">
                                    <ObjectionHandlingSection objections={displayed.objectionHandling} />
                                </Block>
                                <Block title="Affinage de la cible (ICP)">
                                    <IcpRefinementsSection refinements={displayed.icpRefinements} />
                                </Block>
                            </div>
                        )}

                        {activeTab === "script" && <ScriptImprovementsSection improvements={displayed.scriptImprovements} />}
                        {activeTab === "evolution" && <TrendSection analysis={displayed} />}
                    </div>
                </div>
            )}
        </div>
    );
}
