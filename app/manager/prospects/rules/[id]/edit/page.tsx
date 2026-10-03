"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Select, useToast } from "@/components/ui";
import { ArrowLeft, Save, Loader2, Eye } from "lucide-react";
import { ProspectPipelineStep } from "@prisma/client";

interface Rule {
    id: string;
    name: string;
    description: string | null;
    step: ProspectPipelineStep;
    priority: number;
    isActive: boolean;
    condition: any;
    action: any;
}

const PIPELINE_STEPS = [
    { value: "INTAKE", label: "Réception" },
    { value: "NORMALIZE", label: "Normalisation" },
    { value: "VALIDATE", label: "Validation" },
    { value: "ENRICH", label: "Enrichissement" },
    { value: "DEDUPLICATE", label: "Déduplication" },
    { value: "SCORE", label: "Scoring" },
    { value: "ROUTE", label: "Routage" },
    { value: "ACTIVATE", label: "Activation" },
];

export default function EditRulePage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const router = useRouter();
    const { success, error: showError } = useToast();

    const [rule, setRule] = useState<Rule | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showCondition, setShowCondition] = useState(false);
    const [showAction, setShowAction] = useState(false);

    const [formData, setFormData] = useState({
        name: "",
        description: "",
        step: "" as ProspectPipelineStep | "",
        priority: 0,
        isActive: true,
    });

    // Fetch rule
    useEffect(() => {
        const fetchRule = async () => {
            setIsLoading(true);
            try {
                const res = await fetch(`/api/prospects/rules/${resolvedParams.id}`);
                const json = await res.json();

                if (json.success) {
                    setRule(json.data);
                    setFormData({
                        name: json.data.name,
                        description: json.data.description || "",
                        step: json.data.step,
                        priority: json.data.priority,
                        isActive: json.data.isActive,
                    });
                } else {
                    showError("Erreur", json.error || "Règle non trouvée");
                    router.push("/manager/prospects/rules");
                }
            } catch (err) {
                console.error("Failed to fetch rule:", err);
                showError("Erreur", "Impossible de charger la règle");
            } finally {
                setIsLoading(false);
            }
        };

        fetchRule();
    }, [resolvedParams.id]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch(`/api/prospects/rules/${resolvedParams.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: formData.name,
                    description: formData.description || undefined,
                    priority: formData.priority,
                    isActive: formData.isActive,
                    // Note: condition and action are read-only in edit mode
                    // To change them, delete and recreate the rule
                }),
            });

            const json = await res.json();

            if (json.success) {
                success("Succès", "Règle mise à jour");
                router.push("/manager/prospects/rules");
            } else {
                showError("Erreur", json.error || "Impossible de mettre à jour la règle");
            }
        } catch (err) {
            console.error("Failed to update rule:", err);
            showError("Erreur", "Impossible de mettre à jour la règle");
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
            </div>
        );
    }

    if (!rule) {
        return null;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push("/manager/prospects/rules")}
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Modifier la règle</h1>
                        <p className="text-slate-600 mt-1">{rule.name}</p>
                    </div>
                </div>
            </div>

            {/* Form */}
            <Card className="p-6">
                <div className="space-y-6">
                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Nom de la règle *
                        </label>
                        <Input
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Ex: Valider les emails"
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Description
                        </label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Description de la règle..."
                            className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                            rows={3}
                        />
                    </div>

                    {/* Step (read-only) */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Étape du pipeline
                        </label>
                        <Input
                            value={PIPELINE_STEPS.find((s) => s.value === rule.step)?.label || rule.step}
                            disabled
                            className="bg-slate-50"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            L'étape du pipeline ne peut pas être modifiée
                        </p>
                    </div>

                    {/* Priority */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Priorité
                        </label>
                        <Input
                            type="number"
                            value={formData.priority}
                            onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                            min="0"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Les règles avec une priorité plus élevée sont exécutées en premier
                        </p>
                    </div>

                    {/* Active Status */}
                    <div className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            id="isActive"
                            checked={formData.isActive}
                            onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                            className="w-4 h-4 text-primary-600 border-slate-300 rounded focus:ring-primary-500"
                        />
                        <label htmlFor="isActive" className="text-sm font-medium text-slate-700">
                            Règle active
                        </label>
                        <p className="text-xs text-slate-500">
                            Les règles inactives ne sont pas exécutées
                        </p>
                    </div>

                    {/* Condition (read-only) */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-slate-700">
                                Condition
                            </label>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowCondition(!showCondition)}
                            >
                                <Eye className="w-4 h-4 mr-2" />
                                {showCondition ? "Masquer" : "Voir"}
                            </Button>
                        </div>
                        {showCondition ? (
                            <pre className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs overflow-x-auto">
                                {JSON.stringify(rule.condition, null, 2)}
                            </pre>
                        ) : (
                            <Input
                                value="Cliquez sur 'Voir' pour afficher la condition"
                                disabled
                                className="bg-slate-50"
                            />
                        )}
                        <p className="text-xs text-slate-500 mt-1">
                            La condition ne peut pas être modifiée. Supprimez et recréez la règle pour la modifier.
                        </p>
                    </div>

                    {/* Action (read-only) */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-slate-700">
                                Action
                            </label>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowAction(!showAction)}
                            >
                                <Eye className="w-4 h-4 mr-2" />
                                {showAction ? "Masquer" : "Voir"}
                            </Button>
                        </div>
                        {showAction ? (
                            <pre className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs overflow-x-auto">
                                {JSON.stringify(rule.action, null, 2)}
                            </pre>
                        ) : (
                            <Input
                                value="Cliquez sur 'Voir' pour afficher l'action"
                                disabled
                                className="bg-slate-50"
                            />
                        )}
                        <p className="text-xs text-slate-500 mt-1">
                            L'action ne peut pas être modifiée. Supprimez et recréez la règle pour la modifier.
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 justify-end pt-4 border-t">
                        <Button
                            variant="secondary"
                            onClick={() => router.push("/manager/prospects/rules")}
                            disabled={isSaving}
                        >
                            Annuler
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={isSaving || !formData.name.trim()}
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Enregistrement...
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4 mr-2" />
                                    Enregistrer
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
}
