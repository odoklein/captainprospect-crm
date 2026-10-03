"use client";

import { useState, useEffect, useCallback } from "react";
import {
    CheckCircle2,
    Circle,
    Loader2,
    Users,
    Monitor,
    Headphones,
    Briefcase,
    Globe,
    LayoutGrid,
    List,
    Calendar,
    Search,
    Filter,
    ListChecks,
    ChevronDown,
    Clock,
    ArrowUpRight,
    Building2,
    ChevronRight,
    X,
    AlertTriangle,
    ArrowUp,
    ArrowRight,
    ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================
// TYPES
// ============================================

export interface SessionTaskItem {
    id: string;
    label: string;
    assignee: string | null;
    assigneeRole: "SDR" | "MANAGER" | "DEV" | "ALWAYS";
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    doneAt: string | null;
    createdAt: string;
    sessionId: string;
    sessionType: string;
    sessionDate: string;
    clientId: string;
    clientName: string;
}

// ============================================
// CONSTANTS
// ============================================

const ROLE_TABS = [
    { key: "ALL", label: "Toutes", icon: Globe, color: "var(--brand-primary-600)", bg: "var(--brand-primary-50)" },
    { key: "SDR", label: "SDRs", icon: Headphones, color: "#10B981", bg: "#F0FDF4" },
    { key: "MANAGER", label: "Managers", icon: Briefcase, color: "#F59E0B", bg: "#FFF7ED" },
    { key: "DEV", label: "Devs", icon: Monitor, color: "#3B82F6", bg: "#EFF6FF" },
    { key: "ALWAYS", label: "Toujours", icon: Users, color: "var(--brand-accent-600)", bg: "var(--brand-accent-50)" },
] as const;

const PRIORITY_CONFIG = {
    URGENT: { label: "Urgent", icon: AlertTriangle, color: "#EF4444", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.2)" },
    HIGH: { label: "Haute", icon: ArrowUp, color: "#F59E0B", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)" },
    MEDIUM: { label: "Moyenne", icon: ArrowRight, color: "#3B82F6", bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.2)" },
    LOW: { label: "Basse", icon: ArrowDown, color: "var(--ds-ink-3)", bg: "color-mix(in oklab, var(--ds-ink-3) 8%, transparent)", border: "color-mix(in oklab, var(--ds-ink-3) 20%, transparent)" },
};

const ROLE_BADGE_CONFIG = {
    SDR: { label: "SDR", color: "#10B981", bg: "rgba(16,185,129,0.1)" },
    MANAGER: { label: "Manager", color: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
    DEV: { label: "Dev", color: "#3B82F6", bg: "rgba(59,130,246,0.1)" },
    ALWAYS: { label: "Tous", color: "var(--brand-accent-600)", bg: "color-mix(in oklab, var(--brand-accent-500) 10%, transparent)" },
};

// ============================================
// MAIN COMPONENT
// ============================================

export default function SessionTaskBoard() {
    const [tasks, setTasks] = useState<SessionTaskItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeRole, setActiveRole] = useState<string>("ALL");
    const [view, setView] = useState<"kanban" | "list">("kanban");
    const [searchQuery, setSearchQuery] = useState("");
    const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
    const [showDone, setShowDone] = useState(false);
    const [stats, setStats] = useState({ SDR: 0, MANAGER: 0, DEV: 0, ALWAYS: 0 });

    // ============================================
    // FETCH TASKS
    // ============================================

    const fetchTasks = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (activeRole !== "ALL") params.set("role", activeRole);
            params.set("status", showDone ? "all" : "pending");
            if (searchQuery.trim()) params.set("search", searchQuery.trim());

            const res = await fetch(`/api/session-tasks?${params}`);
            const json = await res.json();
            if (json.success) {
                setTasks(json.data.tasks);
                setStats(json.data.byRole);
            }
        } catch (error) {
            console.error("Failed to fetch session tasks:", error);
        } finally {
            setIsLoading(false);
        }
    }, [activeRole, showDone, searchQuery]);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    // ============================================
    // TOGGLE TASK
    // ============================================

    const toggleTask = async (taskId: string) => {
        setUpdatingTaskId(taskId);
        try {
            const res = await fetch("/api/session-tasks", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: taskId, doneAt: "toggle" }),
            });
            const json = await res.json();
            if (json.success) {
                setTasks((prev) =>
                    prev.map((t) =>
                        t.id === taskId
                            ? { ...t, doneAt: json.data.doneAt }
                            : t
                    )
                );
            }
        } catch (error) {
            console.error("Failed to toggle task:", error);
        } finally {
            setUpdatingTaskId(null);
        }
    };

    // ============================================
    // FILTERED TASKS
    // ============================================

    const filteredTasks = tasks.filter((t) => {
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            if (
                !t.label.toLowerCase().includes(q) &&
                !t.clientName.toLowerCase().includes(q) &&
                !(t.assignee || "").toLowerCase().includes(q)
            ) {
                return false;
            }
        }
        return true;
    });

    const pendingTasks = filteredTasks.filter((t) => !t.doneAt);
    const doneTasks = filteredTasks.filter((t) => !!t.doneAt);

    // Group by priority for Kanban
    const kanbanColumns = [
        { key: "URGENT", tasks: pendingTasks.filter((t) => t.priority === "URGENT") },
        { key: "HIGH", tasks: pendingTasks.filter((t) => t.priority === "HIGH") },
        { key: "MEDIUM", tasks: pendingTasks.filter((t) => t.priority === "MEDIUM") },
        { key: "LOW", tasks: pendingTasks.filter((t) => t.priority === "LOW") },
    ];

    // ============================================
    // RENDER
    // ============================================

    return (
        <div className="space-y-0">
            {/* ── Header ── */}
            <div
                className="relative overflow-hidden rounded-2xl p-6 mb-6"
                style={{
                    background: "var(--ds-inverse)",
                }}
            >

                <div className="relative z-10">
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h1 className="text-[22px] font-bold text-white tracking-tight flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--ds-inverse-raised)" }}>
                                    <ListChecks className="w-[18px] h-[18px] text-accent-300" />
                                </div>
                                Tâches d'équipe
                            </h1>
                            <p className="text-[13px] mt-1.5 ml-[46px]" style={{ color: "var(--ds-inverse-ink-3)" }}>
                                Tâches extraites des comptes rendus de session
                            </p>
                        </div>

                        {/* View Toggle */}
                        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.06)" }}>
                            {([
                                { key: "kanban" as const, icon: LayoutGrid, label: "Kanban" },
                                { key: "list" as const, icon: List, label: "Liste" },
                            ]).map(({ key, icon: Icon, label }) => (
                                <button
                                    key={key}
                                    onClick={() => setView(key)}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-semibold transition-all duration-200",
                                        view === key
                                            ? "text-white shadow-lg"
                                            : "text-inverse-ink-3 hover:text-inverse-ink-2"
                                    )}
                                    style={view === key ? { background: "var(--ds-inverse-raised)" } : {}}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Stats Bar */}
                    <div className="flex items-center gap-3 ml-[46px]">
                        {ROLE_TABS.slice(1).map((tab) => (
                            <div
                                key={tab.key}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                                style={{ background: "rgba(255,255,255,0.04)" }}
                            >
                                <div className="w-2 h-2 rounded-full" style={{ background: tab.color }} />
                                <span className="text-[11px] font-medium" style={{ color: "var(--ds-inverse-ink-2)" }}>
                                    {tab.label}
                                </span>
                                <span className="text-[12px] font-bold text-white">
                                    {stats[tab.key as keyof typeof stats] || 0}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Role Filter Tabs ── */}
            <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
                {ROLE_TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeRole === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveRole(tab.key)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200 whitespace-nowrap border",
                                isActive
                                    ? "shadow-sm"
                                    : "bg-white border-line text-ink-2 hover:border-line-strong hover:text-ink"
                            )}
                            style={
                                isActive
                                    ? {
                                          background: tab.bg,
                                          borderColor: `color-mix(in oklab, ${tab.color} 19%, transparent)`,
                                          color: tab.color,
                                      }
                                    : {}
                            }
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                            {tab.key !== "ALL" && (
                                <span
                                    className={cn(
                                        "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                                        isActive ? "text-white" : "text-ink-3 bg-surface-3"
                                    )}
                                    style={isActive ? { background: tab.color } : {}}
                                >
                                    {stats[tab.key as keyof typeof stats] || 0}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ── Search & Filters ── */}
            <div className="flex items-center gap-3 mb-5">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" />
                    <input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Rechercher une tâche, client ou assigné..."
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-line rounded-xl text-[13px] text-ink placeholder:text-ink-4 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 transition-all"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                <button
                    onClick={() => setShowDone(!showDone)}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-semibold border transition-all",
                        showDone
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : "bg-white border-line text-ink-2 hover:border-line-strong"
                    )}
                >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {showDone ? "Masquer terminées" : "Voir terminées"}
                </button>
            </div>

            {/* ── Loading ── */}
            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-7 h-7 text-primary-600 animate-spin" />
                        <span className="text-[13px] text-ink-3 font-medium">Chargement des tâches...</span>
                    </div>
                </div>
            ) : (
                <>
                    {/* ── Kanban View ── */}
                    {view === "kanban" && (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                            {kanbanColumns.map((column) => {
                                const config = PRIORITY_CONFIG[column.key as keyof typeof PRIORITY_CONFIG];
                                const PriorityIcon = config.icon;
                                return (
                                    <div
                                        key={column.key}
                                        className="rounded-2xl border overflow-hidden flex flex-col"
                                        style={{
                                            background: "white",
                                            borderColor: "var(--ds-line)",
                                        }}
                                    >
                                        {/* Column Header */}
                                        <div
                                            className="px-4 py-3 border-b flex items-center justify-between"
                                            style={{
                                                background: config.bg,
                                                borderColor: config.border,
                                            }}
                                        >
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                                                    style={{ background: `color-mix(in oklab, ${config.color} 8%, transparent)` }}
                                                >
                                                    <PriorityIcon
                                                        className="w-3.5 h-3.5"
                                                        style={{ color: config.color }}
                                                    />
                                                </div>
                                                <span className="text-[13px] font-bold" style={{ color: config.color }}>
                                                    {config.label}
                                                </span>
                                            </div>
                                            <span
                                                className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white"
                                                style={{ background: config.color }}
                                            >
                                                {column.tasks.length}
                                            </span>
                                        </div>

                                        {/* Column Body */}
                                        <div className="p-2.5 space-y-2 flex-1 overflow-y-auto max-h-[calc(100vh-420px)]">
                                            {column.tasks.map((task) => (
                                                <TaskCard
                                                    key={task.id}
                                                    task={task}
                                                    isUpdating={updatingTaskId === task.id}
                                                    onToggle={() => toggleTask(task.id)}
                                                />
                                            ))}

                                            {column.tasks.length === 0 && (
                                                <div className="flex items-center justify-center h-20 border-2 border-dashed border-line rounded-xl">
                                                    <span className="text-[12px] text-ink-4">Aucune tâche</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ── List View ── */}
                    {view === "list" && (
                        <div className="bg-white rounded-2xl border border-line overflow-hidden shadow-sm">
                            {/* Table Header */}
                            <div className="grid grid-cols-[1fr_120px_100px_100px_140px] gap-4 px-5 py-3 border-b border-line bg-surface-2">
                                <span className="text-[11px] font-bold text-ink-3 uppercase tracking-wider">Tâche</span>
                                <span className="text-[11px] font-bold text-ink-3 uppercase tracking-wider">Client</span>
                                <span className="text-[11px] font-bold text-ink-3 uppercase tracking-wider">Rôle</span>
                                <span className="text-[11px] font-bold text-ink-3 uppercase tracking-wider">Priorité</span>
                                <span className="text-[11px] font-bold text-ink-3 uppercase tracking-wider">Session</span>
                            </div>

                            {/* Pending Tasks */}
                            {pendingTasks.map((task) => (
                                <TaskListRow
                                    key={task.id}
                                    task={task}
                                    isUpdating={updatingTaskId === task.id}
                                    onToggle={() => toggleTask(task.id)}
                                />
                            ))}

                            {/* Completed Tasks */}
                            {showDone && doneTasks.length > 0 && (
                                <>
                                    <div className="px-5 py-2.5 bg-surface-3 border-y border-line">
                                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ink-3 uppercase tracking-wider">
                                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                            Terminées ({doneTasks.length})
                                        </span>
                                    </div>
                                    {doneTasks.map((task) => (
                                        <TaskListRow
                                            key={task.id}
                                            task={task}
                                            isUpdating={updatingTaskId === task.id}
                                            onToggle={() => toggleTask(task.id)}
                                        />
                                    ))}
                                </>
                            )}

                            {/* Empty State */}
                            {filteredTasks.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-16">
                                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "var(--ds-surface-2)" }}>
                                        <CheckCircle2 className="w-7 h-7 text-ink-4" />
                                    </div>
                                    <p className="text-[14px] font-semibold text-ink">Aucune tâche</p>
                                    <p className="text-[12px] text-ink-3 mt-1">
                                        Les tâches extraites des CRs apparaîtront ici
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ============================================
// TASK CARD (Kanban)
// ============================================

function TaskCard({
    task,
    isUpdating,
    onToggle,
}: {
    task: SessionTaskItem;
    isUpdating: boolean;
    onToggle: () => void;
}) {
    const roleBadge = ROLE_BADGE_CONFIG[task.assigneeRole];
    const isDone = !!task.doneAt;

    return (
        <div
            className={cn(
                "group relative bg-white rounded-xl border border-line p-3.5 transition-all duration-200",
                "hover:border-line-strong hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)]",
                isDone && "opacity-60"
            )}
        >
            <div className="flex items-start gap-2.5">
                {/* Toggle Button */}
                <button
                    onClick={onToggle}
                    disabled={isUpdating}
                    className={cn(
                        "mt-0.5 flex-shrink-0 transition-all duration-200",
                        isDone
                            ? "text-emerald-500 hover:text-emerald-600"
                            : "text-ink-4 hover:text-primary-600"
                    )}
                >
                    {isUpdating ? (
                        <Loader2 className="w-4.5 h-4.5 animate-spin text-primary-600" />
                    ) : isDone ? (
                        <CheckCircle2 className="w-[18px] h-[18px]" />
                    ) : (
                        <Circle className="w-[18px] h-[18px]" />
                    )}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <p
                        className={cn(
                            "text-[13px] font-medium leading-snug",
                            isDone
                                ? "line-through text-ink-3"
                                : "text-ink"
                        )}
                    >
                        {task.label}
                    </p>

                    {/* Meta */}
                    <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                        {/* Role Badge */}
                        <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                            style={{
                                color: roleBadge.color,
                                background: roleBadge.bg,
                            }}
                        >
                            {roleBadge.label}
                        </span>

                        {/* Client */}
                        <span className="flex items-center gap-1 text-[10px] text-ink-3">
                            <Building2 className="w-3 h-3" />
                            {task.clientName}
                        </span>

                        {/* Assignee */}
                        {task.assignee && (
                            <span className="text-[10px] text-ink-2 font-medium bg-surface-3 px-1.5 py-0.5 rounded">
                                {task.assignee}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================
// TASK LIST ROW
// ============================================

function TaskListRow({
    task,
    isUpdating,
    onToggle,
}: {
    task: SessionTaskItem;
    isUpdating: boolean;
    onToggle: () => void;
}) {
    const roleBadge = ROLE_BADGE_CONFIG[task.assigneeRole];
    const priorityConfig = PRIORITY_CONFIG[task.priority];
    const PriorityIcon = priorityConfig.icon;
    const isDone = !!task.doneAt;

    return (
        <div
            className={cn(
                "grid grid-cols-[1fr_120px_100px_100px_140px] gap-4 px-5 py-3 border-b border-line-subtle items-center transition-all hover:bg-surface-2 group",
                isDone && "opacity-50"
            )}
        >
            {/* Task Label */}
            <div className="flex items-center gap-3 min-w-0">
                <button
                    onClick={onToggle}
                    disabled={isUpdating}
                    className={cn(
                        "flex-shrink-0 transition-all",
                        isDone
                            ? "text-emerald-500 hover:text-emerald-600"
                            : "text-ink-4 hover:text-primary-600"
                    )}
                >
                    {isUpdating ? (
                        <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
                    ) : isDone ? (
                        <CheckCircle2 className="w-[16px] h-[16px]" />
                    ) : (
                        <Circle className="w-[16px] h-[16px]" />
                    )}
                </button>
                <div className="min-w-0">
                    <p
                        className={cn(
                            "text-[13px] font-medium truncate",
                            isDone ? "line-through text-ink-3" : "text-ink"
                        )}
                    >
                        {task.label}
                    </p>
                    {task.assignee && (
                        <p className="text-[10px] text-ink-3 mt-0.5 truncate">
                            → {task.assignee}
                        </p>
                    )}
                </div>
            </div>

            {/* Client */}
            <span className="text-[12px] text-ink-2 truncate">{task.clientName}</span>

            {/* Role */}
            <span
                className="text-[10px] font-bold px-2 py-1 rounded-md w-fit"
                style={{ color: roleBadge.color, background: roleBadge.bg }}
            >
                {roleBadge.label}
            </span>

            {/* Priority */}
            <div className="flex items-center gap-1.5">
                <PriorityIcon className="w-3 h-3" style={{ color: priorityConfig.color }} />
                <span className="text-[11px] font-medium" style={{ color: priorityConfig.color }}>
                    {priorityConfig.label}
                </span>
            </div>

            {/* Session Date */}
            <div className="flex items-center gap-1.5 text-[11px] text-ink-3">
                <Calendar className="w-3 h-3" />
                <span>
                    {new Date(task.sessionDate).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                    })}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-ink-2 font-medium">
                    {task.sessionType}
                </span>
            </div>
        </div>
    );
}
