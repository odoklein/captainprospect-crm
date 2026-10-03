"use client";

import { useState, useEffect } from "react";
import { Card, Button, Input, useToast } from "@/components/ui";
import { PipelineViewer } from "@/components/prospects/PipelineViewer";
import {
    TestTube,
    Play,
    RefreshCw,
    CheckCircle,
    AlertCircle,
} from "lucide-react";
import { ProspectPipelineStep, ProspectStatus } from "@prisma/client";

// ============================================
// TEST LEAD TEMPLATES
// ============================================

const TEST_LEAD_TEMPLATES = [
    {
        id: "high-quality",
        name: "Prospect haute qualité",
        data: {
            firstName: "Jean",
            lastName: "Dupont",
            email: "jean.dupont@acme-corp.com",
            phone: "+33612345678",
            title: "CEO",
            company: "Acme Corp",
            companyWebsite: "https://acme-corp.com",
            companyIndustry: "SaaS",
            linkedin: "https://linkedin.com/in/jeandupont",
        },
    },
    {
        id: "low-quality",
        name: "Prospect basse qualité",
        data: {
            firstName: "Test",
            email: "test@gmail.com",
            company: "Test Company",
        },
    },
    {
        id: "incomplete",
        name: "Prospect incomplet",
        data: {
            email: "incomplete@example.com",
        },
    },
];

// ============================================
// SANDBOX PAGE
// ============================================

