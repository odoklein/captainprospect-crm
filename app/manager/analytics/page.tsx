"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
    Calendar, Download, RefreshCw, Target, User, Briefcase, TrendingUp, X, Phone, Clock, Search,
    Activity, BrainCircuit, Zap, Flame, Trophy, Play, CheckCircle2, LayoutDashboard, Sparkles, FileText, Loader2, List,
    BarChart3, GitCompare, ChevronDown, ChevronUp, AlertTriangle, ThumbsUp, ThumbsDown, PhoneOff, PhoneMissed, UserX, Mail, ArrowRight
} from "lucide-react";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
    BarChart, Bar, Cell
} from "recharts";
import { cn } from "@/lib/utils";
import { ACTION_RESULT_LABELS } from "@/lib/types";
import { DataTable } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui";

const SDR_COLORS: Record<string, string> = {
    'Mathieu Deville': '#7C5CFC', // updated to violet
    'Rayan': '#059669', // emerald
    'Anaïs': '#A78BFA', // lighter violet
};
const getSdrColor = (name: string) => SDR_COLORS[name] || '#94A3B8';

type AiAnalysis = {
    executiveSummary: string;
    keyInsights: string[];
    objectionClusters: Array<{
        objection: string;
        frequency: "LOW" | "MEDIUM" | "HIGH";
        whyItHappens: string;
        recommendedResponse: string;
    }>;
    disqualificationCauses: Array<{
        cause: string;
        signalInNotes: string;
        correctiveAction: string;
    }>;
    recommendations: Array<{
        title: string;
        priority: "P1" | "P2" | "P3";
        expectedImpact: string;
        actionPlan: string;
    }>;
    next7DaysPlan: string[];
};

