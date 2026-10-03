"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Plus, FolderKanban, LayoutGrid, LayoutList, Search,
    MoreHorizontal, Copy, Archive, Trash2,
    CheckCircle2, Clock, AlertTriangle, Loader2, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader, Badge, Modal, ModalFooter, EmptyState, LoadingState } from "@/components/ui";

// ============================================
// TYPES
// ============================================

interface Project {
    id: string;
    name: string;
    description: string | null;
    status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
    color: string | null;
    icon: string | null;
    startDate: string | null;
    endDate: string | null;
    owner: { id: string; name: string; email: string };
    client: { id: string; name: string } | null;
    members: { user: { id: string; name: string; email: string }; role: string }[];
    _count: { tasks: number };
    taskStats: {
        TODO: number;
        IN_PROGRESS: number;
        IN_REVIEW: number;
        DONE: number;
        total: number;
        overdue: number;
        completionPercent: number;
    };
    createdAt: string;
    updatedAt: string;
}

// ============================================
// PAGE
// ============================================

const PROJECTS_BASE = "/sdr/projects";

export default function SDRProjectsPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<"grid" | "list">("grid");
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("");
    const [showCreate, setShowCreate] = useState(false);
    const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
    const [users, setUsers] = useState<{ id: string; name: string }[]>([]);

    // Create form
    const [createForm, setCreateForm] = useState({
        name: "",
        description: "",
        clientId: "",
        color: "#6366f1",
        startDate: "",
        endDate: "",
        memberIds: [] as string[],
    });
    const [creating, setCreating] = useState(false);

    const fetchProjects = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (search) params.set("search", search);
            if (statusFilter) params.set("status", statusFilter);

            const res = await fetch(`/api/projects?${params}`);
            const json = await res.json();
            if (json.success) setProjects(json.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [search, statusFilter]);

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    useEffect(() => {
        // Load clients & users for create modal
        Promise.all([
            fetch("/api/clients").then((r) => r.json()),
            fetch("/api/users?role=MANAGER,SDR,DEVELOPER,BUSINESS_DEVELOPER&limit=200").then((r) => r.json()),
        ]).then(([clientsJson, usersJson]) => {
            if (clientsJson.success) setClients(clientsJson.data || []);
            if (usersJson.success) setUsers(usersJson.data?.users?.map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })) || []);
        }).catch(console.error);
    }, []);

    const handleCreate = async () => {
        if (!createForm.name.trim()) return;
        setCreating(true);
        try {
            const res = await fetch("/api/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: createForm.name.trim(),
                    description: createForm.description.trim() || null,
                    clientId: createForm.clientId || null,
                    color: createForm.color,
                    startDate: createForm.startDate || null,
                    endDate: createForm.endDate || null,
                    members: createForm.memberIds.map((id) => ({ userId: id })),
                }),
            });
            const json = await res.json();
            if (json.success) {
                setShowCreate(false);
                setCreateForm({
                    name: "", description: "", clientId: "", color: "#6366f1",
                    startDate: "", endDate: "", memberIds: [],
                });
                fetchProjects();
            }
        } catch (e) {
            console.error(e);
        } finally {
            setCreating(false);
        }
    };

    const handleDuplicate = async (projectId: string) => {
        try {
            const res = await fetch(`/api/projects/${projectId}/duplicate`, { method: "POST" });
            const json = await res.json();
            if (json.success) fetchProjects();
        } catch (e) {
            console.error(e);
        }
    };

    const handleArchive = async (projectId: string) => {
        try {
            const res = await fetch(`/api/projects/${projectId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "ARCHIVED" }),
            });
            if ((await res.json()).success) fetchProjects();
        } catch (e) {
            console.error(e);
        }
    };

    const handleDelete = async (projectId: string) => {
        if (!confirm("Supprimer ce projet et toutes ses tâches ?")) return;
        try {
            await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
            fetchProjects();
        } catch (e) {
            console.error(e);
        }
    };

    // Stats
    const totalActive = projects.filter((p) => p.status === "ACTIVE").length;
    const totalCompleted = projects.filter((p) => p.status === "COMPLETED").length;
    const totalOverdue = projects.reduce((acc, p) => acc + (p.taskStats?.overdue || 0), 0);

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <PageHeader
                title="Projets"
                subtitle={`${projects.length} projets`}
                icon={<FolderKanban className="w-6 h-6 text-primary-600" />}
                actions={
                    <button
                        onClick={() => setShowCreate(true)}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Nouveau projet
                    </button>
                }
            />

            {/* Stats bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
                <StatMini icon={<FolderKanban className="w-4 h-4 text-slate-500" />} label="Total" value={projects.length} />
                <StatMini icon={<Clock className="w-4 h-4 text-blue-500" />} label="Actifs" value={totalActive} />
                <StatMini icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />} label="Terminés" value={totalCompleted} />
                <StatMini icon={<AlertTriangle className="w-4 h-4 text-red-500" />} label="Tâches en retard" value={totalOverdue} />
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3 mt-6">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Rechercher un projet..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-primary-400"
                    />
                </div>

                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-primary-400"
                >
                    <option value="">Tous les statuts</option>
                    <option value="ACTIVE">Actifs</option>
                    <option value="COMPLETED">Terminés</option>
                    <option value="ARCHIVED">Archivés</option>
                </select>

                <div className="flex bg-slate-100 border border-slate-200 rounded-lg p-0.5 ml-auto">
                    <button
                        onClick={() => setView("grid")}
                        className={cn(
                            "p-1.5 rounded transition-colors",
                            view === "grid" ? "bg-white shadow-sm text-primary-600" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setView("list")}
                        className={cn(
                            "p-1.5 rounded transition-colors",
                            view === "list" ? "bg-white shadow-sm text-primary-600" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        <LayoutList className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="mt-6">
                {loading ? (
                    <LoadingState message="Chargement des projets..." />
                ) : projects.length === 0 ? (
                    <EmptyState
                        icon={FolderKanban}
                        title="Aucun projet"
                        description="Créez votre premier projet pour commencer"
                        action={
                            <button
                                onClick={() => setShowCreate(true)}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg"
                            >
                                <Plus className="w-4 h-4" />
                                Créer un projet
                            </button>
                        }
                    />
                ) : view === "grid" ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {projects.map((p) => (
                            <ProjectCard
                                key={p.id}
                                project={p}
                                basePath={PROJECTS_BASE}
                                onDuplicate={() => handleDuplicate(p.id)}
                                onArchive={() => handleArchive(p.id)}
                                onDelete={() => handleDelete(p.id)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {projects.map((p) => (
                            <ProjectRow
                                key={p.id}
                                project={p}
                                basePath={PROJECTS_BASE}
                                onDuplicate={() => handleDuplicate(p.id)}
                                onArchive={() => handleArchive(p.id)}
                                onDelete={() => handleDelete(p.id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Create Modal */}
            <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Nouveau projet" size="lg">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Nom *</label>
                        <input
                            type="text"
                            value={createForm.name}
                            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-primary-400"
                            placeholder="Nom du projet"
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                        <textarea
                            value={createForm.description}
                            onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                            rows={3}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-primary-400 resize-none"
                            placeholder="Description du projet..."
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Client</label>
                            <select
                                value={createForm.clientId}
                                onChange={(e) => setCreateForm({ ...createForm, clientId: e.target.value })}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-primary-400 bg-white"
                            >
                                <option value="">Aucun client</option>
                                {clients.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Couleur</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={createForm.color}
                                    onChange={(e) => setCreateForm({ ...createForm, color: e.target.value })}
                                    className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
                                />
                                <span className="text-xs text-slate-500">{createForm.color}</span>
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Membres de l&apos;équipe</label>
                        <p className="text-xs text-slate-500 mb-2">Vous serez ajouté comme propriétaire. Ajoutez d&apos;autres membres ci-dessous.</p>
                        <select
                            value=""
                            onChange={(e) => {
                                const id = e.target.value;
                                if (id && !createForm.memberIds.includes(id)) {
                                    setCreateForm({ ...createForm, memberIds: [...createForm.memberIds, id] });
                                }
                                e.target.value = "";
                            }}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-primary-400 bg-white"
                        >
                            <option value="">Ajouter un membre...</option>
                            {users
                                .filter((u) => !createForm.memberIds.includes(u.id))
                                .map((u) => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                        </select>
                        {createForm.memberIds.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                                {createForm.memberIds.map((id) => {
                                    const u = users.find((x) => x.id === id);
                                    return (
                                        <span
                                            key={id}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary-50 text-primary-700 text-sm border border-primary-100"
                                        >
                                            {u?.name ?? id}
                                            <button
                                                type="button"
                                                onClick={() => setCreateForm({ ...createForm, memberIds: createForm.memberIds.filter((x) => x !== id) })}
                                                className="p-0.5 hover:bg-primary-200 rounded"
                                                aria-label="Retirer"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Date début</label>
                            <input
                                type="date"
                                value={createForm.startDate}
                                onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-primary-400"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Date fin</label>
                            <input
                                type="date"
                                value={createForm.endDate}
                                onChange={(e) => setCreateForm({ ...createForm, endDate: e.target.value })}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-primary-400"
                            />
                        </div>
                    </div>
                </div>
                <ModalFooter>
                    <button
                        onClick={() => setShowCreate(false)}
                        className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg"
                    >
                        Annuler
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={!createForm.name.trim() || creating}
                        className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50 flex items-center gap-2"
                    >
                        {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                        Créer
                    </button>
                </ModalFooter>
            </Modal>
        </div>
    );
}

// ============================================
// SUB-COMPONENTS
// ============================================

function StatMini({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
    return (
        <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
            {icon}
            <div>
                <p className="text-lg font-bold text-slate-900">{value}</p>
                <p className="text-xs text-slate-500">{label}</p>
            </div>
        </div>
    );
}

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "success" | "warning" }> = {
    ACTIVE: { label: "Actif", variant: "default" },
    COMPLETED: { label: "Terminé", variant: "success" },
    ARCHIVED: { label: "Archivé", variant: "warning" },
};

function ProjectCard({
    project,
    basePath,
    onDuplicate,
    onArchive,
    onDelete,
}: {
    project: Project;
    basePath: string;
    onDuplicate: () => void;
    onArchive: () => void;
    onDelete: () => void;
}) {
    const [showMenu, setShowMenu] = useState(false);
    const stats = project.taskStats;

    return (
        <a
            href={`${basePath}/${project.id}`}
            className="block bg-white border border-slate-200 rounded-xl p-4 hover:border-primary-300 hover:shadow-md transition-all group relative"
        >
            {/* Color accent */}
            <div
                className="h-1.5 rounded-full mb-3 w-16"
                style={{ backgroundColor: project.color || "#6366f1" }}
            />

            {/* Header */}
            <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-800 truncate group-hover:text-primary-700 transition-colors">
                        {project.name}
                    </h3>
                    {project.client && (
                        <p className="text-xs text-slate-500 mt-0.5">{project.client.name}</p>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant={STATUS_BADGE[project.status]?.variant || "default"}>
                        {STATUS_BADGE[project.status]?.label || project.status}
                    </Badge>
                    <div className="relative">
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setShowMenu(!showMenu);
                            }}
                            className="p-1 text-slate-400 hover:text-slate-600 rounded"
                        >
                            <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {showMenu && (
                            <div
                                className="absolute right-0 top-8 z-10 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-40"
                                onClick={(e) => e.preventDefault()}
                            >
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDuplicate(); setShowMenu(false); }}
                                    className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                                >
                                    <Copy className="w-3.5 h-3.5" /> Dupliquer
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onArchive(); setShowMenu(false); }}
                                    className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                                >
                                    <Archive className="w-3.5 h-3.5" /> Archiver
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDelete(); setShowMenu(false); }}
                                    className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                                >
                                    <Trash2 className="w-3.5 h-3.5" /> Supprimer
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Description */}
            {project.description && (
                <p className="text-xs text-slate-500 line-clamp-2 mb-3">{project.description}</p>
            )}

            {/* Progress bar */}
            <div className="mb-3">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>{stats?.completionPercent || 0}% terminé</span>
                    <span>{stats?.total || 0} tâches</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-primary-500 rounded-full transition-all"
                        style={{ width: `${stats?.completionPercent || 0}%` }}
                    />
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between">
                <div className="flex -space-x-1.5">
                    {project.members.slice(0, 4).map((m) => (
                        <div
                            key={m.user.id}
                            className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[9px] font-bold border-2 border-white"
                            title={m.user.name}
                        >
                            {m.user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                    ))}
                    {project.members.length > 4 && (
                        <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-[9px] font-bold border-2 border-white">
                            +{project.members.length - 4}
                        </div>
                    )}
                </div>
                {(stats?.overdue || 0) > 0 && (
                    <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                        <AlertTriangle className="w-3 h-3" />
                        {stats.overdue} en retard
                    </span>
                )}
            </div>
        </a>
    );
}

function ProjectRow({
    project,
    basePath,
    onDuplicate,
    onArchive,
    onDelete,
}: {
    project: Project;
    basePath: string;
    onDuplicate: () => void;
    onArchive: () => void;
    onDelete: () => void;
}) {
    const stats = project.taskStats;

    return (
        <a
            href={`${basePath}/${project.id}`}
            className="flex items-center gap-4 bg-white border border-slate-200 rounded-lg px-4 py-3 hover:border-primary-300 hover:shadow-sm transition-all group"
        >
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: project.color || "#6366f1" }} />
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate group-hover:text-primary-700">{project.name}</p>
                {project.client && <p className="text-xs text-slate-500">{project.client.name}</p>}
            </div>
            <Badge variant={STATUS_BADGE[project.status]?.variant || "default"}>
                {STATUS_BADGE[project.status]?.label || project.status}
            </Badge>
            <div className="w-24 text-right">
                <p className="text-sm font-medium text-slate-700">{stats?.completionPercent || 0}%</p>
                <p className="text-xs text-slate-500">{stats?.total || 0} tâches</p>
            </div>
            <div className="flex -space-x-1.5">
                {project.members.slice(0, 3).map((m) => (
                    <div
                        key={m.user.id}
                        className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[9px] font-bold border-2 border-white"
                    >
                        {m.user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                ))}
            </div>
            <div className="flex items-center gap-1" onClick={(e) => e.preventDefault()}>
                <button onClick={onDuplicate} className="p-1.5 text-slate-400 hover:text-primary-600 rounded" title="Dupliquer">
                    <Copy className="w-3.5 h-3.5" />
                </button>
                <button onClick={onArchive} className="p-1.5 text-slate-400 hover:text-amber-600 rounded" title="Archiver">
                    <Archive className="w-3.5 h-3.5" />
                </button>
                <button onClick={onDelete} className="p-1.5 text-slate-400 hover:text-red-600 rounded" title="Supprimer">
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>
        </a>
    );
}
