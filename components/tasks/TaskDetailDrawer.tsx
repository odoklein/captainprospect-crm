"use client";

import { useState, useEffect, useCallback } from "react";
import {
    X, Calendar, Clock, User, GitBranch, MessageSquare, FileText,
    Activity, Plus, Check, Trash2, Loader2, ChevronRight,
    AlertCircle, Tag
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Drawer } from "@/components/ui/Drawer";
import { AiMark } from "@/components/ui/AiMark";
import { Tabs } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";

// ============================================
// TYPES
// ============================================

interface TaskDetail {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    dueDate: string | null;
    startDate: string | null;
    estimatedHours: number | null;
    loggedHours: number | null;
    labels: string[];
    position: number;
    completedAt: string | null;
    assignee: { id: string; name: string; email: string } | null;
    createdBy: { id: string; name: string };
    project: { id: string; name: string; members?: any[] };
    parentTask: { id: string; title: string } | null;
    subtasks: any[];
    comments: { id: string; content: string; createdAt: string; user: { id: string; name: string } }[];
    files: any[];
    dependentOn: { dependsOnTask: { id: string; title: string; status: string } }[];
    blockedBy: { task: { id: string; title: string; status: string } }[];
    activities: { id: string; action: string; details: any; createdAt: string; user: { id: string; name: string } }[];
    milestone: { id: string; title: string } | null;
    createdAt: string;
    updatedAt: string;
}

interface TaskDetailDrawerProps {
    taskId: string | null;
    isOpen: boolean;
    onClose: () => void;
    onUpdate: () => void;
    members?: { id: string; name: string }[];
}

const STATUS_OPTIONS = [
    { value: "TODO", label: "À faire", color: "bg-slate-200 text-slate-700" },
    { value: "IN_PROGRESS", label: "En cours", color: "bg-blue-100 text-blue-700" },
    { value: "IN_REVIEW", label: "En revue", color: "bg-amber-100 text-amber-700" },
    { value: "DONE", label: "Terminé", color: "bg-emerald-100 text-emerald-700" },
];

const PRIORITY_OPTIONS = [
    { value: "URGENT", label: "Urgent", color: "bg-red-100 text-red-700" },
    { value: "HIGH", label: "Haute", color: "bg-orange-100 text-orange-700" },
    { value: "MEDIUM", label: "Moyenne", color: "bg-blue-100 text-blue-700" },
    { value: "LOW", label: "Basse", color: "bg-slate-100 text-slate-600" },
];

// ============================================
// COMPONENT
// ============================================

