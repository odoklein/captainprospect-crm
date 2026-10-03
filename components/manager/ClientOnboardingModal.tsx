"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui";
import {
    Building2,
    Users,
    Target,
    FileText,
    Calendar,
    ChevronRight,
    ChevronLeft,
    Check,
    Loader2,
    X,
    Brain,
    ArrowRight,
    AlertTriangle,
    ClipboardPaste,
    Search,
    Mic,
    Link2,
    PenLine,
    Mail,
    Clock,
    Shield,
    Edit3,
} from "lucide-react";
import { Button, Badge, Modal } from "@/components/ui";
import { AiMark } from "@/components/ui/AiMark";
import { cn } from "@/lib/utils";
import type { Playbook, PlaybookSignal } from "@/lib/playbook/leexi-types";

// ============================================
// TYPES
// ============================================

type CreationMode = "leexi" | "paste" | "manual";

interface LeexiCallSummary {
    id: string;
    title: string;
    date: string | null;
    duration: number;
    companyName: string;
    participantNames: string[];
    hasRecap: boolean;
}

interface LeexiCallDetail {
    id: string;
    title: string;
    date: string | null;
    duration: number;
    companyName: string;
    participants: Array<{ name?: string; email?: string; company?: string }>;
    recapText: string;
    hasTranscript: boolean;
}

// ============================================
// WIZARD STEPS
// ============================================

const STEPS_WITH_SOURCE = [
    { id: "source", label: "Source", icon: Link2, description: "Choisir la source" },
    { id: "review", label: "Revue", icon: FileText, description: "Vérifier les données extraites" },
    { id: "client", label: "Fiche Client", icon: Building2, description: "Informations de base" },
    { id: "planning", label: "Planning", icon: Calendar, description: "Date de lancement" },
];

const STEPS_MANUAL = [
    { id: "client", label: "Fiche Client", icon: Building2, description: "Informations de base" },
    { id: "planning", label: "Planning", icon: Calendar, description: "Date de lancement" },
];

interface FormData {
    name: string;
    email: string;
    phone: string;
    industry: string;
    website: string;
    icp: string;
    targetIndustries: string[];
    targetCompanySize: string;
    targetJobTitles: string[];
    targetGeographies: string[];
    listingSources: string[];
    listingCriteria: string;
    estimatedContacts: string;
    introScript: string;
    discoveryScript: string;
    objectionScript: string;
    closingScript: string;
    targetLaunchDate: string;
    notes: string;
    createMission: boolean;
    missionName: string;
    missionObjective: string;
    missionChannel: "CALL" | "EMAIL" | "LINKEDIN";
    missionDurationMonths: number;
    missionWorkingDays: number;
    missionRdvTarget: number;
}

const INITIAL_FORM_DATA: FormData = {
    name: "",
    email: "",
    phone: "",
    industry: "",
    website: "",
    icp: "",
    targetIndustries: [],
    targetCompanySize: "",
    targetJobTitles: [],
    targetGeographies: [],
    listingSources: [],
    listingCriteria: "",
    estimatedContacts: "",
    introScript: "",
    discoveryScript: "",
    objectionScript: "",
    closingScript: "",
    targetLaunchDate: "",
    notes: "",
    createMission: false,
    missionName: "",
    missionObjective: "",
    missionChannel: "CALL",
    missionDurationMonths: 3,
    missionWorkingDays: 10,
    missionRdvTarget: 10,
};

const INDUSTRY_OPTIONS = [
    "SaaS / Tech",
    "E-commerce",
    "Finance / Banque",
    "Santé",
    "Immobilier",
    "Industrie",
    "Services B2B",
    "Retail",
    "Éducation",
    "Autre",
];

const COMPANY_SIZE_OPTIONS = [
    "1-10 employés",
    "11-50 employés",
    "51-200 employés",
    "201-500 employés",
    "501-1000 employés",
    "1000+ employés",
];

const LISTING_SOURCE_OPTIONS = [
    "Apollo.io",
    "LinkedIn Sales Navigator",
    "Clay",
    "Pharow",
    "Base interne",
    "Autre",
];

const TARGET_JOB_OPTIONS = [
    "DRH",
    "Responsable RH",
    "Responsable formation",
    "Directeur",
    "CEO",
    "Responsable recrutement",
    "DAF",
    "DSI",
];

const TARGET_GEO_OPTIONS = ["France", "Europe", "Île-de-France", "Métropole", "Belgique", "Suisse"];

interface ClientOnboardingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (clientId: string) => void;
    initialRecapText?: string;
}

