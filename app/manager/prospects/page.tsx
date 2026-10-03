"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, Button, Select, useToast, DataTable, TooltipTrigger, HelpPanelTrigger } from "@/components/ui";
import { getHelpContent } from "@/lib/prospects/help-content";
import { ProspectsOnboarding } from "@/components/prospects/ProspectsOnboarding";
import { ProspectsEmptyState } from "@/components/prospects/ProspectsEmptyState";
import type { Column } from "@/components/ui/DataTable";
import Link from "next/link";
import {
    Users,
    Search,
    Filter,
    RefreshCw,
    Eye,
    AlertCircle,
    CheckCircle,
    Clock,
    XCircle,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
} from "lucide-react";

// ============================================
// TYPES
// ============================================

interface ProspectProfile {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    companyName: string | null;
    currentStep: string;
    status: string;
    qualityScore: number;
    confidenceScore: number;
    reviewRequired: boolean;
    reviewReason: string | null;
    assignedMission: {
        id: string;
        name: string;
    } | null;
    assignedSdr: {
        id: string;
        name: string;
    } | null;
    createdAt: string;
    _count: {
        events: number;
        decisionLogs: number;
    };
}

// ============================================
// STATUS CONFIG
// ============================================

const STATUS_CONFIG = {
    PENDING: {
        label: "En attente",
        color: "bg-slate-100 text-slate-700",
        icon: Clock,
    },
    IN_REVIEW: {
        label: "En révision",
        color: "bg-amber-100 text-amber-700",
        icon: AlertCircle,
    },
    APPROVED: {
        label: "Approuvé",
        color: "bg-blue-100 text-blue-700",
        icon: CheckCircle,
    },
    REJECTED: {
        label: "Rejeté",
        color: "bg-red-100 text-red-700",
        icon: XCircle,
    },
    ACTIVATED: {
        label: "Activé",
        color: "bg-emerald-100 text-emerald-700",
        icon: CheckCircle,
    },
    DUPLICATE: {
        label: "Doublon",
        color: "bg-gray-100 text-gray-700",
        icon: XCircle,
    },
};

// ============================================
// PROSPECTS PAGE
// ============================================