export function TaskDetailDrawer({
    taskId,
    isOpen,
    onClose,
    onUpdate,
    members = [],
}: TaskDetailDrawerProps) {
    const [task, setTask] = useState<TaskDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState("details");
    const [editingTitle, setEditingTitle] = useState(false);
    const [titleValue, setTitleValue] = useState("");
    const [editingDesc, setEditingDesc] = useState(false);
    const [descValue, setDescValue] = useState("");
    const [newComment, setNewComment] = useState("");
    const [newSubtask, setNewSubtask] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);

    const fetchTask = useCallback(async () => {
        if (!taskId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/tasks/${taskId}`);
            const json = await res.json();
            if (json.success) {
                setTask(json.data);
                setTitleValue(json.data.title);
                setDescValue(json.data.description || "");
            }
        } catch (e) {
            console.error("Failed to fetch task:", e);
        } finally {
            setLoading(false);
        }
    }, [taskId]);

    useEffect(() => {
        if (isOpen && taskId) {
            fetchTask();
            setActiveTab("details");
        }
    }, [isOpen, taskId, fetchTask]);

    // ---- Handlers ----

    const updateTask = async (data: any) => {
        if (!task) return;
        try {
            const res = await fetch(`/api/tasks/${task.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            const json = await res.json();
            if (json.success) {
                await fetchTask();
                onUpdate();
            }
        } catch (e) {
            console.error("Failed to update task:", e);
        }
    };

    const saveTitle = () => {
        if (titleValue.trim() && titleValue !== task?.title) {
            updateTask({ title: titleValue.trim() });
        }
        setEditingTitle(false);
    };

    const saveDescription = () => {
        updateTask({ description: descValue.trim() || null });
        setEditingDesc(false);
    };

    const addComment = async () => {
        if (!newComment.trim() || !task) return;
        setSubmitting(true);
        try {
            const res = await fetch(`/api/tasks/${task.id}/comments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: newComment.trim() }),
            });
            if ((await res.json()).success) {
                setNewComment("");
                fetchTask();
                onUpdate();
            }
        } catch (e) {
            console.error(e);
        } finally {
            setSubmitting(false);
        }
    };

    const addSubtask = async () => {
        if (!newSubtask.trim() || !task) return;
        setSubmitting(true);
        try {
            const res = await fetch(`/api/tasks/${task.id}/subtasks`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: newSubtask.trim() }),
            });
            if ((await res.json()).success) {
                setNewSubtask("");
                fetchTask();
                onUpdate();
            }
        } catch (e) {
            console.error(e);
        } finally {
            setSubmitting(false);
        }
    };

    const toggleSubtask = async (subtaskId: string, currentStatus: string) => {
        const newStatus = currentStatus === "DONE" ? "TODO" : "DONE";
        try {
            await fetch(`/api/tasks/${subtaskId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            });
            fetchTask();
            onUpdate();
        } catch (e) {
            console.error(e);
        }
    };

    const deleteTask = async () => {
        if (!task || !confirm("Supprimer cette tâche ?")) return;
        try {
            await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
            onUpdate();
            onClose();
        } catch (e) {
            console.error(e);
        }
    };

    const aiDecompose = async () => {
        if (!task) return;
        setAiLoading(true);
        try {
            const res = await fetch("/api/ai/mistral/task-decompose", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: task.title,
                    description: task.description,
                    projectName: task.project.name,
                }),
            });
            const json = await res.json();
            if (json.success && json.data?.subtasks) {
                // Create subtasks from AI suggestions
                for (const sub of json.data.subtasks) {
                    await fetch(`/api/tasks/${task.id}/subtasks`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            title: sub.title,
                            description: sub.description,
                            priority: sub.priority,
                            estimatedHours: sub.estimatedHours,
                        }),
                    });
                }
                fetchTask();
                onUpdate();
            }
        } catch (e) {
            console.error(e);
        } finally {
            setAiLoading(false);
        }
    };

    const aiEnhance = async () => {
        if (!task) return;
        setAiLoading(true);
        try {
            const res = await fetch("/api/ai/mistral/task-enhance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: task.title,
                    description: task.description,
                    projectContext: task.project.name,
                }),
            });
            const json = await res.json();
            if (json.success && json.data) {
                const { enhancedTitle, enhancedDescription, suggestedPriority, suggestedLabels } = json.data;
                await updateTask({
                    title: enhancedTitle || task.title,
                    description: enhancedDescription || task.description,
                    priority: suggestedPriority || task.priority,
                    labels: suggestedLabels || task.labels,
                });
            }
        } catch (e) {
            console.error(e);
        } finally {
            setAiLoading(false);
        }
    };

    if (!isOpen) return null;

    const tabs = [
        { id: "details", label: "Détails", icon: <FileText className="w-3.5 h-3.5" /> },
        { id: "subtasks", label: `Sous-tâches${task?.subtasks?.length ? ` (${task.subtasks.length})` : ""}`, icon: <GitBranch className="w-3.5 h-3.5" /> },
        { id: "comments", label: `Commentaires${task?.comments?.length ? ` (${task.comments.length})` : ""}`, icon: <MessageSquare className="w-3.5 h-3.5" /> },
        { id: "activity", label: "Activité", icon: <Activity className="w-3.5 h-3.5" /> },
    ];

    const subtasksDone = task?.subtasks?.filter((s: any) => s.status === "DONE").length || 0;
    const subtasksTotal = task?.subtasks?.length || 0;

    return (
        <Drawer isOpen={isOpen} onClose={onClose} size="xl" title="">
            {loading || !task ? (
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
                </div>
            ) : (
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="px-1 pb-4 border-b border-slate-200">
                        {/* Status & Priority row */}
                        <div className="flex items-center gap-2 mb-3">
                            <select
                                value={task.status}
                                onChange={(e) => updateTask({ status: e.target.value })}
                                className={cn(
                                    "text-xs font-semibold px-2.5 py-1 rounded-md border-0 cursor-pointer appearance-none",
                                    STATUS_OPTIONS.find((s) => s.value === task.status)?.color
                                )}
                            >
                                {STATUS_OPTIONS.map((s) => (
                                    <option key={s.value} value={s.value}>{s.label}</option>
                                ))}
                            </select>
                            <select
                                value={task.priority}
                                onChange={(e) => updateTask({ priority: e.target.value })}
                                className={cn(
                                    "text-xs font-semibold px-2.5 py-1 rounded-md border-0 cursor-pointer appearance-none",
                                    PRIORITY_OPTIONS.find((p) => p.value === task.priority)?.color
                                )}
                            >
                                {PRIORITY_OPTIONS.map((p) => (
                                    <option key={p.value} value={p.value}>{p.label}</option>
                                ))}
                            </select>
                            {task.project && (
                                <span className="text-xs text-slate-500 ml-auto">
                                    {task.project.name}
                                </span>
                            )}
                        </div>

                        {/* Title */}
                        {editingTitle ? (
                            <input
                                autoFocus
                                value={titleValue}
                                onChange={(e) => setTitleValue(e.target.value)}
                                onBlur={saveTitle}
                                onKeyDown={(e) => e.key === "Enter" && saveTitle()}
                                className="w-full text-lg font-semibold text-slate-900 bg-transparent border-b-2 border-primary-400 outline-none pb-1"
                            />
                        ) : (
                            <h2
                                onClick={() => setEditingTitle(true)}
                                className="text-lg font-semibold text-slate-900 cursor-text hover:text-primary-700 transition-colors"
                            >
                                {task.title}
                            </h2>
                        )}
                    </div>

                    {/* Tabs */}
                    <div className="px-1 pt-3">
                        <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
                    </div>

                    {/* Tab content */}
                    <div className="flex-1 overflow-y-auto px-1 py-4">
                        {/* ---- DETAILS TAB ---- */}
                        {activeTab === "details" && (
                            <div className="space-y-5">
                                {/* Assignee */}
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-slate-500 flex items-center gap-2">
                                        <User className="w-4 h-4" /> Assigné à
                                    </span>
                                    <select
                                        value={task.assignee?.id || ""}
                                        onChange={(e) => updateTask({ assigneeId: e.target.value || null })}
                                        className="text-sm text-slate-700 bg-transparent border border-slate-200 rounded-md px-2 py-1 cursor-pointer"
                                    >
                                        <option value="">Non assigné</option>
                                        {members.map((m) => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Due Date */}
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-slate-500 flex items-center gap-2">
                                        <Calendar className="w-4 h-4" /> Échéance
                                    </span>
                                    <input
                                        type="date"
                                        value={task.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : ""}
                                        onChange={(e) => updateTask({ dueDate: e.target.value || null })}
                                        className="text-sm text-slate-700 bg-transparent border border-slate-200 rounded-md px-2 py-1"
                                    />
                                </div>

                                {/* Estimated hours */}
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-slate-500 flex items-center gap-2">
                                        <Clock className="w-4 h-4" /> Estimation
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="number"
                                            step="0.5"
                                            min="0"
                                            value={task.estimatedHours ?? ""}
                                            onChange={(e) => updateTask({ estimatedHours: e.target.value || null })}
                                            className="w-16 text-sm text-slate-700 bg-transparent border border-slate-200 rounded-md px-2 py-1 text-right"
                                            placeholder="-"
                                        />
                                        <span className="text-xs text-slate-400">h</span>
                                    </div>
                                </div>

                                {/* Logged hours */}
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-slate-500 flex items-center gap-2">
                                        <Clock className="w-4 h-4" /> Temps passé
                                    </span>
                                    <span className="text-sm text-slate-700">
                                        {task.loggedHours ? `${task.loggedHours}h` : "-"}
                                    </span>
                                </div>

                                {/* Labels */}
                                <div>
                                    <span className="text-sm text-slate-500 flex items-center gap-2 mb-2">
                                        <Tag className="w-4 h-4" /> Labels
                                    </span>
                                    <div className="flex flex-wrap gap-1">
                                        {task.labels.map((l) => (
                                            <span key={l} className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-md">
                                                {l}
                                            </span>
                                        ))}
                                        {task.labels.length === 0 && (
                                            <span className="text-xs text-slate-400">Aucun label</span>
                                        )}
                                    </div>
                                </div>

                                {/* Dependencies */}
                                {(task.dependentOn?.length > 0 || task.blockedBy?.length > 0) && (
                                    <div>
                                        <span className="text-sm text-slate-500 flex items-center gap-2 mb-2">
                                            <AlertCircle className="w-4 h-4" /> Dépendances
                                        </span>
                                        {task.dependentOn?.map((d: any) => (
                                            <div key={d.dependsOnTask.id} className="flex items-center gap-2 text-sm py-1">
                                                <span className="text-slate-500">Bloqué par :</span>
                                                <span className={cn(
                                                    "font-medium",
                                                    d.dependsOnTask.status === "DONE" ? "text-emerald-600 line-through" : "text-red-600"
                                                )}>
                                                    {d.dependsOnTask.title}
                                                </span>
                                            </div>
                                        ))}
                                        {task.blockedBy?.map((d: any) => (
                                            <div key={d.task.id} className="flex items-center gap-2 text-sm py-1">
                                                <span className="text-slate-500">Bloque :</span>
                                                <span className="font-medium text-slate-700">{d.task.title}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Description */}
                                <div>
                                    <span className="text-sm text-slate-500 mb-2 block">Description</span>
                                    {editingDesc ? (
                                        <div>
                                            <textarea
                                                autoFocus
                                                rows={6}
                                                value={descValue}
                                                onChange={(e) => setDescValue(e.target.value)}
                                                className="w-full text-sm text-slate-700 border border-slate-200 rounded-lg p-3 outline-none focus:border-primary-400 resize-none"
                                            />
                                            <div className="flex gap-2 mt-2">
                                                <button
                                                    onClick={saveDescription}
                                                    className="px-3 py-1 text-xs font-medium bg-primary-600 text-white rounded-md hover:bg-primary-700"
                                                >
                                                    Enregistrer
                                                </button>
                                                <button
                                                    onClick={() => { setEditingDesc(false); setDescValue(task.description || ""); }}
                                                    className="px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-md"
                                                >
                                                    Annuler
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                            onClick={() => setEditingDesc(true)}
                                            className={cn(
                                                "text-sm rounded-lg p-3 cursor-text min-h-[60px] border border-transparent hover:border-slate-200",
                                                task.description ? "text-slate-700 whitespace-pre-wrap" : "text-slate-400 italic"
                                            )}
                                        >
                                            {task.description || "Cliquer pour ajouter une description..."}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ---- SUBTASKS TAB ---- */}
                        {activeTab === "subtasks" && (
                            <div className="space-y-3">
                                {/* Progress */}
                                {subtasksTotal > 0 && (
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-emerald-500 rounded-full transition-all"
                                                style={{ width: `${(subtasksDone / subtasksTotal) * 100}%` }}
                                            />
                                        </div>
                                        <span className="text-xs text-slate-500 whitespace-nowrap">
                                            {subtasksDone}/{subtasksTotal} terminées
                                        </span>
                                    </div>
                                )}

                                {/* Subtask list */}
                                {task.subtasks.map((sub: any) => (
                                    <div
                                        key={sub.id}
                                        className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-slate-50 group"
                                    >
                                        <button
                                            onClick={() => toggleSubtask(sub.id, sub.status)}
                                            className={cn(
                                                "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                                                sub.status === "DONE"
                                                    ? "bg-emerald-500 border-emerald-500 text-white"
                                                    : "border-slate-300 hover:border-primary-400"
                                            )}
                                        >
                                            {sub.status === "DONE" && <Check className="w-3 h-3" />}
                                        </button>
                                        <span className={cn(
                                            "text-sm flex-1",
                                            sub.status === "DONE" ? "text-slate-400 line-through" : "text-slate-700"
                                        )}>
                                            {sub.title}
                                        </span>
                                        {sub.assignee && (
                                            <span className="text-xs text-slate-400">{sub.assignee.name}</span>
                                        )}
                                    </div>
                                ))}

                                {/* Add subtask */}
                                <div className="flex items-center gap-2 pt-2">
                                    <input
                                        type="text"
                                        value={newSubtask}
                                        onChange={(e) => setNewSubtask(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && addSubtask()}
                                        placeholder="Ajouter une sous-tâche..."
                                        className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-primary-400"
                                    />
                                    <button
                                        onClick={addSubtask}
                                        disabled={!newSubtask.trim() || submitting}
                                        className="px-3 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* AI Decompose */}
                                <button
                                    onClick={aiDecompose}
                                    disabled={aiLoading}
                                    className="flex items-center gap-2 w-full px-3 py-2.5 text-sm font-medium text-primary-700 bg-primary-50 rounded-lg hover:bg-primary-100 border border-primary-200 transition-colors disabled:opacity-50 mt-4"
                                >
                                    {aiLoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <AiMark className="w-4 h-4" />
                                    )}
                                    Décomposer avec IA
                                </button>
                            </div>
                        )}

                        {/* ---- COMMENTS TAB ---- */}
                        {activeTab === "comments" && (
                            <div className="space-y-4">
                                {task.comments.length === 0 && (
                                    <p className="text-sm text-slate-400 text-center py-6">Aucun commentaire</p>
                                )}

                                {task.comments.map((c) => (
                                    <div key={c.id} className="flex gap-3">
                                        <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold shrink-0">
                                            {c.user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm font-medium text-slate-800">{c.user.name}</span>
                                                <span className="text-xs text-slate-400">
                                                    {new Date(c.createdAt).toLocaleString("fr-FR", {
                                                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                                                    })}
                                                </span>
                                            </div>
                                            <p className="text-sm text-slate-600 whitespace-pre-wrap">{c.content}</p>
                                        </div>
                                    </div>
                                ))}

                                {/* Add comment */}
                                <div className="flex gap-3 pt-2 border-t border-slate-100">
                                    <textarea
                                        rows={2}
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                        placeholder="Écrire un commentaire..."
                                        className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-primary-400 resize-none"
                                    />
                                    <button
                                        onClick={addComment}
                                        disabled={!newComment.trim() || submitting}
                                        className="self-end px-3 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                                    >
                                        Envoyer
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ---- ACTIVITY TAB ---- */}
                        {activeTab === "activity" && (
                            <div className="space-y-3">
                                {task.activities?.length === 0 && (
                                    <p className="text-sm text-slate-400 text-center py-6">Aucune activité</p>
                                )}
                                {task.activities?.map((a) => (
                                    <div key={a.id} className="flex gap-3 py-2">
                                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                            <Activity className="w-3 h-3 text-slate-500" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm text-slate-700">
                                                <span className="font-medium">{a.user.name}</span>{" "}
                                                {formatActivityAction(a.action, a.details)}
                                            </p>
                                            <span className="text-xs text-slate-400">
                                                {new Date(a.createdAt).toLocaleString("fr-FR", {
                                                    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                                                })}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="border-t border-slate-200 pt-3 px-1 flex items-center justify-between">
                        <button
                            onClick={deleteTask}
                            className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1.5 rounded-md transition-colors"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            Supprimer
                        </button>
                        <button
                            onClick={aiEnhance}
                            disabled={aiLoading}
                            className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 hover:bg-primary-50 px-2 py-1.5 rounded-md transition-colors disabled:opacity-50"
                        >
                            {aiLoading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <AiMark className="w-3.5 h-3.5" />
                            )}
                            Améliorer avec IA
                        </button>
                    </div>
                </div>
            )}
        </Drawer>
    );
}

// ============================================
// HELPERS
// ============================================

function formatActivityAction(action: string, details: any): string {
    switch (action) {
        case "task_created":
            return "a créé cette tâche";
        case "status_changed":
            return `a changé le statut de ${formatStatus(details?.from)} à ${formatStatus(details?.to)}`;
        case "assigned":
            return "a modifié l'assignation";
        case "priority_changed":
            return `a changé la priorité de ${details?.from} à ${details?.to}`;
        case "commented":
            return `a commenté : "${details?.preview?.slice(0, 60)}..."`;
        case "subtask_created":
            return `a ajouté la sous-tâche "${details?.subtaskTitle}"`;
        case "ai_decomposed":
            return "a décomposé la tâche avec l'IA";
        case "task_deleted":
            return `a supprimé la tâche "${details?.title}"`;
        default:
            return action;
    }
}

function formatStatus(status: string): string {
    const map: Record<string, string> = {
        TODO: "À faire",
        IN_PROGRESS: "En cours",
        IN_REVIEW: "En revue",
        DONE: "Terminé",
    };
    return map[status] || status;
}
