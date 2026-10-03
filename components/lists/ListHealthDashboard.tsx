"use client";


import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    AlertTriangle, TrendingDown, TrendingUp,
    Search, Loader2,
    Target, Activity, PieChart, CalendarCheck,
    Clock, ChevronRight, Info, ChevronDown,
} from "lucide-react";
import Link from "next/link";
import {
    type ListHealthSummary,
    type ClientListsIntelligence,
    type HealthStatus,
    type StagnationAlert,
    HEALTH_THRESHOLDS,
} from "@/lib/types/health";
import {
    ProspectionHealthBadge,
    ActivityScoreBar,
    VelocityTrendBadge,
} from "./ProspectionHealthBadge";


// ============================================
// DATA FETCHING
// ============================================


async function fetchBulkHealth(params: {
    clientId?: string;
    missionId?: string;
    sdrIds?: string[];
}): Promise<ListHealthSummary[]> {
    const sp = new URLSearchParams();
    if (params.clientId) sp.set('clientId', params.clientId);
    if (params.missionId) sp.set('missionId', params.missionId);
    params.sdrIds?.forEach(id => sp.append('sdrIds[]', id));
    const res = await fetch(`/api/lists/health?${sp}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data as ListHealthSummary[];
}


async function fetchIntelligence(clientId: string, params: {
    sdrIds?: string[];
    from?: string;
    to?: string;
}): Promise<ClientListsIntelligence> {
    const sp = new URLSearchParams({ clientId });
    params.sdrIds?.forEach(id => sp.append('sdrIds[]', id));
    if (params.from) sp.set('from', params.from);
    if (params.to) sp.set('to', params.to);
    const res = await fetch(`/api/lists/intelligence?${sp}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    return json.data as ClientListsIntelligence;
}


// ============================================
// FILTER BAR
// ============================================


interface FilterState {
    search: string;
    status: HealthStatus | 'ACTIVE' | 'INACTIVE' | 'ALL';
    sdrId: string;
    missionId: string;
    sortBy: 'activityScore' | 'coverageRate' | 'daysSinceLastAction' | 'totalContacts';
}


function getCoverageTextColor(coverageRate: number): string {
    if (coverageRate >= 70) return "text-rose-600";
    if (coverageRate >= 50) return "text-amber-600";
    return "text-emerald-600";
}


// ============================================
// STAT CARD (mini)
// ============================================


function MiniStatCard({
    label,
    value,
    sub,
    color,
    icon,
}: {
    label: string;
    value: string | number;
    sub?: string;
    color: string;
    icon: React.ReactNode;
}) {
    return (
        <div className={`rounded-xl border p-4 ${color} bg-white`}>
            <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                {icon}
            </div>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </div>
    );
}


// ============================================
// STATUS DISTRIBUTION BAR
// ============================================


interface StatusCounts {
    totalLists: number;
    fullyProspectedCount: number;
    inProgressCount: number;
    atRiskCount: number;
    stalledCount: number;
    insufficientDataCount: number;
}


function StatusDistributionBar({ counts }: { counts: StatusCounts }) {
    const total = counts.totalLists;
    if (total === 0) return null;


    type StatusSegment = HealthStatus | 'ACTIVE' | 'INACTIVE';
    const segments: { count: number; status: StatusSegment }[] = [
        { count: counts.fullyProspectedCount + counts.inProgressCount, status: 'ACTIVE' },
        { count: counts.atRiskCount, status: 'AT_RISK' },
        { count: counts.stalledCount + counts.insufficientDataCount, status: 'INACTIVE' },
    ].filter(s => s.count > 0);


    const DOT_COLORS: Record<StatusSegment, string> = {
        ACTIVE: 'bg-emerald-500',
        INACTIVE: 'bg-slate-400',
        AT_RISK: 'bg-amber-400',
        STALLED: 'bg-rose-400',
        INSUFFICIENT_DATA: 'bg-slate-300',
        FULLY_PROSPECTED: 'bg-emerald-500',
        IN_PROGRESS: 'bg-emerald-500',
    };
    const BAR_COLORS: Record<StatusSegment, string> = {
        ACTIVE: 'bg-emerald-500',
        INACTIVE: 'bg-slate-300',
        AT_RISK: 'bg-amber-400',
        STALLED: 'bg-rose-400',
        INSUFFICIENT_DATA: 'bg-slate-200',
        FULLY_PROSPECTED: 'bg-emerald-500',
        IN_PROGRESS: 'bg-emerald-500',
    };


    const LABELS: Record<StatusSegment, string> = {
        ACTIVE: 'ACTIVE',
        INACTIVE: 'INACTIVE',
        AT_RISK: 'À risque',
        STALLED: 'Stagnante',
        INSUFFICIENT_DATA: 'Insuff.',
        FULLY_PROSPECTED: 'ACTIVE',
        IN_PROGRESS: 'ACTIVE',
    };


    return (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Distribution des statuts ({total} liste{total !== 1 ? 's' : ''})
            </p>
            <div className="flex h-3 rounded-full overflow-hidden gap-px">
                {segments.map(seg => (
                    <div
                        key={seg.status}
                        className={`${BAR_COLORS[seg.status]} transition-all`}
                        style={{ width: `${(seg.count / total) * 100}%` }}
                        title={`${LABELS[seg.status]}: ${seg.count}`}
                    />
                ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
                {segments.map(seg => (
                    <div key={seg.status} className="flex items-center gap-1.5 text-xs text-slate-600">
                        <span className={`w-2 h-2 rounded-full ${DOT_COLORS[seg.status]}`} />
                        <span>{LABELS[seg.status]}: <strong>{seg.count}</strong></span>
                    </div>
                ))}
            </div>
        </div>
    );
}


// ============================================
// STAGNATION ALERT CARD
// ============================================


function StagnationAlertCard({ alert }: { alert: StagnationAlert }) {
    const SEVERITY_STYLES = {
        CRITICAL: "bg-rose-50 border-rose-200 text-rose-700",
        HIGH: "bg-amber-50 border-amber-200 text-amber-700",
        MODERATE: "bg-yellow-50 border-yellow-200 text-yellow-700",
    };
    const SEVERITY_LABELS = {
        CRITICAL: "Critique",
        HIGH: "Élevé",
        MODERATE: "Modéré",
    };


    return (
        <div className={`flex items-center gap-3 p-3 rounded-lg border ${SEVERITY_STYLES[alert.severity]}`}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{alert.listName}</p>
                <p className="text-[10px] opacity-70 truncate">{alert.missionName}</p>
            </div>
            <div className="text-right flex-shrink-0">
                <p className="text-xs font-bold">{alert.daysSinceLastAction}j</p>
                <p className="text-[10px] opacity-70">{SEVERITY_LABELS[alert.severity]}</p>
            </div>
            <Link href={`/manager/lists/${alert.listId}`}>
                <ChevronRight className="w-4 h-4 opacity-50 hover:opacity-100" />
            </Link>
        </div>
    );
}


// ============================================
// PERFORMER CARD
// ============================================


function PerformerCard({
    summary,
    rank,
    variant,
}: {
    summary: ListHealthSummary;
    rank: number;
    variant: 'top' | 'bottom';
}) {
    const borderColor = variant === 'top' ? 'border-emerald-200' : 'border-rose-100';
    const rankColor = variant === 'top' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600';


    return (
        <Link
            href={`/manager/lists/${summary.listId}`}
            className={`block p-3 rounded-xl border ${borderColor} bg-white hover:shadow-sm transition-shadow`}
        >
            <div className="flex items-start gap-2.5">
                <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 ${rankColor}`}>
                    {rank}
                </span>
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{summary.listName}</p>
                    <p className="text-[10px] text-slate-400 truncate">{summary.missionName}</p>
                    <div className="mt-1.5 space-y-1">
                        <ActivityScoreBar score={summary.activityScore} size="sm" />
                        <div className="flex items-center gap-2">
                            <ProspectionHealthBadge
                                status={summary.status}
                                statusLabel={summary.statusLabel}
                                compact
                            />
                            {summary.coverageRate !== null && (
                                <span className={`text-[10px] font-semibold ${getCoverageTextColor(summary.coverageRate)}`}>
                                    {summary.coverageRate.toFixed(0)}% couverts
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </Link>
    );
}


// ============================================
// DENSE LIST ROW (compact, for mission cards)
// ============================================


function DenseListRow({ summary }: { summary: ListHealthSummary }) {
    return (
        <Link
            href={`/manager/lists/${summary.listId}`}
            className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_60px_60px_80px_80px] gap-2 px-3 py-2 hover:bg-slate-50 transition-colors group text-[10px]"
        >
            {/* List name */}
            <div className="flex items-center gap-1.5 min-w-0">
                <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-800 group-hover:text-primary-600 transition-colors truncate">
                        {summary.listName}
                    </p>
                </div>
            </div>

            {/* Health badge */}
            <div className="flex items-center">
                <ProspectionHealthBadge
                    status={summary.status}
                    statusLabel={summary.statusLabel}
                    compact
                />
            </div>

            {/* Coverage % */}
            <div className="flex items-center justify-center">
                {summary.coverageRate !== null ? (
                    <span className={`text-xs font-semibold ${getCoverageTextColor(summary.coverageRate)}`}>
                        {summary.coverageRate.toFixed(0)}%
                    </span>
                ) : (
                    <span className="text-slate-400">—</span>
                )}
            </div>

            {/* Actions 7d */}
            <div className="flex items-center justify-center">
                <span className="text-xs font-semibold text-slate-700">{summary.actions7d}</span>
            </div>

            {/* Velocity trend */}
            <div className="flex items-center justify-center">
                <VelocityTrendBadge
                    trend={summary.velocity.trend}
                    explanation={summary.velocity.trendExplanation}
                    showLabel={false}
                />
            </div>

            {/* ETA */}
            <div className="flex items-center justify-center">
                {summary.eta.etaDays !== null ? (
                    <span className="text-xs font-medium text-slate-600 tabular-nums">
                        {summary.eta.etaDays === 0 ? "Terminé" : `~${summary.eta.etaDays}j`}
                    </span>
                ) : (
                    <span className="text-slate-400">—</span>
                )}
            </div>
        </Link>
    );
}


// ============================================
// MISSION CARD (grouped lists)
// ============================================


function MissionCard({
    missionId,
    missionName,
    lists,
    isExpanded,
    onToggle,
}: {
    missionId: string;
    missionName: string;
    lists: ListHealthSummary[];
    isExpanded: boolean;
    onToggle: () => void;
}) {
    // Compute mission-level stats
    const activeCount = lists.filter(l => l.status === 'FULLY_PROSPECTED' || l.status === 'IN_PROGRESS').length;
    const atRiskCount = lists.filter(l => l.status === 'AT_RISK').length;
    const inactiveCount = lists.filter(l => l.status === 'STALLED' || l.status === 'INSUFFICIENT_DATA').length;
    const avgActivityScore = lists.length > 0
        ? Math.round(lists.reduce((sum, l) => sum + l.activityScore, 0) / lists.length)
        : 0;

    // Find worst status
    const statusPriority: Record<HealthStatus, number> = {
        INSUFFICIENT_DATA: 0,
        STALLED: 1,
        AT_RISK: 2,
        IN_PROGRESS: 3,
        FULLY_PROSPECTED: 4,
    };
    const worstStatus = lists.reduce((worst, l) =>
        statusPriority[l.status] < statusPriority[worst.status] ? l : worst
    );

    // Left border reflects the worst status for quick visual scanning
    const BORDER_BY_STATUS: Record<HealthStatus, string> = {
        STALLED: 'border-l-4 border-l-rose-400',
        AT_RISK: 'border-l-4 border-l-amber-400',
        INSUFFICIENT_DATA: 'border-l-4 border-l-slate-300',
        IN_PROGRESS: 'border-l-4 border-l-blue-400',
        FULLY_PROSPECTED: 'border-l-4 border-l-emerald-400',
    };
    const borderAccent = BORDER_BY_STATUS[worstStatus.status];

    return (
        <div className={`bg-white border border-slate-200 rounded-lg overflow-hidden ${borderAccent}`}>
            {/* Mission header */}
            <button
                onClick={onToggle}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-50 transition-colors border-b border-slate-100"
            >
                <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${
                        isExpanded ? '' : '-rotate-90'
                    }`}
                />
                <div className="flex-1 text-left min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{missionName}</p>
                </div>

                {/* Mission stats badges */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    {activeCount > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {activeCount} ACTIVE
                        </span>
                    )}
                    {atRiskCount > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            {atRiskCount} À risque
                        </span>
                    )}
                    {inactiveCount > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-50 text-slate-700 border border-slate-200">
                            {inactiveCount} INACTIVE
                        </span>
                    )}
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary-50 text-primary-700 border border-primary-200">
                        Score: {avgActivityScore}
                    </span>
                </div>
            </button>

            {/* Mission lists (expanded) */}
            {isExpanded && (
                <div className="divide-y divide-slate-100">
                    {/* Table header */}
                    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_60px_60px_80px_80px] gap-2 px-3 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                        <span>Liste</span>
                        <span>Santé</span>
                        <span className="text-center">Couverture</span>
                        <span className="text-center">Actions 7j</span>
                        <span className="text-center">Cadence</span>
                        <span className="text-center">ETA</span>
                    </div>

                    {/* List rows */}
                    {lists.map(summary => (
                        <DenseListRow key={summary.listId} summary={summary} />
                    ))}
                </div>
            )}
        </div>
    );
}


