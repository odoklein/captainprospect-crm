"use client";

import { useState, useEffect } from "react";
import {
    ListChecks,
    Loader2,
    CheckCircle2,
    Circle,
    Trash2,
    Plus,
    Headphones,
    Briefcase,
    Monitor,
    Users,
    AlertTriangle,
    ArrowUp,
    ArrowRight,
    ArrowDown,
    AlertCircle,
    Calendar,
    ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AiMark } from "@/components/ui/AiMark";

// ============================================
// TYPES
// ============================================

export interface ExtractedTask {
    label: string;
    assigneeRole: "SDR" | "MANAGER" | "DEV" | "ALWAYS";
    assignee: string | null;
    assigneeId?: string | null;
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    dueDate?: string | null;
}

interface TeamMember {
    id: string;
    name: string;
    role: string;
}

interface AITaskExtractorProps {
    content: string;
    clientName?: string;
    sessionType?: string;
    tasks: ExtractedTask[];
    onTasksChange: (tasks: ExtractedTask[]) => void;
    compact?: boolean;
}

// ============================================
// CONSTANTS
// ============================================

const ROLE_OPTIONS = [
    { key: "SDR", label: "SDR", icon: Headphones, color: "#10B981" },
    { key: "MANAGER", label: "Manager", icon: Briefcase, color: "#F59E0B" },
    { key: "DEV", label: "Dev", icon: Monitor, color: "#3B82F6" },
    { key: "ALWAYS", label: "Tous", icon: Users, color: "var(--brand-accent-600)" },
] as const;

const PRIORITY_OPTIONS = [
    { key: "URGENT", label: "Urgent", icon: AlertTriangle, color: "#EF4444" },
    { key: "HIGH", label: "Haute", icon: ArrowUp, color: "#F59E0B" },
    { key: "MEDIUM", label: "Moyenne", icon: ArrowRight, color: "#3B82F6" },
    { key: "LOW", label: "Basse", icon: ArrowDown, color: "var(--ds-ink-3)" },
] as const;

// ============================================
// COMPONENT
// ============================================

