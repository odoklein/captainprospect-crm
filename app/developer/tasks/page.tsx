"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import {
    Plus,
    CheckSquare,
    Clock,
    Loader2,
    Calendar,
    User,
    LayoutGrid,
    List,
    X,
} from "lucide-react";

interface Task {
    id: string;
    title: string;
    description: string | null;
    status: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    dueDate: string | null;
    project: { id: string; name: string };
    assignee: { id: string; name: string; email: string } | null;
    createdBy: { id: string; name: string };
    _count: { comments: number };
    createdAt: string;
}

const STATUS_COLUMNS = [
    { key: "TODO", label: "À faire", color: "slate", headerClass: "dev-kanban-header-todo" },
    { key: "IN_PROGRESS", label: "En cours", color: "blue", headerClass: "dev-kanban-header-progress" },
    { key: "IN_REVIEW", label: "En revue", color: "amber", headerClass: "dev-kanban-header-review" },
    { key: "DONE", label: "Terminé", color: "emerald", headerClass: "dev-kanban-header-done" },
];

const PRIORITY_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
    LOW: { bg: "dev-priority-low", text: "text-slate-600", icon: "↓" },
    MEDIUM: { bg: "dev-priority-medium", text: "text-blue-700", icon: "→" },
    HIGH: { bg: "dev-priority-high", text: "text-amber-700", icon: "↑" },
    URGENT: { bg: "dev-priority-urgent", text: "text-red-700", icon: "↑↑" },
};

