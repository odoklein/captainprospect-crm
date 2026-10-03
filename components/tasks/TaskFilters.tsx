"use client";

import { useState } from "react";
import { Search, X, Filter, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskFiltersProps {
    onFiltersChange: (filters: TaskFilterState) => void;
    members?: { id: string; name: string }[];
    showAssigneeFilter?: boolean;
    showProjectFilter?: boolean;
    className?: string;
}

export interface TaskFilterState {
    search: string;
    statuses: string[];
    priorities: string[];
    assigneeIds: string[];
    labels: string[];
}

const STATUS_OPTIONS = [
    { value: "TODO", label: "À faire", color: "bg-slate-400" },
    { value: "IN_PROGRESS", label: "En cours", color: "bg-blue-500" },
    { value: "IN_REVIEW", label: "En revue", color: "bg-amber-500" },
    { value: "DONE", label: "Terminé", color: "bg-emerald-500" },
];

const PRIORITY_OPTIONS = [
    { value: "URGENT", label: "Urgent", color: "bg-red-500" },
    { value: "HIGH", label: "Haute", color: "bg-orange-500" },
    { value: "MEDIUM", label: "Moyenne", color: "bg-blue-500" },
    { value: "LOW", label: "Basse", color: "bg-slate-400" },
];

export function TaskFilters({
    onFiltersChange,
    members = [],
    showAssigneeFilter = true,
    className,
}: TaskFiltersProps) {
    const [filters, setFilters] = useState<TaskFilterState>({
        search: "",
        statuses: [],
        priorities: [],
        assigneeIds: [],
        labels: [],
    });
    const [showFilters, setShowFilters] = useState(false);

    const updateFilters = (partial: Partial<TaskFilterState>) => {
        const next = { ...filters, ...partial };
        setFilters(next);
        onFiltersChange(next);
    };

    const toggleArrayValue = (key: keyof TaskFilterState, value: string) => {
        const arr = filters[key] as string[];
        const next = arr.includes(value)
            ? arr.filter((v) => v !== value)
            : [...arr, value];
        updateFilters({ [key]: next });
    };

    const activeCount =
        filters.statuses.length +
        filters.priorities.length +
        filters.assigneeIds.length +
        filters.labels.length;

    const clearAll = () => {
        const cleared = { search: "", statuses: [], priorities: [], assigneeIds: [], labels: [] };
        setFilters(cleared);
        onFiltersChange(cleared);
    };

    return (
        <div className={cn("space-y-3", className)}>
            {/* Search + filter toggle */}
            <div className="flex items-center gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Rechercher des tâches..."
                        value={filters.search}
                        onChange={(e) => updateFilters({ search: e.target.value })}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    />
                    {filters.search && (
                        <button
                            onClick={() => updateFilters({ search: "" })}
                            className="absolute right-3 top-1/2 -translate-y-1/2"
                        >
                            <X className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                    )}
                </div>
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={cn(
                        "flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors",
                        showFilters || activeCount > 0
                            ? "bg-primary-50 border-primary-200 text-primary-700"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    )}
                >
                    <Filter className="w-4 h-4" />
                    Filtres
                    {activeCount > 0 && (
                        <span className="ml-1 w-5 h-5 rounded-full bg-primary-600 text-white text-xs flex items-center justify-center">
                            {activeCount}
                        </span>
                    )}
                    <ChevronDown
                        className={cn(
                            "w-3.5 h-3.5 transition-transform",
                            showFilters && "rotate-180"
                        )}
                    />
                </button>
                {activeCount > 0 && (
                    <button
                        onClick={clearAll}
                        className="text-xs text-slate-500 hover:text-slate-700 whitespace-nowrap"
                    >
                        Effacer tout
                    </button>
                )}
            </div>

            {/* Expanded filters */}
            {showFilters && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                    {/* Status */}
                    <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                            Statut
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {STATUS_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    onClick={() => toggleArrayValue("statuses", opt.value)}
                                    className={cn(
                                        "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors",
                                        filters.statuses.includes(opt.value)
                                            ? "bg-primary-50 border-primary-200 text-primary-700"
                                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                    )}
                                >
                                    <span className={cn("w-2 h-2 rounded-full", opt.color)} />
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Priority */}
                    <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                            Priorité
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {PRIORITY_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    onClick={() => toggleArrayValue("priorities", opt.value)}
                                    className={cn(
                                        "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors",
                                        filters.priorities.includes(opt.value)
                                            ? "bg-primary-50 border-primary-200 text-primary-700"
                                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                    )}
                                >
                                    <span className={cn("w-2 h-2 rounded-full", opt.color)} />
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Assignee */}
                    {showAssigneeFilter && members.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                Assigné à
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                <button
                                    onClick={() => toggleArrayValue("assigneeIds", "unassigned")}
                                    className={cn(
                                        "px-2.5 py-1 text-xs font-medium rounded-md border transition-colors",
                                        filters.assigneeIds.includes("unassigned")
                                            ? "bg-primary-50 border-primary-200 text-primary-700"
                                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                    )}
                                >
                                    Non assigné
                                </button>
                                {members.map((m) => (
                                    <button
                                        key={m.id}
                                        onClick={() => toggleArrayValue("assigneeIds", m.id)}
                                        className={cn(
                                            "px-2.5 py-1 text-xs font-medium rounded-md border transition-colors",
                                            filters.assigneeIds.includes(m.id)
                                                ? "bg-primary-50 border-primary-200 text-primary-700"
                                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                        )}
                                    >
                                        {m.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
