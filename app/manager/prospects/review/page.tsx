"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, Button, useToast, DataTable, Modal, HelpPanelTrigger } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { getHelpContent } from "@/lib/prospects/help-content";
import {
    AlertCircle,
    CheckCircle,
    XCircle,
    Eye,
    RefreshCw,
    Search,
    Filter,
} from "lucide-react";
import Link from "next/link";

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
    createdAt: string;
    decisionLogs: Array<{
        id: string;
        step: string;
        outcome: string;
        reason: string;
        executedAt: string;
    }>;
}

// ============================================
// EXCEPTION INBOX PAGE
// ============================================

export default function ExceptionInboxPage() {
    const router = useRouter();
    const { success, error: showError } = useToast();
    const [profiles, setProfiles] = useState<ProspectProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedProfile, setSelectedProfile] = useState<ProspectProfile | null>(null);
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    // ============================================
    // FETCH PROFILES REQUIRING REVIEW
    // ============================================

    const fetchProfiles = async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            params.set("reviewRequired", "true");
            params.set("status", "IN_REVIEW");
            if (searchQuery) {
                params.set("search", searchQuery);
            }

            const res = await fetch(`/api/prospects/profiles?${params.toString()}`);
            const json = await res.json();

            if (json.success) {
                setProfiles(json.data);
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
    }, [searchQuery]);

    // ============================================
    // REVIEW ACTIONS
    // ============================================

    const handleApprove = async (profileId: string) => {
        setIsProcessing(true);
        try {
            const res = await fetch(`/api/prospects/profiles/${profileId}/review`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "approve",
                }),
            });

            const json = await res.json();

            if (json.success) {
                success("Succès", "Prospect approuvé");
                setShowReviewModal(false);
                setSelectedProfile(null);
                fetchProfiles();
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

    const handleReject = async (profileId: string, reason?: string) => {
        setIsProcessing(true);
        try {
            const res = await fetch(`/api/prospects/profiles/${profileId}/review`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "reject",
                    reason,
                }),
            });

            const json = await res.json();

            if (json.success) {
                success("Succès", "Prospect rejeté");
                setShowReviewModal(false);
                setSelectedProfile(null);
                fetchProfiles();
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
            key: "reason",
            header: "Raison",
            render: (_value, profile) => (
                <div className="text-sm text-amber-700">
                    {profile.reviewReason || "Révision requise"}
                </div>
            ),
        },
        {
            key: "scores",
            header: "Scores",
            render: (_value, profile) => (
                <div className="text-sm">
                    <div>Qualité: <span className="font-medium">{profile.qualityScore}</span></div>
                    <div>Confiance: <span className="font-medium">{profile.confidenceScore}</span></div>
                </div>
            ),
        },
        {
            key: "actions",
            header: "",
            render: (_value, profile) => (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                        setSelectedProfile(profile);
                        setShowReviewModal(true);
                    }}
                >
                    <Eye className="w-4 h-4" />
                </Button>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between" data-tour="exception-inbox-header">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Exception Inbox</h1>
                    <p className="text-slate-600 mt-1">
                        Prospects nécessitant une révision manuelle
                    </p>
                </div>
                <div className="flex gap-2">
                    <HelpPanelTrigger
                        topic="exceptions"
                        sections={getHelpContent("exceptions")}
                    />
                    <Button
                        variant="secondary"
                        onClick={fetchProfiles}
                        disabled={isLoading}
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                        Actualiser
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => router.push("/manager/prospects")}
                    >
                        Retour
                    </Button>
                </div>
            </div>

            {/* Search */}
            <Card className="p-4">
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
            </Card>

            {/* Table */}
            <Card>
                {isLoading ? (
                    <div className="text-center py-12">
                        <RefreshCw className="w-8 h-8 text-slate-400 mx-auto animate-spin" />
                        <p className="text-slate-500 mt-2">Chargement...</p>
                    </div>
                ) : profiles.length === 0 ? (
                    <div className="text-center py-12">
                        <CheckCircle className="w-12 h-12 text-emerald-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-slate-700">Aucun prospect en révision</h3>
                        <p className="text-slate-500 mt-1">
                            Tous les prospects ont été traités.
                        </p>
                    </div>
                ) : (
                    <DataTable
                        data={profiles}
                        columns={columns}
                        keyField="id"
                        pagination
                        pageSize={20}
                    />
                )}
            </Card>

            {/* Review Modal */}
            {showReviewModal && selectedProfile && (
                <ReviewModal
                    profile={selectedProfile}
                    isOpen={showReviewModal}
                    onClose={() => {
                        setShowReviewModal(false);
                        setSelectedProfile(null);
                    }}
                    onApprove={() => handleApprove(selectedProfile.id)}
                    onReject={(reason) => handleReject(selectedProfile.id, reason)}
                    isProcessing={isProcessing}
                />
            )}
        </div>
    );
}