export default function ProspectsPage() {
    const router = useRouter();
    const { success, error: showError } = useToast();
    const [profiles, setProfiles] = useState<ProspectProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [reviewFilter, setReviewFilter] = useState<string>("all");
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [limit] = useState(20);
    const [hasSources, setHasSources] = useState<boolean | null>(null);
    const [hasRules, setHasRules] = useState<boolean | null>(null);

    // ============================================
    // FETCH PROFILES
    // ============================================

    const fetchProfiles = async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            params.set("page", page.toString());
            params.set("limit", limit.toString());

            if (statusFilter !== "all") {
                params.set("status", statusFilter);
            }

            if (reviewFilter === "required") {
                params.set("reviewRequired", "true");
            }

            if (searchQuery) {
                params.set("search", searchQuery);
            }

            const res = await fetch(`/api/prospects/profiles?${params.toString()}`);
            const json = await res.json();

            if (json.success) {
                setProfiles(json.data);
                setTotal(json.pagination.total);
            } else {
                showError("Erreur", json.error || "Impossible de charger les prospects");
            }
        } catch (err) {
            console.error("Failed to fetch prospects:", err);
            showError("Erreur", "Impossible de charger les prospects");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchProfiles();
    }, [page, statusFilter, reviewFilter]);

    // Reset to page 1 when filters change
    useEffect(() => {
        if (page !== 1) {
            setPage(1);
        }
    }, [statusFilter, reviewFilter]);

    // Check for first-time setup
    useEffect(() => {
        const checkSetup = async () => {
            try {
                const [sourcesRes, rulesRes] = await Promise.all([
                    fetch("/api/prospects/sources?limit=1"),
                    fetch("/api/prospects/rules?limit=1"),
                ]);

                const sourcesJson = await sourcesRes.json();
                const rulesJson = await rulesRes.json();

                setHasSources(sourcesJson.success && sourcesJson.data?.length > 0);
                setHasRules(rulesJson.success && rulesJson.data?.length > 0);
            } catch (err) {
                console.error("Failed to check setup:", err);
            }
        };

        if (profiles.length === 0) {
            checkSetup();
        }
    }, [profiles.length]);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (page === 1) {
                fetchProfiles();
            } else {
                setPage(1);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    // ============================================
    // TABLE COLUMNS
    // ============================================

    const columns: Column<ProspectProfile>[] = [
        {
            key: "name",
            header: "Nom",
            render: (_value, profile) => {
                const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "N/A";
                return (
                    <div>
                        <div className="font-medium text-slate-900">{name}</div>
                        {profile.email && (
                            <div className="text-sm text-slate-500">{profile.email}</div>
                        )}
                    </div>
                );
            },
        },
        {
            key: "company",
            header: "Entreprise",
            render: (_value, profile) => profile.companyName || "—",
        },
        {
            key: "status",
            header: "Statut",
            render: (_value, profile) => {
                const config = STATUS_CONFIG[profile.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.PENDING;
                const Icon = config.icon;
                return (
                    <Badge className={config.color}>
                        <Icon className="w-3 h-3 mr-1" />
                        {config.label}
                    </Badge>
                );
            },
        },
        {
            key: "scores",
            header: (
                <div className="flex items-center gap-2">
                    Scores
                    <TooltipTrigger
                        content="Score de qualité (0-100) : Évalue la valeur du prospect basé sur la complétude des données. Score de confiance (0-100) : Indique la fiabilité des données."
                        position="top"
                    />
                </div>
            ),
            render: (_value, profile) => (
                <div className="text-sm">
                    <div>Qualité: <span className="font-medium">{profile.qualityScore}</span></div>
                    <div>Confiance: <span className="font-medium">{profile.confidenceScore}</span></div>
                </div>
            ),
        },
        {
            key: "mission",
            header: "Mission",
            render: (_value, profile) => profile.assignedMission?.name || "—",
        },
        {
            key: "actions",
            header: "",
            render: (_value, profile) => (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(`/manager/prospects/${profile.id}`)}
                >
                    <Eye className="w-4 h-4" />
                </Button>
            ),
        },
    ];

    // ============================================
    // STATS
    // ============================================

    const stats = {
        total: total,
        pending: profiles.filter((p) => p.status === "PENDING").length,
        inReview: profiles.filter((p) => p.reviewRequired || p.status === "IN_REVIEW").length,
        activated: profiles.filter((p) => p.status === "ACTIVATED").length,
    };

    // ============================================
    // SELECT OPTIONS
    // ============================================

    const statusOptions = [
        { value: "all", label: "Tous les statuts" },
        { value: "PENDING", label: "En attente" },
        { value: "IN_REVIEW", label: "En révision" },
        { value: "APPROVED", label: "Approuvé" },
        { value: "REJECTED", label: "Rejeté" },
        { value: "ACTIVATED", label: "Activé" },
    ];

    const reviewOptions = [
        { value: "all", label: "Tous" },
        { value: "required", label: "Révision requise" },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between" data-tour="prospects-header">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Prospects</h1>
                    <p className="text-slate-600 mt-1">
                        Gestion des prospects entrants
                    </p>
                </div>
                <div className="flex gap-2">
                    <HelpPanelTrigger
                        topic="prospects"
                        sections={getHelpContent("prospects")}
                    />
                    <Button
                        variant="secondary"
                        onClick={() => router.push("/manager/prospects/review")}
                        data-tour="exception-inbox-button"
                    >
                        <AlertCircle className="w-4 h-4 mr-2" />
                        Révision ({stats.inReview})
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={fetchProfiles}
                        disabled={isLoading}
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                        Actualiser
                    </Button>
                </div>
            </div>

            {/* Navigation Links */}
            <div className="flex gap-2 border-b border-slate-200">
                <Link
                    href="/manager/prospects"
                    className="px-4 py-2 text-sm font-medium text-primary-600 border-b-2 border-primary-600"
                >
                    Liste
                </Link>
                <Link
                    href="/manager/prospects/review"
                    className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
                >
                    Exception Inbox
                </Link>
                <Link
                    href="/manager/prospects/sources"
                    className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
                >
                    Sources
                </Link>
                <Link
                    href="/manager/prospects/rules"
                    className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
                >
                    Règles
                </Link>
                <Link
                    href="/manager/prospects/sandbox"
                    className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
                >
                    Mode Test
                </Link>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4" data-tour="prospects-stats">
                <Card className="p-4">
                    <div className="text-sm text-slate-600">Total</div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</div>
                </Card>
                <Card className="p-4">
                    <div className="text-sm text-slate-600">En attente</div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">{stats.pending}</div>
                </Card>
                <Card className="p-4">
                    <div className="text-sm text-slate-600">En révision</div>
                    <div className="text-2xl font-bold text-amber-600 mt-1">{stats.inReview}</div>
                </Card>
                <Card className="p-4">
                    <div className="text-sm text-slate-600">Activés</div>
                    <div className="text-2xl font-bold text-emerald-600 mt-1">{stats.activated}</div>
                </Card>
            </div>

            {/* Filters */}
            <Card className="p-4" data-tour="prospects-filters">
                <div className="flex flex-wrap gap-4 items-center">
                    <div className="flex-1 min-w-[200px]">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Rechercher..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                    <Select
                        options={statusOptions}
                        value={statusFilter}
                        onChange={setStatusFilter}
                        className="w-[180px]"
                    />
                    <Select
                        options={reviewOptions}
                        value={reviewFilter}
                        onChange={setReviewFilter}
                        className="w-[180px]"
                    />
                </div>
            </Card>

            {/* Table */}
            <Card data-tour="prospects-table">
                {isLoading ? (
                    <div className="text-center py-12">
                        <RefreshCw className="w-8 h-8 text-slate-400 mx-auto animate-spin" />
                        <p className="text-slate-500 mt-2">Chargement...</p>
                    </div>
                ) : profiles.length === 0 ? (
                    <ProspectsEmptyState
                        hasSources={hasSources ?? true}
                        hasRules={hasRules ?? true}
                    />
                ) : (
                    <>
                        <DataTable
                            data={profiles}
                            columns={columns}
                            keyField="id"
                            pagination={false}
                        />
                        {/* Custom Pagination */}
                        {total > limit && (
                            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
                                <div className="text-sm text-slate-600">
                                    {((page - 1) * limit) + 1} - {Math.min(page * limit, total)} sur {total}
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setPage(1)}
                                        disabled={page === 1}
                                    >
                                        <ChevronsLeft className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </Button>
                                    <div className="flex items-center gap-1 px-2">
                                        {Array.from({ length: Math.min(5, Math.ceil(total / limit)) }, (_, i) => {
                                            const totalPages = Math.ceil(total / limit);
                                            let pageNum: number;
                                            if (totalPages <= 5) {
                                                pageNum = i + 1;
                                            } else if (page <= 3) {
                                                pageNum = i + 1;
                                            } else if (page >= totalPages - 2) {
                                                pageNum = totalPages - 4 + i;
                                            } else {
                                                pageNum = page - 2 + i;
                                            }

                                            return (
                                                <Button
                                                    key={pageNum}
                                                    variant={pageNum === page ? "primary" : "ghost"}
                                                    size="sm"
                                                    onClick={() => setPage(pageNum)}
                                                    className="w-8 h-8 p-0"
                                                >
                                                    {pageNum}
                                                </Button>
                                            );
                                        })}
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setPage((p) => Math.min(Math.ceil(total / limit), p + 1))}
                                        disabled={page >= Math.ceil(total / limit)}
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setPage(Math.ceil(total / limit))}
                                        disabled={page >= Math.ceil(total / limit)}
                                    >
                                        <ChevronsRight className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </Card>

            {/* Onboarding Tour */}
            <ProspectsOnboarding tourId="prospects-list" autoStart={false} />
        </div>
    );
}