function toLocalISODate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export default function AnalyticsPage() {
    // Filters State
    const [dateRange, setDateRange] = useState(() => {
        const today = toLocalISODate(new Date());
        return { from: today, to: today };
    });
    const [selectedSdrs, setSelectedSdrs] = useState<string[]>([]);
    const [selectedMissions, setSelectedMissions] = useState<string[]>([]);
    const [selectedClients, setSelectedClients] = useState<string[]>([]);
    const [selectedLists, setSelectedLists] = useState<string[]>([]);

    // Data State
    const [stats, setStats] = useState<any>(null);
    const [missions, setMissions] = useState<any[]>([]);
    const [sdrs, setSdrs] = useState<any[]>([]);
    const [clients, setClients] = useState<any[]>([]);
    const [lists, setLists] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Actions State for the Journal
    const [actions, setActions] = useState<any[]>([]);
    const [isLoadingActions, setIsLoadingActions] = useState(true);
    const [journalFilter, setJournalFilter] = useState<string>('all');

    // AI Recap State
    const [aiRecap, setAiRecap] = useState<string | null>(null);
    const [aiAnalysis, setAiAnalysis] = useState<AiAnalysis | null>(null);
    const [aiRecapExtras, setAiRecapExtras] = useState<Array<{ id: string; label: string; answer: string }>>([]);
    const [isLoadingAiRecap, setIsLoadingAiRecap] = useState(false);
    const [isLoadingFollowUp, setIsLoadingFollowUp] = useState<string | null>(null);

    // Phase-by-phase AI analysis
    const [aiPhase, setAiPhase] = useState<number>(0); // 0=idle, 1=collecting, 2=statuses, 3=notes, 4=recommendations, 5=done
    const [showFullRecap, setShowFullRecap] = useState(false);
    const [expandedStatusCode, setExpandedStatusCode] = useState<string | null>(null);

    // Status labels from mission config (or global fallback)
    const defaultColors: Record<string, string> = {
        NO_RESPONSE: "#60a5fa", BAD_CONTACT: "#a78bfa", INTERESTED: "#f59e0b",
        CALLBACK_REQUESTED: "#f59e0b", MEETING_BOOKED: "#10b981",
        MEETING_CANCELLED: "#94a3b8", DISQUALIFIED: "#ef4444",
        ENVOIE_MAIL: "#94a3b8", NOT_INTERESTED: "#94a3b8",
    };
    const [statusLabelMap, setStatusLabelMap] = useState<Record<string, string>>(ACTION_RESULT_LABELS);
    const [statusColorMap, setStatusColorMap] = useState<Record<string, string>>(defaultColors);

    // Persona / Target Intelligence
    const [personaData, setPersonaData] = useState<any>(null);
    const [isLoadingPersona, setIsLoadingPersona] = useState(false);
    const [personaDimension, setPersonaDimension] = useState<'byFunction' | 'byCompanySize' | 'bySector' | 'byGeography' | 'byCampaign'>('byFunction');
    const [personaMetric, setPersonaMetric] = useState<'conversion' | 'calls' | 'meetings'>('conversion');
    const [compareMode, setCompareMode] = useState<'none' | 'lists' | 'missions'>('none');
    const [compareListA, setCompareListA] = useState<string>('');
    const [compareListB, setCompareListB] = useState<string>('');
    const [compareMissionA, setCompareMissionA] = useState<string[]>([]);
    const [compareMissionB, setCompareMissionB] = useState<string[]>([]);

    // Report modal
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportType, setReportType] = useState<'daily' | 'weekly' | 'custom'>('weekly');
    const [reportDate, setReportDate] = useState(() => toLocalISODate(new Date()));
    const [reportDateFrom, setReportDateFrom] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 6);
        return toLocalISODate(d);
    });
    const [reportDateTo, setReportDateTo] = useState(() => toLocalISODate(new Date()));
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);

    // Fetch Reference Data
    useEffect(() => {
        const fetchRefs = async () => {
            try {
                const listUrl = selectedMissions.length === 1
                    ? `/api/lists?missionId=${selectedMissions[0]}&limit=200`
                    : '/api/lists?limit=200';
                const [mRes, sRes, cRes, lRes] = await Promise.all([
                    fetch('/api/missions?isActive=true'),
                    fetch('/api/users?role=SDR,BUSINESS_DEVELOPER&limit=100'),
                    fetch('/api/clients?limit=100'),
                    fetch(listUrl)
                ]);
                const [mJson, sJson, cJson, lJson] = await Promise.all([mRes.json(), sRes.json(), cRes.json(), lRes.json()]);

                if (mJson.success) setMissions(mJson.data || []);
                if (sJson.success) setSdrs(sJson.data?.users || sJson.users || []);
                if (cJson.success) setClients(cJson.data || []);
                if (lJson.success) setLists(lJson.data || []);
            } catch (err) {
                console.error("Refs fetch error:", err);
            }
        };
        fetchRefs();
    }, [selectedMissions]);

    // Fetch Stats Data
    const fetchStats = async () => {
        setIsRefreshing(true);
        try {
            const params = new URLSearchParams();
            params.set('from', dateRange.from);
            params.set('to', dateRange.to);
            selectedSdrs.forEach(id => params.append('sdrIds[]', id));
            selectedMissions.forEach(id => params.append('missionIds[]', id));
            selectedClients.forEach(id => params.append('clientIds[]', id));
            selectedLists.forEach(id => params.append('listIds[]', id));

            const res = await fetch(`/api/analytics/stats?${params.toString()}`);
            const json = await res.json();
            if (json.success) {
                setStats(json.data);
            }
        } catch (err) {
            console.error("Stats fetch error:", err);
        } finally {
            setIsRefreshing(false);
            setIsLoading(false);
        }
    };

    // Fetch Actions Data (Journal)
    const fetchActions = async () => {
        setIsLoadingActions(true);
        try {
            const params = new URLSearchParams();
            params.set('from', dateRange.from);
            params.set('to', dateRange.to);
            params.set('limit', '500');
            selectedSdrs.forEach(id => params.append('sdrIds[]', id));
            selectedMissions.forEach(id => params.append('missionIds[]', id));
            selectedClients.forEach(id => params.append('clientIds[]', id));
            selectedLists.forEach(id => params.append('listIds[]', id));

            const res = await fetch(`/api/analytics/actions?${params.toString()}`);
            const json = await res.json();
            if (json.success) {
                setActions(json.data);
            }
        } catch (err) {
            console.error("Actions fetch error:", err);
        } finally {
            setIsLoadingActions(false);
        }
    };

    useEffect(() => {
        fetchStats();
        fetchActions();
    }, [dateRange, selectedSdrs, selectedMissions, selectedClients, selectedLists]);

    // Fetch Persona / Target Intelligence
    const fetchPersona = useCallback(async () => {
        setIsLoadingPersona(true);
        try {
            const params = new URLSearchParams();
            params.set('from', dateRange.from);
            params.set('to', dateRange.to);
            selectedSdrs.forEach(id => params.append('sdrIds[]', id));
            if (compareMode === 'none') {
                selectedMissions.forEach(id => params.append('missionIds[]', id));
                selectedLists.forEach(id => params.append('listIds[]', id));
            } else if (compareMode === 'lists' && selectedMissions.length === 1 && compareListA && compareListB) {
                params.set('compareListA', compareListA);
                params.set('compareListB', compareListB);
                params.append('missionIds[]', selectedMissions[0]);
            } else if (compareMode === 'missions' && compareMissionA.length > 0 && compareMissionB.length > 0) {
                compareMissionA.forEach(id => params.append('compareMissionA[]', id));
                compareMissionB.forEach(id => params.append('compareMissionB[]', id));
            }
            const res = await fetch(`/api/analytics/persona?${params.toString()}`);
            const json = await res.json();
            if (json.success) setPersonaData(json.data);
            else setPersonaData(null);
        } catch (err) {
            console.error("Persona fetch error:", err);
            setPersonaData(null);
        } finally {
            setIsLoadingPersona(false);
        }
    }, [dateRange, selectedSdrs, selectedMissions, selectedLists, compareMode, compareListA, compareListB, compareMissionA, compareMissionB]);

    useEffect(() => {
        const shouldFetch = compareMode === 'none'
            || (compareMode === 'lists' && selectedMissions.length === 1 && compareListA && compareListB)
            || (compareMode === 'missions' && compareMissionA.length > 0 && compareMissionB.length > 0);
        if (shouldFetch) fetchPersona();
        else setPersonaData(null);
    }, [fetchPersona, compareMode, selectedMissions.length, compareListA, compareListB, compareMissionA.length, compareMissionB.length]);

    // Fetch mission-specific status labels when a single mission is selected
    useEffect(() => {
        const missionId = selectedMissions.length === 1 ? selectedMissions[0] : undefined;
        if (!missionId) {
            setStatusLabelMap(ACTION_RESULT_LABELS);
            setStatusColorMap(defaultColors);
            return;
        }
        fetch(`/api/config/action-statuses?missionId=${missionId}`)
            .then((res) => res.json())
            .then((json) => {
                if (json.success && json.data?.statuses) {
                    const labels: Record<string, string> = { ...ACTION_RESULT_LABELS };
                    const colors: Record<string, string> = { ...defaultColors };
                    for (const s of json.data.statuses) {
                        labels[s.code] = s.label || s.code;
                        colors[s.code] = s.color || defaultColors[s.code] || "#94a3b8";
                    }
                    setStatusLabelMap(labels);
                    setStatusColorMap(colors);
                } else {
                    setStatusLabelMap(ACTION_RESULT_LABELS);
                }
            })
            .catch(() => setStatusLabelMap(ACTION_RESULT_LABELS));
    }, [selectedMissions]);

    // Auto-select date range when a single mission is selected
    useEffect(() => {
        if (selectedMissions.length !== 1) return;
        const missionId = selectedMissions[0];
        fetch(`/api/analytics/mission-date-range?missionId=${encodeURIComponent(missionId)}`)
            .then((res) => res.json())
            .then((json) => {
                if (json.success && json.data?.from && json.data?.to) {
                    setDateRange({ from: json.data.from, to: json.data.to });
                }
            })
            .catch(() => {});
    }, [selectedMissions]);

    // Generate report (PDF)
    const handleGenerateReport = useCallback(async () => {
        let from: string;
        let to: string;
        if (reportType === "daily") {
            from = reportDate;
            to = reportDate;
        } else if (reportType === "weekly") {
            const d = new Date(reportDate);
            const day = d.getDay();
            const monday = new Date(d);
            monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            from = monday.toISOString().split("T")[0];
            to = sunday.toISOString().split("T")[0];
        } else {
            from = reportDateFrom;
            to = reportDateTo;
        }
        if (!from || !to) return;
        setIsGeneratingReport(true);
        // Open synchronously so Chrome allows the generated PDF preview after the fetch.
        const previewWindow = window.open("about:blank", "_blank");
        try {
            const params = new URLSearchParams();
            params.set("from", from);
            params.set("to", to);
            selectedMissions.forEach((id) => params.append("missionIds[]", id));
            selectedSdrs.forEach((id) => params.append("sdrIds[]", id));
            selectedClients.forEach((id) => params.append("clientIds[]", id));
            selectedLists.forEach((id) => params.append("listIds[]", id));
            const res = await fetch(`/api/analytics/report/pdf?${params.toString()}`);
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error((j as { error?: string }).error || "Erreur lors de la génération");
            }
            const contentType = res.headers.get("content-type") || "";
            const filename = `rapport-analytics-${from}-${to}.pdf`;

            if (contentType.includes("application/json")) {
                const j = await res.json();
                if (j.success && j.url) {
                    if (previewWindow) previewWindow.location.href = j.url;
                    else window.open(j.url, "_blank", "noopener,noreferrer");
                    setShowReportModal(false);
                    return;
                }
            }

            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            if (previewWindow) {
                previewWindow.location.href = blobUrl;
                window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
            } else {
                const a = document.createElement("a");
                a.href = blobUrl;
                a.download = filename;
                a.click();
                window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1_000);
            }
            setShowReportModal(false);
        } catch (err) {
            previewWindow?.close();
            console.error("Report generation failed:", err);
            alert(err instanceof Error ? err.message : "Erreur lors de la génération du rapport");
        } finally {
            setIsGeneratingReport(false);
        }
    }, [reportType, reportDate, reportDateFrom, reportDateTo, selectedMissions, selectedSdrs, selectedClients, selectedLists]);

    // Data Formatting
    const dailyData = useMemo(() => {
        if (!stats?.charts?.daily) return [];
        return stats.charts.daily.map((d: any) => ({
            name: new Date(d.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
            calls: d.calls,
            meetings: d.meetings,
        }));
    }, [stats]);

    // AI Recap - fetch from API with phase-by-phase animation
    const fetchAiRecap = useCallback(async () => {
        setIsLoadingAiRecap(true);
        setAiRecap(null);
        setAiAnalysis(null);
        setAiRecapExtras([]);
        setShowFullRecap(false);
        setAiPhase(1);

        await new Promise(r => setTimeout(r, 800));
        setAiPhase(2);

        await new Promise(r => setTimeout(r, 1000));
        setAiPhase(3);

        try {
            const fetchPromise = fetch("/api/analytics/ai-recap", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    from: dateRange.from,
                    to: dateRange.to,
                    missionIds: selectedMissions,
                    sdrIds: selectedSdrs,
                    clientIds: selectedClients,
                    listIds: selectedLists,
                }),
            });

            await new Promise(r => setTimeout(r, 900));
            setAiPhase(4);

            const res = await fetchPromise;
            const json = await res.json();
            if (json.success && json.data?.recap) {
                setAiRecap(json.data.recap);
                setAiAnalysis(json.data.analysis ?? null);
            }
        } catch (err) {
            console.error("AI recap fetch error:", err);
        } finally {
            setAiPhase(5);
            setIsLoadingAiRecap(false);
        }
    }, [dateRange, selectedMissions, selectedSdrs, selectedClients, selectedLists]);

    const fetchAiFollowUp = useCallback(async (followUpId: string, followUpPrompt: string, followUpLabel: string) => {
        if (!aiRecap) return;
        setIsLoadingFollowUp(followUpId);
        try {
            const res = await fetch("/api/analytics/ai-recap", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    from: dateRange.from,
                    to: dateRange.to,
                    missionIds: selectedMissions,
                    sdrIds: selectedSdrs,
                    clientIds: selectedClients,
                    listIds: selectedLists,
                    followUp: followUpPrompt,
                    previousRecap: aiRecap,
                }),
            });
            const json = await res.json();
            if (json.success && json.data?.recap) {
                setAiRecapExtras((prev) => {
                    const filtered = prev.filter((e) => e.id !== followUpId);
                    return [...filtered, { id: followUpId, label: followUpLabel, answer: json.data.recap }];
                });
            }
        } catch (err) {
            console.error("AI follow-up fetch error:", err);
        } finally {
            setIsLoadingFollowUp(null);
        }
    }, [aiRecap, dateRange, selectedMissions, selectedSdrs, selectedClients, selectedLists]);

    useEffect(() => {
        // Quand les filtres changent, on réinitialise simplement l'analyse IA.
        // L'utilisateur doit cliquer sur le bouton pour relancer manuellement.
        setAiRecap(null);
        setAiAnalysis(null);
        setAiRecapExtras([]);
        setIsLoadingFollowUp(null);
    }, [dateRange.from, dateRange.to, selectedMissions.join(","), selectedSdrs.join(","), selectedClients.join(","), selectedLists.join(",")]);

    // Handle Journal Filtering
    const filteredActions = useMemo(() => {
        if (journalFilter === 'all') return actions;
        if (journalFilter === 'meetings') return actions.filter(a => a.result === 'MEETING_BOOKED');
        if (journalFilter === 'callbacks') return actions.filter(a => a.result === 'CALLBACK_REQUESTED' || a.result === 'INTERESTED');
        if (journalFilter === 'disqualified') return actions.filter(a => a.result === 'DISQUALIFIED');
        if (journalFilter === 'no_response') return actions.filter(a => a.result === 'NO_RESPONSE');
        return actions;
    }, [actions, journalFilter]);

    // Persona chart data (for BarChart) — sorted by selected metric
    const personaChartData = useMemo(() => {
        if (!personaData || personaData.mode !== 'single' || !personaData[personaDimension]) return [];
        const rows = (personaData[personaDimension] || []).map((r: any) => ({
            name: r.value?.length > 18 ? r.value.slice(0, 18) + '…' : r.value,
            fullName: r.value,
            conversionRate: r.conversionRate,
            calls: r.calls,
            meetings: r.meetings,
        }));
        const sorted = [...rows].sort((a, b) => {
            if (personaMetric === 'conversion') return b.conversionRate - a.conversionRate;
            if (personaMetric === 'calls') return b.calls - a.calls;
            return b.meetings - a.meetings;
        });
        return sorted.slice(0, 10);
    }, [personaData, personaDimension, personaMetric]);

    const getBarColor = (entry: { conversionRate: number; calls: number; meetings: number }) => {
        if (personaMetric === 'conversion') {
            if (entry.conversionRate >= 5) return '#10b981';
            if (entry.conversionRate >= 3) return '#6366f1';
            return '#94a3b8';
        }
        if (personaMetric === 'calls') return '#6366f1';
        return '#10b981'; // meetings
    };

    const PersonaTooltip = ({ active, payload }: any) => {
        if (!active || !payload?.length) return null;
        const p = payload[0]?.payload;
        if (!p) return null;
        return (
            <div className="bg-white rounded-xl border border-slate-200 shadow-lg px-4 py-3 text-[12px]">
                <div className="font-bold text-slate-800 mb-1">{p.fullName}</div>
                <div className="text-slate-500">{p.calls} appels · {p.meetings} RDV · {p.conversionRate}% conversion</div>
            </div>
        );
    };

    const PersonaChart = ({ data, height = 280, metric }: { data: any[]; height?: number; metric: 'conversion' | 'calls' | 'meetings' }) => {
        const dataKey = metric === 'conversion' ? 'conversionRate' : metric === 'calls' ? 'calls' : 'meetings';
        const tickFormatter = metric === 'conversion' ? (v: number) => `${v}%` : (v: number) => String(v);
        return (
            <ResponsiveContainer width="100%" height={height}>
                <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
                    <XAxis type="number" domain={[0, 'auto']} tickFormatter={tickFormatter} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <RechartsTooltip content={<PersonaTooltip />} cursor={{ fill: 'rgba(99, 102, 241, 0.06)' }} />
                    <Bar dataKey={dataKey} name={metric === 'conversion' ? 'Conversion' : metric === 'calls' ? 'Appels' : 'RDV'} radius={[0, 6, 6, 0]} barSize={22} minPointSize={4}>
                        {data.map((entry, i) => (
                            <Cell key={i} fill={getBarColor(entry)} stroke="none" />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        );
    };

    // Build dynamic status items from statusBreakdown using mission-specific labels (must be before early return)
    const statusItems = useMemo(() => {
        const breakdown = stats?.statusBreakdown || {};
        const items: { code: string; count: number; label: string; color: string }[] = [];
        for (const [code, count] of Object.entries(breakdown)) {
            if (!code || count === 0) continue;
            items.push({
                code,
                count: count as number,
                label: statusLabelMap[code] || code,
                color: statusColorMap[code] || "#94a3b8",
            });
        }
        return items.sort((a, b) => b.count - a.count);
    }, [stats?.statusBreakdown, statusLabelMap, statusColorMap]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-40" style={{ background: "#F4F6FA", minHeight: "100vh" }}>
                <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center mb-4">
                    <RefreshCw className="w-7 h-7 text-violet-600 animate-spin" />
                </div>
                <p className="text-[13px] text-slate-400 font-medium">Chargement des analytics...</p>
            </div>
        );
    }

    const { kpis, segments, funnel, sdrPerformance, missionStates } = stats || {};
    const totalCalls = kpis?.totalCalls || 1; // Prevent division by 0
    const noRespCount = stats?.statusBreakdown?.['NO_RESPONSE'] || 0;
    const disqCount = stats?.statusBreakdown?.['DISQUALIFIED'] || 0;
    const cbackCount = stats?.statusBreakdown?.['CALLBACK_REQUESTED'] || 0;
    const intCount = stats?.statusBreakdown?.['INTERESTED'] || 0;
    const totalCbacks = cbackCount + intCount;

    // Heatmap Config
    const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
    const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

    return (
        <div className="min-h-full p-5 lg:p-6 pb-20 overflow-x-hidden" style={{ background: "linear-gradient(160deg, #F4F6FA 0%, #EEF2FF 100%)", fontFamily: "'Inter', system-ui, sans-serif" }}>

            {/* Page Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                            <Activity className="w-4 h-4 text-white" />
                        </div>
                        <h1 className="text-[22px] font-black text-slate-900 tracking-tight">Analytics & Performance</h1>
                    </div>
                    <p className="text-[12px] text-slate-400 ml-10 font-medium">Suivi détaillé des appels et des résultats d'équipe</p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                    <div className="flex items-center gap-2 px-3.5 py-2 text-[12px] font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-violet-300 transition-all">
                        <Calendar className="w-3.5 h-3.5 text-violet-500" />
                        <input
                            type="date"
                            value={dateRange.from}
                            onChange={e => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                            className="bg-transparent border-none p-0 outline-none hover:text-violet-600 transition-colors cursor-pointer"
                        />
                        <span className="text-slate-300 font-normal">→</span>
                        <input
                            type="date"
                            value={dateRange.to}
                            onChange={e => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                            className="bg-transparent border-none p-0 outline-none hover:text-violet-600 transition-colors cursor-pointer"
                        />
                    </div>

                    <button
                        onClick={() => setShowReportModal(true)}
                        className="flex items-center gap-2 px-3.5 py-2 text-[12px] font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:border-violet-300 hover:shadow-sm transition-all shadow-sm"
                    >
                        <Download className="w-3.5 h-3.5 text-slate-400" /> Exporter les stats
                    </button>
                    <button onClick={fetchStats} className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-violet-600 hover:border-violet-300 hover:shadow-sm transition-all shadow-sm">
                        <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-6">
                <div className="flex-1 min-w-[200px] flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 transition-all hover:border-violet-300 shadow-sm">
                    <div className="flex-1">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Mission</span>
                        <select
                            className="w-full bg-transparent border-none text-[13px] font-semibold text-slate-700 outline-none p-0 cursor-pointer"
                            value={selectedMissions[0] || "all"}
                            onChange={(e) => {
                                if (e.target.value === "all") setSelectedMissions([]);
                                else setSelectedMissions([e.target.value]);
                            }}
                        >
                            <option value="all">Toutes les missions</option>
                            {(missions || []).map((m) => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0"><Target className="w-4 h-4 text-indigo-500" /></div>
                </div>

                <div className="flex-1 min-w-[200px] flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 transition-all hover:border-violet-300 shadow-sm">
                    <div className="flex-1">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">SDR</span>
                        <select className="w-full bg-transparent border-none text-[13px] font-semibold text-slate-700 outline-none p-0 cursor-pointer" onChange={e => {
                            if (e.target.value === "all") setSelectedSdrs([]);
                            else if (!selectedSdrs.includes(e.target.value)) setSelectedSdrs([e.target.value]);
                        }}>
                            <option value="all">Toute l'équipe</option>
                            {(sdrs || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0"><User className="w-4 h-4 text-emerald-500" /></div>
                </div>

                <div className="flex-1 min-w-[200px] flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 transition-all hover:border-violet-300 shadow-sm">
                    <div className="flex-1">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Client</span>
                        <select className="w-full bg-transparent border-none text-[13px] font-semibold text-slate-700 outline-none p-0 cursor-pointer" onChange={e => {
                            if (e.target.value === "all") setSelectedClients([]);
                            else if (!selectedClients.includes(e.target.value)) setSelectedClients([e.target.value]);
                        }}>
                            <option value="all">Tous les clients</option>
                            {(clients || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0"><Briefcase className="w-4 h-4 text-amber-500" /></div>
                </div>

                <div className="flex-1 min-w-[200px] flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 transition-all hover:border-violet-300 shadow-sm">
                    <div className="flex-1">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Liste</span>
                        <select
                            className="w-full bg-transparent border-none text-[13px] font-semibold text-slate-700 outline-none p-0 cursor-pointer"
                            value={selectedLists[0] || "all"}
                            onChange={(e) => {
                                if (e.target.value === "all") setSelectedLists([]);
                                else setSelectedLists([e.target.value]);
                            }}
                        >
                            <option value="all">Toutes les listes</option>
                            {(lists || []).map((l) => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0"><List className="w-4 h-4 text-slate-500" /></div>
                </div>
            </div>

            {/* AI Hero Banner */}
            <div className="relative overflow-hidden rounded-2xl p-6 lg:p-8 mb-6 shadow-xl" style={{ background: "linear-gradient(145deg, #16103A 0%, #1A1040 40%, #08051E 100%)" }}>
                <div className="absolute -top-32 -right-32 w-80 h-80 rounded-full blur-3xl opacity-30 pointer-events-none" style={{ background: "radial-gradient(circle, #7C5CFC, transparent 70%)" }} />
                <div className="absolute -bottom-32 -left-32 w-72 h-72 rounded-full blur-3xl opacity-20 pointer-events-none" style={{ background: "radial-gradient(circle, #A78BFA, transparent 70%)" }} />

                <button
                    className="absolute top-6 right-6 flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600/80 to-indigo-600/80 hover:from-violet-500/90 hover:to-indigo-500/90 border border-violet-400/30 text-white transition-all text-[12px] font-bold backdrop-blur-sm z-20 disabled:opacity-60 shadow-lg shadow-violet-900/30"
                    onClick={() => fetchAiRecap()}
                    disabled={isLoadingAiRecap}
                >
                    {isLoadingAiRecap ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BrainCircuit className="w-3.5 h-3.5" />} Ré-analyser
                </button>

                <div className="relative z-10 flex items-center gap-3 mb-5">
                    <div className="flex items-center gap-2 bg-violet-600/30 border border-violet-500/50 text-violet-200 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wider">
                        <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                        ANALYSE IA
                    </div>
                    <span className="text-[13px] font-medium text-white/50">Analyse des notes et statuts</span>
                </div>

                {/* Phase-by-phase analysis progress */}
                {isLoadingAiRecap && aiPhase > 0 && (
                    <div className="relative z-10 py-4 space-y-3">
                        {[
                            { phase: 1, icon: <Activity className="w-4 h-4" />, label: "Collecte des données...", sub: "Récupération des appels et notes" },
                            { phase: 2, icon: <Phone className="w-4 h-4" />, label: "Analyse des statuts d'appels...", sub: `${statusItems.length} statuts différents détectés` },
                            { phase: 3, icon: <FileText className="w-4 h-4" />, label: "Analyse des notes d'appels...", sub: "Extraction des objections et patterns" },
                            { phase: 4, icon: <Sparkles className="w-4 h-4" />, label: "Génération des recommandations...", sub: "Synthèse IA en cours" },
                        ].map(({ phase, icon, label, sub }) => (
                            <div
                                key={phase}
                                className={cn(
                                    "flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-500",
                                    aiPhase > phase ? "bg-emerald-500/10 border border-emerald-500/20" :
                                    aiPhase === phase ? "bg-violet-500/15 border border-violet-400/30 animate-pulse" :
                                    "bg-white/5 border border-white/5 opacity-40"
                                )}
                            >
                                <div className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-500",
                                    aiPhase > phase ? "bg-emerald-500/20 text-emerald-400" :
                                    aiPhase === phase ? "bg-violet-500/30 text-violet-300" :
                                    "bg-white/10 text-white/30"
                                )}>
                                    {aiPhase > phase ? <CheckCircle2 className="w-4 h-4" /> : aiPhase === phase ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className={cn(
                                        "text-[13px] font-bold transition-colors duration-500",
                                        aiPhase > phase ? "text-emerald-300" :
                                        aiPhase === phase ? "text-white" :
                                        "text-white/30"
                                    )}>{label}</div>
                                    <div className={cn(
                                        "text-[11px] transition-colors duration-500",
                                        aiPhase >= phase ? "text-white/50" : "text-white/20"
                                    )}>{sub}</div>
                                </div>
                                {aiPhase === phase && (
                                    <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden shrink-0">
                                        <div className="h-full bg-violet-400 rounded-full animate-[progressPulse_1.5s_ease-in-out_infinite]" style={{ width: '70%' }} />
                                    </div>
                                )}
                                {aiPhase > phase && (
                                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider shrink-0">OK</span>
                                )}
                            </div>
                        ))}

                        {/* Live status mini-cards during phase 2 */}
                        {aiPhase >= 2 && statusItems.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2 pl-12 animate-in fade-in duration-500">
                                {statusItems.slice(0, 5).map((item) => (
                                    <div key={item.code} className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5">
                                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                                        <span className="text-[10px] font-bold text-white/70">{item.label}</span>
                                        <span className="text-[10px] font-black text-white/90">{item.count}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* AI Recap Result */}
                {!isLoadingAiRecap && aiRecap ? (
                    <div className="relative z-10 space-y-5">
                        {aiAnalysis ? (
                            <>
                                <div className="rounded-2xl bg-white/10 border border-white/15 backdrop-blur-sm p-4 lg:p-5">
                                    <div className="text-[11px] uppercase tracking-widest text-violet-200/70 font-bold mb-2">Synthèse exécutive</div>
                                    <p className="text-[14px] leading-relaxed text-white/90">{aiAnalysis.executiveSummary}</p>
                                    <div className="flex flex-wrap gap-2 mt-4">
                                        {aiAnalysis.keyInsights.map((insight, idx) => (
                                            <span key={`${insight}-${idx}`} className="px-2.5 py-1.5 rounded-lg bg-violet-500/15 border border-violet-400/30 text-violet-100 text-[11px] font-semibold">
                                                {insight}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                                    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                                        <div className="flex items-center gap-2 text-[12px] font-bold text-white/80 mb-3">
                                            <AlertTriangle className="w-4 h-4 text-amber-300" />
                                            Objections récurrentes
                                        </div>
                                        <div className="space-y-2.5">
                                            {aiAnalysis.objectionClusters.slice(0, 3).map((item, idx) => (
                                                <div key={`${item.objection}-${idx}`} className="rounded-xl bg-white/5 border border-white/10 p-3">
                                                    <div className="flex items-center justify-between gap-2 mb-1.5">
                                                        <p className="text-[12px] font-bold text-white">{item.objection}</p>
                                                        <span className={cn(
                                                            "text-[10px] px-2 py-0.5 rounded-full font-bold",
                                                            item.frequency === "HIGH" ? "bg-red-500/20 text-red-200 border border-red-400/30" :
                                                            item.frequency === "MEDIUM" ? "bg-amber-500/20 text-amber-200 border border-amber-400/30" :
                                                            "bg-slate-500/20 text-slate-200 border border-slate-400/30"
                                                        )}>
                                                            {item.frequency}
                                                        </span>
                                                    </div>
                                                    <p className="text-[11px] text-white/65">{item.whyItHappens}</p>
                                                    <p className="text-[11px] text-violet-100/80 mt-1.5">Réponse: {item.recommendedResponse}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                                        <div className="flex items-center gap-2 text-[12px] font-bold text-white/80 mb-3">
                                            <UserX className="w-4 h-4 text-rose-300" />
                                            Causes de disqualification
                                        </div>
                                        <div className="space-y-2.5">
                                            {aiAnalysis.disqualificationCauses.slice(0, 3).map((item, idx) => (
                                                <div key={`${item.cause}-${idx}`} className="rounded-xl bg-white/5 border border-white/10 p-3">
                                                    <p className="text-[12px] font-bold text-white mb-1">{item.cause}</p>
                                                    <p className="text-[11px] text-white/70">{item.signalInNotes}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                                        <div className="flex items-center gap-2 text-[12px] font-bold text-white/80 mb-3">
                                            <ThumbsUp className="w-4 h-4 text-emerald-300" />
                                            Recommandations prioritaires
                                        </div>
                                        <div className="space-y-2.5">
                                            {aiAnalysis.recommendations.slice(0, 3).map((item, idx) => (
                                                <div key={`${item.title}-${idx}`} className="rounded-xl bg-white/5 border border-white/10 p-3">
                                                    <div className="flex items-center justify-between gap-2 mb-1.5">
                                                        <p className="text-[12px] font-bold text-white">{item.title}</p>
                                                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-violet-500/20 text-violet-200 border border-violet-400/30">
                                                            {item.priority}
                                                        </span>
                                                    </div>
                                                    <p className="text-[11px] text-emerald-100/80">Impact attendu: {item.expectedImpact}</p>
                                                    <p className="text-[11px] text-white/70">{item.actionPlan}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-2xl bg-emerald-500/10 border border-emerald-400/20 p-4">
                                    <div className="flex items-center gap-2 text-[12px] font-bold text-emerald-200 mb-2.5">
                                        <ArrowRight className="w-4 h-4" />
                                        Plan d'action 7 jours
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {aiAnalysis.next7DaysPlan.map((step, idx) => (
                                            <div key={`${step}-${idx}`} className="text-[12px] text-white/90 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                                                <span className="text-emerald-200 font-bold mr-2">{idx + 1}.</span>
                                                {step}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="relative">
                                    <div
                                        className={cn(
                                            "text-[14px] leading-relaxed text-white/90 max-w-4xl prose prose-invert prose-sm max-w-none [&_strong]:text-white [&_ul]:my-2 [&_li]:my-0.5 transition-all duration-300",
                                            !showFullRecap && "max-h-[120px] overflow-hidden"
                                        )}
                                        dangerouslySetInnerHTML={{ __html: aiRecap.replace(/\n/g, "<br />").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }}
                                    />
                                    {!showFullRecap && (
                                        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#16103A] to-transparent pointer-events-none" />
                                    )}
                                </div>
                                <button
                                    onClick={() => setShowFullRecap(!showFullRecap)}
                                    className="flex items-center gap-1.5 text-[12px] font-bold text-violet-300 hover:text-violet-200 transition-colors"
                                >
                                    {showFullRecap ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                    {showFullRecap ? "Réduire" : "Voir l'analyse complète"}
                                </button>
                            </>
                        )}

                        {/* Follow-up buttons */}
                        <div className="flex flex-wrap gap-2 pt-2">
                            <span className="text-[11px] font-bold text-white/50 uppercase tracking-wider self-center mr-1">Approfondir :</span>
                            {[
                                { id: "objections", label: "Objections détaillées", icon: <AlertTriangle className="w-3 h-3" />, prompt: "Liste et analyse en détail toutes les objections récurrentes dans les notes (budget, timing, prestataire actuel, etc.). Donne des exemples concrets et des pistes de réponse." },
                                { id: "causes", label: "Causes disqualifications", icon: <UserX className="w-3 h-3" />, prompt: "Quelles sont les causes racines des disqualifications ? Analyse les notes des contacts disqualifiés et synthétise les motifs récurrents." },
                                { id: "recommandations", label: "Recommandations", icon: <ThumbsUp className="w-3 h-3" />, prompt: "Donne des recommandations actionnables et concrètes pour améliorer les résultats (pitch, qualification, timing, etc.)." },
                                { id: "meetings", label: "Facteurs de succès RDV", icon: <Trophy className="w-3 h-3" />, prompt: "Quels facteurs ou patterns ressortent dans les notes des contacts qui ont booké un RDV ? Que faire pour reproduire ce succès ?" },
                                { id: "non_reponse", label: "Réduire la non-réponse", icon: <PhoneOff className="w-3 h-3" />, prompt: "Quelles stratégies proposer pour réduire le taux de non-réponse ? Analyse les notes et le contexte pour identifier des leviers." },
                            ].map(({ id, label, icon, prompt }) => {
                                const extra = aiRecapExtras.find((e) => e.id === id);
                                const loading = isLoadingFollowUp === id;
                                return (
                                    <button
                                        key={id}
                                        onClick={() => !extra && !loading && fetchAiFollowUp(id, prompt, label)}
                                        disabled={!!extra || loading}
                                        className={cn(
                                            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border backdrop-blur-sm",
                                            extra ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-200 cursor-default" : "bg-white/10 hover:bg-white/20 border-white/20 text-white/90 hover:border-violet-400/40"
                                        )}
                                    >
                                        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : extra ? <CheckCircle2 className="w-3 h-3" /> : icon}
                                        {extra ? `${label}` : label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Follow-up expanded answers */}
                        {aiRecapExtras.length > 0 && (
                            <div className="space-y-3 pt-3 border-t border-white/10">
                                {aiRecapExtras.map((ex) => (
                                    <details key={ex.id} className="group rounded-xl bg-white/5 border border-white/10 overflow-hidden" open>
                                        <summary className="flex items-center gap-2 cursor-pointer px-4 py-3 hover:bg-white/5 transition-colors list-none">
                                            <ChevronDown className="w-3.5 h-3.5 text-violet-400 group-open:rotate-180 transition-transform duration-200" />
                                            <span className="text-[12px] font-bold text-violet-300 uppercase tracking-wider">{ex.label}</span>
                                        </summary>
                                        <div className="px-4 pb-4">
                                            <div className="text-[13px] leading-relaxed text-white/85 [&_strong]:text-white [&_ul]:my-2 [&_li]:my-0.5" dangerouslySetInnerHTML={{ __html: ex.answer.replace(/\n/g, "<br />").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
                                        </div>
                                    </details>
                                ))}
                            </div>
                        )}
                    </div>
                ) : !isLoadingAiRecap ? (
                    <div className="relative z-10 flex flex-col items-center justify-center py-8 gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                            <BrainCircuit className="w-7 h-7 text-violet-400/60" />
                        </div>
                        <p className="text-[14px] text-white/40 font-medium text-center">Cliquez sur <span className="text-violet-300 font-bold">Ré-analyser</span> pour lancer l&apos;analyse IA</p>
                        <p className="text-[11px] text-white/25 text-center max-w-md">L&apos;IA analysera les statuts, les notes d&apos;appels et générera des recommandations actionnables phase par phase.</p>
                    </div>
                ) : null}

                <div className="relative z-10 flex flex-wrap gap-4 mt-7">
                    <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl px-5 py-3 hover:bg-white/10 transition-colors">
                        <div className="w-9 h-9 rounded-full bg-red-500/20 flex items-center justify-center"><Phone className="w-4 h-4 text-red-400" /></div>
                        <div><div className="text-[18px] font-black text-white leading-none tracking-tight">{Math.round((noRespCount / totalCalls) * 100)}%</div><div className="text-[10px] text-white/50 uppercase tracking-widest mt-1">Non-réponse</div></div>
                    </div>
                    <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl px-5 py-3 hover:bg-white/10 transition-colors">
                        <div className="w-9 h-9 rounded-full bg-blue-500/20 flex items-center justify-center"><Activity className="w-4 h-4 text-blue-400" /></div>
                        <div><div className="text-[18px] font-black text-white leading-none tracking-tight">{kpis?.totalCalls || 0}</div><div className="text-[10px] text-white/50 uppercase tracking-widest mt-1">Appels passés</div></div>
                    </div>
                    <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl px-5 py-3 hover:bg-white/10 transition-colors">
                        <div className="w-9 h-9 rounded-full bg-amber-500/20 flex items-center justify-center"><Flame className="w-4 h-4 text-amber-400" /></div>
                        <div><div className="text-[18px] font-black text-white leading-none tracking-tight">{totalCbacks || 0}</div><div className="text-[10px] text-white/50 uppercase tracking-widest mt-1">Opp. à traiter</div></div>
                    </div>
                    <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl px-5 py-3 hover:bg-white/10 transition-colors">
                        <div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-emerald-400" /></div>
                        <div><div className="text-[18px] font-black text-white leading-none tracking-tight">{kpis?.meetings || 0}</div><div className="text-[10px] text-white/50 uppercase tracking-widest mt-1">RDV Confirmés</div></div>
                    </div>
                    {sdrPerformance?.[0] && (
                        <div className="flex items-center gap-3 bg-violet-600/20 backdrop-blur-md border border-violet-500/30 rounded-xl px-5 py-3 ml-auto hover:bg-violet-600/30 transition-colors">
                            <div className="w-9 h-9 rounded-full bg-violet-500/30 flex items-center justify-center"><Trophy className="w-4 h-4 text-violet-300" /></div>
                            <div><div className="text-[18px] font-black text-white leading-none tracking-tight">{sdrPerformance[0].sdrName.split(' ')[0]}</div><div className="text-[10px] text-violet-300 uppercase tracking-widest mt-1 font-bold">Top SDR</div></div>
                        </div>
                    )}
                </div>
            </div>

            {/* KPI ROW */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-2xl border border-slate-100 p-5 flex flex-col justify-between group hover:shadow-md hover:border-violet-100 transition-all cursor-default">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-11 h-11 rounded-xl bg-violet-50 flex items-center justify-center transition-transform group-hover:scale-110">
                            <Phone className="w-5 h-5 text-violet-600" />
                        </div>
                        <span className="px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-600 flex items-center gap-1"><TrendingUp className="w-3 h-3" />+12%</span>
                    </div>
                    <div>
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Total Appels</div>
                        <div className="text-[36px] font-black text-slate-800 leading-none tracking-tight">{kpis?.totalCalls || 0}</div>
                    </div>
                    <div className="h-10 mt-5 -mx-1">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={dailyData}>
                                <defs><linearGradient id="gViolet" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7c3aed" stopOpacity={0.2} /><stop offset="100%" stopColor="#7c3aed" stopOpacity={0} /></linearGradient></defs>
                                <Area type="monotone" dataKey="calls" stroke="#7c3aed" strokeWidth={2.5} fillOpacity={1} fill="url(#gViolet)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 p-5 flex flex-col justify-between group hover:shadow-md hover:border-emerald-100 transition-all cursor-default relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-500"><Target className="w-24 h-24 text-emerald-900" /></div>
                    <div className="flex items-center justify-between mb-5 relative z-10">
                        <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center transition-transform group-hover:scale-110">
                            <Target className="w-5 h-5 text-emerald-600" />
                        </div>
                    </div>
                    <div className="relative z-10">
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Meetings Bookés</div>
                        <div className="text-[36px] font-black text-slate-800 leading-none tracking-tight">{kpis?.meetings || 0}</div>
                    </div>
                    <div className="mt-6 relative z-10">
                        <div className="flex justify-between text-[11px] font-bold text-slate-400 mb-2"><span>Objectif hebdo (10)</span><span className="text-slate-700">{Math.min(100, ((kpis?.meetings || 0) / 10) * 100).toFixed(0)}%</span></div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, ((kpis?.meetings || 0) / 10) * 100)}%` }} /></div>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 p-5 flex flex-col justify-between group hover:shadow-md hover:border-indigo-100 transition-all cursor-default">
                    <div className="flex items-center justify-between mb-5">
                        <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center transition-transform group-hover:scale-110">
                            <Zap className="w-5 h-5 text-indigo-500" />
                        </div>
                        <span className="px-2 py-1 rounded-md text-[10px] font-bold bg-amber-50 text-amber-600 flex items-center gap-1"><TrendingUp className="w-3 h-3 rotate-180" />-2%</span>
                    </div>
                    <div>
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Taux de Conversion</div>
                        <div className="flex items-baseline gap-1">
                            <div className="text-[36px] font-black text-slate-800 leading-none tracking-tight">{kpis?.conversionRate || 0}</div>
                            <span className="text-[18px] font-bold text-slate-400">%</span>
                        </div>
                    </div>
                    <div className="mt-6">
                        <div className="flex justify-between text-[11px] font-bold text-slate-400 mb-2"><span>Cible (3%)</span><span className="text-slate-700">{Math.min(100, ((kpis?.conversionRate || 0) / 3) * 100).toFixed(0)}%</span></div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, ((kpis?.conversionRate || 0) / 3) * 100)}%` }} /></div>
                    </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 p-5 flex flex-col justify-between group hover:shadow-md hover:border-amber-100 transition-all cursor-default">
                    <div className="flex items-center justify-between mb-5">
                        <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center transition-transform group-hover:scale-110">
                            <Clock className="w-5 h-5 text-amber-500" />
                        </div>
                        <span className="px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-600 flex items-center gap-1"><TrendingUp className="w-3 h-3" />+8%</span>
                    </div>
                    <div>
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Temps de Talk Total</div>
                        <div className="flex items-baseline gap-1">
                            <div className="text-[36px] font-black text-slate-800 leading-none tracking-tight">{Math.round((kpis?.totalTalkTime || 0) / 60)}</div>
                            <span className="text-[18px] font-bold text-slate-400">min</span>
                        </div>
                    </div>
                    <div className="h-10 mt-5 hidden lg:block" /> {/* spacer for alignment without chart */}
                </div>
            </div>

            {/* Missions List */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm mb-6 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                        <Target className="w-5 h-5 text-violet-500" />
                        <h3 className="text-[16px] font-bold text-slate-800">Missions proches de l'objectif</h3>
                    </div>
                    <button className="text-[12px] font-bold text-violet-600 hover:text-violet-800 transition-colors">Voir toutes →</button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {(missionStates || []).map((m: any) => {
                        const mGoal = 5;
                        const pct = Math.min(100, (m.meetings / mGoal) * 100);
                        const isHot = pct >= 80;
                        return (
                            <div key={m.missionId} className="group p-4 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all cursor-pointer">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="overflow-hidden">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            {isHot && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />}
                                            <div className="text-[14px] font-bold text-slate-800 truncate group-hover:text-violet-600 transition-colors">{m.missionName}</div>
                                        </div>
                                        <div className="text-[11.5px] text-slate-400 truncate flex items-center gap-1">
                                            <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold", m.isActive ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
                                                {m.isActive ? "ACTIF" : "PAUSE"}
                                            </span>
                                            · {m.clientName}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-[15px] font-black text-slate-700 leading-tight">{m.meetings}</div>
                                        <div className="text-[10px] font-bold text-slate-400">/ {mGoal} RDV</div>
                                    </div>
                                </div>
                                <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
                                    <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${pct}%`, background: isHot ? "linear-gradient(90deg, #7C5CFC, #A78BFA)" : (pct >= 50 ? "#F59E0B" : "#CBD5E1") }} />
                                </div>
                                <div className="flex justify-between items-center text-[11px] font-semibold text-slate-500">
                                    <div className="flex gap-3">
                                        <span><span className="text-blue-600 font-bold">{m.calls}</span> Appels</span>
                                        <span><span className="text-amber-500 font-bold">{m.callbacks}</span> Rappels</span>
                                    </div>
                                    <div className="flex">
                                        {m.sdrNames.slice(0, 3).map((name: string, i: number) => (
                                            <div key={i} className="w-5 h-5 rounded-full border border-white flex items-center justify-center text-[7px] font-black text-white -ml-1.5 first:ml-0 shadow-sm" style={{ background: getSdrColor(name) }} title={name}>
                                                {name.substring(0, 2).toUpperCase()}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Charts Row */}
            <div className="flex flex-col lg:flex-row gap-4 mb-6">
                <div className="flex-[3] bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex flex-col hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-[15px] font-bold text-slate-800">Évolution de l'activité</h3>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-slate-500"><div className="w-3 h-1.5 rounded bg-violet-500" />Appels</div>
                            <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-slate-500"><div className="w-3 h-1.5 rounded bg-amber-400" />Meetings</div>
                        </div>
                    </div>
                    <div className="flex-1 min-h-[200px] -mx-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="gV" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7C5CFC" stopOpacity={0.15} /><stop offset="100%" stopColor="#7C5CFC" stopOpacity={0} /></linearGradient>
                                </defs>
                                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} />
                                <RechartsTooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', fontSize: '12px', fontWeight: 600, padding: '10px 14px' }} />
                                <Area type="monotone" dataKey="calls" stroke="#7C5CFC" strokeWidth={2.5} fillOpacity={1} fill="url(#gV)" />
                                <Area type="monotone" dataKey="meetings" stroke="#F59E0B" strokeWidth={2.5} fillOpacity={0} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="flex-[2] bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[15px] font-bold text-slate-800">Résultats des appels</h3>
                        <span className="text-[11px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded">{totalCalls} total</span>
                    </div>

                    {/* Donut + Legend */}
                    <div className="flex items-center gap-5 mb-5">
                        <div className="w-24 h-24 relative shrink-0">
                            <svg viewBox="0 0 52 52" className="w-full h-full -rotate-90 drop-shadow-sm">
                                <circle cx="26" cy="26" r="20" fill="none" stroke="#f1f5f9" strokeWidth="5" />
                                {(() => {
                                    let offset = 0;
                                    return statusItems.map((item) => {
                                        const len = (item.count / totalCalls) * 125;
                                        const dashOffset = -offset;
                                        offset += len;
                                        return (
                                            <circle key={item.code} cx="26" cy="26" r="20" fill="none" stroke={item.color} strokeWidth="5" strokeDasharray={`${len} 125`} strokeDashoffset={dashOffset} strokeLinecap="round" className="transition-all duration-500 hover:opacity-80 cursor-pointer" />
                                        );
                                    });
                                })()}
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-[15px] font-black text-slate-800">{totalCalls}</span>
                                <span className="text-[8px] font-bold text-slate-400 uppercase">appels</span>
                            </div>
                        </div>

                        {/* Category summary chips */}
                        <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50/80 border border-emerald-100/50">
                                <ThumbsUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                <span className="text-[11px] font-bold text-emerald-700 flex-1">Positifs</span>
                                <span className="text-[12px] font-black text-emerald-600">{segments?.success || 0}</span>
                                <span className="text-[10px] font-bold text-emerald-500/70">{totalCalls > 0 ? Math.round(((segments?.success || 0) / totalCalls) * 100) : 0}%</span>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50/80 border border-slate-100/50">
                                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="text-[11px] font-bold text-slate-600 flex-1">Neutres</span>
                                <span className="text-[12px] font-black text-slate-700">{segments?.neutral || 0}</span>
                                <span className="text-[10px] font-bold text-slate-400">{totalCalls > 0 ? Math.round(((segments?.neutral || 0) / totalCalls) * 100) : 0}%</span>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50/80 border border-red-100/50">
                                <ThumbsDown className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                <span className="text-[11px] font-bold text-red-600 flex-1">Négatifs</span>
                                <span className="text-[12px] font-black text-red-600">{segments?.failure || 0}</span>
                                <span className="text-[10px] font-bold text-red-400">{totalCalls > 0 ? Math.round(((segments?.failure || 0) / totalCalls) * 100) : 0}%</span>
                            </div>
                        </div>
                    </div>

                    {/* Detailed expandable status list */}
                    <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                        {statusItems.map((item) => {
                            const pct = Math.round((item.count / totalCalls) * 100);
                            const isExpanded = expandedStatusCode === item.code;
                            return (
                                <div key={item.code}>
                                    <button
                                        onClick={() => setExpandedStatusCode(isExpanded ? null : item.code)}
                                        className={cn(
                                            "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-left group",
                                            isExpanded ? "bg-slate-50 border border-slate-200" : "hover:bg-slate-50/80 border border-transparent"
                                        )}
                                    >
                                        <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
                                        <span className="text-[11.5px] font-bold text-slate-600 flex-1 truncate">{item.label}</span>
                                        <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden shrink-0">
                                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: item.color }} />
                                        </div>
                                        <span className="text-[11.5px] font-black text-slate-800 w-8 text-right shrink-0">{item.count}</span>
                                        <span className="text-[10px] font-bold text-slate-400 w-8 text-right shrink-0">{pct}%</span>
                                        <ChevronDown className={cn("w-3 h-3 text-slate-300 transition-transform duration-200 shrink-0", isExpanded && "rotate-180")} />
                                    </button>
                                    {isExpanded && (
                                        <div className="ml-5 pl-3 border-l-2 py-2 mb-1 space-y-1.5 animate-in slide-in-from-top-1 duration-200" style={{ borderColor: item.color }}>
                                            <div className="flex items-center gap-2 text-[11px] text-slate-500">
                                                <span className="font-semibold">Part du total :</span>
                                                <span className="font-black text-slate-700">{pct}%</span>
                                                <span className="text-slate-300">|</span>
                                                <span className="font-semibold">Volume :</span>
                                                <span className="font-black text-slate-700">{item.count} appels</span>
                                            </div>
                                            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                                                <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${pct}%`, backgroundColor: item.color }} />
                                            </div>
                                            <div className="text-[10px] text-slate-400 leading-relaxed">
                                                {item.code === 'NO_RESPONSE' && 'Prospects non joignables. Envisager des créneaux horaires alternatifs.'}
                                                {item.code === 'MEETING_BOOKED' && 'RDV confirmés avec les prospects. Taux de succès optimal.'}
                                                {item.code === 'CALLBACK_REQUESTED' && 'Rappels planifiés. Opportunités actives à convertir.'}
                                                {item.code === 'INTERESTED' && 'Intérêt exprimé. Suivi prioritaire recommandé.'}
                                                {item.code === 'DISQUALIFIED' && 'Contacts hors cible. Revoir les critères de qualification.'}
                                                {item.code === 'BAD_CONTACT' && 'Coordonnées erronées. Vérifier la qualité des données.'}
                                                {item.code === 'NOT_INTERESTED' && 'Refus explicite. Analyser les objections pour ajuster le pitch.'}
                                                {item.code === 'MEETING_CANCELLED' && 'RDV annulés. Identifier les causes pour réduire le taux.'}
                                                {item.code === 'ENVOIE_MAIL' && 'En attente d\'envoi de documentation. Suivi email à planifier.'}
                                                {item.code === 'MAIL_ENVOYE' && 'Documentation envoyée. Relance à prévoir.'}
                                                {item.code === 'INVALIDE' && 'Entrées invalides. Nettoyer la base de données.'}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Call Status Funnel */}
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm mb-6 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2 mb-5">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
                        <ArrowRight className="w-5 h-5 text-indigo-500" />
                    </div>
                    <div>
                        <h3 className="text-[15px] font-bold text-slate-800">Entonnoir de conversion</h3>
                        <p className="text-[11px] text-slate-400">Du premier appel au RDV confirmé</p>
                    </div>
                </div>
                <div className="flex items-end gap-1 justify-center">
                    {[
                        { label: 'Appels', value: funnel?.totalCalls || 0, color: '#6366f1', bg: 'bg-indigo-50' },
                        { label: 'Contacts', value: funnel?.contacts || 0, color: '#8b5cf6', bg: 'bg-violet-50' },
                        { label: 'Opportunités', value: funnel?.opportunities || 0, color: '#f59e0b', bg: 'bg-amber-50' },
                        { label: 'RDV', value: funnel?.meetings || 0, color: '#10b981', bg: 'bg-emerald-50' },
                    ].map((step, i, arr) => {
                        const maxVal = arr[0].value || 1;
                        const widthPct = Math.max(15, (step.value / maxVal) * 100);
                        const convFromPrev = i > 0 && arr[i - 1].value > 0 ? Math.round((step.value / arr[i - 1].value) * 100) : null;
                        return (
                            <div key={step.label} className="flex flex-col items-center flex-1 gap-1.5">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{step.label}</div>
                                <div
                                    className="w-full rounded-xl flex items-center justify-center transition-all duration-700 relative group cursor-default"
                                    style={{
                                        height: `${Math.max(48, (step.value / maxVal) * 140)}px`,
                                        backgroundColor: step.color,
                                        maxWidth: `${widthPct}%`,
                                        minWidth: '60px',
                                        opacity: 0.85 + (i * 0.05)
                                    }}
                                >
                                    <span className="text-white font-black text-[16px]">{step.value}</span>
                                </div>
                                {convFromPrev !== null && (
                                    <div className="flex items-center gap-1 text-[10px] font-bold" style={{ color: step.color }}>
                                        <ArrowRight className="w-3 h-3" />
                                        {convFromPrev}%
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* SDR TABLE */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden mb-6">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-amber-500" />
                        <h3 className="text-[15px] font-bold text-slate-800">Leaderboard SDR</h3>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50">
                                <th className="px-5 py-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 w-10 text-center">#</th>
                                <th className="px-5 py-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100">SDR</th>
                                <th className="px-5 py-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center">Appels (Allo)</th>
                                <th className="px-5 py-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center">Connectés</th>
                                <th className="px-5 py-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center">Actions CRM</th>
                                <th className="px-5 py-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center">Rappels</th>
                                <th className="px-5 py-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 text-center">Meetings</th>
                                <th className="px-5 py-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100">Taux Contact</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {(sdrPerformance || []).map((s: any, i: number) => {
                                const crmActions = s.crmActions ?? s.calls ?? 0;
                                const contactRate = Math.round((s.contacts / Math.max(1, crmActions)) * 100) || 0;
                                const isFirst = i === 0;
                                return (
                                    <tr key={s.sdrId} className={cn("transition-colors", isFirst ? "bg-gradient-to-r from-violet-50/50 to-transparent" : "hover:bg-slate-50")}>
                                        <td className="px-5 py-4 text-center">
                                            <span className={cn("text-[12px] font-black", i === 0 ? "text-amber-500" : i === 1 ? "text-slate-400" : i === 2 ? "text-amber-700" : "text-slate-300")}>
                                                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-black text-white shrink-0 shadow-sm", isFirst ? "bg-gradient-to-br from-violet-500 to-indigo-600 shadow-violet-300" : "")} style={!isFirst ? { background: getSdrColor(s.sdrName) } : {}}>
                                                    {s.sdrName.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className={cn("text-[13.5px] font-bold", isFirst ? "text-violet-700" : "text-slate-800")}>{s.sdrName}</div>
                                                    <div className="text-[11px] text-slate-500 font-medium">{s.sdrRole}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4 text-center text-[13.5px] font-black text-slate-700">{s.alloCalls ?? 0}</td>
                                        <td className="px-5 py-4 text-center text-[13.5px] font-black text-indigo-600">{s.connectedCalls ?? 0}</td>
                                        <td className="px-5 py-4 text-center text-[13.5px] font-black text-slate-700">{crmActions}</td>
                                        <td className="px-5 py-4 text-center text-[13.5px] font-bold text-amber-500">{s.callbacks}</td>
                                        <td className="px-5 py-4 text-center">
                                            <span className={cn("text-[13px] font-black", s.meetings > 0 ? "text-emerald-600" : "text-slate-400")}>{s.meetings}</span>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-3 max-w-[140px]">
                                                <div className="text-[12.5px] font-black text-slate-600 w-10 text-right">{contactRate}%</div>
                                                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 rounded-full" style={{ width: `${contactRate}%` }} /></div>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Persona / Target Intelligence */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow p-5 mb-6">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
                            <BarChart3 className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                            <h3 className="text-[15px] font-bold text-slate-800">Persona / Target Intelligence</h3>
                            <p className="text-[11px] text-slate-500">Conversion par fonction, secteur, taille, géographie</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <select
                            value={compareMode}
                            onChange={(e) => setCompareMode(e.target.value as 'none' | 'lists' | 'missions')}
                            className="text-[12px] font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl px-3 py-2 hover:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                        >
                            <option value="none">Vue globale</option>
                            <option value="lists">Comparer 2 listes</option>
                            <option value="missions">Comparer 2 missions</option>
                        </select>
                        {compareMode === 'lists' && selectedMissions.length === 1 && (
                            <>
                                <select value={compareListA} onChange={(e) => setCompareListA(e.target.value)} className="text-[12px] font-medium border border-slate-200 rounded-xl px-3 py-2 min-w-[140px]">
                                    <option value="">Liste A</option>
                                    {lists.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                                </select>
                                <span className="text-slate-400">vs</span>
                                <select value={compareListB} onChange={(e) => setCompareListB(e.target.value)} className="text-[12px] font-medium border border-slate-200 rounded-xl px-3 py-2 min-w-[140px]">
                                    <option value="">Liste B</option>
                                    {lists.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                                </select>
                            </>
                        )}
                        {compareMode === 'missions' && (
                            <>
                                <select
                                    value={compareMissionA[0] || ''}
                                    onChange={(e) => setCompareMissionA(e.target.value ? [e.target.value] : [])}
                                    className="text-[12px] font-medium border border-slate-200 rounded-xl px-3 py-2 min-w-[160px]"
                                >
                                    <option value="">Mission A</option>
                                    {missions.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                                <span className="text-slate-400">vs</span>
                                <select
                                    value={compareMissionB[0] || ''}
                                    onChange={(e) => setCompareMissionB(e.target.value ? [e.target.value] : [])}
                                    className="text-[12px] font-medium border border-slate-200 rounded-xl px-3 py-2 min-w-[160px]"
                                >
                                    <option value="">Mission B</option>
                                    {missions.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                            </>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 mb-5">
                    <div className="flex flex-wrap gap-2">
                        {(['byFunction', 'byCompanySize', 'bySector', 'byGeography', 'byCampaign'] as const).map((dim) => (
                            <button
                                key={dim}
                                onClick={() => setPersonaDimension(dim)}
                                className={cn(
                                    "px-3 py-1.5 text-[11px] font-bold rounded-xl transition-all",
                                    personaDimension === dim
                                        ? "bg-indigo-600 text-white shadow-md"
                                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                )}
                            >
                                {dim === 'byFunction' && 'Fonction'}
                                {dim === 'byCompanySize' && 'Taille entreprise'}
                                {dim === 'bySector' && 'Secteur'}
                                {dim === 'byGeography' && 'Géographie'}
                                {dim === 'byCampaign' && 'Campagne'}
                            </button>
                        ))}
                    </div>
                    <span className="text-slate-300">|</span>
                    <div className="flex flex-wrap gap-1.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider self-center">Afficher</span>
                        {(['conversion', 'calls', 'meetings'] as const).map((m) => (
                            <button
                                key={m}
                                onClick={() => setPersonaMetric(m)}
                                className={cn(
                                    "px-3 py-1.5 text-[11px] font-bold rounded-xl transition-all",
                                    personaMetric === m
                                        ? "bg-slate-800 text-white shadow-md"
                                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                )}
                            >
                                {m === 'conversion' && 'Conversion %'}
                                {m === 'calls' && 'Appels'}
                                {m === 'meetings' && 'RDV'}
                            </button>
                        ))}
                    </div>
                </div>

                {isLoadingPersona ? (
                    <div className="flex items-center justify-center py-12">
                        <RefreshCw className="w-6 h-6 text-indigo-500 animate-spin" />
                    </div>
                ) : personaData && (personaData.mode === 'single' ? personaData[personaDimension] : true) ? (
                    personaData.mode === 'compare' ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-violet-50/30 to-white p-5">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                                        <GitCompare className="w-4 h-4 text-violet-600" />
                                    </div>
                                    <h4 className="text-[13px] font-bold text-slate-800">{personaData.segmentA?.label}</h4>
                                </div>
                                <PersonaChart
                                    data={[...(personaData.segmentA?.[personaDimension] || [])]
                                        .map((r: any) => ({
                                            name: r.value?.length > 16 ? r.value.slice(0, 16) + '…' : r.value,
                                            fullName: r.value,
                                            conversionRate: r.conversionRate,
                                            calls: r.calls,
                                            meetings: r.meetings,
                                        }))
                                        .sort((a: any, b: any) => personaMetric === 'conversion' ? b.conversionRate - a.conversionRate : personaMetric === 'calls' ? b.calls - a.calls : b.meetings - a.meetings)
                                        .slice(0, 8)}
                                    height={260}
                                    metric={personaMetric}
                                />
                            </div>
                            <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-indigo-50/30 to-white p-5">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                                        <GitCompare className="w-4 h-4 text-indigo-600" />
                                    </div>
                                    <h4 className="text-[13px] font-bold text-slate-800">{personaData.segmentB?.label}</h4>
                                </div>
                                <PersonaChart
                                    data={[...(personaData.segmentB?.[personaDimension] || [])]
                                        .map((r: any) => ({
                                            name: r.value?.length > 16 ? r.value.slice(0, 16) + '…' : r.value,
                                            fullName: r.value,
                                            conversionRate: r.conversionRate,
                                            calls: r.calls,
                                            meetings: r.meetings,
                                        }))
                                        .sort((a: any, b: any) => personaMetric === 'conversion' ? b.conversionRate - a.conversionRate : personaMetric === 'calls' ? b.calls - a.calls : b.meetings - a.meetings)
                                        .slice(0, 8)}
                                    height={260}
                                    metric={personaMetric}
                                />
                            </div>
                        </div>
                    ) : personaChartData.length > 0 ? (
                        <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-slate-50/50 to-white p-5">
                            {personaMetric === 'conversion' && (
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="flex gap-1.5 text-[11px] font-bold text-slate-500">
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />≥5%</span>
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500" />≥3%</span>
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-400" />&lt;3%</span>
                                    </div>
                                </div>
                            )}
                            <PersonaChart data={personaChartData} height={300} metric={personaMetric} />
                        </div>
                    ) : (
                        <div className="text-center py-12 text-[13px] text-slate-500 font-medium">
                            {compareMode === 'lists' && (!selectedMissions.length || selectedMissions.length > 1)
                                ? "Sélectionnez une mission pour comparer deux listes."
                                : compareMode === 'lists' && (!compareListA || !compareListB)
                                    ? "Sélectionnez les deux listes à comparer."
                                    : compareMode === 'missions' && (compareMissionA.length === 0 || compareMissionB.length === 0)
                                        ? "Sélectionnez les deux missions à comparer."
                                        : "Aucune donnée pour cette période et ces filtres."}
                        </div>
                    )
                ) : (
                    <div className="text-center py-12 text-[13px] text-slate-500 font-medium">
                        Aucune donnée pour cette période et ces filtres.
                    </div>
                )}
            </div>

            {/* JOURNAL TABLE */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow p-5">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        <h3 className="text-[15px] font-bold text-slate-800">Journal d'Activité</h3>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-2 sm:pb-0">
                        <button className={cn("px-3.5 py-1.5 text-[11px] font-bold transition-all whitespace-nowrap rounded-xl", journalFilter === 'all' ? "bg-slate-800 text-white shadow-md shadow-slate-800/20" : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200")} onClick={() => setJournalFilter('all')}>
                            Tous <span className={cn("ml-1.5 px-1.5 py-0.5 rounded text-[9px]", journalFilter === 'all' ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500")}>{actions.length}</span>
                        </button>
                        <button className={cn("px-3.5 py-1.5 text-[11px] font-bold transition-all whitespace-nowrap rounded-xl flex items-center gap-1.5", journalFilter === 'meetings' ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20" : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200")} onClick={() => setJournalFilter('meetings')}>
                            <div className={cn("w-1.5 h-1.5 rounded-full", journalFilter === 'meetings' ? "bg-white" : "bg-emerald-500")} /> Meetings
                        </button>
                        <button className={cn("px-3.5 py-1.5 text-[11px] font-bold transition-all whitespace-nowrap rounded-xl flex items-center gap-1.5", journalFilter === 'callbacks' ? "bg-amber-500 text-white shadow-md shadow-amber-500/20" : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200")} onClick={() => setJournalFilter('callbacks')}>
                            <div className={cn("w-1.5 h-1.5 rounded-full", journalFilter === 'callbacks' ? "bg-white" : "bg-amber-500")} /> Intéressés
                        </button>
                        <button className={cn("px-3.5 py-1.5 text-[11px] font-bold transition-all whitespace-nowrap rounded-xl flex items-center gap-1.5", journalFilter === 'disqualified' ? "bg-red-500 text-white shadow-md shadow-red-500/20" : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200")} onClick={() => setJournalFilter('disqualified')}>
                            <div className={cn("w-1.5 h-1.5 rounded-full", journalFilter === 'disqualified' ? "bg-white" : "bg-red-500")} /> Disqualifiés
                        </button>
                        <button className={cn("px-3.5 py-1.5 text-[11px] font-bold transition-all whitespace-nowrap rounded-xl flex items-center gap-1.5", journalFilter === 'no_response' ? "bg-blue-500 text-white shadow-md shadow-blue-500/20" : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200")} onClick={() => setJournalFilter('no_response')}>
                            <div className={cn("w-1.5 h-1.5 rounded-full", journalFilter === 'no_response' ? "bg-white" : "bg-blue-500")} /> Sans réponse
                        </button>
                    </div>

                    <div className="relative shrink-0 w-full md:w-auto">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input className="w-full md:w-56 pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-[12px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500/50 transition-all placeholder:text-slate-400 shadow-sm" type="text" placeholder="Rechercher..." disabled />
                    </div>
                </div>

                <div className="[&_.rt-table]:border-slate-100 [&_th]:text-[10px] [&_th]:font-extrabold [&_th]:text-slate-400 [&_th]:uppercase [&_th]:tracking-widest [&_th]:bg-slate-50/50 [&_th]:py-3 [&_td]:py-3.5 [&_td]:text-[13px] border border-slate-100 rounded-xl overflow-hidden [&_.rt-pagination]:p-3 [&_.rt-pagination]:border-t [&_.rt-pagination]:border-slate-100">
                    <DataTable
                        data={filteredActions}
                        columns={[
                            { key: "createdAt", header: "Date", sortable: true, render: (val: string) => <div className="text-[12px] text-slate-500 font-bold font-mono bg-slate-50 px-2 py-1 rounded w-max">{new Date(val).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div> },
                            { key: "sdrName", header: "SDR", sortable: true, render: (val: string) => <div className="flex items-center gap-2"><div className="w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-black text-white shrink-0 shadow-sm" style={{ background: getSdrColor(val) }}>{val.substring(0, 2).toUpperCase()}</div><span className="font-bold text-slate-700">{val}</span></div> },
                            { key: "missionName", header: "Mission", sortable: true, render: (val: string) => <span className="text-[12px] font-bold text-violet-600 bg-violet-50 px-2 py-1 rounded-md">{val}</span> },
                            { key: "contactName", header: "Contact", sortable: true, render: (val: string, row: any) => <div><div className="font-black text-slate-800 tracking-tight">{val}</div><div className="text-[11.5px] font-medium text-slate-400">{row.companyName}</div></div> },
                            {
                                key: "result", header: "Résultat", sortable: true, render: (val: string) => {
                                    let bg = 'bg-slate-100 text-slate-600', dot = 'bg-slate-400';
                                    if (val === 'MEETING_BOOKED') { bg = 'bg-emerald-50 text-emerald-700 border border-emerald-100/50'; dot = 'bg-emerald-500'; }
                                    if (val === 'CALLBACK_REQUESTED' || val === 'INTERESTED') { bg = 'bg-amber-50 text-amber-700 border border-amber-100/50'; dot = 'bg-amber-500'; }
                                    if (val === 'DISQUALIFIED') { bg = 'bg-red-50 text-red-700 border border-red-100/50'; dot = 'bg-red-500'; }
                                    if (val === 'NO_RESPONSE') { bg = 'bg-blue-50 text-blue-700 border border-blue-100/50'; dot = 'bg-blue-500'; }
                                    return <span className={cn("px-2.5 py-1.5 rounded-full text-[10px] font-bold tracking-wider flex w-max items-center gap-1.5 uppercase", bg)}><div className={cn("w-1.5 h-1.5 rounded-full", dot)} />{ACTION_RESULT_LABELS[val] || val}</span>
                                }
                            },
                            { key: "duration", header: "Durée", sortable: true, render: (val: number) => <span className="text-slate-500 text-[11.5px] font-mono font-bold bg-slate-50 px-2 py-1 rounded">{val ? `${Math.floor(val / 60)}m ${val % 60}s` : '-'}</span> }
                        ]}
                        keyField="id"
                        pagination
                        pageSize={15}
                        loading={isLoadingActions}
                    />
                </div>
            </div>

            {/* Report Modal */}
            <Modal
                isOpen={showReportModal}
                onClose={() => !isGeneratingReport && setShowReportModal(false)}
                title="Exporter les stats en PDF"
                description="Choisissez la période. Vos indicateurs et la performance de l'équipe seront ouverts dans un nouvel onglet Chrome."
                size="md"
            >
                <div className="space-y-5">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Type de rapport</label>
                        <div className="flex gap-2">
                            {(["daily", "weekly", "custom"] as const).map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setReportType(t)}
                                    className={cn(
                                        "flex-1 px-3 py-2.5 rounded-xl text-[13px] font-semibold border transition-all",
                                        reportType === t
                                            ? "bg-violet-50 border-violet-300 text-violet-700"
                                            : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                                    )}
                                >
                                    {t === "daily" ? "Quotidien" : t === "weekly" ? "Hebdomadaire" : "Personnalisé"}
                                </button>
                            ))}
                        </div>
                    </div>

                    {reportType === "daily" && (
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Date</label>
                            <input
                                type="date"
                                value={reportDate}
                                onChange={(e) => setReportDate(e.target.value)}
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-[13px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                            />
                        </div>
                    )}

                    {reportType === "weekly" && (
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Date (dans la semaine)</label>
                            <input
                                type="date"
                                value={reportDate}
                                onChange={(e) => setReportDate(e.target.value)}
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-[13px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                            />
                            <p className="text-[11px] text-slate-400 mt-1">La semaine (lun-dim) contenant cette date sera utilisée.</p>
                        </div>
                    )}

                    {reportType === "custom" && (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Du</label>
                                <input
                                    type="date"
                                    value={reportDateFrom}
                                    onChange={(e) => setReportDateFrom(e.target.value)}
                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-[13px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Au</label>
                                <input
                                    type="date"
                                    value={reportDateTo}
                                    onChange={(e) => setReportDateTo(e.target.value)}
                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-[13px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                                />
                            </div>
                        </div>
                    )}

                    <p className="text-[12px] text-slate-500">
                        Mission(s) et filtres actuels : {selectedMissions.length ? selectedMissions.length + " mission(s)" : "Toutes"} · SDR : {selectedSdrs.length || "Tous"}
                    </p>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setShowReportModal(false)}
                            disabled={isGeneratingReport}
                            className="px-4 py-2.5 text-[13px] font-semibold text-slate-600 hover:bg-slate-50 rounded-xl transition-colors"
                        >
                            Annuler
                        </button>
                        <button
                            type="button"
                            onClick={handleGenerateReport}
                            disabled={isGeneratingReport}
                            className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white text-[13px] font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-60 transition-colors"
                        >
                            {isGeneratingReport ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Préparation du PDF…
                                </>
                            ) : (
                                <>
                                    <FileText className="w-4 h-4" />
                                    Exporter les stats
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </Modal>

        </div>
    );
}
