"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Plus, FolderKanban, LayoutGrid, LayoutList, Search,
    MoreHorizontal, Copy, Archive, Trash2, Users, Calendar,
    CheckCircle2, Clock, AlertTriangle, Loader2, Activity,
    X, TrendingUp, ArrowUpRight, Briefcase, ListTodo,
    BarChart3, Target, Filter,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { PageHeader, Badge, Modal, ModalFooter, ConfirmModal, EmptyState, LoadingState, useToast } from "@/components/ui";

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

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
    ACTIVE: { label: "Actif", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500" },
    COMPLETED: { label: "Terminé", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", dot: "bg-blue-500" },
    ARCHIVED: { label: "Archivé", color: "text-slate-500", bg: "bg-slate-50", border: "border-slate-200", dot: "bg-slate-400" },
};

const PRESET_COLORS = [
    "#6366f1", "#8b5cf6", "#a855f7", "#ec4899", "#f43f5e",
    "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
    "#06b6d4", "#3b82f6", "#0ea5e9", "#64748b",
];

// ============================================
// PAGE
// ============================================

export default function ManagerProjectsPage() {
    const { success, error: showError } = useToast();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<"grid" | "list">("grid");
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("");
    const [clientFilter, setClientFilter] = useState("");
    const [showCreate, setShowCreate] = useState(false);
    const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
    const [users, setUsers] = useState<{ id: string; name: string; role: string }[]>([]);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

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
            if (clientFilter) params.set("clientId", clientFilter);

            const res = await fetch(`/api/projects?${params}`);
            const json = await res.json();
            if (json.success) setProjects(json.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [search, statusFilter, clientFilter]);

    useEffect(() => { fetchProjects(); }, [fetchProjects]);

    useEffect(() => {
        Promise.all([
            fetch("/api/clients").then((r) => r.json()),
            fetch("/api/users?role=MANAGER,SDR,DEVELOPER,BUSINESS_DEVELOPER&limit=200").then((r) => r.json()),
        ]).then(([cj, uj]) => {
            if (cj.success) setClients(cj.data || []);
            if (uj.success) setUsers(uj.data?.users?.map((u: any) => ({ id: u.id, name: u.name, role: u.role })) || uj.data?.map((u: any) => ({ id: u.id, name: u.name, role: u.role })) || []);
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
                success("Projet créé", createForm.name);
                setShowCreate(false);
                setCreateForm({ name: "", description: "", clientId: "", color: "#6366f1", startDate: "", endDate: "", memberIds: [] });
                fetchProjects();
            } else {
                showError("Erreur", json.error || "Impossible de créer le projet");
            }
        } catch {
            showError("Erreur", "Impossible de créer le projet");
        } finally {
            setCreating(false);
        }
    };

    const handleDuplicate = async (projectId: string) => {
        try {
            const res = await fetch(`/api/projects/${projectId}/duplicate`, { method: "POST" });
            const json = await res.json();
            if (json.success) { success("Projet dupliqué", ""); fetchProjects(); }
        } catch { showError("Erreur", "Impossible de dupliquer"); }
    };

    const handleArchive = async (projectId: string) => {
        try {
            const res = await fetch(`/api/projects/${projectId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "ARCHIVED" }),
            });
            if ((await res.json()).success) { success("Projet archivé", ""); fetchProjects(); }
        } catch { showError("Erreur", "Impossible d'archiver"); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            await fetch(`/api/projects/${deleteTarget}`, { method: "DELETE" });
            success("Projet supprimé", "");
            setDeleteTarget(null);
            fetchProjects();
        } catch { showError("Erreur", "Impossible de supprimer"); }
        finally { setIsDeleting(false); }
    };

    // Stats
    const totalActive = projects.filter((p) => p.status === "ACTIVE").length;
    const totalCompleted = projects.filter((p) => p.status === "COMPLETED").length;
    const totalTasks = projects.reduce((acc, p) => acc + (p.taskStats?.total || 0), 0);
    const totalDone = projects.reduce((acc, p) => acc + (p.taskStats?.DONE || 0), 0);
    const totalOverdue = projects.reduce((acc, p) => acc + (p.taskStats?.overdue || 0), 0);
    const avgCompletion = projects.length
        ? Math.round(projects.reduce((acc, p) => acc + (p.taskStats?.completionPercent || 0), 0) / projects.length)
        : 0;

    const uniqueClients = [...new Set(projects.filter(p => p.client).map(p => p.client!.name))];

    return (
        <div className="p-6 max-w-[1400px] mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary-600 flex items-center justify-center">
                        <FolderKanban className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Projets</h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            {projects.length} projet{projects.length !== 1 ? "s" : ""} · {totalTasks} tâches au total
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-xl transition-colors shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    Nouveau projet
                </button>
            </div>

            {/* KPI Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
                <KpiCard icon={FolderKanban} label="Total" value={projects.length} iconColor="text-slate-600" iconBg="bg-slate-100" />
                <KpiCard icon={Activity} label="Actifs" value={totalActive} iconColor="text-emerald-600" iconBg="bg-emerald-50" />
                <KpiCard icon={CheckCircle2} label="Terminés" value={totalCompleted} iconColor="text-blue-600" iconBg="bg-blue-50" />
                <KpiCard icon={ListTodo} label="Tâches" value={totalTasks} subtitle={`${totalDone} terminées`} iconColor="text-accent-600" iconBg="bg-accent-50" />
                <KpiCard icon={TrendingUp} label="Progression" value={`${avgCompletion}%`} iconColor="text-primary-600" iconBg="bg-primary-50" />
                <KpiCard icon={AlertTriangle} label="En retard" value={totalOverdue} iconColor={totalOverdue > 0 ? "text-red-600" : "text-slate-400"} iconBg={totalOverdue > 0 ? "bg-red-50" : "bg-slate-50"} accent={totalOverdue > 0} />
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3 mb-6 flex-wrap">
                <div className="relative flex-1 min-w-[240px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Rechercher un projet..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all"
                    />
                </div>

                {/* Status filter chips */}
                <div className="flex items-center gap-1.5">
                    {[
                        { value: "", label: "Tous" },
                        { value: "ACTIVE", label: "Actifs" },
                        { value: "COMPLETED", label: "Terminés" },
                        { value: "ARCHIVED", label: "Archivés" },
                    ].map(f => (
                        <button
                            key={f.value}
                            onClick={() => setStatusFilter(f.value)}
                            className={cn(
                                "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                                statusFilter === f.value
                                    ? "bg-primary-50 text-primary-700 border-primary-200 shadow-sm"
                                    : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                            )}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* Client filter */}
                {uniqueClients.length > 1 && (
                    <select
                        value={clientFilter}
                        onChange={(e) => setClientFilter(e.target.value)}
                        className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 appearance-none min-w-[150px]"
                    >
                        <option value="">Tous les clients</option>
                        {clients.filter(c => projects.some(p => p.client?.id === c.id)).map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                )}

                {/* View toggle */}
                <div className="flex bg-slate-100 border border-slate-200 rounded-xl p-0.5 ml-auto">
                    <button
                        onClick={() => setView("grid")}
                        className={cn("p-2 rounded-lg transition-all", view === "grid" ? "bg-white shadow-sm text-primary-600" : "text-slate-400 hover:text-slate-600")}
                    >
                        <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setView("list")}
                        className={cn("p-2 rounded-lg transition-all", view === "list" ? "bg-white shadow-sm text-primary-600" : "text-slate-400 hover:text-slate-600")}
                    >
                        <LayoutList className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-32">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-10 h-10 animate-spin text-primary-400" />
                        <p className="text-sm text-slate-500">Chargement des projets...</p>
                    </div>
                </div>
            ) : projects.length === 0 ? (
                <div className="flex flex-col items-center py-32">
                    <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center mb-6">
                        <FolderKanban className="w-10 h-10 text-slate-300" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">Aucun projet</h3>
                    <p className="text-sm text-slate-500 mb-6 max-w-sm text-center">
                        Les projets sont créés automatiquement lorsque vous extrayez des tâches depuis une session client, ou vous pouvez en créer un manuellement.
                    </p>
                    <button
                        onClick={() => setShowCreate(true)}
                        className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-sm transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Créer un projet
                    </button>
                </div>
            ) : view === "grid" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {projects.map((p) => (
                        <ProjectCard
                            key={p.id}
                            project={p}
                            onDuplicate={() => handleDuplicate(p.id)}
                            onArchive={() => handleArchive(p.id)}
                            onDelete={() => setDeleteTarget(p.id)}
                        />
                    ))}
                </div>
            ) : (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="grid grid-cols-[1fr,100px,120px,100px,60px] gap-4 px-5 py-3 border-b border-slate-100 bg-slate-50/60 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        <span>Projet</span>
                        <span>Statut</span>
                        <span>Progression</span>
                        <span>Équipe</span>
                        <span />
                    </div>
                    {projects.map((p) => (
                        <ProjectRow
                            key={p.id}
                            project={p}
                            onDuplicate={() => handleDuplicate(p.id)}
                            onArchive={() => handleArchive(p.id)}
                            onDelete={() => setDeleteTarget(p.id)}
                        />
                    ))}
                </div>
            )}

            {/* Create Modal */}
            <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Nouveau projet" description="Créez un projet pour organiser les tâches de votre équipe." size="lg">
                <div className="space-y-5">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nom du projet *</label>
                        <input
                            type="text"
                            value={createForm.name}
                            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                            className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all"
                            placeholder="Ex: Onboarding UpikaJob, Sprint Q1..."
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Description</label>
                        <textarea
                            value={createForm.description}
                            onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                            rows={3}
                            className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all resize-none"
                            placeholder="Décrivez l'objectif du projet..."
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Client</label>
                            <select
                                value={createForm.clientId}
                                onChange={(e) => setCreateForm({ ...createForm, clientId: e.target.value })}
                                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 bg-white transition-all"
                            >
                                <option value="">Aucun client</option>
                                {clients.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Couleur</label>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {PRESET_COLORS.map(c => (
                                    <button
                                        key={c}
                                        onClick={() => setCreateForm({ ...createForm, color: c })}
                                        className={cn(
                                            "w-7 h-7 rounded-lg transition-all",
                                            createForm.color === c ? "ring-2 ring-offset-2 ring-primary-500" : "hover:ring-2 hover:ring-offset-2 hover:ring-slate-200"
                                        )}
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Membres de l&apos;équipe</label>
                        <select
                            value=""
                            onChange={(e) => {
                                const id = e.target.value;
                                if (id && !createForm.memberIds.includes(id)) {
                                    setCreateForm({ ...createForm, memberIds: [...createForm.memberIds, id] });
                                }
                                e.target.value = "";
                            }}
                            className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 bg-white transition-all"
                        >
                            <option value="">Ajouter un membre...</option>
                            {users.filter((u) => !createForm.memberIds.includes(u.id)).map((u) => (
                                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                            ))}
                        </select>
                        {createForm.memberIds.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2.5">
                                {createForm.memberIds.map((id) => {
                                    const u = users.find((x) => x.id === id);
                                    return (
                                        <span key={id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary-50 text-primary-700 text-xs font-medium border border-primary-100">
                                            {u?.name ?? id}
                                            <button type="button" onClick={() => setCreateForm({ ...createForm, memberIds: createForm.memberIds.filter((x) => x !== id) })} className="p-0.5 hover:bg-primary-200 rounded-full transition-colors">
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
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Date début</label>
                            <input type="date" value={createForm.startDate} onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })} className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Date fin</label>
                            <input type="date" value={createForm.endDate} onChange={(e) => setCreateForm({ ...createForm, endDate: e.target.value })} className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition-all" />
                        </div>
                    </div>
                </div>
                <ModalFooter>
                    <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-xl transition-colors">
                        Annuler
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={!createForm.name.trim() || creating}
                        className="px-5 py-2.5 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-50 flex items-center gap-2 transition-colors shadow-sm"
                    >
                        {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                        Créer le projet
                    </button>
                </ModalFooter>
            </Modal>

            {/* Delete Confirm */}
            <ConfirmModal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title="Supprimer ce projet ?"
                message="Le projet et toutes ses tâches seront définitivement supprimés. Cette action est irréversible."
                confirmText="Supprimer"
                variant="danger"
                isLoading={isDeleting}
            />
        </div>
    );
}

// ============================================
// SUB-COMPONENTS
// ============================================

function KpiCard({ icon: Icon, label, value, subtitle, iconColor, iconBg, accent }: {
    icon: any; label: string; value: number | string; subtitle?: string; iconColor: string; iconBg: string; accent?: boolean;
}) {
    return (
        <div className={cn(
            "flex items-center gap-3 bg-white border rounded-2xl px-4 py-3.5 transition-all hover:shadow-sm",
            accent ? "border-red-200 bg-red-50/30" : "border-slate-200"
        )}>
            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", iconBg)}>
                <Icon className={cn("w-4.5 h-4.5", iconColor)} />
            </div>
            <div className="min-w-0">
                <p className="text-lg font-bold text-slate-900 leading-tight">{value}</p>
                <p className="text-[11px] text-slate-500 font-medium">{label}</p>
                {subtitle && <p className="text-[10px] text-slate-400">{subtitle}</p>}
            </div>
        </div>
    );
}

function ProjectCard({ project, onDuplicate, onArchive, onDelete }: {
    project: Project; onDuplicate: () => void; onArchive: () => void; onDelete: () => void;
}) {
    const [showMenu, setShowMenu] = useState(false);
    const stats = project.taskStats;
    const status = STATUS_CONFIG[project.status] || STATUS_CONFIG.ACTIVE;
    const progress = stats?.completionPercent || 0;

    return (
        <Link
            href={`/manager/projects/${project.id}`}
            className="block bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-primary-300 hover:shadow-md transition-all duration-200 group relative"
        >
            {/* Color accent bar */}
            <div className="h-1" style={{ backgroundColor: project.color || "#6366f1" }} />

            <div className="p-5">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 truncate group-hover:text-primary-700 transition-colors">
                            {project.name}
                        </h3>
                        {project.client && (
                            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                                <Briefcase className="w-3 h-3" />
                                {project.client.name}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold border", status.bg, status.color, status.border)}>
                            <span className={cn("w-1.5 h-1.5 rounded-full", status.dot)} />
                            {status.label}
                        </span>
                        <div className="relative">
                            <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowMenu(!showMenu); }}
                                className="p-1.5 text-slate-300 hover:text-slate-500 rounded-lg hover:bg-slate-50 transition-colors opacity-0 group-hover:opacity-100"
                            >
                                <MoreHorizontal className="w-4 h-4" />
                            </button>
                            {showMenu && (
                                <div className="absolute right-0 top-9 z-20 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 w-44" onClick={(e) => e.preventDefault()}>
                                    <button onClick={(e) => { e.stopPropagation(); onDuplicate(); setShowMenu(false); }} className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                                        <Copy className="w-3.5 h-3.5 text-slate-400" /> Dupliquer
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); onArchive(); setShowMenu(false); }} className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                                        <Archive className="w-3.5 h-3.5 text-slate-400" /> Archiver
                                    </button>
                                    <div className="my-1 border-t border-slate-100" />
                                    <button onClick={(e) => { e.stopPropagation(); onDelete(); setShowMenu(false); }} className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                                        <Trash2 className="w-3.5 h-3.5" /> Supprimer
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Description */}
                {project.description && (
                    <p className="text-xs text-slate-500 line-clamp-2 mb-4 leading-relaxed">{project.description}</p>
                )}

                {/* Task status breakdown */}
                <div className="flex items-center gap-1 mb-3">
                    {stats && stats.total > 0 ? (
                        <>
                            {stats.DONE > 0 && <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ flex: stats.DONE }} />}
                            {stats.IN_REVIEW > 0 && <div className="h-2 rounded-full bg-amber-400 transition-all" style={{ flex: stats.IN_REVIEW }} />}
                            {stats.IN_PROGRESS > 0 && <div className="h-2 rounded-full bg-blue-500 transition-all" style={{ flex: stats.IN_PROGRESS }} />}
                            {stats.TODO > 0 && <div className="h-2 rounded-full bg-slate-200 transition-all" style={{ flex: stats.TODO }} />}
                        </>
                    ) : (
                        <div className="h-2 rounded-full bg-slate-100 w-full" />
                    )}
                </div>

                {/* Stats row */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-4">
                    <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" />{stats?.DONE || 0}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-blue-500" />{stats?.IN_PROGRESS || 0}</span>
                        <span className="flex items-center gap-1"><ListTodo className="w-3 h-3 text-slate-400" />{stats?.TODO || 0}</span>
                    </div>
                    <span className="font-bold text-slate-700">{progress}%</span>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <div className="flex -space-x-2">
                        {project.members.slice(0, 4).map((m) => (
                            <div
                                key={m.user.id}
                                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-white shadow-sm"
                                style={{ backgroundColor: project.color + "20", color: project.color || "#6366f1" }}
                                title={m.user.name}
                            >
                                {m.user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                            </div>
                        ))}
                        {project.members.length > 4 && (
                            <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-[10px] font-bold border-2 border-white">
                                +{project.members.length - 4}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {(stats?.overdue || 0) > 0 && (
                            <span className="flex items-center gap-1 text-[10px] text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded-lg">
                                <AlertTriangle className="w-3 h-3" />
                                {stats.overdue} en retard
                            </span>
                        )}
                        <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-primary-500 transition-colors" />
                    </div>
                </div>
            </div>
        </Link>
    );
}

function ProjectRow({ project, onDuplicate, onArchive, onDelete }: {
    project: Project; onDuplicate: () => void; onArchive: () => void; onDelete: () => void;
}) {
    const stats = project.taskStats;
    const status = STATUS_CONFIG[project.status] || STATUS_CONFIG.ACTIVE;
    const progress = stats?.completionPercent || 0;

    return (
        <Link
            href={`/manager/projects/${project.id}`}
            className="grid grid-cols-[1fr,100px,120px,100px,60px] gap-4 items-center px-5 py-3.5 border-b border-slate-100 last:border-b-0 hover:bg-primary-50/30 transition-colors group"
        >
            <div className="flex items-center gap-3 min-w-0">
                <div className="w-3 h-8 rounded-full shrink-0" style={{ backgroundColor: project.color || "#6366f1" }} />
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate group-hover:text-primary-700 transition-colors">{project.name}</p>
                    <p className="text-xs text-slate-500 truncate">
                        {project.client ? project.client.name : "Pas de client"} · {project.owner.name}
                    </p>
                </div>
            </div>
            <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold border w-fit", status.bg, status.color, status.border)}>
                <span className={cn("w-1.5 h-1.5 rounded-full", status.dot)} />
                {status.label}
            </span>
            <div>
                <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-xs font-bold text-slate-700 w-8 text-right">{progress}%</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">{stats?.total || 0} tâches</p>
            </div>
            <div className="flex -space-x-1.5">
                {project.members.slice(0, 3).map((m) => (
                    <div key={m.user.id} className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[9px] font-bold border-2 border-white">
                        {m.user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                ))}
                {project.members.length > 3 && (
                    <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-[9px] font-bold border-2 border-white">
                        +{project.members.length - 3}
                    </div>
                )}
            </div>
            <div className="flex items-center gap-1" onClick={(e) => e.preventDefault()}>
                <button onClick={onArchive} className="p-1.5 text-slate-300 hover:text-amber-600 rounded-lg hover:bg-amber-50 transition-colors" title="Archiver">
                    <Archive className="w-3.5 h-3.5" />
                </button>
                <button onClick={onDelete} className="p-1.5 text-slate-300 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors" title="Supprimer">
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>
        </Link>
    );
}
