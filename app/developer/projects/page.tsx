"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
    Plus,
    FolderKanban,
    Users,
    CheckSquare,
    Search,
    Loader2,
    ArrowRight,
    Sparkles,
    X,
} from "lucide-react";

interface Project {
    id: string;
    name: string;
    description: string | null;
    status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
    owner: { id: string; name: string; email: string };
    client: { id: string; name: string } | null;
    members: Array<{ id: string; userId: string; role: string; user: { id: string; name: string; email: string } }>;
    _count: { tasks: number };
    createdAt: string;
    updatedAt: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string; dot: string }> = {
    ACTIVE: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Actif", dot: "bg-emerald-500" },
    COMPLETED: { bg: "bg-blue-50", text: "text-blue-700", label: "Terminé", dot: "bg-blue-500" },
    ARCHIVED: { bg: "bg-slate-100", text: "text-slate-600", label: "Archivé", dot: "bg-slate-400" },
};

export default function ProjectsPage() {
    const { data: session } = useSession();
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [showNewModal, setShowNewModal] = useState(false);
    const [newProject, setNewProject] = useState({ name: "", description: "" });
    const [isCreating, setIsCreating] = useState(false);

    const role = session?.user?.role as string | undefined;
    const canCreate = role === "MANAGER" || role === "DEVELOPER";

    useEffect(() => {
        loadProjects();
    }, []);

    const loadProjects = async () => {
        try {
            const res = await fetch("/api/projects");
            const json = await res.json();
            if (json.success) {
                setProjects(json.data);
            }
        } catch (error) {
            console.error("Failed to load projects:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateProject = async () => {
        if (!newProject.name.trim()) return;

        setIsCreating(true);
        try {
            const res = await fetch("/api/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newProject),
            });
            const json = await res.json();
            if (json.success) {
                setProjects([json.data, ...projects]);
                setShowNewModal(false);
                setNewProject({ name: "", description: "" });
            }
        } catch (error) {
            console.error("Failed to create project:", error);
        } finally {
            setIsCreating(false);
        }
    };

    const [filterTab, setFilterTab] = useState<"ALL" | "MINE" | "ACTIVE" | "COMPLETED" | "ARCHIVED">("ALL");

    const currentUserId = session?.user?.id;

    const filteredProjects = projects.filter((p) => {
        const matchesSearch =
            p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.description?.toLowerCase().includes(search.toLowerCase()) ||
            p.client?.name.toLowerCase().includes(search.toLowerCase());

        if (!matchesSearch) return false;

        if (filterTab === "MINE") {
            return p.owner?.id === currentUserId || p.members?.some((m) => m.userId === currentUserId);
        }
        if (filterTab === "ACTIVE") return p.status === "ACTIVE";
        if (filterTab === "COMPLETED") return p.status === "COMPLETED";
        if (filterTab === "ARCHIVED") return p.status === "ARCHIVED";
        return true;
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    <p className="text-sm text-slate-500">Chargement des projets...</p>
                </div>
            </div>
        );
    }

    const myProjectsCount = projects.filter(
        (p) => p.owner?.id === currentUserId || p.members?.some((m) => m.userId === currentUserId)
    ).length;

    return (
        <div className="space-y-6">
            {/* Premium Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Projets</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        {projects.length} projet{projects.length !== 1 ? "s" : ""} au total &bull; {myProjectsCount} assigné{myProjectsCount > 1 ? "s" : ""}
                    </p>
                </div>
                {canCreate && (
                    <button
                        onClick={() => setShowNewModal(true)}
                        className="dev-btn-primary flex items-center gap-2 h-10 px-5 text-sm font-medium"
                    >
                        <Plus className="w-4 h-4" />
                        Nouveau projet
                    </button>
                )}
            </div>

            {/* Filter Tabs & Search */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center">
                {/* Status Tabs */}
                <div className="flex items-center gap-1.5 p-1 bg-slate-200/60 rounded-xl overflow-x-auto">
                    {[
                        { key: "ALL", label: "Tous", count: projects.length },
                        { key: "MINE", label: "Mes projets", count: myProjectsCount },
                        { key: "ACTIVE", label: "Actifs", count: projects.filter(p => p.status === "ACTIVE").length },
                        { key: "COMPLETED", label: "Terminés", count: projects.filter(p => p.status === "COMPLETED").length },
                        { key: "ARCHIVED", label: "Archivés", count: projects.filter(p => p.status === "ARCHIVED").length },
                    ].map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setFilterTab(tab.key as any)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                                filterTab === tab.key
                                    ? "bg-white text-slate-900 shadow-sm font-semibold"
                                    : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                            }`}
                        >
                            <span>{tab.label}</span>
                            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                                filterTab === tab.key ? "bg-slate-100 text-slate-800 font-bold" : "bg-slate-300/50 text-slate-600"
                            }`}>
                                {tab.count}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Premium Search */}
                <div className="relative sm:w-80">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Rechercher un projet, client..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="dev-search-input w-full h-10 pl-10 pr-9 text-sm text-slate-900 bg-white"
                    />
                    {search && (
                        <button
                            onClick={() => setSearch("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-full transition-colors"
                        >
                            <X className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                    )}
                </div>
            </div>

            {/* Projects Grid */}
            {filteredProjects.length === 0 ? (
                <div className="dev-empty-state bg-white border border-slate-200 rounded-2xl py-16">
                    <div className="dev-empty-state-icon">
                        <FolderKanban className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">
                        {search ? "Aucun résultat" : "Aucun projet"}
                    </h3>
                    <p className="text-sm text-slate-500 mb-6">
                        {search
                            ? "Essayez avec d'autres termes de recherche"
                            : "Créez votre premier projet pour commencer"}
                    </p>
                    {canCreate && !search && (
                        <button
                            onClick={() => setShowNewModal(true)}
                            className="dev-btn-primary inline-flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            Créer un projet
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredProjects.map((project, index) => {
                        const statusStyle = STATUS_STYLES[project.status];
                        return (
                            <Link
                                key={project.id}
                                href={`${typeof window !== 'undefined' ? window.location.pathname : '/developer/projects'}/${project.id}`}
                                className="dev-project-card group block"
                                style={{ animationDelay: `${index * 50}ms` }}
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                        <FolderKanban className="w-6 h-6 text-blue-600" />
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {project.owner?.id === currentUserId && (
                                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-blue-100 text-blue-700">
                                                Lead
                                            </span>
                                        )}
                                        <span className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${statusStyle.bg} ${statusStyle.text}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                                            {statusStyle.label}
                                        </span>
                                    </div>
                                </div>

                                <h3 className="font-semibold text-slate-900 mb-1 group-hover:text-blue-600 transition-colors duration-200">
                                    {project.name}
                                </h3>
                                {project.client && (
                                    <p className="text-xs font-medium text-blue-600 mb-2">
                                        Client: {project.client.name}
                                    </p>
                                )}
                                {project.description && (
                                    <p className="text-sm text-slate-500 line-clamp-2 mb-4">
                                        {project.description}
                                    </p>
                                )}

                                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                                    <div className="flex items-center gap-4 text-xs text-slate-500">
                                        <span className="flex items-center gap-1.5">
                                            <CheckSquare className="w-4 h-4" />
                                            {project._count?.tasks || 0} tâches
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                            <Users className="w-4 h-4" />
                                            {project.members.length} membres
                                        </span>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all duration-200" />
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}

            {/* Premium New Project Modal */}
            {showNewModal && (
                <div className="fixed inset-0 dev-modal-overlay z-50 flex items-center justify-center p-4">
                    <div className="dev-modal w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                                <Sparkles className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">Nouveau projet</h2>
                                <p className="text-sm text-slate-500">Créez un nouveau projet</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Nom du projet *
                                </label>
                                <input
                                    type="text"
                                    value={newProject.name}
                                    onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                                    placeholder="Ex: Refonte landing page"
                                    className="dev-input"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Description
                                </label>
                                <textarea
                                    value={newProject.description}
                                    onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                                    placeholder="Description du projet..."
                                    rows={3}
                                    className="dev-input resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-200">
                            <button
                                onClick={() => setShowNewModal(false)}
                                className="h-10 px-5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleCreateProject}
                                disabled={!newProject.name.trim() || isCreating}
                                className="dev-btn-primary h-10 px-5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isCreating ? (
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
            )}
        </div>
    );
}
