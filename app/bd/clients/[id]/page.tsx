"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import {
    ArrowLeft,
    Building2,
    Target,
    Users,
    Calendar,
    Edit,
    Clock,
    CheckCircle2,
    AlertCircle,
    FileText,
    Phone,
    Mail,
    Globe,
    Loader2,
    ChevronRight,
    Send,
} from "lucide-react";
import Link from "next/link";
import { Card, Button, Badge, LoadingState, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";

// ============================================
// TYPES
// ============================================

interface ClientDetail {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    industry?: string;
    createdAt: string;
    onboarding?: {
        status: string;
        targetLaunchDate?: string;
        completedAt?: string;
        onboardingData?: Record<string, unknown>;
        scripts?: {
            intro?: string;
            discovery?: string;
            objection?: string;
            closing?: string;
        };
        notes?: string;
    };
    missions: Array<{
        id: string;
        name: string;
        isActive: boolean;
        channel: string;
        _count: {
            sdrAssignments: number;
            campaigns: number;
            lists: number;
        };
    }>;
    _count: {
        missions: number;
        users: number;
        files: number;
    };
}

const ONBOARDING_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode; bgColor: string }> = {
    DRAFT: { label: "Brouillon", color: "text-slate-600", bgColor: "bg-slate-100", icon: <Clock className="w-4 h-4" /> },
    IN_PROGRESS: { label: "En cours", color: "text-blue-600", bgColor: "bg-blue-100", icon: <Clock className="w-4 h-4" /> },
    READY_FOR_REVIEW: { label: "En attente de validation", color: "text-amber-600", bgColor: "bg-amber-100", icon: <AlertCircle className="w-4 h-4" /> },
    APPROVED: { label: "Approuvé", color: "text-emerald-600", bgColor: "bg-emerald-100", icon: <CheckCircle2 className="w-4 h-4" /> },
    ACTIVE: { label: "Actif", color: "text-green-600", bgColor: "bg-green-100", icon: <CheckCircle2 className="w-4 h-4" /> },
};

const CHANNEL_CONFIG: Record<string, { label: string; color: string }> = {
    CALL: { label: "Appel", color: "bg-amber-100 text-amber-700" },
    EMAIL: { label: "Email", color: "bg-blue-100 text-blue-700" },
    LINKEDIN: { label: "LinkedIn", color: "bg-primary-100 text-primary-700" },
};