export default function AITaskExtractor({
    content,
    clientName,
    sessionType,
    tasks,
    onTasksChange,
    compact = false,
}: AITaskExtractorProps) {
    const [isExtracting, setIsExtracting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [summary, setSummary] = useState<string | null>(null);
    const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

    useEffect(() => {
        fetch("/api/users?status=active&excludeSelf=false&limit=100")
            .then(r => r.json())
            .then(json => {
                if (json.success && json.data) {
                    setTeamMembers(json.data.map((u: any) => ({ id: u.id, name: u.name, role: u.role })));
                }
            })
            .catch(() => {});
    }, []);

    // ── Extract Tasks via Mistral ──
    const handleExtract = async () => {
        if (!content || content.trim().length < 10) {
            setError("Le contenu est trop court pour extraire des tâches.");
            return;
        }

        setIsExtracting(true);
        setError(null);
        setSummary(null);

        try {
            const res = await fetch("/api/ai/mistral/extract-tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    content: content.trim(),
                    clientName,
                    sessionType,
                }),
            });

            const json = await res.json();

            if (!json.success) {
                setError(json.error || "Erreur lors de l'extraction");
                return;
            }

            const extracted: ExtractedTask[] = json.data.tasks || [];
            onTasksChange([...tasks, ...extracted]);
            setSummary(json.data.summary || null);
        } catch (err) {
            setError("Erreur de connexion. Vérifiez votre connexion internet.");
        } finally {
            setIsExtracting(false);
        }
    };

    const addEmptyTask = () => {
        onTasksChange([
            ...tasks,
            { label: "", assigneeRole: "ALWAYS", assignee: null, assigneeId: null, priority: "MEDIUM", dueDate: null },
        ]);
    };

    // ── Remove Task ──
    const removeTask = (index: number) => {
        onTasksChange(tasks.filter((_, i) => i !== index));
    };

    // ── Update Task ──
    const updateTask = (index: number, field: keyof ExtractedTask, value: string | null) => {
        const updated = [...tasks];
        (updated[index] as any)[field] = value;
        onTasksChange(updated);
    };

    // ============================================
    // RENDER
    // ============================================

    return (
        <div className="space-y-4">
            {/* ── Header with AI Extract Button ── */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: "var(--ds-primary)" }}
                    >
                        <ListChecks className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h3 className="text-[14px] font-bold text-ink">Tâches d'équipe</h3>
                        <p className="text-[11px] text-ink-3">
                            {tasks.length > 0
                                ? `${tasks.length} tâche${tasks.length > 1 ? "s" : ""} identifiée${tasks.length > 1 ? "s" : ""}`
                                : "Extraire les tâches du CR"}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={addEmptyTask}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold bg-white border border-line text-ink-2 hover:border-line-strong hover:text-ink transition-all"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Ajouter
                    </button>

                    <button
                        onClick={handleExtract}
                        disabled={isExtracting || !content || content.trim().length < 10}
                        className={cn(
                            "flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all shadow-sm",
                            "text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                        style={{
                            background: isExtracting
                                ? "var(--ds-primary-hover)"
                                : "var(--ds-primary)",
                        }}
                    >
                        {isExtracting ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Extraction IA...
                            </>
                        ) : (
                            <>
                                <AiMark className="w-3.5 h-3.5" />
                                Extraire avec IA
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* ── Error ── */}
            {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[12px]">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                </div>
            )}

            {/* ── AI Summary ── */}
            {summary && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary-50 border border-primary-200 text-[12px] text-primary-700">
                    <AiMark className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <p className="leading-relaxed">{summary}</p>
                </div>
            )}

            {/* ── Task List ── */}
            {tasks.length > 0 && (
                <div className="space-y-2">
                    {tasks.map((task, index) => (
                        <div
                            key={index}
                            className="group bg-white border border-line rounded-xl p-3 hover:border-line-strong transition-all"
                        >
                            {/* Task Label */}
                            <div className="flex items-start gap-2.5 mb-2.5">
                                <div className="mt-1 flex-shrink-0 text-ink-4">
                                    <Circle className="w-4 h-4" />
                                </div>
                                <input
                                    value={task.label}
                                    onChange={(e) => updateTask(index, "label", e.target.value)}
                                    className="flex-1 text-[13px] font-medium text-ink placeholder:text-ink-4 bg-transparent border-none outline-none"
                                    placeholder="Description de la tâche..."
                                />
                                <button
                                    onClick={() => removeTask(index)}
                                    className="flex-shrink-0 text-ink-4 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {/* Task Meta */}
                            <div className="flex items-center gap-2 ml-[26px] flex-wrap">
                                {/* Role Selector */}
                                <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-surface-3">
                                    {ROLE_OPTIONS.map((role) => {
                                        const Icon = role.icon;
                                        const isActive = task.assigneeRole === role.key;
                                        return (
                                            <button
                                                key={role.key}
                                                onClick={() => updateTask(index, "assigneeRole", role.key)}
                                                className={cn(
                                                    "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all",
                                                    isActive
                                                        ? "bg-white shadow-sm"
                                                        : "text-ink-3 hover:text-ink-2"
                                                )}
                                                style={isActive ? { color: role.color } : {}}
                                                title={role.label}
                                            >
                                                <Icon className="w-3 h-3" />
                                                {!compact && role.label}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Priority Selector */}
                                <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-surface-3">
                                    {PRIORITY_OPTIONS.map((p) => {
                                        const Icon = p.icon;
                                        const isActive = task.priority === p.key;
                                        return (
                                            <button
                                                key={p.key}
                                                onClick={() => updateTask(index, "priority", p.key)}
                                                className={cn(
                                                    "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all",
                                                    isActive
                                                        ? "bg-white shadow-sm"
                                                        : "text-ink-3 hover:text-ink-2"
                                                )}
                                                style={isActive ? { color: p.color } : {}}
                                                title={p.label}
                                            >
                                                <Icon className="w-3 h-3" />
                                                {!compact && p.label}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Assignee Dropdown */}
                                <div className="relative">
                                    <select
                                        value={task.assigneeId || ""}
                                        onChange={(e) => {
                                            const userId = e.target.value || null;
                                            const user = teamMembers.find(u => u.id === userId);
                                            const updated = [...tasks];
                                            updated[index] = {
                                                ...updated[index],
                                                assigneeId: userId,
                                                assignee: user?.name || null,
                                            };
                                            onTasksChange(updated);
                                        }}
                                        className="text-[11px] font-medium text-ink-2 bg-surface-3 border-none outline-none rounded-md pl-2.5 pr-6 py-1.5 w-32 appearance-none focus:ring-1 focus:ring-primary-500/20"
                                    >
                                        <option value="">Non assigné</option>
                                        {teamMembers.map(m => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-4 pointer-events-none" />
                                </div>

                                {/* Due Date */}
                                <div className="relative flex items-center">
                                    <Calendar className="absolute left-2 w-3 h-3 text-ink-4 pointer-events-none" />
                                    <input
                                        type="date"
                                        value={task.dueDate ? task.dueDate.slice(0, 10) : ""}
                                        onChange={(e) => {
                                            const updated = [...tasks];
                                            updated[index] = { ...updated[index], dueDate: e.target.value || null };
                                            onTasksChange(updated);
                                        }}
                                        className="text-[11px] font-medium text-ink-2 placeholder:text-ink-4 bg-surface-3 border-none outline-none rounded-md pl-6 pr-2 py-1.5 w-32 focus:ring-1 focus:ring-primary-500/20"
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Empty State ── */}
            {tasks.length === 0 && !isExtracting && (
                <div className="flex flex-col items-center py-8 border-2 border-dashed border-line rounded-xl">
                    <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center mb-3"
                        style={{ background: "var(--ds-surface-2)" }}
                    >
                        <ListChecks className="w-5 h-5 text-ink-4" />
                    </div>
                    <p className="text-[13px] font-semibold text-ink">
                        Aucune tâche pour le moment
                    </p>
                    <p className="text-[11px] text-ink-3 mt-1 text-center max-w-[260px]">
                        « Extraire avec IA » lit le CR et propose les tâches. Vous pouvez aussi les ajouter à la main.
                    </p>
                </div>
            )}
        </div>
    );
}
