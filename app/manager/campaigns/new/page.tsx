"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Modal, ModalFooter, Select, Tabs, useToast } from "@/components/ui";
import { ArrowLeft, Target, Loader2, MessageSquare, Sparkles, Plus, Wand2 } from "lucide-react";
import Link from "next/link";
import { PitchBlockEditor } from "@/components/strategy";

// ============================================
// TYPES
// ============================================

interface Mission {
    id: string;
    name: string;
    objective: string;
    channel: "CALL" | "EMAIL" | "LINKEDIN";
    isActive: boolean;
    client: {
        id: string;
        name: string;
    };
}

interface ScriptTemplate {
    id: string;
    name: string;
    content: string;
}

interface FormData {
    name: string;
    missionId: string;
    icp: string;
    pitch: string;
    scriptIntro: string;
    scriptDiscovery: string;
    scriptObjection: string;
    scriptClosing: string;
}

type ScriptSectionKey = "intro" | "discovery" | "objection" | "closing";

const SCRIPT_TABS = [
    { id: "intro", label: "Introduction" },
    { id: "discovery", label: "Découverte" },
    { id: "objection", label: "Objections" },
    { id: "closing", label: "Closing" },
];

// ============================================
// SCRIPT TEMPLATES
// ============================================

const SCRIPT_TEMPLATES: Record<string, ScriptTemplate[]> = {
    CALL: [
        {
            id: "call-saas",
            name: "SaaS B2B Standard",
            content: JSON.stringify({
                intro: "Bonjour [Prénom], je suis [Nom] de [Entreprise]. Je vous contacte car nous aidons des entreprises comme [Société] à [bénéfice principal]. Avez-vous 2 minutes ?",
                discovery: "Actuellement, comment gérez-vous [problème] ? Quels sont vos principaux défis ?",
                objection: "Je comprends votre préoccupation. Justement, c'est pour cela que [argument]. Puis-je vous montrer comment ?",
                closing: "Parfait ! Je vous propose qu'on se cale 20 minutes cette semaine pour vous montrer concrètement. Vous êtes disponible [jour] ou [jour] ?",
            }),
        },
        {
            id: "call-discovery",
            name: "Découverte Approfondie",
            content: JSON.stringify({
                intro: "Bonjour [Prénom], [Nom] à l'appareil. J'ai vu que [Société] [contexte]. Je me demandais si vous aviez déjà réfléchi à [sujet] ?",
                discovery: "Intéressant ! Et aujourd'hui, qu'est-ce qui vous empêche de [objectif] ? Quels sont les impacts sur votre activité ?",
                objection: "C'est une excellente question. En fait, nos clients avaient exactement la même avant de [résultat]. Voulez-vous que je vous explique ?",
                closing: "Super ! Je vous envoie une invitation pour [durée] cette semaine. Ça vous va ?",
            }),
        },
    ],
    EMAIL: [
        {
            id: "email-cold",
            name: "Cold Email Classique",
            content: JSON.stringify({
                intro: "Objet: [Bénéfice] pour [Société]\n\nBonjour [Prénom],\n\nJ'ai remarqué que [Société] [contexte]. Je me demandais si [question pertinente] ?",
                discovery: "Nous aidons des entreprises comme [concurrent/pair] à [résultat mesurable].",
                objection: "Si cela vous intéresse, je serais ravi de vous montrer comment en 15 minutes.",
                closing: "Êtes-vous disponible cette semaine pour un échange rapide ?\n\nCordialement,\n[Signature]",
            }),
        },
    ],
    LINKEDIN: [
        {
            id: "linkedin-connection",
            name: "Demande de Connexion",
            content: JSON.stringify({
                intro: "Bonjour [Prénom], j'ai vu votre profil et votre expérience chez [Société] m'a interpellé. J'aimerais échanger avec vous sur [sujet].",
                discovery: "",
                objection: "",
                closing: "",
            }),
        },
    ],
};

// ============================================
// NEW CAMPAIGN PAGE
// ============================================

