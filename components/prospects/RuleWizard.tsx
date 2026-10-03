"use client";

import { useState, useEffect } from "react";
import { Button, Card, Input, Select, Modal, useToast } from "@/components/ui";
import { getRuleCreatedNotification } from "@/lib/prospects/notifications";
import {
    ChevronRight,
    ChevronLeft,
    Check,
    Loader2,
    TestTube,
    AlertCircle,
    Plus,
    X,
    Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ProspectPipelineStep } from "@prisma/client";

// ============================================
// WIZARD STEPS
// ============================================

const STEPS = [
    { id: "scope", label: "Portée", icon: AlertCircle },
    { id: "condition", label: "Condition", icon: Check },
    { id: "action", label: "Action", icon: Play },
    { id: "test", label: "Test", icon: TestTube },
];

// ============================================
// FORM DATA
// ============================================

interface FormData {
    name: string;
    description: string;
    step: ProspectPipelineStep | null;
    clientId: string | null;
    sourceId: string | null;
    priority: number;
    condition: {
        field: string;
        operator: string;
        value: any;
    } | null;
    action: {
        type: string;
        value: any;
        reason: string;
    } | null;
}

const INITIAL_FORM_DATA: FormData = {
    name: "",
    description: "",
    step: null,
    clientId: null,
    sourceId: null,
    priority: 0,
    condition: null,
    action: null,
};

// ============================================
// FIELD OPTIONS
// ============================================

const FIELD_OPTIONS = [
    { value: "email", label: "Email" },
    { value: "phone", label: "Téléphone" },
    { value: "firstName", label: "Prénom" },
    { value: "lastName", label: "Nom" },
    { value: "title", label: "Titre" },
    { value: "companyName", label: "Nom de l'entreprise" },
    { value: "companyWebsite", label: "Site web" },
    { value: "companyIndustry", label: "Industrie" },
    { value: "qualityScore", label: "Score de qualité" },
    { value: "confidenceScore", label: "Score de confiance" },
];

const OPERATOR_OPTIONS = [
    { value: "equals", label: "Égal à" },
    { value: "contains", label: "Contient" },
    { value: "startsWith", label: "Commence par" },
    { value: "endsWith", label: "Se termine par" },
    { value: "isEmpty", label: "Est vide" },
    { value: "isNotEmpty", label: "N'est pas vide" },
    { value: "greaterThan", label: "Supérieur à" },
    { value: "lessThan", label: "Inférieur à" },
];

const ACTION_OPTIONS = [
    { value: "adjustScore", label: "Ajuster le score", description: "Ajouter ou soustraire des points" },
    { value: "setScore", label: "Définir le score", description: "Définir un score spécifique" },
    { value: "requireReview", label: "Requérir révision", description: "Envoyer à l'Exception Inbox" },
    { value: "reject", label: "Rejeter", description: "Rejeter le prospect" },
    { value: "setField", label: "Définir un champ", description: "Modifier une valeur" },
];

// ============================================
// RULE WIZARD
// ============================================

interface RuleWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export function RuleWizard({ isOpen, onClose, onSuccess }: RuleWizardProps) {
    const { success, error: showError } = useToast();
    const [currentStep, setCurrentStep] = useState(0);
    const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<any>(null);
    const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
    const [sources, setSources] = useState<Array<{ id: string; name: string }>>([]);

    // Fetch clients and sources
    useEffect(() => {
        if (isOpen) {
            fetch("/api/clients")
                .then((res) => res.json())
                .then((json) => {
                    if (json.success) {
                        setClients(json.data || []);
                    }
                });

            fetch("/api/prospects/sources")
                .then((res) => res.json())
                .then((json) => {
                    if (json.success) {
                        setSources(json.data || []);
                    }
                });
        }
    }, [isOpen]);

    // ============================================
    // FORM HANDLERS
    // ============================================

    const updateField = (field: keyof FormData, value: any) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const updateCondition = (field: keyof FormData["condition"], value: any) => {
        setFormData((prev) => ({
            ...prev,
            condition: {
                ...(prev.condition || { field: "", operator: "", value: "" }),
                [field]: value,
            } as any,
        }));
    };

