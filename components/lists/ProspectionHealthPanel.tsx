"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    TrendingUp, Users, Gauge,
    Calendar, Target, AlertTriangle, CheckCircle2, Info,
    ChevronDown, ChevronUp, Loader2, HelpCircle,
} from "lucide-react";
import type { ListHealthMetrics, ActionableHint } from "@/lib/types/health";
import {
    ProspectionHealthBadge,
    VelocityTrendBadge,
    ConfidenceBadge,
    ActivityScoreBar,
} from "./ProspectionHealthBadge";

// ============================================
// DATA FETCHING
// ============================================

async function fetchListHealth(listId: string, sdrIds?: string[]): Promise<ListHealthMetrics> {
    const params = new URLSearchParams();
    if (sdrIds?.length) sdrIds.forEach(id => params.append('sdrIds[]', id));
    const res = await fetch(`/api/lists/${listId}/health?${params}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Erreur de chargement');
    return json.data as ListHealthMetrics;
}

// ============================================
// HINT ICON
// ============================================

function HintIcon({ type }: { type: ActionableHint['type'] }) {
    switch (type) {
        case 'POSITIVE': return <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />;
        case 'WARNING': return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />;
        case 'CRITICAL': return <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />;
        default: return <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />;
    }
}

const HINT_BG: Record<ActionableHint['type'], string> = {
    POSITIVE: "bg-emerald-50 border-emerald-200",
    WARNING: "bg-amber-50 border-amber-200",
    CRITICAL: "bg-rose-50 border-rose-200",
    INFO: "bg-blue-50 border-blue-200",
};

// ============================================
// METRIC ROW with tooltip
// ============================================

function MetricRow({
    label,
    value,
    tooltip,
    mono = false,
}: {
    label: string;
    value: React.ReactNode;
    tooltip?: string;
    mono?: boolean;
}) {
    return (
        <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
            <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-slate-500">{label}</span>
                {tooltip && (
                    <span title={tooltip}>
                        <HelpCircle className="w-3 h-3 text-slate-300 hover:text-slate-400 cursor-help" />
                    </span>
                )}
            </div>
            <span className={`text-xs font-semibold text-slate-800 ${mono ? "font-mono" : ""}`}>
                {value}
            </span>
        </div>
    );
}

// ============================================
// SDR CONTRIBUTION ROW
// ============================================

function SDRRow({
    sdrName,
    actionCount,
    contactsReached,
    meetingsBooked,
    rank,
}: {
    sdrName: string;
    actionCount: number;
    contactsReached: number;
    meetingsBooked: number;
    rank: number;
}) {
    return (
        <div className="flex items-center gap-3 py-1.5">
            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                {rank}
            </span>
            <span className="flex-1 text-xs font-medium text-slate-700 truncate">{sdrName}</span>
            <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="tabular-nums">{actionCount} act.</span>
                <span className="tabular-nums">{contactsReached} contacts</span>
                {meetingsBooked > 0 && (
                    <span className="text-emerald-600 font-semibold tabular-nums">{meetingsBooked} RDV</span>
                )}
            </div>
        </div>
    );
}

// ============================================
// COVERAGE PROGRESS BAR
// ============================================

function CoverageBar({
    contacted,
    total,
    rate,
}: {
    contacted: number;
    total: number;
    rate: number | null;
}) {
    const pct = rate ?? 0;
    const pctTextColor =
        pct >= 70 ? "text-rose-600" :
        pct >= 50 ? "text-amber-600" :
        "text-emerald-600";
    const barColor =
        pct >= 80 ? "bg-emerald-500" :
        pct >= 40 ? "bg-blue-500" :
        pct >= 20 ? "bg-amber-400" : "bg-rose-400";

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600">
                    {contacted} / {total} cibles prospectées
                </span>
                <span className={`font-bold ${pctTextColor}`}>{pct.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                    className={`${barColor} h-2 rounded-full transition-all duration-700`}
                    style={{ width: `${Math.max(pct > 0 ? 2 : 0, pct)}%` }}
                />
            </div>
        </div>
    );
}

// ============================================
// RESULT DISTRIBUTION BAR
// ============================================

function ResultDistributionBar({ breakdown, total }: {
    breakdown: ListHealthMetrics['resultBreakdown'];
    total: number;
}) {
    if (total === 0) return <span className="text-xs text-slate-400">Aucune action</span>;

    const segments = [
        { count: breakdown.meetings, color: "bg-emerald-500", label: "RDV" },
        { count: breakdown.positive - breakdown.meetings, color: "bg-teal-400", label: "Positif" },
        { count: breakdown.neutral, color: "bg-slate-300", label: "Neutre" },
        { count: breakdown.negative, color: "bg-amber-400", label: "Négatif" },
        { count: breakdown.badContact, color: "bg-rose-400", label: "KO" },
    ].filter(s => s.count > 0);

    return (
        <div className="space-y-2">
            <div className="flex h-2 rounded-full overflow-hidden gap-px">
                {segments.map(seg => (
                    <div
                        key={seg.label}
                        className={`${seg.color} transition-all`}
                        style={{ width: `${(seg.count / total) * 100}%` }}
                        title={`${seg.label}: ${seg.count} (${((seg.count / total) * 100).toFixed(1)}%)`}
                    />
                ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
                {segments.map(seg => (
                    <div key={seg.label} className="flex items-center gap-1 text-[10px] text-slate-500">
                        <span className={`w-2 h-2 rounded-sm ${seg.color}`} />
                        {seg.label}: {seg.count}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ============================================
// MAIN PANEL
// ============================================

interface ProspectionHealthPanelProps {
    listId: string;
    listName?: string;
    sdrIds?: string[];
    /** If true, renders an inline collapsed/expanded accordion */
    collapsible?: boolean;
    defaultExpanded?: boolean;
}

export function ProspectionHealthPanel({
    listId,
    listName,
    sdrIds,
    collapsible = false,
    defaultExpanded = true,
}: ProspectionHealthPanelProps) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const toggleExpanded = collapsible ? () => setExpanded(!expanded) : undefined;

    const { data: health, isLoading, error } = useQuery({
        queryKey: ["list-health", listId, sdrIds],
        queryFn: () => fetchListHealth(listId, sdrIds),
        staleTime: 2 * 60 * 1000, // 2 min
    });

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 py-4 text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">Calcul des métriques de santé…</span>
            </div>
        );
    }

    if (error || !health) {
        return (
            <div className="text-xs text-rose-500 py-2">
                Impossible de charger les métriques de santé.
            </div>
        );
    }

    const { eta } = health;

    return (
        <div className="space-y-4">
            {/* ── Header ── */}
            <div
                className={`flex items-center justify-between ${collapsible ? "cursor-pointer" : ""}`}
                onClick={toggleExpanded}
            >
                <div className="flex items-center gap-3">
                    <ProspectionHealthBadge
                        status={health.status}
                        statusLabel={health.statusLabel}
                        statusExplanation={health.statusExplanation}
                    />
                    <ActivityScoreBar
                        score={health.activityScore}
                        explanation={health.activityScoreExplanation}
                        size="md"
                    />
                    <span className="text-xs text-slate-400 font-medium">Score d'activité</span>
                </div>
                {collapsible && (
                    expanded
                        ? <ChevronUp className="w-4 h-4 text-slate-400" />
                        : <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
            </div>

            {(!collapsible || expanded) && (
                <>
                    {/* ── Sparse data / new list disclaimer ── */}
                    {(health.hasSparseData || health.isNewList) && (
                        <div className="flex items-start gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
                            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-slate-400" />
                            <span>
                                {health.isNewList
                                    ? "Liste récente — les prédictions seront disponibles après quelques jours d'activité."
                                    : `Données limitées (${health.totalTargets} cibles, ${health.totalActions} actions) — les métriques sont à titre indicatif.`
                                }
                            </span>
                        </div>
                    )}

                    {/* ── Coverage ── */}
                    <div className="bg-white border border-slate-100 rounded-xl p-4 space-y-3">
                        <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                            <Target className="w-3.5 h-3.5" />
                            Couverture
                        </h4>
                        <CoverageBar
                            contacted={health.contactedTargets}
                            total={health.totalTargets}
                            rate={health.coverageRate}
                        />
                        <div className="grid grid-cols-3 gap-3 pt-1">
                            <div className="text-center">
                                <p className="text-lg font-bold text-slate-900">{health.totalTargets}</p>
                                <p className="text-[10px] text-slate-400">Cibles totales</p>
                            </div>
                            <div className="text-center">
                                <p className="text-lg font-bold text-blue-600">{health.contactedTargets}</p>
                                <p className="text-[10px] text-slate-400">Cibles contactées</p>
                            </div>
                            <div className="text-center">
                                <p className="text-lg font-bold text-slate-500">{health.eta.remainingContacts}</p>
                                <p className="text-[10px] text-slate-400">Restants</p>
                            </div>
                        </div>
                    </div>

                    {/* ── ETA Prediction ── */}
                    <div className="bg-white border border-slate-100 rounded-xl p-4 space-y-3">
                        <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            Prédiction de fin de prospection
                        </h4>
                        {eta.etaDays !== null ? (
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-2xl font-bold text-slate-900">
                                        {eta.etaDays === 0 ? "Terminé" : `~${eta.etaDays} jours`}
                                    </p>
                                    {eta.etaDate && eta.etaDays > 0 && (
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Estimé le {new Date(eta.etaDate).toLocaleDateString('fr-FR', {
                                                day: 'numeric', month: 'long', year: 'numeric'
                                            })}
                                        </p>
                                    )}
                                </div>
                                <div className="text-right">
                                    <ConfidenceBadge
                                        confidence={eta.confidence}
                                        explanation={eta.confidenceExplanation}
                                    />
                                    <p className="text-[10px] text-slate-400 mt-0.5">Confiance</p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-slate-400 italic">
                                Prédiction impossible — cadence insuffisante.
                                <span className="block mt-0.5 text-slate-400">{eta.confidenceExplanation}</span>
                            </p>
                        )}
                        <div className="pt-1 border-t border-slate-100">
                            <p className="text-[10px] text-slate-400">
                                Formule : cibles restantes ÷ nouvelles cibles/jour (7j)
                            </p>
                        </div>
                    </div>

                    {/* ── Velocity ── */}
                    <div className="bg-white border border-slate-100 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                                <Gauge className="w-3.5 h-3.5" />
                                Cadence
                            </h4>
                            <VelocityTrendBadge
                                trend={health.velocity.trend}
                                explanation={health.velocity.trendExplanation}
                                showLabel
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-slate-50 rounded-lg p-3">
                                <p className="text-xs text-slate-400 mb-1">7 derniers jours</p>
                                <p className="text-xl font-bold text-slate-900">
                                    {health.velocity.actionsPerDay7d.toFixed(1)}
                                </p>
                                <p className="text-[10px] text-slate-500">actions / jour</p>
                                <p className="text-[10px] text-slate-500 mt-0.5">
                                    {health.velocity.newContactsPerDay7d.toFixed(2)} contacts / jour
                                </p>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3">
                                <p className="text-xs text-slate-400 mb-1">30 derniers jours</p>
                                <p className="text-xl font-bold text-slate-900">
                                    {health.velocity.actionsPerDay30d.toFixed(1)}
                                </p>
                                <p className="text-[10px] text-slate-500">actions / jour</p>
                                <p className="text-[10px] text-slate-500 mt-0.5">
                                    {health.velocity.newContactsPerDay30d.toFixed(2)} contacts / jour
                                </p>
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-400">{health.velocity.trendExplanation}</p>
                    </div>

                    {/* ── Activity & Results ── */}
                    <div className="bg-white border border-slate-100 rounded-xl p-4 space-y-3">
                        <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                            <TrendingUp className="w-3.5 h-3.5" />
                            Activité & Résultats
                        </h4>
                        <div>
                            <MetricRow
                                label="Actions total"
                                value={health.totalActions}
                                tooltip="Nombre total d'actions (appels, emails, LinkedIn) enregistrées sur cette liste"
                            />
                            <MetricRow
                                label="Actions (7j)"
                                value={health.actions7d}
                                tooltip="Actions sur les 7 derniers jours"
                            />
                            <MetricRow
                                label="Actions (30j)"
                                value={health.actions30d}
                                tooltip="Actions sur les 30 derniers jours"
                            />
                            {health.daysSinceLastAction !== null && (
                                <MetricRow
                                    label="Dernière activité"
                                    value={
                                        health.daysSinceLastAction === 0
                                            ? "Aujourd'hui"
                                            : health.daysSinceLastAction === 1
                                            ? "Hier"
                                            : `Il y a ${health.daysSinceLastAction} jours`
                                    }
                                    tooltip={health.lastActionAt
                                        ? new Date(health.lastActionAt).toLocaleString('fr-FR')
                                        : undefined
                                    }
                                />
                            )}
                            {health.positiveRate !== null && (
                                <MetricRow
                                    label="Taux positif"
                                    value={`${health.positiveRate.toFixed(1)}%`}
                                    tooltip="Ratio : (Intéressés + RDV + Rappels) / total actions"
                                />
                            )}
                            {health.meetingRate !== null && (
                                <MetricRow
                                    label="Taux de RDV"
                                    value={`${health.meetingRate.toFixed(1)}%`}
                                    tooltip="Ratio : MEETING_BOOKED / total actions"
                                />
                            )}
                            {health.badContactRate !== null && (
                                <MetricRow
                                    label="Contacts invalides"
                                    value={`${health.badContactRate.toFixed(1)}%`}
                                    tooltip="Numéros KO, mauvais interlocuteurs, contacts invalides"
                                />
                            )}
                        </div>

                        {health.totalActions > 0 && (
                            <div className="pt-2 border-t border-slate-100">
                                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                    Distribution des résultats
                                </p>
                                <ResultDistributionBar
                                    breakdown={health.resultBreakdown}
                                    total={health.totalActions}
                                />
                            </div>
                        )}
                    </div>

                    {/* ── SDR Breakdown ── */}
                    {health.topSdrs.length > 0 && (
                        <div className="bg-white border border-slate-100 rounded-xl p-4 space-y-3">
                            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5" />
                                SDRs actifs ({health.uniqueSdrCount})
                            </h4>
                            <div className="divide-y divide-slate-50">
                                {health.topSdrs.map((sdr, i) => (
                                    <SDRRow
                                        key={sdr.sdrId}
                                        rank={i + 1}
                                        sdrName={sdr.sdrName}
                                        actionCount={sdr.actionCount}
                                        contactsReached={sdr.contactsReached}
                                        meetingsBooked={sdr.meetingsBooked}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Actionable Hints ── */}
                    {health.hints.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Recommandations
                            </h4>
                            {health.hints.map((hint, i) => (
                                <div
                                    key={i}
                                    className={`flex items-start gap-2 p-3 rounded-lg border ${HINT_BG[hint.type]}`}
                                >
                                    <HintIcon type={hint.type} />
                                    <div className="min-w-0">
                                        <p className="text-xs font-medium text-slate-700">{hint.message}</p>
                                        {hint.detail && (
                                            <p className="text-[10px] text-slate-500 mt-0.5">{hint.detail}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── Status explanation footer ── */}
                    <div className="flex items-start gap-2 p-2.5 bg-slate-50 rounded-lg text-[10px] text-slate-400">
                        <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span>
                            Statut : <strong className="text-slate-500">{health.statusLabel}</strong>
                            {" — "}{health.statusExplanation}
                        </span>
                    </div>

                    <p className="text-[10px] text-slate-300 text-right">
                        Calculé le {new Date(health.computedAt).toLocaleString('fr-FR')}
                    </p>
                </>
            )}
        </div>
    );
}