export default function NewCampaignPage() {
    const router = useRouter();
    const { success, error: showError } = useToast();
    const [missions, setMissions] = useState<Mission[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<string>("");
    const [formData, setFormData] = useState<FormData>({
        name: "",
        missionId: "",
        icp: "",
        pitch: "",
        scriptIntro: "",
        scriptDiscovery: "",
        scriptObjection: "",
        scriptClosing: "",
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatingSection, setGeneratingSection] = useState<string | null>(null);

    // AI suggestions (user selects before applying)
    const [aiModalOpen, setAiModalOpen] = useState(false);
    const [aiRequestedSection, setAiRequestedSection] = useState<"all" | ScriptSectionKey>("all");
    const [aiActiveTab, setAiActiveTab] = useState<ScriptSectionKey>("intro");
    const [aiSuggestions, setAiSuggestions] = useState<Partial<Record<ScriptSectionKey, string[]>>>({});
    const [aiSelectedIndex, setAiSelectedIndex] = useState<Record<ScriptSectionKey, number>>({
        intro: 0,
        discovery: 0,
        objection: 0,
        closing: 0,
    });

    // ============================================
    // MISTRAL AI GENERATION
    // ============================================

    const generateWithMistral = async (section: 'all' | 'intro' | 'discovery' | 'objection' | 'closing') => {
        const mission = missions.find(m => m.id === formData.missionId);
        if (!mission) {
            showError("Erreur", "Veuillez d'abord sélectionner une mission");
            return;
        }

        if (!formData.icp.trim() || !formData.pitch.trim()) {
            showError("Erreur", "Veuillez renseigner l'ICP et le pitch avant de générer");
            return;
        }

        setIsGenerating(true);
        setGeneratingSection(section);

        try {
            const res = await fetch("/api/ai/mistral/script", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    channel: mission.channel,
                    clientName: mission.client?.name || "Client",
                    missionName: mission.name,
                    campaignName: formData.name || "Nouvelle campagne",
                    campaignDescription: mission.objective,
                    icp: formData.icp,
                    pitch: formData.pitch,
                    section,
                    suggestionsCount: 3,
                }),
            });

            const json = await res.json();

            if (json.success && (json.data?.suggestions || json.data?.script)) {
                const suggestions = json.data?.suggestions || {};
                setAiSuggestions(suggestions);
                setAiRequestedSection(section);
                setAiActiveTab(section === "all" ? "intro" : section);
                setAiSelectedIndex({
                    intro: 0,
                    discovery: 0,
                    objection: 0,
                    closing: 0,
                });
                setAiModalOpen(true);
            } else {
                showError("Erreur", json.error || "Impossible de générer le script");
            }
        } catch (err) {
            console.error("Failed to generate script:", err);
            showError("Erreur", "Erreur de connexion à Mistral AI");
        } finally {
            setIsGenerating(false);
            setGeneratingSection(null);
        }
    };

    const applySelectedSuggestions = (mode: "all" | ScriptSectionKey) => {
        const fieldMap: Record<ScriptSectionKey, keyof FormData> = {
            intro: "scriptIntro",
            discovery: "scriptDiscovery",
            objection: "scriptObjection",
            closing: "scriptClosing",
        };

        const applyOne = (key: ScriptSectionKey) => {
            const list = aiSuggestions[key] || [];
            const idx = aiSelectedIndex[key] ?? 0;
            const value = list[idx] ?? "";
            setFormData((prev) => ({ ...prev, [fieldMap[key]]: value }));
        };

        if (mode === "all") {
            (["intro", "discovery", "objection", "closing"] as ScriptSectionKey[]).forEach(applyOne);
            success("Suggestions appliquées", "Les sections sélectionnées ont été ajoutées au script");
        } else {
            applyOne(mode);
            success("Suggestion appliquée", "La suggestion sélectionnée a été ajoutée au script");
        }

        setAiModalOpen(false);
    };

    // ============================================
    // FETCH MISSIONS
    // ============================================

    useEffect(() => {
        const fetchMissions = async () => {
            setIsLoading(true);
            try {
                // Fetch all missions, including inactive ones
                const res = await fetch("/api/missions");
                const json = await res.json();
                if (json.success) {
                    setMissions(json.data);
                }
            } catch (err) {
                console.error("Failed to fetch missions:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchMissions();
    }, []);

    // ============================================
    // TEMPLATE SELECTION
    // ============================================

    const selectedMission = missions.find(m => m.id === formData.missionId);
    const availableTemplates = selectedMission
        ? SCRIPT_TEMPLATES[selectedMission.channel] || []
        : [];

    const applyTemplate = (templateId: string) => {
        const template = availableTemplates.find(t => t.id === templateId);
        if (template) {
            const content = JSON.parse(template.content);
            setFormData(prev => ({
                ...prev,
                scriptIntro: content.intro || "",
                scriptDiscovery: content.discovery || "",
                scriptObjection: content.objection || "",
                scriptClosing: content.closing || "",
            }));
            setSelectedTemplate(templateId);
        }
    };

    // ============================================
    // VALIDATION
    // ============================================

    const validate = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!formData.name.trim()) {
            newErrors.name = "Le nom est requis";
        }
        if (!formData.missionId) {
            newErrors.missionId = "La mission est requise";
        }
        if (!formData.icp.trim()) {
            newErrors.icp = "L'ICP est requis";
        }
        if (!formData.pitch.trim()) {
            newErrors.pitch = "Le pitch est requis";
        }
        if (!formData.scriptIntro.trim()) {
            newErrors.scriptIntro = "L'introduction est requise";
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // ============================================
    // SUBMIT
    // ============================================

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validate()) return;

        setIsSaving(true);
        try {
            const res = await fetch("/api/campaigns", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: formData.name,
                    missionId: formData.missionId,
                    icp: formData.icp,
                    pitch: formData.pitch,
                    script: {
                        intro: formData.scriptIntro,
                        discovery: formData.scriptDiscovery,
                        objection: formData.scriptObjection,
                        closing: formData.scriptClosing,
                    },
                }),
            });

            const json = await res.json();

            if (json.success) {
                success("Campagne créée", `${formData.name} a été créée avec succès`);
                router.push(`/manager/campaigns`);
            } else {
                showError("Erreur", json.error || "Impossible de créer la campagne");
            }
        } catch (err) {
            console.error("Failed to create campaign:", err);
            showError("Erreur", "Impossible de créer la campagne");
        } finally {
            setIsSaving(false);
        }
    };

    // ============================================
    // RENDER
    // ============================================

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/manager/campaigns">
                    <Button variant="ghost" size="sm">
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900">Nouvelle campagne</h1>
                    <p className="text-slate-500 mt-1">
                        Configurez votre stratégie de prospection et vos scripts
                    </p>
                </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-6 pb-20">
                {/* Basic Info */}
                <Card className="shadow-sm">
                    <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                        <Target className="w-5 h-5 text-indigo-500" />
                        Configuration de base
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Select
                            label="Mission *"
                            placeholder="Sélectionner une mission..."
                            options={missions.map(m => ({
                                value: m.id,
                                label: `${m.name} (${m.channel})${!m.isActive ? " [Inactif]" : ""}`
                            }))}
                            value={formData.missionId}
                            onChange={(value) => {
                                setFormData(prev => ({ ...prev, missionId: value }));
                                setSelectedTemplate("");
                            }}
                            error={errors.missionId}
                            searchable
                        />

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">
                                Nom de la campagne *
                            </label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="Ex: Prospection Q1 2026"
                                className={`w-full px-4 py-2.5 bg-white border rounded-xl text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 transition-all ${errors.name ? "border-red-500" : "border-slate-200"
                                    }`}
                            />
                            {errors.name && (
                                <p className="text-xs text-red-500 mt-1 font-medium">{errors.name}</p>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">
                                ICP (Profil Client Idéal) *
                            </label>
                            <textarea
                                value={formData.icp}
                                onChange={(e) => setFormData(prev => ({ ...prev, icp: e.target.value }))}
                                placeholder="Ex: CEOs de startups B2B SaaS entre 10 et 50 employés en France."
                                rows={3}
                                className={`w-full px-4 py-2.5 bg-white border rounded-xl text-slate-900 text-sm placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 transition-all resize-none ${errors.icp ? "border-red-500" : "border-slate-200"}`}
                            />
                            {errors.icp && (
                                <p className="text-xs text-red-500 mt-1 font-medium">{errors.icp}</p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">
                                Pitch Commercial *
                            </label>
                            <PitchBlockEditor
                                value={formData.pitch}
                                onChange={(val) => setFormData(prev => ({ ...prev, pitch: val }))}
                                icp={formData.icp}
                                channel={selectedMission?.channel}
                                clientName={selectedMission?.client?.name}
                                placeholder="Ex: Nous aidons les CEOs à automatiser leur prospection pour gagner 10h par semaine."
                                error={errors.pitch}
                            />
                        </div>
                    </div>
                </Card>

                {/* Script Builder */}
                <Card className="shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <MessageSquare className="w-5 h-5 text-indigo-500" />
                            Construction du script
                        </h2>
                        <div className="flex items-center gap-3">
                            {availableTemplates.length > 0 && (
                                <Select
                                    placeholder="Template..."
                                    options={[
                                        { value: "", label: "Script vierge" },
                                        ...availableTemplates.map(t => ({ value: t.id, label: t.name }))
                                    ]}
                                    value={selectedTemplate}
                                    onChange={applyTemplate}
                                    className="w-48"
                                />
                            )}
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => generateWithMistral('all')}
                                disabled={isGenerating || !formData.missionId || !formData.icp || !formData.pitch}
                                className="gap-2 bg-gradient-to-r from-purple-50 to-indigo-50 border-indigo-200 text-indigo-700 hover:from-purple-100 hover:to-indigo-100"
                            >
                                {isGenerating && generatingSection === 'all' ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Wand2 className="w-4 h-4" />
                                )}
                                Générer avec IA
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-6">
                        {/* Introduction */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-semibold text-slate-700">
                                    Introduction / Accroche *
                                </label>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => generateWithMistral('intro')}
                                        disabled={isGenerating || !formData.missionId || !formData.icp || !formData.pitch}
                                        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 disabled:text-slate-400 disabled:cursor-not-allowed"
                                    >
                                        {isGenerating && generatingSection === 'intro' ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                            <Wand2 className="w-3 h-3" />
                                        )}
                                        Générer
                                    </button>
                                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Étape 1</span>
                                </div>
                            </div>
                            <textarea
                                value={formData.scriptIntro}
                                onChange={(e) => setFormData(prev => ({ ...prev, scriptIntro: e.target.value }))}
                                placeholder="Comment vous présentez-vous et captez l'attention ?"
                                rows={3}
                                className={`w-full px-4 py-3 bg-slate-50 border rounded-xl text-slate-900 text-sm placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 transition-all resize-none ${errors.scriptIntro ? "border-red-500" : "border-slate-200"
                                    }`}
                            />
                            {errors.scriptIntro && (
                                <p className="text-xs text-red-500 mt-1 font-medium">{errors.scriptIntro}</p>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Discovery */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-semibold text-slate-700">
                                        Phase de découverte
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => generateWithMistral('discovery')}
                                            disabled={isGenerating || !formData.missionId || !formData.icp || !formData.pitch}
                                            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 disabled:text-slate-400 disabled:cursor-not-allowed"
                                        >
                                            {isGenerating && generatingSection === 'discovery' ? (
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                            ) : (
                                                <Wand2 className="w-3 h-3" />
                                            )}
                                            Générer
                                        </button>
                                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Étape 2</span>
                                    </div>
                                </div>
                                <textarea
                                    value={formData.scriptDiscovery}
                                    onChange={(e) => setFormData(prev => ({ ...prev, scriptDiscovery: e.target.value }))}
                                    placeholder="Quelles questions pour qualifier le besoin ?"
                                    rows={4}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 transition-all resize-none"
                                />
                            </div>

                            {/* Objection Handling */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-semibold text-slate-700">
                                        Réponses aux Objections
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => generateWithMistral('objection')}
                                            disabled={isGenerating || !formData.missionId || !formData.icp || !formData.pitch}
                                            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 disabled:text-slate-400 disabled:cursor-not-allowed"
                                        >
                                            {isGenerating && generatingSection === 'objection' ? (
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                            ) : (
                                                <Wand2 className="w-3 h-3" />
                                            )}
                                            Générer
                                        </button>
                                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Optionnel</span>
                                    </div>
                                </div>
                                <textarea
                                    value={formData.scriptObjection}
                                    onChange={(e) => setFormData(prev => ({ ...prev, scriptObjection: e.target.value }))}
                                    placeholder="Arguments face aux refus classiques..."
                                    rows={4}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 transition-all resize-none"
                                />
                            </div>
                        </div>

                        {/* Closing */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-semibold text-slate-700">
                                    Closing / Appel à l'action
                                </label>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => generateWithMistral('closing')}
                                        disabled={isGenerating || !formData.missionId || !formData.icp || !formData.pitch}
                                        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 disabled:text-slate-400 disabled:cursor-not-allowed"
                                    >
                                        {isGenerating && generatingSection === 'closing' ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                            <Wand2 className="w-3 h-3" />
                                        )}
                                        Générer
                                    </button>
                                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Étape 3</span>
                                </div>
                            </div>
                            <textarea
                                value={formData.scriptClosing}
                                onChange={(e) => setFormData(prev => ({ ...prev, scriptClosing: e.target.value }))}
                                placeholder="Comment proposez-vous le rendez-vous ?"
                                rows={2}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 transition-all resize-none"
                            />
                        </div>
                    </div>
                </Card>

                {/* AI Suggestions Modal */}
                <Modal
                    isOpen={aiModalOpen}
                    onClose={() => setAiModalOpen(false)}
                    title="Suggestions IA"
                    description="Choisissez une proposition avant de l'appliquer à votre script."
                    size="xl"
                >
                    {aiRequestedSection === "all" && (
                        <Tabs
                            tabs={SCRIPT_TABS}
                            activeTab={aiActiveTab}
                            onTabChange={(t) => setAiActiveTab(t as ScriptSectionKey)}
                            className="mb-4"
                        />
                    )}

                    {(() => {
                        const currentSection: ScriptSectionKey =
                            aiRequestedSection === "all" ? aiActiveTab : aiRequestedSection;
                        const items = aiSuggestions[currentSection] || [];

                        return (
                            <div className="space-y-3">
                                {items.length === 0 ? (
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                                        Aucune suggestion reçue pour cette section. Réessayez la génération.
                                    </div>
                                ) : (
                                    items.map((text, idx) => {
                                        const selected = (aiSelectedIndex[currentSection] ?? 0) === idx;
                                        return (
                                            <button
                                                key={`${currentSection}-${idx}`}
                                                type="button"
                                                onClick={() =>
                                                    setAiSelectedIndex((prev) => ({ ...prev, [currentSection]: idx }))
                                                }
                                                className={[
                                                    "w-full text-left rounded-xl border p-4 transition-all",
                                                    selected
                                                        ? "border-indigo-300 bg-indigo-50"
                                                        : "border-slate-200 bg-white hover:bg-slate-50",
                                                ].join(" ")}
                                            >
                                                <div className="flex items-center justify-between gap-3 mb-2">
                                                    <div className="text-xs font-bold tracking-wide uppercase text-slate-500">
                                                        Suggestion {idx + 1}
                                                    </div>
                                                    <div
                                                        className={[
                                                            "text-[11px] font-bold px-2 py-1 rounded-full",
                                                            selected
                                                                ? "bg-indigo-600 text-white"
                                                                : "bg-slate-100 text-slate-600",
                                                        ].join(" ")}
                                                    >
                                                        {selected ? "Sélectionnée" : "Choisir"}
                                                    </div>
                                                </div>
                                                <div className="text-sm text-slate-800 whitespace-pre-wrap">{text}</div>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        );
                    })()}

                    <ModalFooter>
                        <Button variant="secondary" onClick={() => setAiModalOpen(false)}>
                            Annuler
                        </Button>
                        <Button
                            variant="primary"
                            onClick={() =>
                                applySelectedSuggestions(aiRequestedSection === "all" ? "all" : aiRequestedSection)
                            }
                            disabled={
                                aiRequestedSection === "all"
                                    ? false
                                    : (aiSuggestions[aiRequestedSection]?.length || 0) === 0
                            }
                        >
                            {aiRequestedSection === "all" ? "Appliquer tout" : "Appliquer"}
                        </Button>
                    </ModalFooter>
                </Modal>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-4">
                    <Link href="/manager/campaigns">
                        <Button variant="ghost" type="button" size="lg">
                            Annuler
                        </Button>
                    </Link>
                    <Button
                        variant="primary"
                        type="submit"
                        size="lg"
                        disabled={isSaving}
                        className="gap-2 px-8"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Création en cours...
                            </>
                        ) : (
                            <>
                                <Plus className="w-5 h-5" />
                                Créer la campagne
                            </>
                        )}
                    </Button>
                </div>
            </form>
        </div>
    );
}
