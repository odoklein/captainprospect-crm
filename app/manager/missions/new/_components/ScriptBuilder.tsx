"use client";

import { useState } from "react";
import { Card, Button, Modal, ModalFooter, Select, Tabs, useToast } from "@/components/ui";
import { MessageSquare, Loader2 } from "lucide-react";
import { AiMark } from "@/components/ui/AiMark";
import { CreateMissionInput } from "@/app/actions/mission-wizard";
import { Channel } from "@prisma/client";

// ============================================
// TYPES
// ============================================

type ScriptSectionKey = "intro" | "discovery" | "objection" | "closing";

interface ScriptBuilderProps {
    data: CreateMissionInput;
    onChange: (data: CreateMissionInput) => void;
    clientName?: string;
    errors: Record<string, string>;
}

interface ScriptTemplate {
    id: string;
    name: string;
    content: string;
}

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
// SCRIPT BUILDER COMPONENT
// ============================================

export function ScriptBuilder({ data, onChange, clientName, errors }: ScriptBuilderProps) {
    const { success, error: showError } = useToast();
    const [selectedTemplate, setSelectedTemplate] = useState<string>("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatingSection, setGeneratingSection] = useState<string | null>(null);

    // AI suggestions
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

    const availableTemplates = SCRIPT_TEMPLATES[data.channel] || [];

    const handleChange = (field: keyof CreateMissionInput, value: string) => {
        onChange({ ...data, [field]: value });
    };

    // ============================================
    // TEMPLATE APPLICATION
    // ============================================

    const applyTemplate = (templateId: string) => {
        const template = availableTemplates.find(t => t.id === templateId);
        if (template) {
            const content = JSON.parse(template.content);
            onChange({
                ...data,
                scriptIntro: content.intro || "",
                scriptDiscovery: content.discovery || "",
                scriptObjection: content.objection || "",
                scriptClosing: content.closing || "",
            });
            setSelectedTemplate(templateId);
        }
    };

    // ============================================
    // MISTRAL AI GENERATION
    // ============================================

    const generateWithMistral = async (section: "all" | ScriptSectionKey) => {
        if (!data.icp.trim() || !data.pitch.trim()) {
            showError("Erreur", "Veuillez renseigner l'ICP et le pitch (étape précédente) avant de générer");
            return;
        }

        setIsGenerating(true);
        setGeneratingSection(section);

        try {
            const res = await fetch("/api/ai/mistral/script", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    channel: data.channel,
                    clientName: clientName || "Client",
                    missionName: data.name,
                    campaignName: data.name,
                    campaignDescription: data.objective,
                    icp: data.icp,
                    pitch: data.pitch,
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
        const fieldMap: Record<ScriptSectionKey, keyof CreateMissionInput> = {
            intro: "scriptIntro",
            discovery: "scriptDiscovery",
            objection: "scriptObjection",
            closing: "scriptClosing",
        };

        const applyOne = (key: ScriptSectionKey) => {
            const list = aiSuggestions[key] || [];
            const idx = aiSelectedIndex[key] ?? 0;
            const value = list[idx] ?? "";
            handleChange(fieldMap[key], value);
        };

        if (mode === "all") {
            const updates: Partial<CreateMissionInput> = {};
            (["intro", "discovery", "objection", "closing"] as ScriptSectionKey[]).forEach((key) => {
                const list = aiSuggestions[key] || [];
                const idx = aiSelectedIndex[key] ?? 0;
                updates[fieldMap[key] as keyof CreateMissionInput] = list[idx] ?? "";
            });
            onChange({ ...data, ...updates });
            success("Suggestions appliquées", "Les sections sélectionnées ont été ajoutées au script");
        } else {
            applyOne(mode);
            success("Suggestion appliquée", "La suggestion sélectionnée a été ajoutée au script");
        }

        setAiModalOpen(false);
    };

    // ============================================
    // RENDER
    // ============================================

    return (
        <>
            <Card className="shadow-sm p-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <MessageSquare className="w-5 h-5 text-primary-500" />
                            Script de prospection
                        </h3>
                        <p className="text-sm text-slate-500 mt-1">Construisez votre argumentaire étape par étape</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {availableTemplates.length > 0 && (
                            <Select
                                placeholder="Template..."
                                options={[
                                    { value: "", label: "Script vierge" },
                                    ...availableTemplates.map(t => ({ value: t.id, label: t.name })),
                                ]}
                                value={selectedTemplate}
                                onChange={applyTemplate}
                                className="w-48"
                            />
                        )}
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => generateWithMistral("all")}
                            disabled={isGenerating || !data.icp || !data.pitch}
                            className="gap-2 bg-primary-50 border-primary-200 text-primary-700 hover:bg-primary-100"
                        >
                            {isGenerating && generatingSection === "all" ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <AiMark className="w-4 h-4" />
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
                                    onClick={() => generateWithMistral("intro")}
                                    disabled={isGenerating || !data.icp || !data.pitch}
                                    className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 disabled:text-slate-400 disabled:cursor-not-allowed"
                                >
                                    {isGenerating && generatingSection === "intro" ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                        <AiMark className="w-3 h-3" />
                                    )}
                                    Générer
                                </button>
                                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Étape 1</span>
                            </div>
                        </div>
                        <textarea
                            value={data.scriptIntro}
                            onChange={(e) => handleChange("scriptIntro", e.target.value)}
                            placeholder="Comment vous présentez-vous et captez l'attention ?"
                            rows={3}
                            className={`w-full px-4 py-3 bg-slate-50 border rounded-xl text-slate-900 text-sm placeholder:text-slate-500 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/15 transition-all resize-none ${errors.scriptIntro ? "border-red-500" : "border-slate-200"}`}
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
                                        onClick={() => generateWithMistral("discovery")}
                                        disabled={isGenerating || !data.icp || !data.pitch}
                                        className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 disabled:text-slate-400 disabled:cursor-not-allowed"
                                    >
                                        {isGenerating && generatingSection === "discovery" ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                            <AiMark className="w-3 h-3" />
                                        )}
                                        Générer
                                    </button>
                                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Étape 2</span>
                                </div>
                            </div>
                            <textarea
                                value={data.scriptDiscovery}
                                onChange={(e) => handleChange("scriptDiscovery", e.target.value)}
                                placeholder="Quelles questions pour qualifier le besoin ?"
                                rows={4}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm placeholder:text-slate-500 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/15 transition-all resize-none"
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
                                        onClick={() => generateWithMistral("objection")}
                                        disabled={isGenerating || !data.icp || !data.pitch}
                                        className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 disabled:text-slate-400 disabled:cursor-not-allowed"
                                    >
                                        {isGenerating && generatingSection === "objection" ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                            <AiMark className="w-3 h-3" />
                                        )}
                                        Générer
                                    </button>
                                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Optionnel</span>
                                </div>
                            </div>
                            <textarea
                                value={data.scriptObjection}
                                onChange={(e) => handleChange("scriptObjection", e.target.value)}
                                placeholder="Arguments face aux refus classiques..."
                                rows={4}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm placeholder:text-slate-500 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/15 transition-all resize-none"
                            />
                        </div>
                    </div>

                    {/* Closing */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-semibold text-slate-700">
                                Closing / Appel à l&apos;action
                            </label>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => generateWithMistral("closing")}
                                    disabled={isGenerating || !data.icp || !data.pitch}
                                    className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 disabled:text-slate-400 disabled:cursor-not-allowed"
                                >
                                    {isGenerating && generatingSection === "closing" ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                        <AiMark className="w-3 h-3" />
                                    )}
                                    Générer
                                </button>
                                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Étape 3</span>
                            </div>
                        </div>
                        <textarea
                            value={data.scriptClosing}
                            onChange={(e) => handleChange("scriptClosing", e.target.value)}
                            placeholder="Comment proposez-vous le rendez-vous ?"
                            rows={2}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm placeholder:text-slate-500 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/15 transition-all resize-none"
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
                                                    ? "border-primary-300 bg-primary-50"
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
                                                            ? "bg-primary-600 text-white"
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
        </>
    );
}
