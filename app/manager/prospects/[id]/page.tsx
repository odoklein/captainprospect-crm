"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, Button, useToast, Tabs, Modal, Select } from "@/components/ui";
import { PipelineViewer } from "@/components/prospects/PipelineViewer";
import {
    ArrowLeft,
    Mail,
    Phone,
    Building2,
    User,
    CheckCircle,
    XCircle,
    Clock,
    AlertCircle,
    RefreshCw,
    Target,
    Users,
    FileText,
    Activity,
    ListChecks,
    Zap,
    Loader2,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ProspectPipelineStep, ProspectStatus } from "@prisma/client";

// ============================================
// TYPES
// ============================================

interface ProspectDetail {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    companyName: string | null;
    title: string | null;
    currentStep: ProspectPipelineStep;
    status: ProspectStatus;
    qualityScore: number;
    confidenceScore: number;
    reviewRequired: boolean;
    reviewReason: string | null;
    customFields: any;
    createdAt: string;
    updatedAt: string;
    assignedMission: {
        id: string;
        name: string;
        client: {
            id: string;
            name: string;
        };
    } | null;
    assignedSdr: {
        id: string;
        name: string;
        email: string;
    } | null;
    source: {
        id: string;
        name: string;
        type: string;
    } | null;
    events: Array<{
        id: string;
        eventType: string;
        step: ProspectPipelineStep;
        rawPayload: any;
        processedAt: string;
        processedBy: string;
    }>;
    decisionLogs: Array<{
        id: string;
        step: ProspectPipelineStep;
        outcome: string;
        reason: string;
        executedAt: string;
        rule: {
            id: string;
            name: string;
        } | null;
    }>;
}

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
// PROSPECT DETAIL PAGE
// ============================================

