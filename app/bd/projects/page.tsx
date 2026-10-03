"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui";
import {
    FolderKanban,
    Search,
    RefreshCw,
    ChevronRight,
    X,
    CheckCircle2,
    Clock,
    AlertCircle,
} from "lucide-react";
import { Card, Badge, LoadingState, EmptyState, PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";

// ============================================
// TYPES
// ============================================

interface Project {
    id: string;
    name: string;
    description?: string;
    status: string;
    createdAt: string;
    client?: {
        name: string;
    };
    _count: {
        tasks: number;
    };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    PLANNING: { label: "Planification", color: "bg-slate-100 text-slate-600", icon: <Clock className="w-3 h-3" /> },
    IN_PROGRESS: { label: "En cours", color: "bg-blue-100 text-blue-600", icon: <Clock className="w-3 h-3" /> },
    REVIEW: { label: "Revue", color: "bg-amber-100 text-amber-600", icon: <AlertCircle className="w-3 h-3" /> },
    COMPLETED: { label: "Terminé", color: "bg-emerald-100 text-emerald-600", icon: <CheckCircle2 className="w-3 h-3" /> },
    ON_HOLD: { label: "En pause", color: "bg-red-100 text-red-600", icon: <AlertCircle className="w-3 h-3" /> },
};

export default function BDProjectsPage() {
    const { error: showError } = useToast();
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    // ============================================
    // FETCH PROJECTS
    // ============================================

    const fetchProjects = async () => {
        setIsLoading(true);
        try {
            // Get BD's client IDs first
            const clientsRes = await fetch("/api/bd/clients?limit=100");
            const clientsJson = await clientsRes.json();

            if (!clientsJson.success) {
                setProjects([]);
                setIsLoading(false);
                return;
            }

            const clientIds = clientsJson.data.map((c: { id: string }) => c.id);

            if (clientIds.length === 0) {
                setProjects([]);
                setIsLoading(false);
                return;
            }

            // Fetch projects
            const res = await fetch("/api/projects");
            const json = await res.json();

            if (json.success) {
                // Filter by portfolio clients
                const filtered = json.data.filter((p: Project) =>
                    clientIds.includes(p.client?.id)
                );
                setProjects(filtered);
            } else {
                showError("Erreur", json.error);
            }
        } catch (err) {
            console.error("Failed to fetch projects:", err);
            showError("Erreur", "Impossible de charger les projets");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchProjects();
    }, []);

    // ============================================
    // FILTER
    // ============================================

    const filteredProjects = projects.filter(project =>
        project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (isLoading) {
        return <LoadingState message="Chargement des projets..." />;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <PageHeader
                title="Projets"
                subtitle="Projets liés à vos clients"
                onRefresh={fetchProjects}
                isRefreshing={isLoading}
            />

            {/* Search */}
            <Card className="!p-4">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Rechercher un projet..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-11 pl-12 pr-10 text-sm text-slate-900 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-full transition-colors"
                        >
                            <X className="w-4 h-4 text-slate-400" />
                        </button>
                    )}
                </div>
            </Card>

            {/* Projects List */}
            {filteredProjects.length === 0 ? (
                <EmptyState
                    icon={FolderKanban}
                    title={searchQuery ? "Aucun projet trouvé" : "Aucun projet"}
                    description={searchQuery ? "Essayez une autre recherche" : "Les projets de vos clients apparaîtront ici"}
                />
            ) : (
                <div className="space-y-3">
                    {filteredProjects.map((project) => {
                        const statusConfig = STATUS_CONFIG[project.status] || STATUS_CONFIG.PLANNING;

                        return (
                            <Card key={project.id} className="group hover:border-emerald-300 transition-all">
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                                        <FolderKanban className="w-6 h-6 text-emerald-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-1">
                                            <h3 className="font-semibold text-slate-900 group-hover:text-emerald-600 transition-colors">
                                                {project.name}
                                            </h3>
                                            <span className={cn(
                                                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                                                statusConfig.color
                                            )}>
                                                {statusConfig.icon}
                                                {statusConfig.label}
                                            </span>
                                        </div>
                                        {project.description && (
                                            <p className="text-sm text-slate-500 line-clamp-1 mb-2">
                                                {project.description}
                                            </p>
                                        )}
                                        <div className="flex items-center gap-4 text-sm text-slate-500">
                                            {project.client && (
                                                <span>{project.client.name}</span>
                                            )}
                                            <span>{project._count.tasks} tâches</span>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all flex-shrink-0" />
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
