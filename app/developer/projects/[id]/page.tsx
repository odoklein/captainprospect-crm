"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import {
    ArrowLeft,
    Calendar,
    CheckSquare,
    Clock,
    User,
    Users,
    Building2,
    Loader2,
    Plus,
    MoreHorizontal,
} from "lucide-react";
import { NewTaskModal } from "@/components/tasks/NewTaskModal";

interface ProjectDetail {
    id: string;
    name: string;
    description: string | null;
    status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
    owner: { id: string; name: string; email: string };
    client: { id: string; name: string } | null;
    members: Array<{
        id: string;
        userId: string;
        role: string;
        user: { id: string; name: string; email: string; role: string }
    }>;
    tasks: Array<{
        id: string;
        title: string;
        status: string;
        priority: string;
        dueDate: string | null;
        assignee: { id: string; name: string } | null;
    }>;
    createdAt: string;
    updatedAt: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string; solid: string }> = {
    ACTIVE: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Actif", solid: "bg-emerald-600" },
    COMPLETED: { bg: "bg-blue-50", text: "text-blue-700", label: "Terminé", solid: "bg-blue-600" },
    ARCHIVED: { bg: "bg-slate-100", text: "text-slate-600", label: "Archivé", solid: "bg-slate-500" },
};

const PRIORITY_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
    LOW: { bg: "bg-slate-100", text: "text-slate-600", icon: "↓" },
    MEDIUM: { bg: "bg-blue-100", text: "text-blue-700", icon: "→" },
    HIGH: { bg: "bg-amber-100", text: "text-amber-700", icon: "↑" },
    URGENT: { bg: "bg-red-100", text: "text-red-700", icon: "↑↑" },
};

const TASK_STATUS_COLORS: Record<string, string> = {
    TODO: "bg-slate-400",
    IN_PROGRESS: "bg-blue-500",
    IN_REVIEW: "bg-amber-500",
    DONE: "bg-emerald-500",
};