export default function ProspectDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const router = useRouter();
    const { success, error: showError } = useToast();

    const [profile, setProfile] = useState<ProspectDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [activeTab, setActiveTab] = useState<"overview" | "events" | "decisions">("overview");
    const [showActivateModal, setShowActivateModal] = useState(false);
    const [missions, setMissions] = useState<Array<{ id: string; name: string; client: { id: string; name: string } }>>([]);
    const [selectedMissionId, setSelectedMissionId] = useState<string>("");
    const [isLoadingMissions, setIsLoadingMissions] = useState(false);

    // ============================================
    // FETCH PROFILE
    // ============================================

    const fetchProfile = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/prospects/profiles/${resolvedParams.id}`);
            const json = await res.json();

            if (json.success) {
                setProfile(json.data);
            } else {
                showError("Erreur", json.error || "Prospect non trouvé");
                router.push("/manager/prospects");
            }
        } catch (err) {
            console.error("Failed to fetch prospect:", err);
            showError("Erreur", "Impossible de charger le prospect");
            router.push("/manager/prospects");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchProfile();
    }, [resolvedParams.id]);

    // Fetch missions when activate modal opens
    useEffect(() => {
        if (showActivateModal) {
            const fetchMissions = async () => {
                setIsLoadingMissions(true);
                try {
                    const res = await fetch("/api/missions?isActive=true");
                    const json = await res.json();
                    if (json.success) {
                        setMissions(json.data || []);
                        // Pre-select routed mission if exists
                        if (profile?.assignedMission?.id) {
                            setSelectedMissionId(profile.assignedMission.id);
                        }
                    }
                } catch (err) {
                    console.error("Failed to fetch missions:", err);
                } finally {
                    setIsLoadingMissions(false);
                }
            };
            fetchMissions();
        }
    }, [showActivateModal, profile?.assignedMission?.id]);

    // ============================================
    // ACTIONS
    // ============================================

    const handleApprove = async () => {
        setIsProcessing(true);
        try {
            const res = await fetch(`/api/prospects/profiles/${resolvedParams.id}/review`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "approve" }),
            });

            const json = await res.json();

            if (json.success) {
                success("Succès", "Prospect approuvé");
                fetchProfile();
            } else {
                showError("Erreur", json.error || "Impossible d'approuver le prospect");
            }
        } catch (err) {
            console.error("Failed to approve prospect:", err);
            showError("Erreur", "Impossible d'approuver le prospect");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReject = async () => {
        const reason = prompt("Raison du rejet (optionnel):");
        setIsProcessing(true);
        try {
            const res = await fetch(`/api/prospects/profiles/${resolvedParams.id}/review`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "reject", reason: reason || undefined }),
            });

            const json = await res.json();

            if (json.success) {
                success("Succès", "Prospect rejeté");
                fetchProfile();
            } else {
                showError("Erreur", json.error || "Impossible de rejeter le prospect");
            }
        } catch (err) {
            console.error("Failed to reject prospect:", err);
            showError("Erreur", "Impossible de rejeter le prospect");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleActivate = async () => {
        const missionToUse = selectedMissionId || profile?.assignedMission?.id;
        
        if (!missionToUse) {
            showError("Erreur", "Veuillez sélectionner une mission");
            return;
        }

        setIsProcessing(true);
        try {
            const res = await fetch(`/api/prospects/profiles/${resolvedParams.id}/activate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ missionId: missionToUse }),
            });

            const json = await res.json();

            if (json.success) {
                const missionName = missions.find(m => m.id === missionToUse)?.name || profile?.assignedMission?.name || "la mission";
                success("Succès", `Prospect activé et ajouté à ${missionName}`);
                setShowActivateModal(false);
                setSelectedMissionId("");
                fetchProfile();
            } else {
                showError("Erreur", json.error || "Impossible d'activer le prospect");
            }
        } catch (err) {
            console.error("Failed to activate prospect:", err);
            showError("Erreur", "Impossible d'activer le prospect");
        } finally {
            setIsProcessing(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="w-8 h-8 text-primary-600 animate-spin" />
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="text-center py-16">
                <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-slate-900 mb-2">Prospect non trouvé</h2>
                <p className="text-slate-500 mb-4">Ce prospect n'existe pas ou a été supprimé.</p>
                <Button onClick={() => router.push("/manager/prospects")}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Retour à la liste
                </Button>
            </div>
        );
    }

    const statusConfig = STATUS_CONFIG[profile.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.PENDING;
    const StatusIcon = statusConfig.icon;
    const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "N/A";

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push("/manager/prospects")}
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">{fullName}</h1>
                        <p className="text-slate-600 mt-1">
                            Prospect • Créé le {new Date(profile.createdAt).toLocaleDateString("fr-FR")}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    {(profile.status === "PENDING" || profile.status === "APPROVED") && profile.status !== "ACTIVATED" && (
                        <Button
                            onClick={() => setShowActivateModal(true)}
                            disabled={isProcessing}
                        >
                            <Zap className="w-4 h-4 mr-2" />
                            Activer
                        </Button>
                    )}
                    {profile.reviewRequired && profile.status === "IN_REVIEW" && (
                        <>
                            <Button
                                variant="danger"
                                onClick={handleReject}
                                disabled={isProcessing}
                            >
                                <XCircle className="w-4 h-4 mr-2" />
                                Rejeter
                            </Button>
                            <Button
                                onClick={handleApprove}
                                disabled={isProcessing}
                            >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Approuver
                            </Button>
                        </>
                    )}
                    <Button
                        variant="secondary"
                        onClick={fetchProfile}
                        disabled={isLoading}
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                        Actualiser
                    </Button>
                </div>
            </div>

            {/* Status Badge */}
            <div className="flex items-center gap-2">
                <Badge className={statusConfig.color}>
                    <StatusIcon className="w-3 h-3 mr-1" />
                    {statusConfig.label}
                </Badge>
                {profile.reviewRequired && (
                    <Badge className="bg-amber-100 text-amber-700">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Révision requise
                    </Badge>
                )}
            </div>

            {/* Tabs */}
            <Tabs
                tabs={[
                    { id: "overview", label: "Vue d'ensemble", icon: <User className="w-4 h-4" /> },
                    { id: "events", label: `Événements (${profile.events.length})`, icon: <Activity className="w-4 h-4" /> },
                    { id: "decisions", label: `Décisions (${profile.decisionLogs.length})`, icon: <ListChecks className="w-4 h-4" /> },
                ]}
                activeTab={activeTab}
                onTabChange={(tab) => setActiveTab(tab as any)}
            />

            {/* Tab Content */}
            {activeTab === "overview" && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Pipeline Viewer */}
                        <PipelineViewer
                            currentStep={profile.currentStep}
                            status={profile.status}
                            decisionLogs={profile.decisionLogs}
                        />

                        {/* Review Reason */}
                        {profile.reviewReason && (
                            <Card className="p-4">
                                <div className="flex items-start gap-3">
                                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <h3 className="font-semibold text-slate-900 mb-1">Raison de la révision</h3>
                                        <p className="text-sm text-amber-700">{profile.reviewReason}</p>
                                    </div>
                                </div>
                            </Card>
                        )}
                    </div>

                    {/* Right Column */}
                    <div className="space-y-6">
                        {/* Contact Info */}
                        <Card className="p-4">
                            <h3 className="font-semibold text-slate-900 mb-4">Informations de contact</h3>
                            <div className="space-y-3">
                                {profile.email && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <Mail className="w-4 h-4 text-slate-400" />
                                        <a
                                            href={`mailto:${profile.email}`}
                                            className="text-primary-600 hover:underline"
                                        >
                                            {profile.email}
                                        </a>
                                    </div>
                                )}
                                {profile.phone && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <Phone className="w-4 h-4 text-slate-400" />
                                        <a
                                            href={`tel:${profile.phone}`}
                                            className="text-primary-600 hover:underline"
                                        >
                                            {profile.phone}
                                        </a>
                                    </div>
                                )}
                                {profile.companyName && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <Building2 className="w-4 h-4 text-slate-400" />
                                        <span className="text-slate-700">{profile.companyName}</span>
                                    </div>
                                )}
                                {profile.title && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <User className="w-4 h-4 text-slate-400" />
                                        <span className="text-slate-700">{profile.title}</span>
                                    </div>
                                )}
                            </div>
                        </Card>

                        {/* Scores */}
                        <Card className="p-4">
                            <h3 className="font-semibold text-slate-900 mb-4">Scores</h3>
                            <div className="space-y-3">
                                <div>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-slate-600">Qualité</span>
                                        <span className="font-medium">{profile.qualityScore}/100</span>
                                    </div>
                                    <div className="w-full bg-slate-200 rounded-full h-2">
                                        <div
                                            className="bg-primary-600 h-2 rounded-full"
                                            style={{ width: `${profile.qualityScore}%` }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-slate-600">Confiance</span>
                                        <span className="font-medium">{profile.confidenceScore}/100</span>
                                    </div>
                                    <div className="w-full bg-slate-200 rounded-full h-2">
                                        <div
                                            className="bg-emerald-600 h-2 rounded-full"
                                            style={{ width: `${profile.confidenceScore}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </Card>

                        {/* Assignment */}
                        <Card className="p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-slate-900">Assignation</h3>
                                {!profile.assignedMission && (profile.status === "PENDING" || profile.status === "APPROVED") && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowActivateModal(true)}
                                    >
                                        <Target className="w-4 h-4 mr-1" />
                                        Assigner
                                    </Button>
                                )}
                            </div>
                            <div className="space-y-3">
                                {profile.assignedMission ? (
                                    <div>
                                        <div className="text-xs text-slate-500 mb-1">Mission</div>
                                        <Link
                                            href={`/manager/missions/${profile.assignedMission.id}`}
                                            className="flex items-center gap-2 text-sm text-primary-600 hover:underline"
                                        >
                                            <Target className="w-4 h-4" />
                                            {profile.assignedMission.name}
                                        </Link>
                                        {profile.assignedMission.client && (
                                            <div className="text-xs text-slate-500 mt-1 ml-6">
                                                {profile.assignedMission.client.name}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-sm text-slate-500">
                                        Aucune mission assignée
                                        {profile.status !== "ACTIVATED" && (
                                            <div className="text-xs text-amber-600 mt-1">
                                                Une mission doit être assignée avant l'activation
                                            </div>
                                        )}
                                    </div>
                                )}
                                {profile.assignedSdr ? (
                                    <div>
                                        <div className="text-xs text-slate-500 mb-1">SDR</div>
                                        <div className="flex items-center gap-2 text-sm">
                                            <Users className="w-4 h-4 text-slate-400" />
                                            <span>{profile.assignedSdr.name}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-sm text-slate-500">Aucun SDR assigné</div>
                                )}
                            </div>
                        </Card>

                        {/* Source */}
                        {profile.source && (
                            <Card className="p-4">
                                <h3 className="font-semibold text-slate-900 mb-4">Source</h3>
                                <div className="text-sm">
                                    <Link
                                        href={`/manager/prospects/sources/${profile.source.id}`}
                                        className="text-primary-600 hover:underline"
                                    >
                                        {profile.source.name}
                                    </Link>
                                    <div className="text-xs text-slate-500 mt-1">{profile.source.type}</div>
                                </div>
                            </Card>
                        )}
                    </div>
                </div>
            )}

            {activeTab === "events" && (
                <Card>
                    <div className="p-4 border-b border-slate-200">
                        <h3 className="font-semibold text-slate-900">Historique des événements</h3>
                    </div>
                    <div className="divide-y divide-slate-200">
                        {profile.events.length === 0 ? (
                            <div className="p-8 text-center text-slate-500">
                                Aucun événement enregistré
                            </div>
                        ) : (
                            profile.events.map((event) => (
                                <div key={event.id} className="p-4">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Badge className="bg-primary-100 text-primary-700">
                                                    {event.step}
                                                </Badge>
                                                <span className="text-sm font-medium text-slate-900">
                                                    {event.eventType}
                                                </span>
                                            </div>
                                            <div className="text-xs text-slate-500">
                                                {new Date(event.processedAt).toLocaleString("fr-FR")} • {event.processedBy}
                                            </div>
                                        </div>
                                    </div>
                                    {event.rawPayload && (
                                        <details className="mt-2">
                                            <summary className="text-xs text-slate-600 cursor-pointer hover:text-slate-900">
                                                Voir les données brutes
                                            </summary>
                                            <pre className="mt-2 p-2 bg-slate-50 rounded text-xs overflow-x-auto">
                                                {JSON.stringify(event.rawPayload, null, 2)}
                                            </pre>
                                        </details>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </Card>
            )}

            {activeTab === "decisions" && (
                <Card>
                    <div className="p-4 border-b border-slate-200">
                        <h3 className="font-semibold text-slate-900">Journal des décisions</h3>
                    </div>
                    <div className="divide-y divide-slate-200">
                        {profile.decisionLogs.length === 0 ? (
                            <div className="p-8 text-center text-slate-500">
                                Aucune décision enregistrée
                            </div>
                        ) : (
                            profile.decisionLogs.map((log) => (
                                <div key={log.id} className="p-4">
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <Badge className="bg-blue-100 text-blue-700">
                                                {log.step}
                                            </Badge>
                                            <span className="text-sm font-medium text-slate-900">
                                                {log.outcome}
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            {new Date(log.executedAt).toLocaleString("fr-FR")}
                                        </div>
                                    </div>
                                    <div className="text-sm text-slate-700 mb-1">{log.reason}</div>
                                    {log.rule && (
                                        <div className="text-xs text-slate-500">
                                            Règle: {log.rule.name}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </Card>
            )}

            {/* Activate Modal */}
            <Modal
                isOpen={showActivateModal}
                onClose={() => {
                    setShowActivateModal(false);
                    setSelectedMissionId(profile?.assignedMission?.id || "");
                }}
                title="Activer le prospect"
                size="md"
            >
                <div className="space-y-4">
                    <div className="bg-primary-50 border border-primary-200 rounded-lg p-3">
                        <p className="text-sm text-primary-900">
                            <strong>Que fait l'activation ?</strong>
                        </p>
                        <ul className="text-xs text-primary-800 mt-2 space-y-1 list-disc list-inside">
                            <li>Crée un Contact dans le CRM</li>
                            <li>Crée une Company (si nom d'entreprise fourni)</li>
                            <li>Assigne le prospect à la mission sélectionnée</li>
                            <li>Ajoute le Contact à une liste de la mission</li>
                            <li>Rend le Contact visible pour les SDRs assignés à cette mission</li>
                        </ul>
                    </div>

                    {/* Show routed mission if different */}
                    {profile?.assignedMission && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <div className="flex items-start gap-2">
                                <Target className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                    <p className="text-xs font-medium text-amber-900 mb-1">
                                        Mission routée automatiquement:
                                    </p>
                                    <p className="text-sm text-amber-800">
                                        {profile.assignedMission.name}
                                        {profile.assignedMission.client && (
                                            <span className="text-amber-600"> ({profile.assignedMission.client.name})</span>
                                        )}
                                    </p>
                                    <p className="text-xs text-amber-700 mt-1">
                                        Vous pouvez changer cette mission ci-dessous si nécessaire.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Sélectionner une mission *
                        </label>
                        {isLoadingMissions ? (
                            <div className="flex items-center gap-2 py-2">
                                <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
                                <span className="text-sm text-slate-500">Chargement des missions...</span>
                            </div>
                        ) : (
                            <Select
                                options={missions.map((m) => ({
                                    value: m.id,
                                    label: `${m.name} (${m.client.name})`,
                                }))}
                                value={selectedMissionId || profile?.assignedMission?.id || ""}
                                onChange={setSelectedMissionId}
                                placeholder="Choisir une mission..."
                            />
                        )}
                        <p className="text-xs text-slate-500 mt-1">
                            La mission est requise car les Contacts doivent appartenir à une Liste, qui doit appartenir à une Mission.
                        </p>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-xs text-blue-800">
                            <strong>Note:</strong> Le prospect sera automatiquement ajouté à une liste de la mission sélectionnée.
                            Les SDRs assignés à cette mission pourront voir et contacter ce prospect.
                        </p>
                    </div>

                    <div className="flex gap-2 justify-end pt-4 border-t">
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setShowActivateModal(false);
                                setSelectedMissionId("");
                            }}
                            disabled={isProcessing}
                        >
                            Annuler
                        </Button>
                        <Button
                            onClick={handleActivate}
                            disabled={isProcessing || (!selectedMissionId && !profile?.assignedMission?.id) || isLoadingMissions}
                        >
                            {isProcessing ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Activation...
                                </>
                            ) : (
                                <>
                                    <Zap className="w-4 h-4 mr-2" />
                                    Activer
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