// ============================================
// REVIEW MODAL
// ============================================

interface ReviewModalProps {
    profile: ProspectProfile;
    isOpen: boolean;
    onClose: () => void;
    onApprove: () => void;
    onReject: (reason?: string) => void;
    isProcessing: boolean;
}

function ReviewModal({ profile, isOpen, onClose, onApprove, onReject, isProcessing }: ReviewModalProps) {
    const [rejectReason, setRejectReason] = useState("");

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Réviser le prospect">
            <div className="space-y-4">
                {/* Profile Info */}
                <div className="space-y-2">
                    <h3 className="font-semibold text-slate-900">Informations</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-slate-600">Nom:</span>
                            <div className="font-medium">
                                {[profile.firstName, profile.lastName].filter(Boolean).join(" ") || "N/A"}
                            </div>
                        </div>
                        <div>
                            <span className="text-slate-600">Email:</span>
                            <div className="font-medium">{profile.email || "—"}</div>
                        </div>
                        <div>
                            <span className="text-slate-600">Téléphone:</span>
                            <div className="font-medium">{profile.phone || "—"}</div>
                        </div>
                        <div>
                            <span className="text-slate-600">Entreprise:</span>
                            <div className="font-medium">{profile.companyName || "—"}</div>
                        </div>
                    </div>
                </div>

                {/* Scores */}
                <div className="space-y-2">
                    <h3 className="font-semibold text-slate-900">Scores</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-slate-600">Qualité:</span>
                            <div className="font-medium">{profile.qualityScore}/100</div>
                        </div>
                        <div>
                            <span className="text-slate-600">Confiance:</span>
                            <div className="font-medium">{profile.confidenceScore}/100</div>
                        </div>
                    </div>
                </div>

                {/* Review Reason */}
                {profile.reviewReason && (
                    <div className="space-y-2">
                        <h3 className="font-semibold text-slate-900">Raison de la révision</h3>
                        <div className="text-sm text-amber-700 bg-amber-50 p-3 rounded-lg">
                            {profile.reviewReason}
                        </div>
                    </div>
                )}

                {/* Decision Logs */}
                {profile.decisionLogs && profile.decisionLogs.length > 0 && (
                    <div className="space-y-2">
                        <h3 className="font-semibold text-slate-900">Historique des décisions</h3>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                            {profile.decisionLogs.map((log) => (
                                <div key={log.id} className="text-xs bg-slate-50 p-2 rounded">
                                    <div className="font-medium">{log.step}</div>
                                    <div className="text-slate-600">{log.reason}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Reject Reason Input */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Raison du rejet (optionnel)</label>
                    <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Expliquez pourquoi ce prospect est rejeté..."
                        className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                        rows={3}
                    />
                </div>

                {/* Actions */}
                <div className="flex gap-2 justify-end pt-4 border-t">
                    <Button
                        variant="secondary"
                        onClick={onClose}
                        disabled={isProcessing}
                    >
                        Annuler
                    </Button>
                    <Button
                        variant="danger"
                        onClick={() => onReject(rejectReason)}
                        disabled={isProcessing}
                    >
                        <XCircle className="w-4 h-4 mr-2" />
                        Rejeter
                    </Button>
                    <Button
                        onClick={onApprove}
                        disabled={isProcessing}
                    >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Approuver
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