// ============================================
// MAIN DASHBOARD
// ============================================


interface ListHealthDashboardProps {
    /** If provided, shows intelligence for a specific client */
    clientId?: string;
    /** If provided, filters to a specific mission */
    missionId?: string;
    /** Available SDRs for filter */
    availableSdrs?: { id: string; name: string }[];
    /** Available missions for filter */
    availableMissions?: { id: string; name: string }[];
}


export function ListHealthDashboard({
    clientId,
    missionId: initialMissionId,
    availableSdrs = [],
    availableMissions = [],
}: ListHealthDashboardProps) {
    const [filters, setFilters] = useState<FilterState>({
        search: '',
        status: 'ALL',
        sdrId: '',
        missionId: initialMissionId ?? '',
        sortBy: 'activityScore',
    });

    // Track expanded/collapsed state for each mission
    const [expandedMissions, setExpandedMissions] = useState<Record<string, boolean>>({});

    // Determine query mode
    const useIntelligence = !!clientId;


    const intelligenceQuery = useQuery({
        queryKey: ['lists-intelligence', clientId, filters.sdrId],
        queryFn: () => fetchIntelligence(clientId!, {
            sdrIds: filters.sdrId ? [filters.sdrId] : undefined,
        }),
        enabled: useIntelligence,
        staleTime: 3 * 60 * 1000,
    });


    const bulkHealthQuery = useQuery({
        queryKey: ['lists-health-bulk', clientId, filters.missionId, filters.sdrId],
        queryFn: () => fetchBulkHealth({
            clientId,
            missionId: filters.missionId || undefined,
            sdrIds: filters.sdrId ? [filters.sdrId] : undefined,
        }),
        enabled: !useIntelligence || !intelligenceQuery.data,
        staleTime: 3 * 60 * 1000,
    });


    const intel = intelligenceQuery.data;
    const allSummaries: ListHealthSummary[] = intel?.lists ?? bulkHealthQuery.data ?? [];


    const isLoading = intelligenceQuery.isLoading || bulkHealthQuery.isLoading;


    // ── Aggregate stats derived locally when no client intelligence is loaded
    // (i.e. the "Santé Prospection" tab from the manager lists page).
    // Gives the manager view the same KPIs / distribution / alerts / top performers
    // as the per-client intelligence view, derived from the bulk summaries we
    // already have in memory — no extra roundtrip needed.
    const aggregateStats = useMemo(() => {
        if (intel || allSummaries.length === 0) return null;

        const total = allSummaries.length;
        const fullyProspected = allSummaries.filter(s => s.status === 'FULLY_PROSPECTED').length;
        const inProgress = allSummaries.filter(s => s.status === 'IN_PROGRESS').length;
        const atRisk = allSummaries.filter(s => s.status === 'AT_RISK').length;
        const stalled = allSummaries.filter(s => s.status === 'STALLED').length;
        const insufficientData = allSummaries.filter(s => s.status === 'INSUFFICIENT_DATA').length;

        const totalActions7d = allSummaries.reduce((sum, s) => sum + s.actions7d, 0);
        const totalTargets = allSummaries.reduce((sum, s) => sum + s.totalTargets, 0);
        const totalContactedTargets = allSummaries.reduce((sum, s) => sum + s.contactedTargets, 0);
        const overallCoverage = totalTargets > 0
            ? (totalContactedTargets / totalTargets) * 100
            : null;
        const totalContacts = allSummaries.reduce((sum, s) => sum + s.totalContacts, 0);
        const activeScoreSum = allSummaries.reduce((sum, s) => sum + s.activityScore, 0);
        const avgActivityScore = total > 0 ? Math.round(activeScoreSum / total) : 0;

        const topPerformers = [...allSummaries]
            .filter(s => !s.hasSparseData && s.activityScore > 0)
            .sort((a, b) => b.activityScore - a.activityScore)
            .slice(0, 3);

        const stagnationAlerts: StagnationAlert[] = allSummaries
            .filter(s =>
                s.daysSinceLastAction !== null &&
                s.daysSinceLastAction >= HEALTH_THRESHOLDS.STAGNATION_MODERATE_DAYS
            )
            .map(s => ({
                listId: s.listId,
                listName: s.listName,
                missionId: s.missionId,
                missionName: s.missionName,
                daysSinceLastAction: s.daysSinceLastAction!,
                lastActionAt: null,
                coverageRate: s.coverageRate,
                totalContacts: s.totalContacts,
                severity:
                    s.daysSinceLastAction! >= HEALTH_THRESHOLDS.STAGNATION_CRITICAL_DAYS
                        ? 'CRITICAL'
                        : s.daysSinceLastAction! >= HEALTH_THRESHOLDS.STAGNATION_HIGH_DAYS
                            ? 'HIGH'
                            : 'MODERATE',
            }))
            .sort((a, b) => b.daysSinceLastAction - a.daysSinceLastAction)
            .slice(0, 5);

        return {
            // StatusCounts-shaped (compatible with StatusDistributionBar)
            totalLists: total,
            fullyProspectedCount: fullyProspected,
            inProgressCount: inProgress,
            atRiskCount: atRisk,
            stalledCount: stalled,
            insufficientDataCount: insufficientData,
            // Aggregates
            totalActions7d,
            overallCoverage,
            totalContacts,
            avgActivityScore,
            // Rankings & alerts
            topPerformers,
            stagnationAlerts,
        };
    }, [intel, allSummaries]);


    // Apply client-side filters & sort
    const filteredSummaries = useMemo(() => {
        let items = [...allSummaries];


        if (filters.search) {
            const q = filters.search.toLowerCase();
            items = items.filter(
                s => s.listName.toLowerCase().includes(q) ||
                    s.missionName.toLowerCase().includes(q)
            );
        }


        if (filters.status !== 'ALL') {
            items = items.filter((s) => {
                if (filters.status === "ACTIVE") {
                    return s.status === "FULLY_PROSPECTED" || s.status === "IN_PROGRESS";
                }
                if (filters.status === "INACTIVE") {
                    return s.status === "STALLED" || s.status === "INSUFFICIENT_DATA";
                }
                return s.status === filters.status;
            });
        }


        if (filters.missionId && !initialMissionId) {
            items = items.filter(s => s.missionId === filters.missionId);
        }


        // Sort
        items.sort((a, b) => {
            switch (filters.sortBy) {
                case 'activityScore': return b.activityScore - a.activityScore;
                case 'coverageRate': return (b.coverageRate ?? -1) - (a.coverageRate ?? -1);
                case 'daysSinceLastAction': return (a.daysSinceLastAction ?? 999) - (b.daysSinceLastAction ?? 999);
                case 'totalContacts': return b.totalContacts - a.totalContacts;
                default: return 0;
            }
        });


        return items;
    }, [allSummaries, filters, initialMissionId]);


    // Group filtered summaries by mission
    const groupedByMission = useMemo(() => {
        const groups: Record<string, { missionName: string; lists: ListHealthSummary[] }> = {};

        filteredSummaries.forEach(summary => {
            if (!groups[summary.missionId]) {
                groups[summary.missionId] = {
                    missionName: summary.missionName,
                    lists: [],
                };
            }
            groups[summary.missionId].lists.push(summary);
        });

        return groups;
    }, [filteredSummaries]);

    // Initialize expanded state for all missions (default: expanded)
    useMemo(() => {
        const newExpanded: Record<string, boolean> = {};
        Object.keys(groupedByMission).forEach(missionId => {
            if (!(missionId in expandedMissions)) {
                newExpanded[missionId] = true;
            }
        });
        if (Object.keys(newExpanded).length > 0) {
            setExpandedMissions(prev => ({ ...prev, ...newExpanded }));
        }
    }, [groupedByMission]);

    const toggleMission = (missionId: string) => {
        setExpandedMissions(prev => ({
            ...prev,
            [missionId]: !prev[missionId],
        }));
    };


    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
                <p className="text-sm text-slate-500">Calcul des métriques de santé…</p>
                <p className="text-xs text-slate-400">Analyse des actions et contacts en cours</p>
            </div>
        );
    }


    if (allSummaries.length === 0) {
        return (
            <div className="text-center py-16">
                <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <Target className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-700">Aucune liste à analyser</p>
                <p className="text-xs text-slate-400 mt-1">Importez des contacts pour commencer la prospection.</p>
            </div>
        );
    }


    return (
        <div className="space-y-6">
            {/* ── Manager aggregate stats (no specific client) ── */}
            {!intel && aggregateStats && (
                <div className="space-y-4">
                    {/* KPI row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <MiniStatCard
                            label="Listes actives"
                            value={aggregateStats.fullyProspectedCount + aggregateStats.inProgressCount}
                            sub={`sur ${aggregateStats.totalLists} liste${aggregateStats.totalLists !== 1 ? 's' : ''}`}
                            color="border-emerald-200"
                            icon={<Target className="w-4 h-4 text-emerald-500" />}
                        />
                        <MiniStatCard
                            label="À surveiller"
                            value={aggregateStats.atRiskCount + aggregateStats.stalledCount}
                            sub={`${aggregateStats.atRiskCount} à risque · ${aggregateStats.stalledCount} stagnantes`}
                            color="border-rose-200"
                            icon={<AlertTriangle className="w-4 h-4 text-rose-500" />}
                        />
                        <MiniStatCard
                            label="Actions (7 jours)"
                            value={aggregateStats.totalActions7d}
                            sub={`Score moyen: ${aggregateStats.avgActivityScore}/100`}
                            color="border-blue-200"
                            icon={<Activity className="w-4 h-4 text-blue-500" />}
                        />
                        <MiniStatCard
                            label="Couverture globale"
                            value={aggregateStats.overallCoverage !== null
                                ? `${aggregateStats.overallCoverage.toFixed(1)}%`
                                : '—'
                            }
                            sub={`${aggregateStats.totalContacts} contact${aggregateStats.totalContacts !== 1 ? 's' : ''} suivis`}
                            color="border-primary-200"
                            icon={<PieChart className="w-4 h-4 text-primary-500" />}
                        />
                    </div>


                    {/* Status distribution */}
                    <StatusDistributionBar counts={aggregateStats} />


                    {/* Top performers + Stagnation alerts (two columns when both present) */}
                    {(aggregateStats.topPerformers.length > 0 || aggregateStats.stagnationAlerts.length > 0) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {aggregateStats.topPerformers.length > 0 && (
                                <div className="space-y-2">
                                    <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                                        <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
                                        Listes les plus actives
                                    </h3>
                                    {aggregateStats.topPerformers.map((s, i) => (
                                        <PerformerCard key={s.listId} summary={s} rank={i + 1} variant="top" />
                                    ))}
                                </div>
                            )}

                            {aggregateStats.stagnationAlerts.length > 0 && (
                                <div className="space-y-2">
                                    <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5 text-rose-500" />
                                        Alertes de stagnation ({aggregateStats.stagnationAlerts.length})
                                    </h3>
                                    {aggregateStats.stagnationAlerts.map(alert => (
                                        <StagnationAlertCard key={alert.listId} alert={alert} />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}


            {/* ── Intelligence stats (client view) ── */}
            {intel && (
                <div className="space-y-4">
                    {/* KPI row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <MiniStatCard
                            label="Couverture globale"
                            value={intel.overallCoverageRate !== null
                                ? `${intel.overallCoverageRate.toFixed(1)}%`
                                : '—'
                            }
                            sub={`${intel.totalContactedTargets} / ${intel.totalTargets} cibles`}
                            color="border-emerald-200"
                            icon={<Target className="w-4 h-4 text-emerald-500" />}
                        />
                        <MiniStatCard
                            label="Actions (7 jours)"
                            value={intel.totalActions7d}
                            sub={`${intel.totalActions} total`}
                            color="border-blue-200"
                            icon={<Activity className="w-4 h-4 text-blue-500" />}
                        />
                        <MiniStatCard
                            label="RDV générés"
                            value={intel.totalMeetings}
                            sub={`Toutes missions confondues`}
                            color="border-primary-200"
                            icon={<CalendarCheck className="w-4 h-4 text-primary-500" />}
                        />
                        <MiniStatCard
                            label="Listes à risque"
                            value={intel.atRiskCount + intel.stalledCount}
                            sub={`${intel.atRiskCount} à risque, ${intel.stalledCount} stagnantes`}
                            color="border-rose-200"
                            icon={<AlertTriangle className="w-4 h-4 text-rose-500" />}
                        />
                    </div>


                    {/* Status distribution */}
                    <StatusDistributionBar counts={intel} />


                    {/* Top/Bottom + Stagnation */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Top performers */}
                        {intel.topPerformers.length > 0 && (
                            <div className="space-y-2">
                                <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                                    <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
                                    Meilleures listes
                                </h3>
                                {intel.topPerformers.map((s, i) => (
                                    <PerformerCard key={s.listId} summary={s} rank={i + 1} variant="top" />
                                ))}
                            </div>
                        )}


                        {/* Bottom performers */}
                        {intel.bottomPerformers.length > 0 && (
                            <div className="space-y-2">
                                <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                                    <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                                    Listes sous-performantes
                                </h3>
                                {intel.bottomPerformers.map((s, i) => (
                                    <PerformerCard key={s.listId} summary={s} rank={i + 1} variant="bottom" />
                                ))}
                            </div>
                        )}


                        {/* Stagnation alerts */}
                        {intel.stagnationAlerts.length > 0 && (
                            <div className="space-y-2">
                                <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-rose-500" />
                                    Alertes de stagnation ({intel.stagnationAlerts.length})
                                </h3>
                                {intel.stagnationAlerts.slice(0, 5).map(alert => (
                                    <StagnationAlertCard key={alert.listId} alert={alert} />
                                ))}
                                {intel.stagnationAlerts.length > 5 && (
                                    <p className="text-[10px] text-slate-400 text-center">
                                        +{intel.stagnationAlerts.length - 5} autres alertes
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}


            {/* ── Filter bar ── */}
            <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 flex items-center gap-2 flex-wrap">
                {/* Search */}
                <div className="relative flex-1 min-w-32">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Rechercher une liste…"
                        value={filters.search}
                        onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                        className="w-full h-7 pl-8 pr-3 text-xs font-medium bg-slate-50 border border-transparent focus:bg-white focus:border-primary-400 rounded-md transition-all"
                    />
                </div>


                <div className="h-4 w-px bg-slate-200" />


                {/* Status filter */}
                {(['ALL', 'ACTIVE', 'AT_RISK', 'INACTIVE'] as const).map(s => (
                    <button
                        key={s}
                        onClick={() => setFilters(f => ({ ...f, status: s }))}
                        className={`px-2 py-1 rounded-md text-xs font-semibold transition-all ${
                            filters.status === s
                                ? 'bg-primary-50 text-primary-700 border border-primary-200'
                                : 'text-slate-500 hover:bg-slate-50 border border-transparent'
                        }`}
                    >
                        {s === 'ALL' ? 'Tous' :
                         s === 'ACTIVE' ? 'ACTIVE' :
                         s === 'AT_RISK' ? 'À risque' : 'INACTIVE'}
                    </button>
                ))}


                <div className="h-4 w-px bg-slate-200" />


                {/* Sort */}
                <select
                    value={filters.sortBy}
                    onChange={e => setFilters(f => ({ ...f, sortBy: e.target.value as FilterState['sortBy'] }))}
                    className="h-7 px-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-md text-slate-600"
                >
                    <option value="activityScore">Score d'activité</option>
                    <option value="coverageRate">Couverture</option>
                    <option value="daysSinceLastAction">Activité récente</option>
                    <option value="totalContacts">Taille</option>
                </select>


                <div className="flex-1" />
                <span className="text-xs font-medium text-slate-400">
                    {filteredSummaries.length} liste{filteredSummaries.length !== 1 ? 's' : ''}
                </span>
            </div>


            {/* ── Lists grouped by mission (dense cards) ── */}
            <div className="space-y-3">
                {filteredSummaries.length === 0 ? (
                    <div className="bg-white border border-slate-200 rounded-xl py-12 text-center text-sm text-slate-400">
                        Aucune liste ne correspond aux filtres sélectionnés.
                    </div>
                ) : (
                    Object.entries(groupedByMission)
                        .sort(([, a], [, b]) => {
                            // Sort missions by their best list's activity score (descending)
                            const maxScoreA = Math.max(...a.lists.map(l => l.activityScore), 0);
                            const maxScoreB = Math.max(...b.lists.map(l => l.activityScore), 0);
                            return maxScoreB - maxScoreA;
                        })
                        .map(([missionId, { missionName, lists }]) => (
                            <MissionCard
                                key={missionId}
                                missionId={missionId}
                                missionName={missionName}
                                lists={lists}
                                isExpanded={expandedMissions[missionId] ?? true}
                                onToggle={() => toggleMission(missionId)}
                            />
                        ))
                )}
            </div>


            {/* ── Legend / How it works ── */}
            <details className="group">
                <summary className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors list-none">
                    <Info className="w-3.5 h-3.5" />
                    Comment sont calculées ces métriques ?
                    <ChevronRight className="w-3.5 h-3.5 group-open:rotate-90 transition-transform" />
                </summary>
                <div className="mt-3 p-4 bg-slate-50 rounded-xl text-xs text-slate-600 space-y-3">
                    <div>
                        <p className="font-bold mb-1">Statut de santé</p>
                        <ul className="space-y-1 text-slate-500">
                            <li><strong className="text-emerald-600">ACTIVE</strong> — Regroupe les listes « Prospecté » et « En cours »</li>
                            <li><strong className="text-amber-600">À risque</strong> — Couverture &lt;{HEALTH_THRESHOLDS.AT_RISK_COVERAGE_MAX}% ET inactivité &gt;{HEALTH_THRESHOLDS.AT_RISK_INACTIVITY_DAYS} jours</li>
                            <li><strong className="text-slate-600">INACTIVE</strong> — Regroupe les listes stagnantes et les listes avec données insuffisantes</li>
                        </ul>
                    </div>
                    <div>
                        <p className="font-bold mb-1">Score d'activité (0–100)</p>
                        <ul className="space-y-1 text-slate-500">
                            <li>40% — Taux de couverture des cibles (contacts + entreprises)</li>
                            <li>20% — Intensité d'activité récente (7 jours)</li>
                            <li>20% — Taux de résultats positifs</li>
                            <li>20% — Tendance de cadence (hausse/stable/baisse)</li>
                        </ul>
                    </div>
                    <div>
                        <p className="font-bold mb-1">ETA (Estimation de fin)</p>
                        <p className="text-slate-500">
                            ETA = cibles restantes ÷ nouvelles cibles/jour (moyenne 7 jours).
                            La confiance est <em>HIGH</em> si la cadence est régulière sur 30 jours avec ≥20 actions.
                        </p>
                    </div>
                </div>
            </details>
        </div>
    );
}