export default function BDClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const router = useRouter();
    const { success, error: showError } = useToast();

    const [client, setClient] = useState<ClientDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isUpdating, setIsUpdating] = useState(false);

    // ============================================
    // FETCH CLIENT
    // ============================================

    const fetchClient = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/bd/clients/${resolvedParams.id}`);
            const json = await res.json();

            if (json.success) {
                setClient(json.data);
            } else {
                showError("Erreur", json.error || "Client non trouvé");
                router.push("/bd/clients");
            }
        } catch (err) {
            console.error("Failed to fetch client:", err);
            showError("Erreur", "Impossible de charger le client");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchClient();
    }, [resolvedParams.id]);

    // ============================================
    // UPDATE STATUS
    // ============================================

    const updateStatus = async (newStatus: string) => {
        setIsUpdating(true);
        try {
            const res = await fetch(`/api/bd/clients/${resolvedParams.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ onboardingStatus: newStatus }),
            });

            const json = await res.json();

            if (json.success) {
                success("Statut mis à jour", `Le client est maintenant "${ONBOARDING_STATUS_CONFIG[newStatus]?.label}"`);
                fetchClient();
            } else {
                showError("Erreur", json.error);
            }
        } catch (err) {
            showError("Erreur", "Impossible de mettre à jour le statut");
        } finally {
            setIsUpdating(false);
        }
    };

    if (isLoading) {
        return <LoadingState message="Chargement du client..." />;
    }

    if (!client) {
        return null;
    }

    const status = client.onboarding?.status || "DRAFT";
    const statusConfig = ONBOARDING_STATUS_CONFIG[status] || ONBOARDING_STATUS_CONFIG.DRAFT;
    const onboardingData = client.onboarding?.onboardingData as Record<string, unknown> | undefined;

    return (
        <div className="space-y-6">
            {/* Hero Header */}
            <div className="relative overflow-hidden bg-slate-900 rounded-2xl p-8 text-white">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIvPjwvc3ZnPg==')] opacity-50" />
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                        <Link
                            href="/bd/clients"
                            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </Link>
                        <div className="w-14 h-14 rounded-xl bg-emerald-600 flex items-center justify-center text-2xl font-bold">
                            {client.name[0]}
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-3 flex-wrap mb-1">
                                <h1 className="text-2xl font-bold">{client.name}</h1>
                                <span className={cn(
                                    "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium",
                                    statusConfig.bgColor, statusConfig.color
                                )}>
                                    {statusConfig.icon}
                                    {statusConfig.label}
                                </span>
                            </div>
                            <p className="text-slate-400">
                                {client.industry || "Secteur non défini"}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {status === "DRAFT" && (
                            <Button
                                variant="secondary"
                                onClick={() => updateStatus("IN_PROGRESS")}
                                disabled={isUpdating}
                                className="gap-2 bg-white/10 border-white/20 text-white hover:bg-white/20"
                            >
                                <Clock className="w-4 h-4" />
                                Démarrer l'onboarding
                            </Button>
                        )}
                        {status === "IN_PROGRESS" && (
                            <Button
                                variant="secondary"
                                onClick={() => updateStatus("READY_FOR_REVIEW")}
                                disabled={isUpdating}
                                className="gap-2 bg-white/10 border-white/20 text-white hover:bg-white/20"
                            >
                                <Send className="w-4 h-4" />
                                Soumettre pour validation
                            </Button>
                        )}
                        <Link href={`/bd/clients/${client.id}/edit`}>
                            <Button
                                variant="secondary"
                                className="gap-2 bg-white/10 border-white/20 text-white hover:bg-white/20"
                            >
                                <Edit className="w-4 h-4" />
                                Modifier
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-5">
                <Card className="!p-5">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                            <Target className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">{client._count.missions}</p>
                            <p className="text-sm text-slate-500">Missions</p>
                        </div>
                    </div>
                </Card>
                <Card className="!p-5">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center">
                            <Users className="w-6 h-6 text-primary-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">{client._count.users}</p>
                            <p className="text-sm text-slate-500">Utilisateurs</p>
                        </div>
                    </div>
                </Card>
                <Card className="!p-5">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                            <FileText className="w-6 h-6 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">{client._count.files}</p>
                            <p className="text-sm text-slate-500">Fichiers</p>
                        </div>
                    </div>
                </Card>
                <Card className="!p-5">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-cyan-100 flex items-center justify-center">
                            <Calendar className="w-6 h-6 text-cyan-600" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-900">
                                {client.onboarding?.targetLaunchDate 
                                    ? new Date(client.onboarding.targetLaunchDate).toLocaleDateString("fr-FR")
                                    : "-"}
                            </p>
                            <p className="text-xs text-slate-500">Date de lancement</p>
                        </div>
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-3 gap-6">
                {/* Client Info */}
                <div className="col-span-2 space-y-6">
                    {/* Contact Info */}
                    <Card>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                                <Building2 className="w-5 h-5 text-slate-600" />
                            </div>
                            <h2 className="text-lg font-semibold text-slate-900">Informations de contact</h2>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            {client.email && (
                                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                                    <Mail className="w-4 h-4 text-slate-400" />
                                    <span className="text-sm text-slate-700">{client.email}</span>
                                </div>
                            )}
                            {client.phone && (
                                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                                    <Phone className="w-4 h-4 text-slate-400" />
                                    <span className="text-sm text-slate-700">{client.phone}</span>
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* ICP & Targets */}
                    {onboardingData && (
                        <Card>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                                    <Target className="w-5 h-5 text-emerald-600" />
                                </div>
                                <h2 className="text-lg font-semibold text-slate-900">Cibles & ICP</h2>
                            </div>
                            {onboardingData.icp && (
                                <div className="mb-4">
                                    <p className="text-sm font-medium text-slate-500 mb-1">Profil Client Idéal</p>
                                    <p className="text-sm text-slate-700">{String(onboardingData.icp)}</p>
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                {Array.isArray(onboardingData.targetIndustries) && onboardingData.targetIndustries.length > 0 && (
                                    <div>
                                        <p className="text-sm font-medium text-slate-500 mb-2">Secteurs cibles</p>
                                        <div className="flex flex-wrap gap-1">
                                            {onboardingData.targetIndustries.map((ind: string) => (
                                                <Badge key={ind} variant="default">{ind}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {Array.isArray(onboardingData.targetJobTitles) && onboardingData.targetJobTitles.length > 0 && (
                                    <div>
                                        <p className="text-sm font-medium text-slate-500 mb-2">Fonctions cibles</p>
                                        <div className="flex flex-wrap gap-1">
                                            {onboardingData.targetJobTitles.map((title: string) => (
                                                <Badge key={title} variant="primary">{title}</Badge>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </Card>
                    )}

                    {/* Scripts */}
                    {client.onboarding?.scripts && Object.values(client.onboarding.scripts).some(s => s) && (
                        <Card>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                                    <FileText className="w-5 h-5 text-primary-600" />
                                </div>
                                <h2 className="text-lg font-semibold text-slate-900">Scripts</h2>
                            </div>
                            <div className="space-y-4">
                                {client.onboarding.scripts.intro && (
                                    <div>
                                        <p className="text-sm font-medium text-slate-500 mb-1">Introduction</p>
                                        <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg">
                                            {client.onboarding.scripts.intro}
                                        </p>
                                    </div>
                                )}
                                {client.onboarding.scripts.discovery && (
                                    <div>
                                        <p className="text-sm font-medium text-slate-500 mb-1">Découverte</p>
                                        <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg">
                                            {client.onboarding.scripts.discovery}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </Card>
                    )}

                    {/* Missions */}
                    <Card>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                                    <Target className="w-5 h-5 text-amber-600" />
                                </div>
                                <h2 className="text-lg font-semibold text-slate-900">Missions</h2>
                            </div>
                        </div>

                        {client.missions.length === 0 ? (
                            <EmptyState
                                icon={Target}
                                title="Aucune mission"
                                description="Les missions seront créées par le manager"
                                variant="inline"
                            />
                        ) : (
                            <div className="space-y-2">
                                {client.missions.map((mission) => (
                                    <div
                                        key={mission.id}
                                        className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-emerald-300 transition-all"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                                            <Target className="w-5 h-5 text-amber-600" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-medium text-slate-900">{mission.name}</span>
                                                <Badge variant={mission.isActive ? "success" : "default"}>
                                                    {mission.isActive ? "Actif" : "Pause"}
                                                </Badge>
                                                <span className={cn(
                                                    "text-xs px-2 py-0.5 rounded-full",
                                                    CHANNEL_CONFIG[mission.channel]?.color || "bg-slate-100"
                                                )}>
                                                    {CHANNEL_CONFIG[mission.channel]?.label || mission.channel}
                                                </span>
                                            </div>
                                            <p className="text-sm text-slate-500">
                                                {mission._count.sdrAssignments} SDRs · {mission._count.campaigns} campagnes · {mission._count.lists} listes
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    {/* Onboarding Progress */}
                    <Card>
                        <div className="flex items-center gap-3 mb-4">
                            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", statusConfig.bgColor)}>
                                {statusConfig.icon}
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">Onboarding</h2>
                                <p className={cn("text-sm font-medium", statusConfig.color)}>{statusConfig.label}</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {["DRAFT", "IN_PROGRESS", "READY_FOR_REVIEW", "APPROVED", "ACTIVE"].map((step, index) => {
                                const stepConfig = ONBOARDING_STATUS_CONFIG[step];
                                const currentIndex = ["DRAFT", "IN_PROGRESS", "READY_FOR_REVIEW", "APPROVED", "ACTIVE"].indexOf(status);
                                const isCompleted = index < currentIndex;
                                const isCurrent = step === status;

                                return (
                                    <div
                                        key={step}
                                        className={cn(
                                            "flex items-center gap-3 p-2 rounded-lg",
                                            isCurrent && "bg-slate-50"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-6 h-6 rounded-full flex items-center justify-center",
                                            isCompleted ? "bg-emerald-500 text-white" : isCurrent ? stepConfig.bgColor : "bg-slate-100"
                                        )}>
                                            {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : <span className="text-xs">{index + 1}</span>}
                                        </div>
                                        <span className={cn(
                                            "text-sm",
                                            isCurrent ? "font-medium text-slate-900" : "text-slate-500"
                                        )}>
                                            {stepConfig.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </Card>

                    {/* Notes */}
                    {client.onboarding?.notes && (
                        <Card>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-accent-100 flex items-center justify-center">
                                    <FileText className="w-5 h-5 text-accent-600" />
                                </div>
                                <h2 className="text-lg font-semibold text-slate-900">Notes</h2>
                            </div>
                            <p className="text-sm text-slate-700 whitespace-pre-wrap">
                                {client.onboarding.notes}
                            </p>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
