"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, Button, useToast, DataTable, ConfirmModal } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { RuleWizard } from "@/components/prospects/RuleWizard";
import { Plus, RefreshCw, Edit, Trash2, Workflow, CheckCircle, XCircle } from "lucide-react";
import { ProspectPipelineStep } from "@prisma/client";

interface ProspectRule {
    id: string;
    name: string;
    description: string | null;
    step: ProspectPipelineStep;
    priority: number;
    isActive: boolean;
    condition: any;
    action: any;
    createdAt: string;
}

export default function RulesPage() {
    const router = useRouter();
    const { success, error: showError } = useToast();
    const [rules, setRules] = useState<ProspectRule[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showWizard, setShowWizard] = useState(false);
    const [deletingRule, setDeletingRule] = useState<ProspectRule | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    const fetchRules = async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/prospects/rules");
            const json = await res.json();
            if (json.success) {
                setRules(json.data);
            } else {
                showError("Erreur", json.error || "Impossible de charger les règles");
            }
        } catch (err) {
            console.error("Failed to fetch rules:", err);
            showError("Erreur", "Impossible de charger les règles");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchRules();
    }, []);

    const handleDelete = async (rule: ProspectRule) => {
        try {
            const res = await fetch(`/api/prospects/rules/${rule.id}`, {
                method: "DELETE",
            });
            const json = await res.json();
            if (json.success) {
                success("Succès", "Règle supprimée");
                setShowDeleteModal(false);
                setDeletingRule(null);
                fetchRules();
            } else {
                showError("Erreur", json.error || "Impossible de supprimer la règle");
            }
        } catch (err) {
            console.error("Failed to delete rule:", err);
            showError("Erreur", "Impossible de supprimer la règle");
        }
    };

    const columns: Column<ProspectRule>[] = [
        {
            key: "name",
            header: "Nom",
            render: (rule) => (
                <div>
                    <div className="font-medium text-slate-900">{rule.name}</div>
                    {rule.description && (
                        <div className="text-sm text-slate-500">{rule.description}</div>
                    )}
                </div>
            ),
        },
        {
            key: "step",
            header: "Étape",
            render: (rule) => (
                <Badge className="bg-primary-100 text-primary-700">{rule.step}</Badge>
            ),
        },
        {
            key: "priority",
            header: "Priorité",
            render: (rule) => <span className="text-sm">{rule.priority}</span>,
        },
        {
            key: "status",
            header: "Statut",
            render: (rule) => (
                <Badge className={rule.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}>
                    {rule.isActive ? (
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
            ),
        },
        {
            key: "actions",
            header: "",
            render: (rule) => (
                <div className="flex gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/manager/prospects/rules/${rule.id}/edit`)}
                    >
                        <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setDeletingRule(rule);
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

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Règles</h1>
                    <p className="text-slate-600 mt-1">Gérez les règles de validation, scoring et routage</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={() => setShowWizard(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Créer une règle
                    </Button>
                    <Button variant="secondary" onClick={fetchRules} disabled={isLoading}>
                        <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                        Actualiser
                    </Button>
                </div>
            </div>

            <Card>
                {isLoading ? (
                    <div className="text-center py-12">
                        <RefreshCw className="w-8 h-8 text-slate-400 mx-auto animate-spin" />
                        <p className="text-slate-500 mt-2">Chargement...</p>
                    </div>
                ) : rules.length === 0 ? (
                    <div className="text-center py-12">
                        <Workflow className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-slate-700">Aucune règle configurée</h3>
                        <p className="text-slate-500 mt-1 mb-4">
                            Créez votre première règle pour automatiser le traitement des prospects.
                        </p>
                        <Button onClick={() => setShowWizard(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            Créer une règle
                        </Button>
                    </div>
                ) : (
                    <DataTable data={rules} columns={columns} keyField="id" pagination pageSize={20} />
                )}
            </Card>

            <RuleWizard
                isOpen={showWizard}
                onClose={() => setShowWizard(false)}
                onSuccess={() => {
                    fetchRules();
                    setShowWizard(false);
                }}
            />

            <ConfirmModal
                isOpen={showDeleteModal}
                onClose={() => {
                    setShowDeleteModal(false);
                    setDeletingRule(null);
                }}
                onConfirm={() => deletingRule && handleDelete(deletingRule)}
                title="Supprimer la règle"
                message={`Êtes-vous sûr de vouloir supprimer "${deletingRule?.name}" ?`}
                confirmText="Supprimer"
                cancelText="Annuler"
                variant="danger"
            />
        </div>
    );
}