export default function TasksPage() {
    const { data: session } = useSession();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [view, setView] = useState<"kanban" | "list">("kanban");
    const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
    const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
    const [showNewTaskModal, setShowNewTaskModal] = useState(false);

    useEffect(() => {
        loadTasks();
    }, []);

    const loadTasks = async () => {
        try {
            const res = await fetch("/api/tasks");
            const json = await res.json();
            if (json.success) {
                setTasks(json.data);
            }
        } catch (error) {
            console.error("Failed to load tasks:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const updateTaskStatus = async (taskId: string, newStatus: string) => {
        setUpdatingTaskId(taskId);
        try {
            const res = await fetch(`/api/tasks/${taskId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            });
            const json = await res.json();
            if (json.success) {
                setTasks(tasks.map((t) => (t.id === taskId ? { ...t, status: newStatus as Task["status"] } : t)));
            }
        } catch (error) {
            console.error("Failed to update task:", error);
        } finally {
            setUpdatingTaskId(null);
        }
    };

    const formatDate = (date: string) => {
        const d = new Date(date);
        return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    };

    const isOverdue = (dueDate: string | null) => {
        if (!dueDate) return false;
        return new Date(dueDate) < new Date();
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    <p className="text-sm text-slate-500">Chargement des tâches...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Premium Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Mes tâches</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        {tasks.length} tâche{tasks.length !== 1 ? "s" : ""} au total
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowNewTaskModal(true)}
                        className="dev-btn-primary flex items-center gap-2 h-10 px-5 text-sm font-medium"
                    >
                        <Plus className="w-4 h-4" />
                        Nouvelle tâche
                    </button>

                    {/* View Toggle */}
                    <div className="flex items-center bg-slate-100 rounded-lg p-1">
                        <button
                            onClick={() => setView("kanban")}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${view === "kanban"
                                    ? "bg-white text-slate-900 shadow-sm"
                                    : "text-slate-500 hover:text-slate-700"
                                }`}
                        >
                            <LayoutGrid className="w-4 h-4" />
                            Kanban
                        </button>
                        <button
                            onClick={() => setView("list")}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${view === "list"
                                    ? "bg-white text-slate-900 shadow-sm"
                                    : "text-slate-500 hover:text-slate-700"
                                }`}
                        >
                            <List className="w-4 h-4" />
                            Liste
                        </button>
                    </div>
                </div>
            </div>

            {/* Premium Kanban View */}
            {view === "kanban" && (
                <div className="grid grid-cols-4 gap-4">
                    {STATUS_COLUMNS.map((column) => {
                        const columnTasks = tasks.filter((t) => t.status === column.key);
                        const isDragOver = dragOverColumn === column.key;

                        return (
                            <div
                                key={column.key}
                                className={`dev-kanban-column ${isDragOver ? 'drag-over' : ''}`}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    setDragOverColumn(column.key);
                                }}
                                onDragLeave={() => setDragOverColumn(null)}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setDragOverColumn(null);
                                    const taskId = e.dataTransfer.getData("taskId");
                                    if (taskId) {
                                        updateTaskStatus(taskId, column.key);
                                    }
                                }}
                            >
                                <div className={`dev-kanban-header ${column.headerClass}`}>
                                    <h3 className="text-sm font-semibold text-slate-700">{column.label}</h3>
                                    <span className="text-xs font-medium text-slate-500 bg-white px-2 py-0.5 rounded-full shadow-sm">
                                        {columnTasks.length}
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    {columnTasks.map((task) => {
                                        const priority = PRIORITY_STYLES[task.priority];
                                        const isUpdating = updatingTaskId === task.id;

                                        return (
                                            <div
                                                key={task.id}
                                                draggable={!isUpdating}
                                                onDragStart={(e) => {
                                                    e.dataTransfer.setData("taskId", task.id);
                                                    e.dataTransfer.effectAllowed = "move";
                                                    (e.target as HTMLElement).classList.add('dragging');
                                                }}
                                                onDragEnd={(e) => {
                                                    (e.target as HTMLElement).classList.remove('dragging');
                                                }}
                                                className={`dev-task-card relative ${isUpdating ? 'opacity-50' : ''}`}
                                            >
                                                <div className="flex items-start gap-2 mb-2">
                                                    <span className={`w-6 h-6 rounded-lg text-xs flex items-center justify-center font-medium ${priority.bg}`}>
                                                        {priority.icon}
                                                    </span>
                                                    <p className="text-sm font-medium text-slate-900 flex-1 line-clamp-2">
                                                        {task.title}
                                                    </p>
                                                </div>

                                                <p className="text-xs text-slate-500 mb-3 pl-8">{task.project.name}</p>

                                                <div className="flex items-center justify-between text-xs text-slate-400 pl-8">
                                                    {task.dueDate && (
                                                        <span className={`flex items-center gap-1 ${isOverdue(task.dueDate) && task.status !== "DONE" ? "text-red-500 font-medium" : ""}`}>
                                                            <Calendar className="w-3 h-3" />
                                                            {formatDate(task.dueDate)}
                                                        </span>
                                                    )}
                                                    {task.assignee && (
                                                        <div className="flex items-center gap-1">
                                                            <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-medium text-blue-700">
                                                                {task.assignee.name.charAt(0)}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {isUpdating && (
                                                    <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-xl">
                                                        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {columnTasks.length === 0 && (
                                        <div className="py-8 text-center">
                                            <p className="text-xs text-slate-400">Aucune tâche</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Premium List View */}
            {view === "list" && (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-4">Tâche</th>
                                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-4">Projet</th>
                                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-4">Statut</th>
                                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-4">Priorité</th>
                                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-4">Échéance</th>
                                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-4">Assigné</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {tasks.map((task) => {
                                const priority = PRIORITY_STYLES[task.priority];
                                const status = STATUS_COLUMNS.find((s) => s.key === task.status);
                                return (
                                    <tr key={task.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <p className="text-sm font-medium text-slate-900">{task.title}</p>
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className="text-sm text-slate-600">{task.project.name}</span>
                                        </td>
                                        <td className="px-4 py-4">
                                            <select
                                                value={task.status}
                                                onChange={(e) => updateTaskStatus(task.id, e.target.value)}
                                                className="text-sm text-slate-900 border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                            >
                                                {STATUS_COLUMNS.map((s) => (
                                                    <option key={s.key} value={s.key}>{s.label}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg ${priority.bg}`}>
                                                {priority.icon} {task.priority}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4">
                                            {task.dueDate ? (
                                                <span className={`text-sm ${isOverdue(task.dueDate) && task.status !== "DONE" ? "text-red-500 font-medium" : "text-slate-600"}`}>
                                                    {formatDate(task.dueDate)}
                                                </span>
                                            ) : (
                                                <span className="text-sm text-slate-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-4">
                                            {task.assignee ? (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700">
                                                        {task.assignee.name.charAt(0)}
                                                    </div>
                                                    <span className="text-sm text-slate-600">{task.assignee.name}</span>
                                                </div>
                                            ) : (
                                                <span className="text-sm text-slate-400">Non assigné</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {tasks.length === 0 && (
                        <div className="py-16 text-center">
                            <CheckSquare className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                            <p className="text-sm text-slate-500">Aucune tâche pour le moment</p>
                        </div>
                    )}
                </div>
            )}

            {/* Premium New Task Modal */}
            <NewTaskModal
                isOpen={showNewTaskModal}
                onClose={() => setShowNewTaskModal(false)}
                onSuccess={(newTask) => {
                    setTasks([newTask, ...tasks]);
                    setShowNewTaskModal(false);
                }}
            />
        </div>
    );
}

function NewTaskModal({
    isOpen,
    onClose,
    onSuccess,
}: {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (task: Task) => void;
}) {
    const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        title: "",
        description: "",
        projectId: "",
        priority: "MEDIUM",
        dueDate: "",
    });

    useEffect(() => {
        if (isOpen) {
            fetch("/api/projects")
                .then((res) => res.json())
                .then((json) => {
                    if (json.success) setProjects(json.data);
                })
                .catch(console.error);
        }
    }, [isOpen]);

    const handleSubmit = async () => {
        if (!formData.title || !formData.projectId) return;

        setIsLoading(true);
        try {
            const res = await fetch("/api/tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });
            const json = await res.json();
            if (json.success) {
                onSuccess(json.data);
                setFormData({ title: "", description: "", projectId: "", priority: "MEDIUM", dueDate: "" });
            }
        } catch (error) {
            console.error("Failed to create task:", error);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 dev-modal-overlay z-50 flex items-center justify-center p-4">
            <div className="dev-modal w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                        <CheckSquare className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">Nouvelle tâche</h2>
                        <p className="text-sm text-slate-500">Créez une nouvelle tâche</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Titre *</label>
                        <input
                            type="text"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            className="dev-input"
                            placeholder="Titre de la tâche"
                            autoFocus
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Projet *</label>
                        <select
                            value={formData.projectId}
                            onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                            className="dev-input"
                        >
                            <option value="">Sélectionner un projet</option>
                            {projects.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Priorité</label>
                        <div className="flex gap-2">
                            {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => {
                                const style = PRIORITY_STYLES[p];
                                return (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, priority: p })}
                                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${formData.priority === p
                                                ? "border-blue-500 bg-blue-50 text-blue-700"
                                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                            }`}
                                    >
                                        {style.icon} {p}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Échéance</label>
                        <input
                            type="date"
                            value={formData.dueDate}
                            onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                            className="dev-input"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            rows={3}
                            className="dev-input resize-none"
                            placeholder="Description détaillée..."
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-200">
                    <button
                        onClick={onClose}
                        className="h-10 px-5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                        Annuler
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!formData.title || !formData.projectId || isLoading}
                        className="dev-btn-primary h-10 px-5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Création...
                            </>
                        ) : (
                            <>
                                <Plus className="w-4 h-4" />
                                Créer
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
