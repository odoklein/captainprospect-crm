"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Select, Modal, useToast } from "@/components/ui";
import { getSourceCreatedNotification, getSourceTestedNotification } from "@/lib/prospects/notifications";
import {
    Globe,
    FileText,
    Code,
    Link as LinkIcon,
    Users,
    ChevronRight,
    ChevronLeft,
    Check,
    TestTube,
    Loader2,
    Copy,
    CheckCircle,
    XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ProspectSourceType } from "@prisma/client";

// ============================================
// WIZARD STEPS
// ============================================

const STEPS = [
    { id: "type", label: "Type de source", icon: Globe },
    { id: "config", label: "Configuration", icon: Code },
    { id: "settings", label: "Paramètres", icon: Users },
    { id: "test", label: "Test", icon: TestTube },
];

// ============================================
// SOURCE TYPES
// ============================================

const SOURCE_TYPES = [
    {
        id: "WEB_FORM" as ProspectSourceType,
        name: "Formulaire Web",
        description: "Connectez un formulaire web pour recevoir des leads automatiquement",
        icon: Globe,
        color: "from-blue-500 to-blue-600",
        bgColor: "bg-blue-50",
        borderColor: "border-blue-200 hover:border-blue-400",
    },
    {
        id: "CSV_IMPORT" as ProspectSourceType,
        name: "Import CSV",
        description: "Importez des leads depuis un fichier CSV",
        icon: FileText,
        color: "from-green-500 to-green-600",
        bgColor: "bg-green-50",
        borderColor: "border-green-200 hover:border-green-400",
    },
    {
        id: "API" as ProspectSourceType,
        name: "API",
        description: "Intégration API pour recevoir des leads programmatiquement",
        icon: Code,
        color: "from-accent-500 to-accent-600",
        bgColor: "bg-accent-50",
        borderColor: "border-accent-200 hover:border-accent-400",
    },
    {
        id: "PARTNER_FEED" as ProspectSourceType,
        name: "Flux Partenaire",
        description: "Connectez un flux de données partenaire",
        icon: LinkIcon,
        color: "from-orange-500 to-orange-600",
        bgColor: "bg-orange-50",
        borderColor: "border-orange-200 hover:border-orange-400",
    },
    {
        id: "MANUAL_ENTRY" as ProspectSourceType,
        name: "Saisie Manuelle",
        description: "Saisie manuelle de prospects",
        icon: Users,
        color: "from-gray-500 to-gray-600",
        bgColor: "bg-gray-50",
        borderColor: "border-gray-200 hover:border-gray-400",
    },
];

// ============================================
// FORM DATA
// ============================================

interface FormData {
    name: string;
    type: ProspectSourceType | null;
    clientId: string | null;
    defaultMissionId: string | null;
    autoActivate: boolean;
    metadata: Record<string, any>;
}

const INITIAL_FORM_DATA: FormData = {
    name: "",
    type: null,
    clientId: null,
    defaultMissionId: null,
    autoActivate: false,
    metadata: {},
};

// ============================================
// SOURCE SETUP WIZARD
// ============================================