export default function ProjectDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [project, setProject] = useState<ProjectDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showNewTaskModal, setShowNewTaskModal] = useState(false);

    useEffect(() => {
        loadProject();
    }, [id]);

    const loadProject = async () => {
        try {
            const res = await fetch(`/api/projects/${id}`);
            const json = await res.json();
            if (json.success) {
                setProject(json.data);
            }
        } catch (error) {
            console.error("Failed to load project:", error);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    <p className="text-sm text-slate-500">Chargement du projet...</p>
                </div>
            </div>
        );
    }

    if (!project) {
        return (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                <h2 className="text-xl font-semibold text-slate-900 mb-2">Projet non trouvé</h2>
                <p className="text-slate-500 mb-4">Ce projet n'existe pas ou a été supprimé.</p>
                <Link href="/developer/projects" className="dev-btn-primary inline-flex items-center gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    Retour aux projets
                </Link>
            </div>
        );
    }

    const statusStyle = STATUS_STYLES[project.status];
    const completedTasks = project.tasks.filter(t => t.status === "DONE").length;
    const totalTasks = project.tasks.length;
    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return (
        <div className="space-y-6">
            {/* Back Link */}
            <Link
                href="/developer/projects"
                className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors group"
            >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                Retour aux projets
            </Link>

            {/* Premium Hero Header */}
            <div className="relative overflow-hidden bg-slate-900 rounded-2xl p-8 text-white">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIvPjwvc3ZnPg==')] opacity-50" />

                <div className="relative z-10 flex items-start justify-between">
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                            <span className={`px-3 py-1 text-xs font-medium rounded-full ${statusStyle.solid} text-white`}>
                                {statusStyle.label}
                            </span>
                        </div>
                        <h1 className="text-3xl font-bold mb-3">{project.name}</h1>
                        {project.description && (
                            <p className="text-slate-300 max-w-2xl mb-6">{project.description}</p>
                        )}

                        <div className="flex flex-wrap items-center gap-6 text-sm text-slate-400">
                            {project.client && (
                                <div className="flex items-center gap-2">
                                    <Building2 className="w-4 h-4" />
                                    <span>Client: <span className="text-white font-medium">{project.client.name}</span></span>
                                </div>
                            )}
                            <div className="flex items-center gap-2">
                                <User className="w-4 h-4" />
                                <span>Resp: <span className="text-white font-medium">{project.owner.name}</span></span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                <span>Créé le: {new Date(project.createdAt).toLocaleDateString('fr-FR')}</span>
                            </div>
                        </div>
                    </div>

                    {/* Animated Progress Ring */}
                    <div className="hidden lg:flex flex-col items-center">
                        <div className="relative w-32 h-32">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                                <circle
                                    cx="50"
                                    cy="50"
                                    r="45"
                                    fill="none"
                                    stroke="rgba(255,255,255,0.1)"
                                    strokeWidth="8"
                                />
                                <circle
                                    cx="50"
                                    cy="50"
                                    r="45"
                                    fill="none"
                                    stroke="#3b82f6"
                                    strokeWidth="8"
                                    strokeLinecap="round"
                                    strokeDasharray="283"
                                    strokeDashoffset={283 - (283 * progress) / 100}
                                    className="dev-progress-ring"
                                />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-3xl font-bold">{progress}%</span>
                                <span className="text-xs text-slate-400">Terminé</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content - Tasks */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                                    <CheckSquare className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-900">Tâches du projet</h2>
                                    <p className="text-sm text-slate-500">{completedTasks}/{totalTasks} terminées</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowNewTaskModal(true)}
                                className="dev-btn-primary flex items-center gap-2 h-9 px-4 text-sm"
                            >
                                <Plus className="w-4 h-4" />
                                Ajouter
                            </button>
                        </div>

                        <div className="space-y-3">
                            {project.tasks.length === 0 ? (
                                <div className="text-center py-12 text-slate-500">
                                    <CheckSquare className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                                    <p className="text-sm">Aucune tâche pour le moment</p>
                                    <button
                                        onClick={() => setShowNewTaskModal(true)}
                                        className="mt-4 text-sm text-blue-600 hover:text-blue-700 font-medium"
                                    >
                                        Ajouter une tâche
                                    </button>
                                </div>
                            ) : (
                                project.tasks.map(task => {
                                    const priority = PRIORITY_STYLES[task.priority];
                                    const statusColor = TASK_STATUS_COLORS[task.status] || "bg-slate-400";
                                    return (
                                        <div key={task.id} className="dev-task-card flex items-center justify-between">
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                <div className={`w-2 h-8 rounded-full ${statusColor}`} />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-slate-900 truncate">{task.title}</p>
                                                    <div className="flex items-center gap-3 mt-1">
                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded ${priority.bg} ${priority.text}`}>
                                                            {priority.icon} {task.priority}
                                                        </span>
                                                        {task.dueDate && (
                                                            <span className="flex items-center gap-1 text-xs text-slate-500">
                                                                <Clock className="w-3 h-3" />
                                                                {new Date(task.dueDate).toLocaleDateString('fr-FR')}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            {task.assignee && (
                                                <div className="flex items-center gap-2 ml-4">
                                                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700">
                                                        {task.assignee.name.charAt(0)}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* Sidebar - Team */}
                <div className="space-y-6">
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-accent-100 flex items-center justify-center">
                                <Users className="w-5 h-5 text-accent-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">Équipe</h2>
                                <p className="text-sm text-slate-500">{project.members.length} membre{project.members.length > 1 ? 's' : ''}</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {project.members.map(member => (
                                <div key={member.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                                    <div className="relative">
                                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-sm font-medium text-slate-600">
                                            {member.user.name.charAt(0)}
                                        </div>
                                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-900 truncate">{member.user.name}</p>
                                        <p className="text-xs text-slate-500 truncate">{member.user.email}</p>
                                    </div>
                                    <span className="text-xs text-slate-400 capitalize px-2 py-1 bg-slate-100 rounded-full">
                                        {member.role}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Quick Stats */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                        <h3 className="text-sm font-semibold text-slate-900 mb-4">Statistiques</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 rounded-xl bg-slate-50">
                                <p className="text-2xl font-bold text-slate-900">{totalTasks}</p>
                                <p className="text-xs text-slate-500">Tâches totales</p>
                            </div>
                            <div className="p-3 rounded-xl bg-emerald-50">
                                <p className="text-2xl font-bold text-emerald-600">{completedTasks}</p>
                                <p className="text-xs text-slate-500">Terminées</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <NewTaskModal
                isOpen={showNewTaskModal}
                onClose={() => setShowNewTaskModal(false)}
                defaultProjectId={id}
                lockProject={true}
                onSuccess={() => {
                    loadProject();
                    setShowNewTaskModal(false);
                }}
            />
        </div>
    );
}
