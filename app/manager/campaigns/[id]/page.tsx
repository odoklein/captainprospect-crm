"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import {
    ArrowLeft,
    FileText,
    Target,
    Edit,
    Save,
    Loader2,
    Play,
    Pause,
    Trash2,
    Phone,
    MessageSquare,
    AlertCircle,
    Sparkles,
    ChevronRight,
    Copy,
    CheckCircle2,
    Wand2,
} from "lucide-react";
import Link from "next/link";
import { Card, Button, Badge, Modal, ModalFooter, LoadingState, EmptyState, Tabs } from "@/components/ui";
import { cn } from "@/lib/utils";
import { PitchBlockEditor, StrategyArtifactViewer } from "@/components/strategy";

// ============================================
// TYPES
// ============================================

interface Campaign {
    id: string;
    name: string;
    icp: string;
    pitch: string;
    script?: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    mission: {
        id: string;
        name: string;
        objective: string;
        channel: string;
        client: {
            id: string;
            name: string;
        };
    };
    _count: {
        actions: number;
    };
}

interface ScriptSections {
    intro: string;
    discovery: string;
    objection: string;
    closing: string;
}

type ScriptSectionKey = keyof ScriptSections;

const SCRIPT_TABS = [
    { id: "intro", label: "Introduction" },
    { id: "discovery", label: "Découverte" },
    { id: "objection", label: "Objections" },
    { id: "closing", label: "Closing" },
];

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const router = useRouter();
    const { success, error: showError } = useToast();

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [activeScriptTab, setActiveScriptTab] = useState("intro");

    // Form state
    const [formData, setFormData] = useState({
        name: "",
        icp: "",
        pitch: "",
    });
    const [scriptSections, setScriptSections] = useState<ScriptSections>({
        intro: "",
        discovery: "",
        objection: "",
        closing: "",
    });
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
        if (!campaign) return;

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
                    channel: campaign.mission.channel,
                    clientName: campaign.mission.client.name,
                    missionName: campaign.mission.name,
                    campaignName: formData.name,
                    campaignDescription: campaign.mission.objective,
                    icp: formData.icp,
                    pitch: formData.pitch,
                    section,
                    suggestionsCount: 3,
                }),
            });

            const json = await res.json();

            if (json.success && (json.data?.suggestions || json.data?.script)) {
                const suggestions = json.data?.suggestions || {};
                const fallbackScript = json.data?.script || {};
                const merged: Partial<Record<ScriptSectionKey, string[]>> = { ...suggestions };

                // If backend returned only "script" (or missing suggestions), still show a selectable option.
                (["intro", "discovery", "objection", "closing"] as ScriptSectionKey[]).forEach((k) => {
                    if (!merged[k] || merged[k]?.length === 0) {
                        const v = fallbackScript?.[k];
                        if (typeof v === "string" && v.trim()) merged[k] = [v];
                    }
                });

                setAiSuggestions(merged);
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
        const applyOne = (key: ScriptSectionKey) => {
            const list = aiSuggestions[key] || [];
            const idx = aiSelectedIndex[key] ?? 0;
            const value = list[idx] ?? "";
            setScriptSections((prev) => ({ ...prev, [key]: value }));
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
    // FETCH CAMPAIGN
    // ============================================

    const fetchCampaign = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/campaigns/${resolvedParams.id}`);
            const json = await res.json();

            if (json.success) {
                setCampaign(json.data);
                setFormData({
                    name: json.data.name,
                    icp: json.data.icp,
                    pitch: json.data.pitch,
                });

                // Parse script sections
                if (json.data.script) {
                    try {
                        const parsed = JSON.parse(json.data.script);
                        if (typeof parsed === "object") {
                            setScriptSections({
                                intro: parsed.intro || "",
                                discovery: parsed.discovery || "",
                                objection: parsed.objection || "",
                                closing: parsed.closing || "",
                            });
                        } else {
                            setScriptSections({
                                intro: json.data.script,
                                discovery: "",
                                objection: "",
                                closing: "",
                            });
                        }
                    } catch {
                        setScriptSections({
                            intro: json.data.script,
                            discovery: "",
                            objection: "",
                            closing: "",
                        });
                    }
                }
            } else {
                showError("Erreur", json.error || "Campagne non trouvée");
                router.push("/manager/missions");
            }
        } catch (err) {
            console.error("Failed to fetch campaign:", err);
            showError("Erreur", "Impossible de charger la campagne");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchCampaign();
    }, [resolvedParams.id]);

    // ============================================
    // SAVE CAMPAIGN
    // ============================================

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch(`/api/campaigns/${resolvedParams.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: formData.name,
                    icp: formData.icp,
                    pitch: formData.pitch,
                    script: {
                        intro: scriptSections.intro,
                        discovery: scriptSections.discovery,
                        objection: scriptSections.objection,
                        closing: scriptSections.closing,
                    },
                }),
            });

            const json = await res.json();

            if (json.success) {
                success("Campagne mise à jour", "Les modifications ont été enregistrées");
                setIsEditing(false);
                fetchCampaign();
            } else {
                showError("Erreur", json.error || "Impossible de sauvegarder");
            }
        } catch (err) {
            showError("Erreur", "Une erreur est survenue");
        } finally {
            setIsSaving(false);
        }
    };

    // ============================================
    // TOGGLE STATUS
    // ============================================

    const handleToggleStatus = async () => {
        try {
            const res = await fetch(`/api/campaigns/${resolvedParams.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: !campaign?.isActive }),
            });

            const json = await res.json();

            if (json.success) {
                success(
                    campaign?.isActive ? "Campagne désactivée" : "Campagne activée",
                    "Le statut a été mis à jour"
                );
                fetchCampaign();
            } else {
                showError("Erreur", json.error);
            }
        } catch (err) {
            showError("Erreur", "Impossible de modifier le statut");
        }
    };

    // ============================================
    // DELETE CAMPAIGN
    // ============================================

    const handleDelete = async () => {
        try {
            const res = await fetch(`/api/campaigns/${resolvedParams.id}`, {
                method: "DELETE",
            });

            const json = await res.json();

            if (json.success) {
                success("Campagne supprimée", "La campagne a été supprimée");
                router.push("/manager/missions");
            } else {
                showError("Erreur", json.error);
            }
        } catch (err) {
            showError("Erreur", "Impossible de supprimer la campagne");
        }
    };

    // ============================================
    // COPY SCRIPT
    // ============================================

    const copyScript = () => {
        const fullScript = Object.entries(scriptSections)
            .filter(([_, content]) => content)
            .map(([key, content]) => `--- ${key.toUpperCase()} ---\n${content}`)
            .join("\n\n");

        navigator.clipboard.writeText(fullScript);
        success("Script copié", "Le script a été copié dans le presse-papier");
    };

    if (isLoading) {
        return <LoadingState message="Chargement de la campagne..." />;
    }

    if (!campaign) {
        return null;
    }

    return (
        <div className="space-y-6">
            {/* Hero Header */}
            <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-8 text-white">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIvPjwvc3ZnPg==')] opacity-50" />
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                        <button
                            onClick={() => router.back()}
                            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center">
                            <FileText className="w-7 h-7" />
                        </div>
                        <div className="flex-1">
                            {isEditing ? (
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    className="text-2xl font-bold bg-white/10 border border-white/20 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-white/30"
                                />
                            ) : (
                                <div className="flex items-center gap-3 flex-wrap mb-1">
                                    <h1 className="text-2xl font-bold">{campaign.name}</h1>
                                    <Badge variant={campaign.isActive ? "success" : "default"}>
                                        {campaign.isActive ? "Active" : "Inactive"}
                                    </Badge>
                                </div>
                            )}
                            <p className="text-slate-400">
                                {campaign.mission.client.name} · {campaign.mission.name}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {isEditing ? (
                            <>
                                <Button
                                    variant="secondary"
                                    onClick={() => setIsEditing(false)}
                                    className="gap-2 bg-white/10 border-white/20 text-white hover:bg-white/20"
                                >
                                    Annuler
                                </Button>
                                <Button
                                    variant="primary"
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    isLoading={isSaving}
                                    className="gap-2"
                                >
                                    <Save className="w-4 h-4" />
                                    Enregistrer
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    variant="secondary"
                                    onClick={handleToggleStatus}
                                    className="gap-2 bg-white/10 border-white/20 text-white hover:bg-white/20"
                                >
                                    {campaign.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                    {campaign.isActive ? "Désactiver" : "Activer"}
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={() => setIsEditing(true)}
                                    className="gap-2 bg-white/10 border-white/20 text-white hover:bg-white/20"
                                >
                                    <Edit className="w-4 h-4" />
                                    Modifier
                                </Button>
                                <Button
                                    variant="secondary"
                                    onClick={() => setShowDeleteModal(true)}
                                    className="gap-2 bg-red-500/20 border-red-500/30 text-red-300 hover:bg-red-500/30"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-5">
                <Card className="!p-5">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
                            <Target className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">{campaign._count.actions}</p>
                            <p className="text-sm text-slate-500">Actions réalisées</p>
                        </div>
                    </div>
                </Card>
                <Card className="!p-5">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-900">
                                {new Date(campaign.createdAt).toLocaleDateString("fr-FR")}
                            </p>
                            <p className="text-xs text-slate-500">Date de création</p>
                        </div>
                    </div>
                </Card>
                <Card className="!p-5">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                            <MessageSquare className="w-6 h-6 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-900 capitalize">{campaign.mission.channel.toLowerCase()}</p>
                            <p className="text-xs text-slate-500">Canal</p>
                        </div>
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="col-span-2 space-y-6">
                    {/* ICP & Pitch */}
                    <Card>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                                <Target className="w-5 h-5 text-indigo-600" />
                            </div>
                            <h2 className="text-lg font-semibold text-slate-900">Cible & Message</h2>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">ICP (Profil Client Idéal)</label>
                                {isEditing ? (
                            <textarea
                                value={formData.icp}
                                onChange={(e) => setFormData(prev => ({ ...prev, icp: e.target.value }))}
                                rows={3}
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                            />
                                ) : (
                                    <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg">{campaign.icp}</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Pitch Commercial</label>
                                {isEditing ? (
                                    <PitchBlockEditor
                                        value={formData.pitch}
                                        onChange={(val) => setFormData(prev => ({ ...prev, pitch: val }))}
                                        icp={formData.icp}
                                    />
                                ) : (
                                    <StrategyArtifactViewer
                                        type="pitch"
                                        content={campaign.pitch}
                                        emptyText="Aucun pitch défini"
                                    />
                                )}
                            </div>
                        </div>
                    </Card>

                    {/* Script Editor */}
                    <Card>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                                    <Sparkles className="w-5 h-5 text-emerald-600" />
                                </div>
                                <h2 className="text-lg font-semibold text-slate-900">Script d'appel</h2>
                            </div>
                            <div className="flex items-center gap-2">
                                {isEditing && (
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => generateWithMistral('all')}
                                        disabled={isGenerating || !formData.icp || !formData.pitch}
                                        className="gap-2 bg-gradient-to-r from-purple-50 to-indigo-50 border-indigo-200 text-indigo-700 hover:from-purple-100 hover:to-indigo-100"
                                    >
                                        {isGenerating && generatingSection === 'all' ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Wand2 className="w-4 h-4" />
                                        )}
                                        Générer avec IA
                                    </Button>
                                )}
                                {!isEditing && (
                                    <Button variant="secondary" size="sm" onClick={copyScript} className="gap-2">
                                        <Copy className="w-4 h-4" />
                                        Copier
                                    </Button>
                                )}
                            </div>
                        </div>

                        <Tabs
                            tabs={SCRIPT_TABS}
                            activeTab={activeScriptTab}
                            onTabChange={setActiveScriptTab}
                            className="mb-4"
                        />

                        {isEditing ? (
                            <div className="space-y-2">
                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => generateWithMistral(activeScriptTab as 'intro' | 'discovery' | 'objection' | 'closing')}
                                        disabled={isGenerating || !formData.icp || !formData.pitch}
                                        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 disabled:text-slate-400 disabled:cursor-not-allowed"
                                    >
                                        {isGenerating && generatingSection === activeScriptTab ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                            <Wand2 className="w-3 h-3" />
                                        )}
                                        Générer cette section
                                    </button>
                                </div>
                                <textarea
                                    value={scriptSections[activeScriptTab as keyof ScriptSections]}
                                    onChange={(e) => setScriptSections(prev => ({
                                        ...prev,
                                        [activeScriptTab]: e.target.value
                                    }))}
                                    rows={10}
                                    placeholder={`Écrivez votre script de ${SCRIPT_TABS.find(t => t.id === activeScriptTab)?.label.toLowerCase()}...`}
                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none font-mono text-sm"
                                />
                            </div>
                        ) : (
                            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 min-h-[200px]">
                                {scriptSections[activeScriptTab as keyof ScriptSections] ? (
                                    <p className="text-sm text-slate-700 whitespace-pre-wrap">
                                        {scriptSections[activeScriptTab as keyof ScriptSections]}
                                    </p>
                                ) : (
                                    <div className="text-center py-8 text-sm text-slate-400">
                                        <Sparkles className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                                        Aucun script pour cette section
                                    </div>
                                )}
                            </div>
                        )}
                    </Card>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    {/* Mission Info */}
                    <Card>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                                <Target className="w-5 h-5 text-amber-600" />
                            </div>
                            <h2 className="text-lg font-semibold text-slate-900">Mission</h2>
                        </div>
                        <Link
                            href={`/manager/missions/${campaign.mission.id}`}
                            className="block p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                        >
                            <p className="font-medium text-slate-900">{campaign.mission.name}</p>
                            <p className="text-sm text-slate-500">{campaign.mission.client.name}</p>
                        </Link>
                    </Card>

                    {/* Quick Tips */}
                    <Card className="bg-gradient-to-br from-indigo-50 to-white border-indigo-100">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                                <AlertCircle className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div>
                                <h3 className="font-medium text-indigo-900 mb-1">Conseils</h3>
                                <ul className="text-sm text-indigo-700 space-y-1">
                                    <li>• Structurez le script en sections claires</li>
                                    <li>• Incluez des questions de découverte</li>
                                    <li>• Préparez des réponses aux objections</li>
                                </ul>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>

            {/* Delete Modal */}
            <Modal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                title="Supprimer la campagne"
            >
                <div className="space-y-4">
                    <p className="text-sm text-slate-600">
                        Êtes-vous sûr de vouloir supprimer la campagne <strong>{campaign.name}</strong> ?
                        Cette action est irréversible.
                    </p>
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
                            Annuler
                        </Button>
                        <Button variant="danger" onClick={handleDelete}>
                            Supprimer
                        </Button>
                    </div>
                </div>
            </Modal>

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
                                            className={cn(
                                                "w-full text-left rounded-xl border p-4 transition-all",
                                                selected
                                                    ? "border-indigo-300 bg-indigo-50"
                                                    : "border-slate-200 bg-white hover:bg-slate-50"
                                            )}
                                        >
                                            <div className="flex items-center justify-between gap-3 mb-2">
                                                <div className="text-xs font-bold tracking-wide uppercase text-slate-500">
                                                    Suggestion {idx + 1}
                                                </div>
                                                <div
                                                    className={cn(
                                                        "text-[11px] font-bold px-2 py-1 rounded-full",
                                                        selected
                                                            ? "bg-indigo-600 text-white"
                                                            : "bg-slate-100 text-slate-600"
                                                    )}
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
        </div>
    );
}
