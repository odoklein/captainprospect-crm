"use client";

import { useMemo } from "react";
import {
    PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
    ResponsiveContainer, Legend
} from "recharts";
import { AlertTriangle, CheckCircle2, Clock, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskStats {
    byStatus: { TODO: number; IN_PROGRESS: number; IN_REVIEW: number; DONE: number };
    byPriority: { LOW: number; MEDIUM: number; HIGH: number; URGENT: number };
    byAssignee: { name: string; count: number; completed: number }[];
    total: number;
    completed: number;
    overdue: number;
    completionPercent: number;
}

interface ProjectAnalyticsProps {
    taskStats: TaskStats;
    className?: string;
}

const STATUS_COLORS = {
    "À faire": "#94a3b8",
    "En cours": "#3b82f6",
    "En revue": "#f59e0b",
    "Terminé": "#10b981",
};

const PRIORITY_COLORS = {
    Basse: "#94a3b8",
    Moyenne: "#3b82f6",
    Haute: "#f97316",
    Urgent: "#ef4444",
};

export function ProjectAnalytics({ taskStats, className }: ProjectAnalyticsProps) {
    const statusData = useMemo(
        () => [
            { name: "À faire", value: taskStats.byStatus.TODO },
            { name: "En cours", value: taskStats.byStatus.IN_PROGRESS },
            { name: "En revue", value: taskStats.byStatus.IN_REVIEW },
            { name: "Terminé", value: taskStats.byStatus.DONE },
        ].filter((d) => d.value > 0),
        [taskStats.byStatus]
    );

    const priorityData = useMemo(
        () => [
            { name: "Basse", value: taskStats.byPriority.LOW },
            { name: "Moyenne", value: taskStats.byPriority.MEDIUM },
            { name: "Haute", value: taskStats.byPriority.HIGH },
            { name: "Urgent", value: taskStats.byPriority.URGENT },
        ].filter((d) => d.value > 0),
        [taskStats.byPriority]
    );

    const assigneeData = useMemo(
        () =>
            taskStats.byAssignee.map((a) => ({
                name: a.name.split(" ")[0],
                total: a.count,
                completed: a.completed,
                remaining: a.count - a.completed,
            })),
        [taskStats.byAssignee]
    );

    return (
        <div className={cn("space-y-6", className)}>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                    icon={<TrendingUp className="w-5 h-5 text-primary-600" />}
                    label="Progression"
                    value={`${taskStats.completionPercent}%`}
                    detail={`${taskStats.completed}/${taskStats.total} tâches`}
                    accent="indigo"
                />
                <KpiCard
                    icon={<Clock className="w-5 h-5 text-blue-600" />}
                    label="En cours"
                    value={`${taskStats.byStatus.IN_PROGRESS + taskStats.byStatus.IN_REVIEW}`}
                    detail="tâches actives"
                    accent="blue"
                />
                <KpiCard
                    icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
                    label="En retard"
                    value={`${taskStats.overdue}`}
                    detail="tâches échues"
                    accent="red"
                />
                <KpiCard
                    icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                    label="Terminées"
                    value={`${taskStats.completed}`}
                    detail="tâches"
                    accent="emerald"
                />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Status distribution */}
                {statusData.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                        <h3 className="text-sm font-semibold text-slate-700 mb-3">Par statut</h3>
                        <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                                <Pie
                                    data={statusData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={50}
                                    outerRadius={80}
                                    paddingAngle={3}
                                    dataKey="value"
                                >
                                    {statusData.map((entry) => (
                                        <Cell
                                            key={entry.name}
                                            fill={STATUS_COLORS[entry.name as keyof typeof STATUS_COLORS]}
                                        />
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(value: number, name: string) => [`${value} tâches`, name]}
                                />
                                <Legend
                                    iconType="circle"
                                    iconSize={8}
                                    wrapperStyle={{ fontSize: "12px" }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {/* Priority distribution */}
                {priorityData.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                        <h3 className="text-sm font-semibold text-slate-700 mb-3">Par priorité</h3>
                        <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                                <Pie
                                    data={priorityData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={50}
                                    outerRadius={80}
                                    paddingAngle={3}
                                    dataKey="value"
                                >
                                    {priorityData.map((entry) => (
                                        <Cell
                                            key={entry.name}
                                            fill={PRIORITY_COLORS[entry.name as keyof typeof PRIORITY_COLORS]}
                                        />
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(value: number, name: string) => [`${value} tâches`, name]}
                                />
                                <Legend
                                    iconType="circle"
                                    iconSize={8}
                                    wrapperStyle={{ fontSize: "12px" }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {/* Team workload */}
                {assigneeData.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                        <h3 className="text-sm font-semibold text-slate-700 mb-3">Charge équipe</h3>
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={assigneeData} layout="vertical" margin={{ left: 0 }}>
                                <XAxis type="number" hide />
                                <YAxis
                                    type="category"
                                    dataKey="name"
                                    width={60}
                                    tick={{ fontSize: 12 }}
                                />
                                <Tooltip
                                    formatter={(value: number, name: string) => [
                                        `${value}`,
                                        name === "completed" ? "Terminées" : "Restantes",
                                    ]}
                                />
                                <Bar dataKey="completed" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="remaining" stackId="a" fill="#e2e8f0" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================
// KPI Card
// ============================================

function KpiCard({
    icon,
    label,
    value,
    detail,
    accent,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    detail: string;
    accent: string;
}) {
    return (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
                <div className={cn("p-2 rounded-lg", `bg-${accent}-50`)}>{icon}</div>
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                    {label}
                </span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{detail}</p>
        </div>
    );
}