interface SourceSetupWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export function SourceSetupWizard({ isOpen, onClose, onSuccess }: SourceSetupWizardProps) {
    const router = useRouter();
    const { success, error: showError } = useToast();
    const [currentStep, setCurrentStep] = useState(0);
    const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<any>(null);
    const [createdSource, setCreatedSource] = useState<any>(null);
    const [missions, setMissions] = useState<Array<{ id: string; name: string }>>([]);
    const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);

    // Fetch missions and clients
    useEffect(() => {
        if (isOpen && currentStep >= 2) {
            fetch("/api/missions")
                .then((res) => res.json())
                .then((json) => {
                    if (json.success) {
                        setMissions(json.data || []);
                    }
                });

            fetch("/api/clients")
                .then((res) => res.json())
                .then((json) => {
                    if (json.success) {
                        setClients(json.data || []);
                    }
                });
        }
    }, [isOpen, currentStep]);

    // ============================================
    // FORM HANDLERS
    // ============================================

    const updateField = (field: keyof FormData, value: any) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    // ============================================
    // NAVIGATION
    // ============================================

    const canProceed = () => {
        switch (currentStep) {
            case 0:
                return formData.type !== null && formData.name.trim().length > 0;
            case 1:
                return true; // Config step validation depends on type
            case 2:
                return true; // Settings are optional
            case 3:
                return createdSource !== null; // Must have created source to test
            default:
                return true;
        }
    };

    const handleNext = async () => {
        if (currentStep === 1) {
            // Create source before moving to settings
            await handleCreateSource();
        } else if (currentStep === 2) {
            // Update source with settings
            if (createdSource) {
                await handleUpdateSource();
            }
        }

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
        setCreatedSource(null);
        onClose();
    };

    // ============================================
    // CREATE SOURCE
    // ============================================

    const handleCreateSource = async () => {
        setIsSubmitting(true);
        try {
            const res = await fetch("/api/prospects/sources", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: formData.name,
                    type: formData.type,
                    clientId: formData.clientId || undefined,
                    defaultMissionId: formData.defaultMissionId || undefined,
                    autoActivate: formData.autoActivate,
                    metadata: formData.metadata,
                }),
            });

            const json = await res.json();

            if (json.success) {
                setCreatedSource(json.data);
                const notif = getSourceCreatedNotification(formData.name, formData.type || "");
                success(notif.title, notif.message);
            } else {
                showError("Erreur", json.error || "Impossible de créer la source");
            }
        } catch (err) {
            console.error("Failed to create source:", err);
            showError("Erreur", "Impossible de créer la source");
        } finally {
            setIsSubmitting(false);
        }
    };

    // ============================================
    // UPDATE SOURCE
    // ============================================

    const handleUpdateSource = async () => {
        if (!createdSource) return;

        try {
            const res = await fetch(`/api/prospects/sources/${createdSource.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    defaultMissionId: formData.defaultMissionId || null,
                    autoActivate: formData.autoActivate,
                }),
            });

            const json = await res.json();

            if (json.success) {
                setCreatedSource(json.data);
            }
        } catch (err) {
            console.error("Failed to update source:", err);
        }
    };

    // ============================================
    // TEST SOURCE
    // ============================================

    const handleTest = async () => {
        if (!createdSource) return;

        setIsTesting(true);
        setTestResult(null);

        try {
            const res = await fetch(`/api/prospects/sources/${createdSource.id}/test-lead`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });

            const json = await res.json();

            if (json.success) {
                setTestResult({
                    success: true,
                    message: "Lead de test envoyé avec succès",
                    eventId: json.data.eventId,
                    profileId: json.data.profileId,
                });
                const notif = getSourceTestedNotification(true);
                success(notif.title, notif.message);
            } else {
                setTestResult({
                    success: false,
                    message: json.error || "Le test a échoué",
                });
                const notif = getSourceTestedNotification(false);
                showError(notif.title, notif.message);
            }
        } catch (err) {
            console.error("Failed to test source:", err);
            setTestResult({
                success: false,
                message: "Erreur lors du test",
            });
            showError("Erreur", "Le test a échoué");
        } finally {
            setIsTesting(false);
        }
    };

    // ============================================
    // FINISH
    // ============================================

    const handleFinish = () => {
        success(
            "Source activée",
            `"${formData.name}" est maintenant active ! Les nouveaux leads de cette source seront automatiquement traités par le pipeline.`
        );
        onSuccess?.();
        handleClose();
        router.push("/manager/prospects/sources");
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
                                Nom de la source *
                            </label>
                            <Input
                                value={formData.name}
                                onChange={(e) => updateField("name", e.target.value)}
                                placeholder="Ex: Formulaire de contact principal"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-4">
                                Type de source *
                            </label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {SOURCE_TYPES.map((type) => {
                                    const Icon = type.icon;
                                    const isSelected = formData.type === type.id;
                                    return (
                                        <button
                                            key={type.id}
                                            type="button"
                                            onClick={() => updateField("type", type.id)}
                                            className={cn(
                                                "p-4 border-2 rounded-xl text-left transition-all",
                                                "hover:shadow-md",
                                                isSelected
                                                    ? `${type.borderColor} bg-white shadow-md`
                                                    : "border-slate-200 hover:border-slate-300"
                                            )}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={cn("p-2 rounded-lg", type.bgColor)}>
                                                    <Icon className="w-5 h-5" />
                                                </div>
                                                <div className="flex-1">
                                                    <h3 className="font-medium text-slate-900">{type.name}</h3>
                                                    <p className="text-sm text-slate-600 mt-1">{type.description}</p>
                                                </div>
                                                {isSelected && (
                                                    <CheckCircle className="w-5 h-5 text-primary-600 flex-shrink-0" />
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );

            case 1:
                return (
                    <div className="space-y-4">
                        {formData.type === "API" && (
                            <>
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <h4 className="font-medium text-blue-900 mb-2">Clé API générée</h4>
                                    <p className="text-sm text-blue-700 mb-3">
                                        Utilisez cette clé pour authentifier vos requêtes à l'endpoint d'intake.
                                    </p>
                                    {createdSource?.metadata?.apiKey && (
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 px-3 py-2 bg-white border border-blue-200 rounded text-sm font-mono">
                                                {createdSource.metadata.apiKey}
                                            </code>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(createdSource.metadata.apiKey);
                                                    success("Copié", "Clé API copiée dans le presse-papiers");
                                                }}
                                            >
                                                <Copy className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        Endpoint URL
                                    </label>
                                    <code className="block px-3 py-2 bg-slate-50 border border-slate-200 rounded text-sm">
                                        {process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}
                                        /api/prospects/intake
                                    </code>
                                </div>
                            </>
                        )}

                        {formData.type === "WEB_FORM" && (
                            <>
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <h4 className="font-medium text-blue-900 mb-2">URL Webhook</h4>
                                    <p className="text-sm text-blue-700 mb-3">
                                        Configurez votre formulaire pour envoyer les données à cette URL.
                                    </p>
                                    {createdSource?.metadata?.webhookUrl && (
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 px-3 py-2 bg-white border border-blue-200 rounded text-sm break-all">
                                                {createdSource.metadata.webhookUrl}
                                            </code>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(createdSource.metadata.webhookUrl);
                                                    success("Copié", "URL webhook copiée");
                                                }}
                                            >
                                                <Copy className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                                    <h4 className="font-medium text-slate-900 mb-2">Format attendu</h4>
                                    <pre className="text-xs text-slate-600 overflow-x-auto">
                                        {JSON.stringify(
                                            {
                                                sourceId: createdSource?.id || "SOURCE_ID",
                                                payload: {
                                                    firstName: "John",
                                                    lastName: "Doe",
                                                    email: "john@example.com",
                                                    company: "Acme Corp",
                                                },
                                            },
                                            null,
                                            2
                                        )}
                                    </pre>
                                </div>
                            </>
                        )}

                        {(formData.type === "CSV_IMPORT" || formData.type === "PARTNER_FEED" || formData.type === "MANUAL_ENTRY") && (
                            <div className="text-center py-8 text-slate-500">
                                <p>Configuration automatique pour ce type de source.</p>
                                <p className="text-sm mt-2">Passez à l'étape suivante pour configurer les paramètres.</p>
                            </div>
                        )}
                    </div>
                );

            case 2:
                return (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Mission par défaut (optionnel)
                            </label>
                            <Select
                                value={formData.defaultMissionId || ""}
                                onChange={(value) => updateField("defaultMissionId", value || null)}
                                options={[
                                    { value: "", label: "Aucune" },
                                    ...missions.map((m) => ({ value: m.id, label: m.name })),
                                ]}
                                placeholder="Sélectionner une mission"
                            />
                        </div>
                        <div>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={formData.autoActivate}
                                    onChange={(e) => updateField("autoActivate", e.target.checked)}
                                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                                />
                                <span className="text-sm text-slate-700">
                                    Activation automatique pour les prospects haute qualité
                                </span>
                            </label>
                            <p className="text-xs text-slate-500 mt-1 ml-6">
                                Les prospects avec un score élevé seront automatiquement activés sans révision
                            </p>
                        </div>
                    </div>
                );

            case 3:
                return (
                    <div className="space-y-4">
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                            <h4 className="font-medium text-slate-900 mb-2">Tester la source</h4>
                            <p className="text-sm text-slate-600 mb-4">
                                Envoyez un lead de test pour vérifier que la source fonctionne correctement.
                            </p>
                            <Button
                                onClick={handleTest}
                                disabled={isTesting}
                                className="w-full"
                            >
                                {isTesting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Test en cours...
                                    </>
                                ) : (
                                    <>
                                        <TestTube className="w-4 h-4 mr-2" />
                                        Envoyer un lead de test
                                    </>
                                )}
                            </Button>
                        </div>

                        {testResult && (
                            <div
                                className={cn(
                                    "border rounded-lg p-4",
                                    testResult.success
                                        ? "bg-emerald-50 border-emerald-200"
                                        : "bg-red-50 border-red-200"
                                )}
                            >
                                <div className="flex items-start gap-2">
                                    {testResult.success ? (
                                        <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                                    ) : (
                                        <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                                    )}
                                    <div className="flex-1">
                                        <p className={cn("font-medium", testResult.success ? "text-emerald-900" : "text-red-900")}>
                                            {testResult.message}
                                        </p>
                                        {testResult.success && testResult.profileId && (
                                            <p className="text-sm text-emerald-700 mt-1">
                                                Prospect créé avec l'ID: {testResult.profileId}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {testResult?.success && (
                            <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
                                <h4 className="font-medium text-primary-900 mb-2">Source prête</h4>
                                <p className="text-sm text-primary-700">
                                    Votre source est configurée et fonctionne correctement. Les nouveaux leads seront automatiquement traités.
                                </p>
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
            title="Configurer une nouvelle source"
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
                        <Button onClick={handleFinish} disabled={!testResult?.success}>
                            Terminer
                        </Button>
                    ) : (
                        <Button onClick={handleNext} disabled={!canProceed() || isSubmitting}>
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Création...
                                </>
                            ) : (
                                <>
                                    Suivant
                                    <ChevronRight className="w-4 h-4 ml-2" />
                                </>
                            )}
                        </Button>
                    )}
                </div>
            </div>
        </Modal>
    );
}