    const updateAction = (field: keyof FormData["action"], value: any) => {
        setFormData((prev) => ({
            ...prev,
            action: {
                ...(prev.action || { type: "", value: 0, reason: "" }),
                [field]: value,
            } as any,
        }));
    };

    // ============================================
    // NAVIGATION
    // ============================================

    const canProceed = () => {
        switch (currentStep) {
            case 0:
                return formData.name.trim().length > 0 && formData.step !== null;
            case 1:
                return (
                    formData.condition?.field &&
                    formData.condition?.operator &&
                    (formData.condition.operator === "isEmpty" ||
                        formData.condition.operator === "isNotEmpty" ||
                        formData.condition.value !== undefined)
                );
            case 2:
                return formData.action?.type && formData.action?.reason;
            case 3:
                return true;
            default:
                return true;
        }
    };

    const handleNext = () => {
        if (canProceed() && currentStep < STEPS.length - 1) {
            setCurrentStep((prev) => prev + 1);
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep((prev) => prev - 1);
        }
    };

    const handleClose = () => {
        setCurrentStep(0);
        setFormData(INITIAL_FORM_DATA);
        setTestResult(null);
        onClose();
    };

    // ============================================
    // TEST RULE
    // ============================================

    const handleTest = async () => {
        setIsTesting(true);
        setTestResult(null);

        try {
            const res = await fetch("/api/prospects/sandbox/test-rule", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    condition: formData.condition,
                    action: formData.action,
                }),
            });

            const json = await res.json();

            if (json.success) {
                setTestResult(json.data);
            } else {
                showError("Erreur", json.error || "Le test a échoué");
            }
        } catch (err) {
            console.error("Failed to test rule:", err);
            showError("Erreur", "Le test a échoué");
        } finally {
            setIsTesting(false);
        }
    };

    // ============================================
    // SAVE RULE
    // ============================================

    const handleSave = async () => {
        setIsSubmitting(true);
        try {
            const res = await fetch("/api/prospects/rules", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: formData.name,
                    description: formData.description || undefined,
                    step: formData.step,
                    clientId: formData.clientId || undefined,
                    sourceId: formData.sourceId || undefined,
                    priority: formData.priority,
                    condition: formData.condition,
                    action: formData.action,
                }),
            });

            const json = await res.json();

            if (json.success) {
                const notif = getRuleCreatedNotification(formData.name, formData.step || "");
                success(notif.title, notif.message);
                onSuccess?.();
                handleClose();
            } else {
                showError("Erreur", json.error || "Impossible de créer la règle");
            }
        } catch (err) {
            console.error("Failed to create rule:", err);
            showError("Erreur", "Impossible de créer la règle");
        } finally {
            setIsSubmitting(false);
        }
    };

    // ============================================
    // RENDER STEP CONTENT
    // ============================================

    const renderStepContent = () => {
        switch (currentStep) {
            case 0:
                return (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Nom de la règle *
                            </label>
                            <Input
                                value={formData.name}
                                onChange={(e) => updateField("name", e.target.value)}
                                placeholder="Ex: Valider les emails professionnels"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Description
                            </label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => updateField("description", e.target.value)}
                                placeholder="Description de la règle..."
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                rows={3}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Étape du pipeline *
                            </label>
                            <Select
                                value={formData.step || ""}
                                onChange={(value) => updateField("step", value as ProspectPipelineStep)}
                                options={[
                                    { value: "", label: "Sélectionner..." },
                                    { value: "VALIDATE", label: "Validation" },
                                    { value: "SCORE", label: "Scoring" },
                                    { value: "ROUTE", label: "Routage" },
                                ]}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Client (optionnel)
                                </label>
                                <Select
                                    value={formData.clientId || ""}
                                    onChange={(value) => updateField("clientId", value || null)}
                                    options={[
                                        { value: "", label: "Tous les clients" },
                                        ...clients.map((c) => ({ value: c.id, label: c.name })),
                                    ]}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Source (optionnel)
                                </label>
                                <Select
                                    value={formData.sourceId || ""}
                                    onChange={(value) => updateField("sourceId", value || null)}
                                    options={[
                                        { value: "", label: "Toutes les sources" },
                                        ...sources.map((s) => ({ value: s.id, label: s.name })),
                                    ]}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Priorité
                            </label>
                            <Input
                                type="number"
                                value={formData.priority}
                                onChange={(e) => updateField("priority", parseInt(e.target.value) || 0)}
                                placeholder="0"
                            />
                            <p className="text-xs text-slate-500 mt-1">
                                Priorité plus élevée = évaluée en premier (défaut: 0)
                            </p>
                        </div>
                    </div>
                );

            case 1:
                return (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Champ *
                            </label>
                            <Select
                                value={formData.condition?.field || ""}
                                onChange={(value) => updateCondition("field", value)}
                                options={[
                                    { value: "", label: "Sélectionner un champ..." },
                                    ...FIELD_OPTIONS,
                                ]}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Opérateur *
                            </label>
                            <Select
                                value={formData.condition?.operator || ""}
                                onChange={(value) => updateCondition("operator", value)}
                                options={[
                                    { value: "", label: "Sélectionner un opérateur..." },
                                    ...OPERATOR_OPTIONS,
                                ]}
                            />
                        </div>
                        {formData.condition?.operator &&
                            formData.condition.operator !== "isEmpty" &&
                            formData.condition.operator !== "isNotEmpty" && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        Valeur *
                                    </label>
                                    {formData.condition.field === "qualityScore" ||
                                    formData.condition.field === "confidenceScore" ? (
                                        <Input
                                            type="number"
                                            value={formData.condition.value || ""}
                                            onChange={(e) =>
                                                updateCondition("value", parseInt(e.target.value) || 0)
                                            }
                                            placeholder="0"
                                        />
                                    ) : (
                                        <Input
                                            value={formData.condition.value || ""}
                                            onChange={(e) => updateCondition("value", e.target.value)}
                                            placeholder="Valeur à comparer"
                                        />
                                    )}
                                </div>
                            )}
                        {formData.condition?.field && formData.condition?.operator && (
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                                <h4 className="font-medium text-slate-900 mb-2">Aperçu de la condition</h4>
                                <p className="text-sm text-slate-600">
                                    Si{" "}
                                    <span className="font-mono font-medium">
                                        {formData.condition.field}
                                    </span>{" "}
                                    {OPERATOR_OPTIONS.find((o) => o.value === formData.condition?.operator)?.label.toLowerCase()}{" "}
                                    {formData.condition.value !== undefined &&
                                        formData.condition.operator !== "isEmpty" &&
                                        formData.condition.operator !== "isNotEmpty" && (
                                            <>
                                                <span className="font-mono font-medium">
                                                    "{formData.condition.value}"
                                                </span>
                                            </>
                                        )}
                                </p>
                            </div>
                        )}
                    </div>
                );

            case 2:
                return (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Type d'action *
                            </label>
                            <Select
                                value={formData.action?.type || ""}
                                onChange={(value) => updateAction("type", value)}
                                options={[
                                    { value: "", label: "Sélectionner une action..." },
                                    ...ACTION_OPTIONS.map((a) => ({
                                        value: a.value,
                                        label: `${a.label} - ${a.description}`,
                                    })),
                                ]}
                            />
                        </div>
                        {formData.action?.type && (
                            <>
                                {(formData.action.type === "adjustScore" || formData.action.type === "setScore") && (
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">
                                            {formData.action.type === "adjustScore" ? "Ajustement" : "Score"} *
                                        </label>
                                        <Input
                                            type="number"
                                            value={formData.action.value || 0}
                                            onChange={(e) => updateAction("value", parseInt(e.target.value) || 0)}
                                            placeholder={formData.action.type === "adjustScore" ? "-30" : "50"}
                                        />
                                        <p className="text-xs text-slate-500 mt-1">
                                            {formData.action.type === "adjustScore"
                                                ? "Nombre de points à ajouter (négatif pour soustraire)"
                                                : "Score à définir (0-100)"}
                                        </p>
                                    </div>
                                )}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        Raison / Explication *
                                    </label>
                                    <textarea
                                        value={formData.action.reason || ""}
                                        onChange={(e) => updateAction("reason", e.target.value)}
                                        placeholder="Ex: Fournisseur d'email gratuit détecté"
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        rows={3}
                                    />
                                    <p className="text-xs text-slate-500 mt-1">
                                        Cette raison apparaîtra dans les logs de décision
                                    </p>
                                </div>
                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                                    <h4 className="font-medium text-slate-900 mb-2">Aperçu de la règle</h4>
                                    <p className="text-sm text-slate-600">
                                        Si{" "}
                                        <span className="font-mono font-medium">
                                            {formData.condition?.field}
                                        </span>{" "}
                                        {formData.condition?.operator &&
                                            OPERATOR_OPTIONS.find((o) => o.value === formData.condition?.operator)?.label.toLowerCase()}{" "}
                                        {formData.condition?.value !== undefined &&
                                            formData.condition.operator !== "isEmpty" &&
                                            formData.condition.operator !== "isNotEmpty" && (
                                                <span className="font-mono font-medium">
                                                    "{formData.condition.value}"
                                                </span>
                                            )}
                                        <br />
                                        Alors{" "}
                                        {formData.action.type &&
                                            ACTION_OPTIONS.find((a) => a.value === formData.action?.type)?.label.toLowerCase()}{" "}
                                        {formData.action.value !== undefined && (
                                            <span className="font-mono font-medium">
                                                {formData.action.value}
                                            </span>
                                        )}
                                        <br />
                                        Raison: {formData.action.reason}
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                );

            case 3:
                return (
                    <div className="space-y-4">
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                            <h4 className="font-medium text-slate-900 mb-2">Tester la règle</h4>
                            <p className="text-sm text-slate-600 mb-4">
                                Testez la règle avec des données d'essai pour vérifier qu'elle fonctionne correctement.
                            </p>
                            <Button onClick={handleTest} disabled={isTesting} className="w-full">
                                {isTesting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Test en cours...
                                    </>
                                ) : (
                                    <>
                                        <TestTube className="w-4 h-4 mr-2" />
                                        Tester la règle
                                    </>
                                )}
                            </Button>
                        </div>

                        {testResult && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <h4 className="font-medium text-blue-900 mb-2">Résultat du test</h4>
                                <pre className="text-xs text-blue-700 overflow-x-auto">
                                    {JSON.stringify(testResult, null, 2)}
                                </pre>
                            </div>
                        )}
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Créer une règle"
            size="lg"
        >
            {/* Step indicator */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                    {STEPS.map((step, index) => (
                        <div key={step.id} className="flex items-center flex-1">
                            <div className="flex flex-col items-center flex-1">
                                <div
                                    className={cn(
                                        "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors",
                                        index <= currentStep
                                            ? "bg-primary-600 border-primary-600 text-white"
                                            : "bg-white border-slate-300 text-slate-400"
                                    )}
                                >
                                    {index < currentStep ? (
                                        <Check className="w-5 h-5" />
                                    ) : (
                                        <step.icon className="w-5 h-5" />
                                    )}
                                </div>
                                <p className="text-xs text-slate-600 mt-2 text-center">{step.label}</p>
                            </div>
                            {index < STEPS.length - 1 && (
                                <div
                                    className={cn(
                                        "h-0.5 flex-1 mx-2",
                                        index < currentStep ? "bg-primary-600" : "bg-slate-300"
                                    )}
                                />
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Step content */}
            <div className="min-h-[300px]">{renderStepContent()}</div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200">
                <Button variant="secondary" onClick={currentStep === 0 ? handleClose : handleBack}>
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    {currentStep === 0 ? "Annuler" : "Précédent"}
                </Button>
                <div className="flex gap-2">
                    {currentStep === STEPS.length - 1 ? (
                        <Button onClick={handleSave} disabled={!canProceed() || isSubmitting}>
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Création...
                                </>
                            ) : (
                                "Créer la règle"
                            )}
                        </Button>
                    ) : (
                        <Button onClick={handleNext} disabled={!canProceed()}>
                            Suivant
                            <ChevronRight className="w-4 h-4 ml-2" />
                        </Button>
                    )}
                </div>
            </div>
        </Modal>
    );
}