export default function SandboxPage() {
    const { success, error: showError } = useToast();
    const [testLead, setTestLead] = useState<any>(TEST_LEAD_TEMPLATES[0].data);
    const [isProcessing, setIsProcessing] = useState(false);
    const [testResult, setTestResult] = useState<any>(null);
    const [currentStep, setCurrentStep] = useState<ProspectPipelineStep>(ProspectPipelineStep.INTAKE);
    const [status, setStatus] = useState<ProspectStatus>(ProspectStatus.PENDING);
    const [decisionLogs, setDecisionLogs] = useState<any[]>([]);

    // ============================================
    // HANDLERS
    // ============================================

    const handleTemplateSelect = (template: typeof TEST_LEAD_TEMPLATES[0]) => {
        setTestLead(template.data);
    };

    const handleFieldChange = (field: string, value: any) => {
        setTestLead((prev: any) => ({ ...prev, [field]: value }));
    };

    const handleTest = async () => {
        setIsProcessing(true);
        setTestResult(null);
        setCurrentStep(ProspectPipelineStep.INTAKE);
        setStatus(ProspectStatus.PENDING);

        try {
            // First, get or create a test source
            const sourcesRes = await fetch("/api/prospects/sources?type=MANUAL_ENTRY");
            const sourcesJson = await sourcesRes.json();
            let sourceId = sourcesJson.data?.[0]?.id;

            if (!sourceId) {
                // Create test source
                const createRes = await fetch("/api/prospects/sources", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: "Sandbox Test Source",
                        type: "MANUAL_ENTRY",
                        isActive: true,
                    }),
                });
                const createJson = await createRes.json();
                if (createJson.success) {
                    sourceId = createJson.data.id;
                } else {
                    throw new Error("Failed to create test source");
                }
            }

            // Send test lead
            const res = await fetch(`/api/prospects/sources/${sourceId}/test-lead`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ payload: testLead }),
            });

            const json = await res.json();

            if (json.success) {
                setTestResult({
                    success: true,
                    eventId: json.data.eventId,
                    profileId: json.data.profileId,
                });

                success("Succès", "Lead de test envoyé, récupération du statut...");

                // Poll for profile status
                if (json.data.profileId) {
                    pollProfileStatus(json.data.profileId);
                }
            } else {
                setTestResult({
                    success: false,
                    error: json.error || "Le test a échoué",
                });
                showError("Erreur", json.error || "Le test a échoué");
            }
        } catch (err) {
            console.error("Failed to test lead:", err);
            setTestResult({
                success: false,
                error: "Erreur lors du test",
            });
            showError("Erreur", "Le test a échoué");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReset = () => {
        setTestLead(TEST_LEAD_TEMPLATES[0].data);
        setTestResult(null);
        setCurrentStep(ProspectPipelineStep.INTAKE);
        setStatus(ProspectStatus.PENDING);
        setDecisionLogs([]);
    };

    // ============================================
    // POLL PROFILE STATUS
    // ============================================

    const pollProfileStatus = async (profileId: string, retries = 20) => {
        for (let i = 0; i < retries; i++) {
            await new Promise((resolve) => setTimeout(resolve, 1500)); // Wait 1.5 seconds between polls

            try {
                const res = await fetch(`/api/prospects/profiles/${profileId}`);
                const json = await res.json();

                if (json.success) {
                    const profile = json.data;
                    setCurrentStep(profile.currentStep);
                    setStatus(profile.status);
                    setDecisionLogs(profile.decisionLogs || []);

                    // If status is terminal (ACTIVATED, REJECTED, DUPLICATE), stop polling
                    if (
                        profile.status === ProspectStatus.ACTIVATED ||
                        profile.status === ProspectStatus.REJECTED ||
                        profile.status === ProspectStatus.DUPLICATE
                    ) {
                        break;
                    }
                }
            } catch (err) {
                console.error("Failed to poll profile status:", err);
            }
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Mode Test (Sandbox)</h1>
                    <p className="text-slate-600 mt-1">
                        Testez le pipeline avec des leads fictifs sans affecter les données réelles
                    </p>
                </div>
                <Button variant="secondary" onClick={handleReset}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Réinitialiser
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Test Lead Generator */}
                <Card className="p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <TestTube className="w-5 h-5 text-primary-600" />
                        <h2 className="text-lg font-semibold text-slate-900">Générateur de Lead de Test</h2>
                    </div>

                    {/* Templates */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Modèles prédéfinis
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {TEST_LEAD_TEMPLATES.map((template) => (
                                <button
                                    key={template.id}
                                    type="button"
                                    onClick={() => handleTemplateSelect(template)}
                                    className="p-3 border border-slate-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-colors text-left"
                                >
                                    <div className="text-sm font-medium text-slate-900">{template.name}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Form */}
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Prénom</label>
                                <Input
                                    value={testLead.firstName || ""}
                                    onChange={(e) => handleFieldChange("firstName", e.target.value)}
                                    placeholder="Jean"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Nom</label>
                                <Input
                                    value={testLead.lastName || ""}
                                    onChange={(e) => handleFieldChange("lastName", e.target.value)}
                                    placeholder="Dupont"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                            <Input
                                type="email"
                                value={testLead.email || ""}
                                onChange={(e) => handleFieldChange("email", e.target.value)}
                                placeholder="jean.dupont@example.com"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Téléphone</label>
                            <Input
                                value={testLead.phone || ""}
                                onChange={(e) => handleFieldChange("phone", e.target.value)}
                                placeholder="+33612345678"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Titre</label>
                            <Input
                                value={testLead.title || ""}
                                onChange={(e) => handleFieldChange("title", e.target.value)}
                                placeholder="CEO"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Entreprise</label>
                            <Input
                                value={testLead.company || ""}
                                onChange={(e) => handleFieldChange("company", e.target.value)}
                                placeholder="Acme Corp"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Site web</label>
                            <Input
                                value={testLead.companyWebsite || ""}
                                onChange={(e) => handleFieldChange("companyWebsite", e.target.value)}
                                placeholder="https://example.com"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Industrie</label>
                            <Input
                                value={testLead.companyIndustry || ""}
                                onChange={(e) => handleFieldChange("companyIndustry", e.target.value)}
                                placeholder="SaaS"
                            />
                        </div>
                    </div>

                    {/* Test Button */}
                    <div className="mt-6 pt-4 border-t border-slate-200">
                        <Button
                            onClick={handleTest}
                            disabled={isProcessing}
                            className="w-full"
                        >
                            {isProcessing ? (
                                <>
                                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                    Traitement en cours...
                                </>
                            ) : (
                                <>
                                    <Play className="w-4 h-4 mr-2" />
                                    Tester le lead
                                </>
                            )}
                        </Button>
                    </div>

                    {/* Test Result */}
                    {testResult && (
                        <div
                            className={`mt-4 p-4 rounded-lg border ${
                                testResult.success
                                    ? "bg-emerald-50 border-emerald-200"
                                    : "bg-red-50 border-red-200"
                            }`}
                        >
                            <div className="flex items-start gap-2">
                                {testResult.success ? (
                                    <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                                ) : (
                                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                                )}
                                <div className="flex-1">
                                    <p
                                        className={`font-medium ${
                                            testResult.success ? "text-emerald-900" : "text-red-900"
                                        }`}
                                    >
                                        {testResult.success ? "Lead traité avec succès" : testResult.error}
                                    </p>
                                    {testResult.success && testResult.profileId && (
                                        <p className="text-sm text-emerald-700 mt-1">
                                            Profile ID: {testResult.profileId}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </Card>

                {/* Pipeline Viewer */}
                <div>
                    <PipelineViewer
                        currentStep={currentStep}
                        status={status}
                        decisionLogs={decisionLogs}
                    />
                </div>
            </div>
        </div>
    );
}