export function ClientOnboardingModal({ isOpen, onClose, onSuccess, initialRecapText }: ClientOnboardingModalProps) {
    const { success, error: showError } = useToast();

    // Mode & step
    const [creationMode, setCreationMode] = useState<CreationMode | null>(null);
    const [currentStep, setCurrentStep] = useState(0);

    // Form
    const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Leexi: recap text (from paste or API fetch)
    const [recapText, setRecapText] = useState("");
    const [isGeneratingPlaybook, setIsGeneratingPlaybook] = useState(false);
    const [generatedPlaybook, setGeneratedPlaybook] = useState<Playbook | null>(null);

    // Leexi call search (Mode A)
    const [leexiSearchQuery, setLeexiSearchQuery] = useState("");
    const [leexiCalls, setLeexiCalls] = useState<LeexiCallSummary[]>([]);
    const [isSearchingCalls, setIsSearchingCalls] = useState(false);
    const [selectedCall, setSelectedCall] = useState<LeexiCallDetail | null>(null);
    const [isFetchingCall, setIsFetchingCall] = useState(false);

    // Leexi import audit
    const [leexiCallId, setLeexiCallId] = useState<string | null>(null);

    const steps = creationMode === "manual" ? STEPS_MANUAL : STEPS_WITH_SOURCE;

    // If initialRecapText is provided, auto-select paste mode
    useEffect(() => {
        if (initialRecapText && isOpen) {
            setCreationMode("paste");
            setRecapText(initialRecapText);
        }
    }, [initialRecapText, isOpen]);

    // ============================================
    // FORM HANDLERS
    // ============================================

    const updateField = (field: keyof FormData, value: string | string[] | boolean | number) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const addTag = (field: "targetIndustries" | "targetJobTitles" | "targetGeographies" | "listingSources", value: string) => {
        if (value.trim() && !formData[field].includes(value.trim())) {
            updateField(field, [...formData[field], value.trim()]);
        }
    };

    const removeTag = (field: "targetIndustries" | "targetJobTitles" | "targetGeographies" | "listingSources", value: string) => {
        updateField(field, formData[field].filter(t => t !== value));
    };

    // ============================================
    // LEEXI CALL SEARCH (Mode A)
    // ============================================

    const searchLeexiCalls = useCallback(async (query?: string) => {
        setIsSearchingCalls(true);
        try {
            const params = new URLSearchParams();
            if (query?.trim()) params.set("q", query.trim());
            const res = await fetch(`/api/leexi/calls?${params}`);
            const json = await res.json();
            if (json.success) {
                setLeexiCalls(json.data.calls || []);
            }
        } catch {
            // Non-blocking
        } finally {
            setIsSearchingCalls(false);
        }
    }, []);

    const fetchCallDetail = async (callId: string | null | undefined) => {
        if (!callId) return;
        setIsFetchingCall(true);
        try {
            const res = await fetch(`/api/leexi/calls/${callId}`);
            const json = await res.json();
            if (json.success) {
                const detail = json.data as LeexiCallDetail;
                setSelectedCall(detail);
                setRecapText(detail.recapText);
                setLeexiCallId(detail.id);
            } else {
                showError("Erreur", json.error || "Impossible de charger l'appel");
            }
        } catch {
            showError("Erreur", "Erreur de connexion à Leexi");
        } finally {
            setIsFetchingCall(false);
        }
    };

    // Load recent calls when entering Leexi mode
    useEffect(() => {
        if (creationMode === "leexi" && leexiCalls.length === 0) {
            searchLeexiCalls();
        }
    }, [creationMode, searchLeexiCalls, leexiCalls.length]);

    // ============================================
    // PLAYBOOK GENERATION
    // ============================================

    const generatePlaybook = async () => {
        if (!recapText.trim() || recapText.trim().length < 20) {
            showError("Erreur", "Le récapitulatif doit contenir au moins 20 caractères");
            return;
        }

        setIsGeneratingPlaybook(true);
        try {
            const res = await fetch("/api/generate-playbook", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recapText }),
            });

            const data = await res.json();

            if (!data.success) {
                showError("Erreur", data.error || "Impossible de générer le playbook");
                return;
            }

            const playbook = data.data as Playbook;
            setGeneratedPlaybook(playbook);
            applyPlaybookToForm(playbook);
            success("Playbook généré", "Les données ont été extraites avec succès");

            // Auto-advance to review step
            const reviewIdx = steps.findIndex(s => s.id === "review");
            if (reviewIdx >= 0) setCurrentStep(reviewIdx);
        } catch (err) {
            console.error("Playbook generation failed:", err);
            showError("Erreur", "Une erreur est survenue lors de la génération");
        } finally {
            setIsGeneratingPlaybook(false);
        }
    };

    const applyPlaybookToForm = (playbook: Playbook) => {
        setFormData(prev => ({
            ...prev,
            name: playbook.company_name || prev.name,
            website: playbook.website || prev.website,
            industry: playbook.sector || prev.industry,
            icp: playbook.value_proposition || prev.icp,
            targetJobTitles: playbook.target_roles.length > 0 ? playbook.target_roles : prev.targetJobTitles,
            targetIndustries: playbook.target_sectors.length > 0 ? playbook.target_sectors : prev.targetIndustries,
            targetGeographies: playbook.geography.length > 0 ? playbook.geography : prev.targetGeographies,
            targetCompanySize: playbook.company_size_min && playbook.company_size_max
                ? `${playbook.company_size_min}-${playbook.company_size_max} employés`
                : prev.targetCompanySize,
            introScript: playbook.phone_script || prev.introScript,
            objectionScript: playbook.objections.length > 0
                ? playbook.objections.join("\n\n")
                : prev.objectionScript,
            notes: [
                prev.notes,
                playbook.differentiators.length > 0 ? `Différenciateurs:\n${playbook.differentiators.join("\n")}` : "",
                playbook.competitors.length > 0 ? `Concurrents:\n${playbook.competitors.join(", ")}` : "",
                playbook.persona_pains.length > 0 ? `Pains persona:\n${playbook.persona_pains.join("\n")}` : "",
            ].filter(Boolean).join("\n\n"),
            createMission: true,
            missionName: `Mission ${playbook.company_name || prev.name}`,
            missionChannel: playbook.mission_params?.channel && playbook.mission_params.channel !== ''
                ? playbook.mission_params.channel as "CALL" | "EMAIL" | "LINKEDIN"
                : prev.missionChannel,
            missionDurationMonths: playbook.mission_params?.duration_months || prev.missionDurationMonths,
            missionWorkingDays: playbook.mission_params?.working_days_per_month || prev.missionWorkingDays,
            missionRdvTarget: playbook.mission_params?.rdv_target_per_month || prev.missionRdvTarget,
        }));
    };

    // ============================================
    // NAVIGATION
    // ============================================

    const canProceed = () => {
        const stepId = steps[currentStep]?.id;
        switch (stepId) {
            case "source":
                if (creationMode === "leexi") return !!selectedCall;
                if (creationMode === "paste") return recapText.trim().length >= 20;
                return false;
            case "review":
                return !!generatedPlaybook;
            case "client":
                return formData.name.trim().length > 0;
            default:
                return true;
        }
    };

    const handleNext = () => {
        if (canProceed() && currentStep < steps.length - 1) {
            setCurrentStep(prev => prev + 1);
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
        }
    };

    const handleClose = () => {
        setCreationMode(null);
        setCurrentStep(0);
        setFormData(INITIAL_FORM_DATA);
        setRecapText("");
        setGeneratedPlaybook(null);
        setLeexiSearchQuery("");
        setLeexiCalls([]);
        setSelectedCall(null);
        setLeexiCallId(null);
        onClose();
    };

    const handleModeSelect = (mode: CreationMode) => {
        setCreationMode(mode);
        if (mode === "manual") {
            setCurrentStep(0);
        } else {
            setCurrentStep(0);
        }
    };

    const handleBackToModeSelect = () => {
        setCreationMode(null);
        setCurrentStep(0);
        setRecapText("");
        setSelectedCall(null);
        setLeexiCallId(null);
        setGeneratedPlaybook(null);
    };

    // ============================================
    // SUBMIT
    // ============================================

    const handleSubmit = async () => {
        if (!formData.name.trim()) {
            showError("Erreur", "Le nom du client est requis");
            return;
        }

        setIsSubmitting(true);
        try {
            const onboardingData = {
                icp: formData.icp,
                targetIndustries: formData.targetIndustries,
                targetCompanySize: formData.targetCompanySize,
                targetJobTitles: formData.targetJobTitles,
                targetGeographies: formData.targetGeographies,
                listingSources: formData.listingSources,
                listingCriteria: formData.listingCriteria,
                estimatedContacts: formData.estimatedContacts,
            };

            const scripts = {
                intro: formData.introScript,
                discovery: formData.discoveryScript,
                objection: formData.objectionScript,
                closing: formData.closingScript,
            };

            const payload: Record<string, unknown> = {
                name: formData.name,
                email: formData.email || null,
                phone: formData.phone || null,
                industry: formData.industry || null,
                onboardingData,
                targetLaunchDate: formData.targetLaunchDate || null,
                scripts,
                notes: formData.notes || null,
                createMission: formData.createMission,
                missionName: formData.missionName || null,
                missionObjective: formData.missionObjective || null,
                missionChannel: formData.missionChannel,
                missionDurationMonths: formData.missionDurationMonths,
                missionWorkingDays: formData.missionWorkingDays,
                missionRdvTarget: formData.missionRdvTarget,
                salesPlaybook: generatedPlaybook || undefined,
            };

            if (generatedPlaybook?.email_sequence?.length) {
                payload.emailTemplates = generatedPlaybook.email_sequence.filter(e => e.subject || e.body);
            }

            if (recapText && creationMode) {
                payload.leexiImport = {
                    leexiCallId: leexiCallId || undefined,
                    source: creationMode === "leexi" ? "api" : "paste",
                    rawRecap: recapText,
                    callTitle: selectedCall?.title,
                    callDate: selectedCall?.date,
                    callDuration: selectedCall?.duration,
                };
            }

            const clientRes = await fetch("/api/clients", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const clientJson = await clientRes.json();

            if (!clientJson.success) {
                showError("Erreur", clientJson.error || "Impossible de créer le client");
                setIsSubmitting(false);
                return;
            }

            const createdItems: string[] = ["Client"];
            if (formData.createMission) createdItems.push("Mission");
            if (generatedPlaybook?.email_sequence?.length) createdItems.push(`${generatedPlaybook.email_sequence.length} templates email`);
            success("Créé avec succès", `${createdItems.join(" + ")} — ${formData.name}`);
            handleClose();
            onSuccess(clientJson.data.id);
        } catch (err) {
            console.error("Failed to create client:", err);
            showError("Erreur", "Une erreur est survenue");
        } finally {
            setIsSubmitting(false);
        }
    };

    // ============================================
    // RENDER: SOURCE SELECTOR (no mode chosen yet)
    // ============================================

    const renderModeSelector = () => (
        <div className="flex flex-col items-center py-6">
            <div className="w-16 h-16 rounded-2xl bg-primary-600 flex items-center justify-center mb-5">
                <Building2 className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Comment créer ce client ?</h2>
            <p className="text-sm text-slate-500 mb-8 text-center max-w-md">
                Choisissez la source pour pré-remplir automatiquement le playbook et la fiche client.
            </p>
            <div className="grid grid-cols-3 gap-4 w-full max-w-xl">
                {/* Mode A: Import from Leexi */}
                <button
                    onClick={() => handleModeSelect("leexi")}
                    className="group p-5 rounded-2xl border-2 border-slate-200 hover:border-accent-400 hover:bg-accent-50/50 transition-all text-left"
                >
                    <div className="w-11 h-11 rounded-xl bg-accent-100 flex items-center justify-center mb-3 group-hover:bg-accent-200 transition-colors">
                        <Link2 className="w-5 h-5 text-accent-600" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 mb-1">Importer depuis Leexi</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                        Recherchez un appel Leexi et importez le récap automatiquement
                    </p>
                </button>

                {/* Mode B: Paste recap */}
                <button
                    onClick={() => handleModeSelect("paste")}
                    className="group p-5 rounded-2xl border-2 border-slate-200 hover:border-primary-400 hover:bg-primary-50/50 transition-all text-left"
                >
                    <div className="w-11 h-11 rounded-xl bg-primary-100 flex items-center justify-center mb-3 group-hover:bg-primary-200 transition-colors">
                        <ClipboardPaste className="w-5 h-5 text-primary-600" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 mb-1">Coller un récapitulatif</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                        Collez un récap Leexi, des notes d'appel ou un thread email
                    </p>
                </button>

                {/* Mode C: Manual */}
                <button
                    onClick={() => handleModeSelect("manual")}
                    className="group p-5 rounded-2xl border-2 border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition-all text-left"
                >
                    <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center mb-3 group-hover:bg-slate-200 transition-colors">
                        <PenLine className="w-5 h-5 text-slate-600" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 mb-1">Créer manuellement</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                        Remplissez le formulaire directement
                    </p>
                </button>
            </div>
        </div>
    );

    // ============================================
    // RENDER: SOURCE STEP (Leexi search or Paste)
    // ============================================

    const renderSourceStep = () => {
        if (creationMode === "leexi") {
            return (
                <div className="space-y-4">
                    {/* Search bar */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            value={leexiSearchQuery}
                            onChange={(e) => setLeexiSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && searchLeexiCalls(leexiSearchQuery)}
                            placeholder="Rechercher par nom d'entreprise, contact, date..."
                            className="w-full h-10 pl-10 pr-4 border border-slate-200 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-500 text-sm"
                        />
                        <button
                            onClick={() => searchLeexiCalls(leexiSearchQuery)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-xs font-medium text-accent-600 hover:bg-accent-50 rounded"
                        >
                            Rechercher
                        </button>
                    </div>

                    {/* Results */}
                    {isSearchingCalls ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-5 h-5 text-accent-500 animate-spin" />
                            <span className="ml-2 text-sm text-slate-500">Recherche en cours...</span>
                        </div>
                    ) : leexiCalls.length === 0 ? (
                        <div className="text-center py-8 text-sm text-slate-400">
                            Aucun appel trouvé. Vérifiez que Leexi est configuré.
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                            <p className="text-xs font-medium text-slate-500 mb-2">
                                {leexiCalls.length} appel{leexiCalls.length > 1 ? "s" : ""} trouvé{leexiCalls.length > 1 ? "s" : ""}
                            </p>
                            {leexiCalls.map((call) => (
                                <button
                                    key={call.id}
                                    onClick={() => fetchCallDetail(call.id)}
                                    disabled={isFetchingCall}
                                    className={cn(
                                        "w-full p-3 rounded-xl border text-left transition-all",
                                        selectedCall?.id === call.id
                                            ? "border-accent-400 bg-accent-50 ring-1 ring-accent-200"
                                            : "border-slate-200 hover:border-accent-300 hover:bg-accent-50/30"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-lg bg-accent-100 flex items-center justify-center flex-shrink-0">
                                            <Mic className="w-4 h-4 text-accent-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-slate-900 truncate">{call.title}</span>
                                                {!call.hasRecap && (
                                                    <Badge variant="outline" className="text-[9px] text-amber-600 border-amber-200 bg-amber-50">
                                                        Sans récap
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                                                {call.companyName && <span className="font-medium text-slate-700">{call.companyName}</span>}
                                                {call.participantNames.length > 0 && (
                                                    <span>{call.participantNames.slice(0, 2).join(", ")}</span>
                                                )}
                                                {call.date && (
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {new Date(call.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                                                    </span>
                                                )}
                                                {call.duration > 0 && (
                                                    <span>{Math.round(call.duration / 60)}min</span>
                                                )}
                                            </div>
                                        </div>
                                        {selectedCall?.id === call.id && (
                                            <Check className="w-5 h-5 text-accent-600 flex-shrink-0" />
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {isFetchingCall && (
                        <div className="flex items-center gap-2 p-3 bg-accent-50 border border-accent-200 rounded-lg">
                            <Loader2 className="w-4 h-4 text-accent-600 animate-spin" />
                            <span className="text-sm text-accent-700">Chargement du récapitulatif...</span>
                        </div>
                    )}

                    {selectedCall && !isFetchingCall && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                            <div className="flex items-center gap-2 mb-1">
                                <Check className="w-4 h-4 text-emerald-600" />
                                <span className="text-sm font-medium text-emerald-800">Appel sélectionné : {selectedCall.title}</span>
                            </div>
                            <p className="text-xs text-emerald-700">
                                {recapText.length} caractères de récapitulatif chargés. Cliquez sur "Suivant" pour lancer l'extraction IA.
                            </p>
                        </div>
                    )}
                </div>
            );
        }

        // Mode B: Paste
        return (
            <div className="space-y-4">
                <div className="p-4 bg-primary-50 border border-primary-200 rounded-xl">
                    <div className="flex items-center gap-2 mb-3">
                        <ClipboardPaste className="w-4 h-4 text-primary-600" />
                        <h4 className="text-sm font-semibold text-primary-900">Coller le récapitulatif</h4>
                    </div>
                    <p className="text-xs text-primary-700 mb-3">
                        Collez un récap Leexi, des notes d'appel, un thread email ou même une transcription vocale.
                        L'IA en extrait la fiche client et le playbook.
                    </p>
                    <textarea
                        value={recapText}
                        onChange={(e) => setRecapText(e.target.value)}
                        placeholder="Collez ici le récapitulatif de meeting..."
                        rows={10}
                        className="w-full px-3 py-2 border border-primary-200 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm resize-none"
                        autoFocus
                    />
                    <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px] text-slate-400">
                            {recapText.length} caractères {recapText.length < 20 && recapText.length > 0 ? "(minimum 20)" : ""}
                        </span>
                    </div>
                </div>
            </div>
        );
    };

    // ============================================
    // RENDER: REVIEW PANEL (Side-by-side)
    // ============================================

    const renderReviewStep = () => {
        if (!generatedPlaybook) {
            return (
                <div className="flex flex-col items-center justify-center py-12">
                    <div className="w-16 h-16 bg-accent-100 rounded-2xl flex items-center justify-center mb-4">
                        <Brain className="w-8 h-8 text-accent-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">Extraction en cours...</h3>
                    <p className="text-sm text-slate-500 text-center max-w-md">
                        L'IA analyse le récapitulatif pour extraire les données commerciales.
                    </p>
                    <Loader2 className="w-6 h-6 text-accent-600 animate-spin mt-6" />
                </div>
            );
        }

        const pb = generatedPlaybook;

        return (
            <div className="space-y-4">
                <p className="text-sm text-slate-600">
                    Vérifiez les données extraites. Chaque champ est modifiable. Cliquez sur un champ pour le corriger.
                </p>

                <div className="grid grid-cols-2 gap-4 h-[420px]">
                    {/* LEFT: Source recap */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden flex flex-col">
                        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-slate-500" />
                            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Récap source</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4">
                            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                                {recapText.slice(0, 3000)}
                                {recapText.length > 3000 && (
                                    <span className="text-slate-400">... ({recapText.length - 3000} caractères restants)</span>
                                )}
                            </p>
                        </div>
                    </div>

                    {/* RIGHT: Extracted data */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden flex flex-col">
                        <div className="px-4 py-2.5 bg-primary-50 border-b border-primary-200 flex items-center gap-2">
                            <AiMark className="w-4 h-4 text-primary-600" />
                            <span className="text-xs font-semibold text-primary-700 uppercase tracking-wide">Données extraites</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {/* Company info */}
                            <ReviewField label="Entreprise" value={formData.name} onChange={(v) => updateField("name", v)} />
                            <ReviewField label="Secteur" value={formData.industry} onChange={(v) => updateField("industry", v)} />
                            <ReviewField label="Site web" value={formData.website} onChange={(v) => updateField("website", v)} />

                            {/* ICP */}
                            <ReviewTagField label="Rôles cibles" tags={formData.targetJobTitles} onRemove={(t) => removeTag("targetJobTitles", t)} onAdd={(t) => addTag("targetJobTitles", t)} />
                            <ReviewTagField label="Secteurs cibles" tags={formData.targetIndustries} onRemove={(t) => removeTag("targetIndustries", t)} onAdd={(t) => addTag("targetIndustries", t)} />
                            <ReviewField label="Taille" value={formData.targetCompanySize} onChange={(v) => updateField("targetCompanySize", v)} />
                            <ReviewTagField label="Géographie" tags={formData.targetGeographies} onRemove={(t) => removeTag("targetGeographies", t)} onAdd={(t) => addTag("targetGeographies", t)} />

                            {/* Mission params */}
                            {pb.mission_params && (pb.mission_params.rdv_target_per_month > 0 || pb.mission_params.duration_months > 0) && (
                                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg space-y-2">
                                    <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Mission</span>
                                    <div className="grid grid-cols-2 gap-2">
                                        <ReviewNumberField label="RDV/mois" value={formData.missionRdvTarget} onChange={(v) => updateField("missionRdvTarget", v)} />
                                        <ReviewNumberField label="Durée (mois)" value={formData.missionDurationMonths} onChange={(v) => updateField("missionDurationMonths", v)} />
                                        <ReviewNumberField label="Jours/mois" value={formData.missionWorkingDays} onChange={(v) => updateField("missionWorkingDays", v)} />
                                    </div>
                                </div>
                            )}

                            {/* Signals */}
                            {pb.signals_from_call?.length > 0 && (
                                <div className="space-y-1.5">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Signaux détectés</span>
                                    {pb.signals_from_call.map((sig, i) => (
                                        <SignalBadge key={i} signal={sig} />
                                    ))}
                                </div>
                            )}

                            {/* Key contacts */}
                            {pb.key_contacts?.filter(c => c.name).length > 0 && (
                                <div className="space-y-1.5">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Contacts identifiés</span>
                                    {pb.key_contacts.filter(c => c.name).map((contact, i) => (
                                        <div key={i} className="flex items-center gap-2 text-xs text-slate-700 p-1.5 bg-slate-50 rounded">
                                            <Users className="w-3 h-3 text-slate-400" />
                                            <span className="font-medium">{contact.name}</span>
                                            {contact.role && <span className="text-slate-400">— {contact.role}</span>}
                                            {contact.email && <span className="text-primary-500">{contact.email}</span>}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Competitors */}
                            {pb.competitors?.length > 0 && (
                                <div className="space-y-1">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Concurrents</span>
                                    <div className="flex flex-wrap gap-1">
                                        {pb.competitors.map((c, i) => (
                                            <span key={i} className="text-[10px] px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded">{c}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Objection handling */}
                            {pb.objection_handling?.filter(o => o.objection).length > 0 && (
                                <div className="space-y-1.5">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Objections & Réponses</span>
                                    {pb.objection_handling.filter(o => o.objection).map((oh, i) => (
                                        <div key={i} className="text-xs p-2 bg-amber-50 border border-amber-200 rounded">
                                            <p className="font-medium text-amber-800">&ldquo;{oh.objection}&rdquo;</p>
                                            {oh.response && <p className="text-amber-700 mt-0.5">{oh.response}</p>}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Email sequence preview */}
                            {pb.email_sequence?.length > 0 && (
                                <div className="space-y-1.5">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                        Séquence email ({pb.email_sequence.length})
                                    </span>
                                    {pb.email_sequence.map((email, i) => (
                                        <div key={i} className="text-xs p-2 bg-blue-50 border border-blue-200 rounded">
                                            <div className="flex items-center gap-1">
                                                <Mail className="w-3 h-3 text-blue-500" />
                                                <span className="font-medium text-blue-800">Email {i + 1}: {email.subject || "(sans objet)"}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // ============================================
    // RENDER STEP CONTENT
    // ============================================

    const renderStepContent = () => {
        const stepId = steps[currentStep]?.id;

        switch (stepId) {
            case "source":
                return renderSourceStep();

            case "review":
                return renderReviewStep();

            case "client":
                return (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                    Nom de l&apos;entreprise *
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => updateField("name", e.target.value)}
                                    placeholder="Ex: Acme Corp"
                                    className="w-full h-10 px-3 border border-slate-200 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Secteur d&apos;activité</label>
                                <select
                                    value={formData.industry}
                                    onChange={(e) => updateField("industry", e.target.value)}
                                    className="w-full h-10 px-3 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                                >
                                    <option value="">Sélectionner...</option>
                                    {INDUSTRY_OPTIONS.map(opt => (
                                        <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Site web</label>
                                <input
                                    type="text"
                                    value={formData.website}
                                    onChange={(e) => updateField("website", e.target.value)}
                                    placeholder="www.acme.com"
                                    className="w-full h-10 px-3 border border-slate-200 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email de contact</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => updateField("email", e.target.value)}
                                    placeholder="contact@acme.com"
                                    className="w-full h-10 px-3 border border-slate-200 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Téléphone</label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => updateField("phone", e.target.value)}
                                    placeholder="+33 1 23 45 67 89"
                                    className="w-full h-10 px-3 border border-slate-200 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                                />
                            </div>
                        </div>

                        {generatedPlaybook && (
                            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
                                <Check className="w-4 h-4 text-emerald-600" />
                                <span className="text-sm text-emerald-700">Pré-rempli depuis le playbook</span>
                            </div>
                        )}

                        {/* Cibles & ICP */}
                        <div className="border border-slate-200 rounded-xl p-4 space-y-4">
                            <h5 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                                <Target className="w-4 h-4 text-primary-600" />
                                Cibles & ICP
                            </h5>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Profil Client Idéal</label>
                                <textarea
                                    value={formData.icp}
                                    onChange={(e) => updateField("icp", e.target.value)}
                                    placeholder="Entreprises SaaS B2B, 50-200 employés..."
                                    rows={2}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm resize-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Secteurs cibles</label>
                                <TagInput
                                    tags={formData.targetIndustries}
                                    options={INDUSTRY_OPTIONS}
                                    onAdd={(v) => addTag("targetIndustries", v)}
                                    onRemove={(v) => removeTag("targetIndustries", v)}
                                    placeholder="+ Secteur"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Rôles cibles</label>
                                <TagInput
                                    tags={formData.targetJobTitles}
                                    options={TARGET_JOB_OPTIONS}
                                    onAdd={(v) => addTag("targetJobTitles", v)}
                                    onRemove={(v) => removeTag("targetJobTitles", v)}
                                    placeholder="+ Rôle"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Géographie</label>
                                <TagInput
                                    tags={formData.targetGeographies}
                                    options={TARGET_GEO_OPTIONS}
                                    onAdd={(v) => addTag("targetGeographies", v)}
                                    onRemove={(v) => removeTag("targetGeographies", v)}
                                    placeholder="+ Zone"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Taille cible</label>
                                <select
                                    value={formData.targetCompanySize}
                                    onChange={(e) => updateField("targetCompanySize", e.target.value)}
                                    className="w-full h-9 px-3 border border-slate-200 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                >
                                    <option value="">Sélectionner...</option>
                                    {COMPANY_SIZE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Base de données */}
                        <div className="border border-slate-200 rounded-xl p-4 space-y-4">
                            <h5 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                                <Users className="w-4 h-4 text-primary-600" />
                                Base de données
                            </h5>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Sources</label>
                                <TagInput
                                    tags={formData.listingSources}
                                    options={LISTING_SOURCE_OPTIONS}
                                    onAdd={(v) => addTag("listingSources", v)}
                                    onRemove={(v) => removeTag("listingSources", v)}
                                    placeholder="+ Ajouter"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Volume estimé</label>
                                <input
                                    type="text"
                                    value={formData.estimatedContacts}
                                    onChange={(e) => updateField("estimatedContacts", e.target.value)}
                                    placeholder="800-1200 contacts"
                                    className="w-full h-9 px-3 border border-slate-200 rounded-lg bg-white text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                />
                            </div>
                        </div>

                        {/* Scripts */}
                        <div className="border border-slate-200 rounded-xl p-4 space-y-4">
                            <h5 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-primary-600" />
                                Scripts
                            </h5>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Script d&apos;introduction</label>
                                <textarea
                                    value={formData.introScript}
                                    onChange={(e) => updateField("introScript", e.target.value)}
                                    placeholder="Bonjour, je suis [Prénom] de [Entreprise]..."
                                    rows={2}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm resize-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Gestion des objections</label>
                                <textarea
                                    value={formData.objectionScript}
                                    onChange={(e) => updateField("objectionScript", e.target.value)}
                                    placeholder="Objections courantes et réponses..."
                                    rows={2}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm resize-none"
                                />
                            </div>
                        </div>
                    </div>
                );

            case "planning":
                return (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Date de lancement souhaitée</label>
                            <input
                                type="date"
                                value={formData.targetLaunchDate}
                                onChange={(e) => updateField("targetLaunchDate", e.target.value)}
                                className="w-full h-10 px-3 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes additionnelles</label>
                            <textarea
                                value={formData.notes}
                                onChange={(e) => updateField("notes", e.target.value)}
                                placeholder="Informations complémentaires..."
                                rows={3}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none text-sm"
                            />
                        </div>

                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                            <div className="flex items-center gap-3 mb-3">
                                <input
                                    type="checkbox"
                                    id="createMission"
                                    checked={formData.createMission}
                                    onChange={(e) => updateField("createMission", e.target.checked)}
                                    className="w-4 h-4 text-primary-600 border-slate-300 rounded focus:ring-primary-500"
                                />
                                <label htmlFor="createMission" className="text-sm font-medium text-slate-700">
                                    Créer une mission initiale
                                </label>
                            </div>

                            {formData.createMission && (
                                <div className="space-y-3 pt-3 border-t border-slate-200">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Nom de la mission</label>
                                        <input
                                            type="text"
                                            value={formData.missionName}
                                            onChange={(e) => updateField("missionName", e.target.value)}
                                            placeholder={`Mission ${formData.name || "Client"}`}
                                            className="w-full h-10 px-3 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                                        />
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Canal</label>
                                            <select
                                                value={formData.missionChannel}
                                                onChange={(e) => updateField("missionChannel", e.target.value as "CALL" | "EMAIL" | "LINKEDIN")}
                                                className="w-full h-10 px-3 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                                            >
                                                <option value="CALL">Appel</option>
                                                <option value="EMAIL">Email</option>
                                                <option value="LINKEDIN">LinkedIn</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Durée (mois)</label>
                                            <input
                                                type="number"
                                                min={1}
                                                max={24}
                                                value={formData.missionDurationMonths}
                                                onChange={(e) => updateField("missionDurationMonths", parseInt(e.target.value) || 3)}
                                                className="w-full h-10 px-3 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Objectif RDV/mois</label>
                                            <input
                                                type="number"
                                                min={0}
                                                value={formData.missionRdvTarget}
                                                onChange={(e) => updateField("missionRdvTarget", parseInt(e.target.value) || 0)}
                                                className="w-full h-10 px-3 border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Objectif</label>
                                        <input
                                            type="text"
                                            value={formData.missionObjective}
                                            onChange={(e) => updateField("missionObjective", e.target.value)}
                                            placeholder="Ex: Générer des RDV qualifiés"
                                            className="w-full h-10 px-3 border border-slate-200 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Summary of what will be created */}
                        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                            <h4 className="text-sm font-semibold text-emerald-900 mb-2 flex items-center gap-2">
                                <Shield className="w-4 h-4" />
                                Récapitulatif de la création
                            </h4>
                            <ul className="space-y-1.5 text-sm text-emerald-800">
                                <li className="flex items-center gap-2">
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    Client : <strong>{formData.name || "—"}</strong>
                                </li>
                                {formData.createMission && (
                                    <li className="flex items-center gap-2">
                                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                                        Mission : {formData.missionName || `Mission ${formData.name}`} ({formData.missionDurationMonths} mois)
                                    </li>
                                )}
                                {generatedPlaybook && (
                                    <li className="flex items-center gap-2">
                                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                                        Sales Playbook attaché
                                    </li>
                                )}
                                {generatedPlaybook?.email_sequence?.filter(e => e.subject || e.body).length ? (
                                    <li className="flex items-center gap-2">
                                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                                        {generatedPlaybook.email_sequence.filter(e => e.subject || e.body).length} templates email créés
                                    </li>
                                ) : null}
                                {recapText && (
                                    <li className="flex items-center gap-2">
                                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                                        Import Leexi archivé (traçabilité)
                                    </li>
                                )}
                            </ul>
                        </div>
                    </div>
                );

            default:
                return null;
        }
    };

    // ============================================
    // HANDLE "NEXT" on source step: auto-generate
    // ============================================

    const handleSourceNext = async () => {
        if (creationMode === "leexi" || creationMode === "paste") {
            if (!generatedPlaybook) {
                await generatePlaybook();
            } else {
                handleNext();
            }
        } else {
            handleNext();
        }
    };

    // ============================================
    // RENDER
    // ============================================

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title=""
            className="!max-w-4xl"
        >
            <div className="flex flex-col h-full max-h-[85vh]">
                {/* Mode selector or wizard */}
                {!creationMode ? (
                    renderModeSelector()
                ) : (
                    <>
                        {/* Header */}
                        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-200">
                            <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center">
                                <Building2 className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-lg font-semibold text-slate-900">Onboarding Client</h2>
                                <p className="text-sm text-slate-500">
                                    {creationMode === "leexi" && "Import depuis Leexi"}
                                    {creationMode === "paste" && "Depuis un récapitulatif"}
                                    {creationMode === "manual" && "Création manuelle avec IA"}
                                </p>
                            </div>
                            <button
                                onClick={handleBackToModeSelect}
                                className="text-xs text-slate-400 hover:text-primary-600 transition-colors"
                            >
                                Changer de mode
                            </button>
                        </div>

                        {/* Progress Steps */}
                        <div className="flex items-center justify-between mb-6 px-2 overflow-x-auto">
                            {steps.map((step, index) => (
                                <div key={step.id} className={cn("flex items-center", index < steps.length - 1 && "flex-1")}>
                                    <button
                                        onClick={() => {
                                            if (index <= currentStep) setCurrentStep(index);
                                        }}
                                        className={cn(
                                            "flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors",
                                            index === currentStep && "bg-primary-50",
                                            index < currentStep && "text-primary-600",
                                            index > currentStep && "opacity-50 cursor-not-allowed"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold",
                                            index === currentStep && "bg-primary-500 text-white",
                                            index < currentStep && "bg-primary-500 text-white",
                                            index > currentStep && "bg-slate-200 text-slate-500"
                                        )}>
                                            {index < currentStep ? <Check className="w-3 h-3" /> : index + 1}
                                        </div>
                                        <span className={cn(
                                            "text-[11px] font-medium hidden lg:block",
                                            index === currentStep ? "text-primary-600" : "text-slate-500"
                                        )}>
                                            {step.label}
                                        </span>
                                    </button>
                                    {index < steps.length - 1 && (
                                        <div className={cn(
                                            "flex-1 h-0.5 mx-1",
                                            index < currentStep ? "bg-primary-500" : "bg-slate-200"
                                        )} />
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Step Content */}
                        <div className="flex-1 overflow-y-auto pr-2">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
                                    {(() => {
                                        const StepIcon = steps[currentStep].icon;
                                        return <StepIcon className="w-4 h-4 text-primary-600" />;
                                    })()}
                                </div>
                                <div>
                                    <h3 className="text-base font-semibold text-slate-900">{steps[currentStep].label}</h3>
                                    <p className="text-xs text-slate-500">{steps[currentStep].description}</p>
                                </div>
                            </div>
                            {renderStepContent()}
                        </div>

                        {/* Navigation */}
                        <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-200">
                            <Button
                                variant="secondary"
                                onClick={handleBack}
                                disabled={currentStep === 0}
                                className="gap-2"
                            >
                                <ChevronLeft className="w-4 h-4" />
                                Retour
                            </Button>

                            {currentStep === steps.length - 1 ? (
                                <Button
                                    variant="primary"
                                    onClick={handleSubmit}
                                    disabled={isSubmitting || !canProceed()}
                                    isLoading={isSubmitting}
                                    className="gap-2"
                                >
                                    Créer le client
                                    <Check className="w-4 h-4" />
                                </Button>
                            ) : steps[currentStep]?.id === "source" ? (
                                <Button
                                    variant="primary"
                                    onClick={handleSourceNext}
                                    disabled={!canProceed() || isGeneratingPlaybook}
                                    isLoading={isGeneratingPlaybook}
                                    className="gap-2"
                                >
                                    {isGeneratingPlaybook ? "Extraction IA..." : "Analyser et extraire"}
                                    <AiMark className="w-4 h-4" />
                                </Button>
                            ) : (
                                <Button
                                    variant="primary"
                                    onClick={handleNext}
                                    disabled={!canProceed()}
                                    className="gap-2"
                                >
                                    Suivant
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}

// ============================================
// SUB-COMPONENTS
// ============================================

function ReviewField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    const [editing, setEditing] = useState(false);
    return (
        <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</span>
            {editing ? (
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onBlur={() => setEditing(false)}
                    onKeyDown={(e) => e.key === "Enter" && setEditing(false)}
                    autoFocus
                    className="w-full h-7 px-2 border border-primary-300 rounded bg-white text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-primary-400"
                />
            ) : (
                <div
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-1 cursor-pointer group"
                >
                    <span className={cn("text-sm", value ? "text-slate-800" : "text-slate-400 italic")}>
                        {value || "Non détecté"}
                    </span>
                    <Edit3 className="w-3 h-3 text-slate-300 group-hover:text-primary-500 transition-colors" />
                </div>
            )}
        </div>
    );
}

function ReviewNumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
    const [editing, setEditing] = useState(false);
    return (
        <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</span>
            {editing ? (
                <input
                    type="number"
                    value={value}
                    onChange={(e) => onChange(parseInt(e.target.value) || 0)}
                    onBlur={() => setEditing(false)}
                    autoFocus
                    className="w-full h-7 px-2 border border-primary-300 rounded bg-white text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-primary-400"
                />
            ) : (
                <div onClick={() => setEditing(true)} className="flex items-center gap-1 cursor-pointer group">
                    <span className="text-sm font-medium text-slate-800">{value || "—"}</span>
                    <Edit3 className="w-3 h-3 text-slate-300 group-hover:text-primary-500 transition-colors" />
                </div>
            )}
        </div>
    );
}

function ReviewTagField({
    label, tags, onRemove, onAdd
}: {
    label: string;
    tags: string[];
    onRemove: (tag: string) => void;
    onAdd: (tag: string) => void;
}) {
    const [adding, setAdding] = useState(false);
    const [inputVal, setInputVal] = useState("");

    return (
        <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</span>
            <div className="flex flex-wrap gap-1 mt-0.5">
                {tags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 text-[11px]">
                        {tag}
                        <button onClick={() => onRemove(tag)} className="hover:text-red-600"><X className="w-2.5 h-2.5" /></button>
                    </span>
                ))}
                {adding ? (
                    <input
                        type="text"
                        value={inputVal}
                        onChange={(e) => setInputVal(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && inputVal.trim()) { onAdd(inputVal.trim()); setInputVal(""); setAdding(false); }
                            if (e.key === "Escape") setAdding(false);
                        }}
                        onBlur={() => setAdding(false)}
                        autoFocus
                        placeholder="Ajouter..."
                        className="h-6 w-20 px-1.5 border border-primary-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-primary-400"
                    />
                ) : (
                    <button
                        onClick={() => setAdding(true)}
                        className="text-[10px] px-1.5 py-0.5 border border-dashed border-slate-300 rounded text-slate-400 hover:border-primary-400 hover:text-primary-600"
                    >
                        +
                    </button>
                )}
                {tags.length === 0 && !adding && (
                    <span className="text-[11px] text-slate-400 italic">Non détecté</span>
                )}
            </div>
        </div>
    );
}

function SignalBadge({ signal }: { signal: PlaybookSignal }) {
    const styles = {
        positive: "bg-emerald-50 border-emerald-200 text-emerald-700",
        warning: "bg-amber-50 border-amber-200 text-amber-700",
        neutral: "bg-slate-50 border-slate-200 text-slate-600",
    };
    const icons = {
        positive: <Check className="w-3 h-3" />,
        warning: <AlertTriangle className="w-3 h-3" />,
        neutral: <ArrowRight className="w-3 h-3" />,
    };

    return (
        <div className={cn("flex items-center gap-1.5 text-xs p-1.5 border rounded", styles[signal.type])}>
            {icons[signal.type]}
            {signal.text}
        </div>
    );
}

function TagInput({
    tags, options, onAdd, onRemove, placeholder
}: {
    tags: string[];
    options: string[];
    onAdd: (v: string) => void;
    onRemove: (v: string) => void;
    placeholder: string;
}) {
    return (
        <div className="flex flex-wrap gap-1.5 items-center">
            {tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs">
                    {tag}
                    <button type="button" onClick={() => onRemove(tag)} className="hover:text-red-600"><X className="w-3 h-3" /></button>
                </span>
            ))}
            <select
                onChange={(e) => { if (e.target.value) { onAdd(e.target.value); e.target.value = ""; } }}
                className="text-xs border-0 bg-transparent text-slate-500 cursor-pointer focus:ring-0"
            >
                <option value="">{placeholder}</option>
                {options.filter(i => !tags.includes(i)).map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
        </div>
    );
}
