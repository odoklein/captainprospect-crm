"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, Button, useToast, DataTable, ConfirmModal } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { cn } from "@/lib/utils";
import {
    Plus,
    Search,
    RefreshCw,
    Edit,
    Trash2,
    TestTube,
    CheckCircle,
    XCircle,
    Globe,
    FileText,
    Code,
    Users,
    Link as LinkIcon,
} from "lucide-react";
import Link from "next/link";

// ============================================
// TYPES
// ============================================

interface ProspectSource {
    id: string;
    name: string;
    type: string;
    isActive: boolean;
    autoActivate: boolean;
    client: {
        id: string;
        name: string;
    } | null;
    defaultMission: {
        id: string;
        name: string;
    } | null;
    createdAt: string;
    _count: {
        events: number;
    };
}

// ============================================
// SOURCE TYPE CONFIG
// ============================================

const SOURCE_TYPE_CONFIG = {
    WEB_FORM: {
        label: "Formulaire Web",
        icon: Globe,
        color: "bg-blue-100 text-blue-700",
    },
    CSV_IMPORT: {
        label: "Import CSV",
        icon: FileText,
        color: "bg-green-100 text-green-700",
    },
    API: {
        label: "API",
        icon: Code,
        color: "bg-accent-100 text-accent-700",
    },
    PARTNER_FEED: {
        label: "Flux Partenaire",
        icon: LinkIcon,
        color: "bg-orange-100 text-orange-700",
    },
    MANUAL_ENTRY: {
        label: "Saisie Manuelle",
        icon: Users,
        color: "bg-gray-100 text-gray-700",
    },
};

// ============================================
// SOURCES PAGE
// ============================================

export default function SourcesPage() {
    const router = useRouter();
    const { success, error: showError } = useToast();
    const [sources, setSources] = useState<ProspectSource[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [deletingSource, setDeletingSource] = useState<ProspectSource | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [testingSource, setTestingSource] = useState<string | null>(null);

    // ============================================
    // FETCH SOURCES
    // ============================================

    const fetchSources = async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/prospects/sources");
            const json = await res.json();

            if (json.success) {
                setSources(json.data);
            } else {
                showError("Erreur", json.error || "Impossible de charger les sources");
            }
        } catch (err) {
            console.error("Failed to fetch sources:", err);
            showError("Erreur", "Impossible de charger les sources");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSources();
    }, []);

    // ============================================
    // ACTIONS
    // ============================================

    const handleDelete = async (source: ProspectSource) => {
        try {
            const res = await fetch(`/api/prospects/sources/${source.id}`, {
                method: "DELETE",
            });

            const json = await res.json();

            if (json.success) {
                success("Succès", "Source désactivée");
                setShowDeleteModal(false);
                setDeletingSource(null);
                fetchSources();
            } else {
                showError("Erreur", json.error || "Impossible de supprimer la source");
            }
        } catch (err) {
            console.error("Failed to delete source:", err);
            showError("Erreur", "Impossible de supprimer la source");
        }
    };

    const handleTest = async (sourceId: string) => {
        setTestingSource(sourceId);
        try {
            const res = await fetch(`/api/prospects/sources/${sourceId}/test-lead`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });

            const json = await res.json();

            if (json.success) {
                success("Succès", "Lead de test envoyé avec succès");
            } else {
                showError("Erreur", json.error || "Le test a échoué");
            }
        } catch (err) {
            console.error("Failed to test source:", err);
            showError("Erreur", "Le test a échoué");
        } finally {
            setTestingSource(null);
        }
    };

    // ============================================
    // TABLE COLUMNS
    // ============================================

    const columns: Column<ProspectSource>[] = [
        {
            key: "name",
            header: "Nom",
            render: (value, source) => {
                const config = SOURCE_TYPE_CONFIG[source.type as keyof typeof SOURCE_TYPE_CONFIG] || SOURCE_TYPE_CONFIG.MANUAL_ENTRY;
                const Icon = config.icon;
                return (
                    <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-lg", config.color)}>
                            <Icon className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="font-medium text-slate-900">{source.name}</div>
                            <div className="text-sm text-slate-500">{config.label}</div>
                        </div>
                    </div>
                );
            },
        },
        {
            key: "status",
            header: "Statut",
            render: (value, source) => (
                <div className="flex items-center gap-2">
                    <Badge className={source.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}>
                        {source.isActive ? (
                            <>
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Actif
                            </>
                        ) : (
                            <>
                                <XCircle className="w-3 h-3 mr-1" />
                                Inactif
                            </>
                        )}
                    </Badge>
                    {source.autoActivate && source.isActive && (
                        <Badge className="bg-blue-100 text-blue-700 text-xs">
                            Auto-activation
                        </Badge>
                    )}
                </div>
            ),
        },
        {
            key: "mission",
            header: "Mission par défaut",
            render: (value, source) => source.defaultMission?.name || "—",
        },
        {
            key: "stats",
            header: "Événements",
            render: (value, source) => (
                <div className="text-sm text-slate-600">
                    {source._count.events} événement{source._count.events !== 1 ? "s" : ""}
                </div>
            ),
        },
        {
            key: "actions",
            header: "",
            render: (value, source) => (
                <div className="flex gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTest(source.id)}
                        disabled={testingSource === source.id || !source.isActive}
                        title="Envoyer un lead de test"
                    >
                        <TestTube className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/manager/prospects/sources/${source.id}/edit`)}
                    >
                        <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setDeletingSource(source);
                            setShowDeleteModal(true);
                        }}
                        className="text-red-600 hover:text-red-700"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            ),
        },
    ];

    // ============================================
    // FILTERED SOURCES
    // ============================================

    const filteredSources = sources.filter((source) => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            source.name.toLowerCase().includes(query) ||
            SOURCE_TYPE_CONFIG[source.type as keyof typeof SOURCE_TYPE_CONFIG]?.label.toLowerCase().includes(query)
        );
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Sources de Prospects</h1>
                    <p className="text-slate-600 mt-1">
                        Gérez les intégrations et sources de leads
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        onClick={() => router.push("/manager/prospects/sources/new")}
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Ajouter une intégration
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={fetchSources}
                        disabled={isLoading}
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                        Actualiser
                    </Button>
                </div>
            </div>

            {/* Search */}
            <Card className="p-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Rechercher une source..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                </div>
            </Card>

            {/* Table */}
            <Card>
                {isLoading ? (
                    <div className="text-center py-12">
                        <RefreshCw className="w-8 h-8 text-slate-400 mx-auto animate-spin" />
                        <p className="text-slate-500 mt-2">Chargement...</p>
                    </div>
                ) : filteredSources.length === 0 ? (
                    <div className="text-center py-12">
                        <Globe className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-slate-700">Aucune source configurée</h3>
                        <p className="text-slate-500 mt-1 mb-4">
                            Créez votre première intégration pour commencer à recevoir des leads.
                        </p>
                        <Button onClick={() => router.push("/manager/prospects/sources/new")}>
                            <Plus className="w-4 h-4 mr-2" />
                            Ajouter une intégration
                        </Button>
                    </div>
                ) : (
                    <DataTable
                        data={filteredSources}
                        columns={columns}
                        keyField="id"
                        pagination
                        pageSize={20}
                    />
                )}
            </Card>

            {/* Delete Confirmation */}
            <ConfirmModal
                isOpen={showDeleteModal}
                onClose={() => {
                    setShowDeleteModal(false);
                    setDeletingSource(null);
                }}
                onConfirm={() => deletingSource && handleDelete(deletingSource)}
                title="Désactiver la source"
                message={`Êtes-vous sûr de vouloir désactiver "${deletingSource?.name}" ? Les nouveaux leads ne seront plus traités.`}
                confirmText="Désactiver"
                cancelText="Annuler"
                variant="danger"
            />
        </div>
    );
}
