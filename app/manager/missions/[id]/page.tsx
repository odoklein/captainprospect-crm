"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
// #region agent log
if (typeof fetch !== "undefined") {
    fetch("http://127.0.0.1:7867/ingest/490ac402-97ac-4553-b1e1-210c752f7614", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "f98d12" }, body: JSON.stringify({ sessionId: "f98d12", location: "app/manager/missions/[id]/page.tsx:pre-ui-import", message: "mission page before ui import", data: { t: Date.now() }, timestamp: Date.now(), hypothesisId: "mission" }) }).catch(() => {});
}
// #endregion
import { Modal, ModalFooter, ConfirmModal, ContextMenu, useContextMenu, useToast, Tabs } from "@/components/ui";
import { MissionStatusWorkflowDrawer } from "@/components/drawers";
import {
    ArrowLeft,
    Target,
    Users,
    Phone,
    Mail,
    Linkedin,
    Edit,
    Trash2,
    PlayCircle,
    PauseCircle,
    Loader2,
    ListIcon,
    ChevronRight,
    Sparkles,
    FileText,
    Plus,
    X,
    Eye,
    ExternalLink,
    Activity,
    TrendingUp,
    Save,
    Wand2,
    Copy,
    CheckCircle2,
    BarChart3,
    GripVertical,
    Pencil,
    MessageSquare,
    Rocket,
    Clock3,
    EyeOff,
    ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { EditMissionDialog } from "./_components/EditMissionDialog";
import { ReadinessPanel } from "./_components/ReadinessPanel";
import { StrategyByListTab } from "./_components/StrategyByListTab";
import { MailboxManagerDialog } from "@/components/email/inbox/MailboxManagerDialog";
import { MISSION_STATUS_CONFIG } from "@/lib/constants/missionStatus";
import type { MissionStatusValue } from "@/lib/constants/missionStatus";

// ============================================
// TYPES
// ============================================

interface Mission {
    id: string;
    name: string;
    objective?: string;
    channel: "CALL" | "EMAIL" | "LINKEDIN";
    channels?: ("CALL" | "EMAIL" | "LINKEDIN")[];
    status: MissionStatusValue;
    isActive: boolean;
    portalLaunchStartedAt?: string | null;
    portalVisibleAt?: string | null;
    startDate?: string;
    endDate?: string;
    client?: {
        id: string;
        name: string;
        interlocuteurs?: {
            id: string;
            firstName: string;
            lastName: string;
            title?: string | null;
            isActive: boolean;
        }[];
    };
    teamLeadSdrId?: string | null;
    teamLeadSdr?: { id: string; name: string; email: string } | null;
    sdrAssignments: Array<{
        id: string;
        sdr: {
            id: string;
            name: string;
            email: string;
            role: string;
            selectedListId?: string | null;
            selectedMissionId?: string | null;
        };
    }>;
    campaigns: Array<{
        id: string;
        name: string;
        isActive: boolean;
    }>;
    lists: Array<{
        id: string;
        name: string;
        type: string;
        isActive?: boolean;
        commercialInterlocuteurId?: string | null;
        commercialInterlocuteur?: {
            id: string;
            firstName: string;
            lastName: string;
            title?: string | null;
        } | null;
        _count?: { companies: number; contacts?: number };
        campaignId?: string | null;
        campaign?: {
            id: string;
            name: string;
            icp: string | null;
            pitch: string | null;
            script: string | null;
            isActive: boolean;
        } | null;
        readiness?: {
            hasStrategy: boolean;
            hasIcp: boolean;
            hasPitch: boolean;
            hasScript: boolean;
            isReady: boolean;
        };
    }>;
    missionReadiness?: {
        activeLists: number;
        readyLists: number;
        missingStrategy: number;
        missingIcp: number;
        missingPitch: number;
        missingScript: number;
    };
    _count: {
        sdrAssignments: number;
        campaigns: number;
        lists: number;
    };
    stats?: {
        totalActions: number;
        meetingsBooked: number;
        opportunities: number;
    };
    defaultMailboxId?: string | null;
    defaultInterlocuteur?: {
        id: string;
        firstName: string;
        lastName: string;
        title?: string | null;
    } | null;
}

interface AssignableUser {
    id: string;
    name: string;
    email: string;
    role: string;
}

interface EmailTemplate {
    id: string;
    name: string;
    subject: string;
    bodyHtml: string;
    category: string;
    variables: string[];
    createdBy?: {
        id: string;
        name: string;
    };
}

interface MissionTemplate {
    id: string;
    order: number;
    template: EmailTemplate;
}

interface CampaignData {
    id: string;
    name: string;
    icp: string;
    pitch: string;
    script?: string | null;
    rules?: Record<string, unknown> | null;
    isActive: boolean;
}

interface MissionFeedbackItem {
    id: string;
    score: number;
    review: string;
    objections: string | null;
    missionComment: string | null;
    submittedAt: string;
    sdr: {
        id: string;
        name: string;
        email: string;
    };
    missions: Array<{
        mission: {
            id: string;
            name: string;
        };
    }>;
}

// ============================================
// CHANNEL CONFIG
// ============================================

const CHANNEL_CONFIG = {
    CALL: { icon: Phone, label: "Appel", className: "mgr-channel-call" },
    EMAIL: { icon: Mail, label: "Email", className: "mgr-channel-email" },
    LINKEDIN: { icon: Linkedin, label: "LinkedIn", className: "mgr-channel-linkedin" },
};

// ============================================
// MISSION DETAIL PAGE
// ============================================

export default function MissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const router = useRouter();
    const { success, error: showError } = useToast();

    const [mission, setMission] = useState<Mission | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isToggling, setIsToggling] = useState(false);
    const [showPortalLaunchModal, setShowPortalLaunchModal] = useState(false);
    const [portalLaunchDays, setPortalLaunchDays] = useState(7);
    const [isUpdatingPortalLaunch, setIsUpdatingPortalLaunch] = useState(false);

    // Modals
    const [showEditMissionDialog, setShowEditMissionDialog] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showDeleteListModal, setShowDeleteListModal] = useState(false);
    const [listToDelete, setListToDelete] = useState<Mission["lists"][0] | null>(null);
    const [isDeletingList, setIsDeletingList] = useState(false);
    const [togglingListId, setTogglingListId] = useState<string | null>(null);
    const { position: listMenuPosition, contextData: listMenuData, handleContextMenu: handleListContextMenu, close: closeListMenu } = useContextMenu();

    // Email Templates
    const [missionTemplates, setMissionTemplates] = useState<MissionTemplate[]>([]);
    const [availableTemplates, setAvailableTemplates] = useState<EmailTemplate[]>([]);
    const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
    const [showAddTemplateModal, setShowAddTemplateModal] = useState(false);
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);
    const [selectedTemplateToAdd, setSelectedTemplateToAdd] = useState<string>("");
    const [isAddingTemplate, setIsAddingTemplate] = useState(false);
    const [removingTemplateId, setRemovingTemplateId] = useState<string | null>(null);
    const [showCreateTemplateModal, setShowCreateTemplateModal] = useState(false);
    const [showEditTemplateModal, setShowEditTemplateModal] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
    const [templateForm, setTemplateForm] = useState({ name: "", subject: "", bodyHtml: "", category: "OUTREACH" });
    const [isSavingTemplate, setIsSavingTemplate] = useState(false);
    const [duplicatingTemplateId, setDuplicatingTemplateId] = useState<string | null>(null);
    const [draggedTemplateIndex, setDraggedTemplateIndex] = useState<number | null>(null);
    // Template modal tabs & AI
    const [templateModalTab, setTemplateModalTab] = useState<"write" | "preview" | "ai">("write");
    const [templateAiPrompt, setTemplateAiPrompt] = useState("");
    const [templateAiSuggestions, setTemplateAiSuggestions] = useState<string[]>([]);
    const [isGeneratingTemplateAi, setIsGeneratingTemplateAi] = useState(false);

    const [activeTab, setActiveTab] = useState("general");
    const [feedbackItems, setFeedbackItems] = useState<MissionFeedbackItem[]>([]);
    const [feedbackLoading, setFeedbackLoading] = useState(false);
    const [feedbackFrom, setFeedbackFrom] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 14);
        return d.toISOString().slice(0, 10);
    });
    const [feedbackTo, setFeedbackTo] = useState(() => new Date().toISOString().slice(0, 10));
    const [showStatusWorkflowDrawer, setShowStatusWorkflowDrawer] = useState(false);

    // Inline Strategy (Campaign) state
    const [campaignData, setCampaignData] = useState<CampaignData | null>(null);
    const [isStrategyEditing, setIsStrategyEditing] = useState(false);
    const [isCreatingStrategy, setIsCreatingStrategy] = useState(false);
    const [isSavingStrategy, setIsSavingStrategy] = useState(false);
    const [strategyForm, setStrategyForm] = useState({ icp: "", pitch: "" });
    const [baseScript, setBaseScript] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatingSection, setGeneratingSection] = useState<"all" | null>(null);
    const [aiModalOpen, setAiModalOpen] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
    const [aiSelectedIndex, setAiSelectedIndex] = useState(0);
    const [additionalScriptDraft, setAdditionalScriptDraft] = useState("");
    const [additionalScriptShared, setAdditionalScriptShared] = useState("");
    const [aiEnhancedScriptDraft, setAiEnhancedScriptDraft] = useState("");
    const [aiEnhancedScriptShared, setAiEnhancedScriptShared] = useState("");
    const [aiGeneratedAt, setAiGeneratedAt] = useState<string | null>(null);
    const [isSavingAdditionalScript, setIsSavingAdditionalScript] = useState(false);
    const [isSharingAdditionalScript, setIsSharingAdditionalScript] = useState(false);
    const [isSavingAiEnhancedScript, setIsSavingAiEnhancedScript] = useState(false);
    const [isSharingAiEnhancedScript, setIsSharingAiEnhancedScript] = useState(false);
    const [isRefreshingAiEnhancedScript, setIsRefreshingAiEnhancedScript] = useState(false);
    const [defaultScriptTab, setDefaultScriptTab] = useState<"base" | "additional" | "ai">("base");
    const [isSavingDefaultScriptTab, setIsSavingDefaultScriptTab] = useState(false);
    const [mailboxes, setMailboxes] = useState<Array<{ id: string; email: string; displayName: string | null }>>([]);
    const [isLoadingMailboxes, setIsLoadingMailboxes] = useState(false);
    const [showMailboxModal, setShowMailboxModal] = useState(false);
    const [showMailboxManager, setShowMailboxManager] = useState(false);


    // ============================================
    // FETCH MISSION
    // ============================================

    const fetchMission = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/missions/${resolvedParams.id}`);
            const json = await res.json();

            if (json.success) {
                const m = json.data;
                setMission(m);
            } else {
                showError("Erreur", json.error || "Mission non trouvée");
                router.push("/manager/missions");
            }
        } catch (err) {
            console.error("Failed to fetch mission:", err);
            showError("Erreur", "Impossible de charger la mission");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchMissionFeedback = async () => {
        if (!mission?.id) return;
        setFeedbackLoading(true);
        try {
            const params = new URLSearchParams({
                missionId: mission.id,
                from: feedbackFrom,
                to: feedbackTo,
                limit: "300",
            });
            const res = await fetch(`/api/manager/sdr-feedback?${params.toString()}`);
            const json = await res.json();
            if (!json.success) {
                showError("Erreur", json.error || "Impossible de charger les avis SDR");
                setFeedbackItems([]);
                return;
            }
            setFeedbackItems(json.data as MissionFeedbackItem[]);
        } catch {
            showError("Erreur", "Impossible de charger les avis SDR");
            setFeedbackItems([]);
        } finally {
            setFeedbackLoading(false);
        }
    };

    useEffect(() => {
        fetchMission();
    }, [resolvedParams.id]);

    useEffect(() => {
        if (activeTab !== "feedback") return;
        void fetchMissionFeedback();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, mission?.id, feedbackFrom, feedbackTo]);

    // Load mailboxes for mission-level default mailbox
    const refetchMailboxes = async () => {
        if (!mission) return;
        setIsLoadingMailboxes(true);
        try {
            const res = await fetch("/api/email/mailboxes?includeShared=true", { cache: "no-store" });
            const json = await res.json();
            if (json.success && Array.isArray(json.data)) {
                setMailboxes(
                    json.data.map((mb: { id: string; email: string; displayName: string | null }) => ({
                        id: mb.id,
                        email: mb.email,
                        displayName: mb.displayName,
                    }))
                );
            }
        } catch {
            // optional, ignore errors
        } finally {
            setIsLoadingMailboxes(false);
        }
    };

    useEffect(() => {
        if (!mission) return;
        refetchMailboxes();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mission?.id]);


    // ============================================
    // FETCH / SAVE STRATEGY (Campaign)
    // ============================================

    const fetchCampaignStrategy = async () => {
        if (!mission?.id || mission.campaigns.length === 0) return;
        try {
            const res = await fetch(`/api/campaigns/${mission.campaigns[0].id}`);
            const json = await res.json();
            if (json.success) {
                const c: CampaignData = json.data;
                setCampaignData(c);
                setStrategyForm({ icp: c.icp || "", pitch: c.pitch || "" });
                setBaseScript(c.script || "");
                try {
                    const companionRes = await fetch(`/api/campaigns/${c.id}/script-companion`);
                    const companionJson = await companionRes.json();
                    if (companionJson.success) {
                        setAdditionalScriptDraft(companionJson.data?.additionalDraft || "");
                        setAdditionalScriptShared(companionJson.data?.additionalShared || "");
                        setAiEnhancedScriptDraft(companionJson.data?.aiDraft || "");
                        setAiEnhancedScriptShared(companionJson.data?.aiShared || "");
                        setAiGeneratedAt(companionJson.data?.aiGeneratedAt || null);
                        setDefaultScriptTab(companionJson.data?.defaultTab || "base");
                    } else {
                        setAdditionalScriptDraft("");
                        setAdditionalScriptShared("");
                        setAiEnhancedScriptDraft("");
                        setAiEnhancedScriptShared("");
                        setAiGeneratedAt(null);
                        setDefaultScriptTab("base");
                    }
                } catch {
                    setAdditionalScriptDraft("");
                    setAdditionalScriptShared("");
                    setAiEnhancedScriptDraft("");
                    setAiEnhancedScriptShared("");
                    setAiGeneratedAt(null);
                    setDefaultScriptTab("base");
                }
            }
        } catch (err) {
            console.error("Failed to fetch campaign strategy:", err);
        }
    };

    useEffect(() => {
        const firstCampaignId = mission?.campaigns?.[0]?.id;
        if (mission?.id && firstCampaignId) {
            fetchCampaignStrategy();
        }
    }, [mission?.id, mission?.campaigns?.[0]?.id]);

    const handleSaveStrategy = async () => {
        if (!campaignData) {
            showError("Erreur", "Chargement de la campagne en cours ou introuvable. Réessayez dans un instant.");
            return;
        }
        setIsSavingStrategy(true);
        try {
            const res = await fetch(`/api/campaigns/${campaignData.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    icp: strategyForm.icp,
                    pitch: strategyForm.pitch,
                    script: baseScript,
                }),
            });
            const json = await res.json();
            if (json.success) {
                success("Stratégie sauvegardée", "Le script et le message ont été mis à jour");
                setIsStrategyEditing(false);
                fetchCampaignStrategy();
            } else {
                showError("Erreur", json.error);
            }
        } catch {
            showError("Erreur", "Impossible de sauvegarder");
        } finally {
            setIsSavingStrategy(false);
        }
    };

    const handleCreateStrategy = async () => {
        if (!mission) return;
        setIsSavingStrategy(true);
        try {
            const res = await fetch("/api/campaigns", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: `${mission.name} — Stratégie`,
                    missionId: mission.id,
                    icp: strategyForm.icp,
                    pitch: strategyForm.pitch,
                    script: baseScript || undefined,
                }),
            });
            const json = await res.json();
            if (json.success) {
                success("Stratégie créée", "La stratégie a été créée pour cette mission");
                setIsCreatingStrategy(false);
                await fetchMission();
            } else {
                showError("Erreur", json.error || "Impossible de créer la stratégie");
            }
        } catch {
            showError("Erreur", "Impossible de créer la stratégie");
        } finally {
            setIsSavingStrategy(false);
        }
    };

    const generateWithMistral = async () => {
        if (!mission) return;
        if (!strategyForm.icp.trim() || !strategyForm.pitch.trim()) {
            showError("Erreur", "Veuillez renseigner l'ICP et le pitch avant de générer");
            return;
        }
        setIsGenerating(true);
        setGeneratingSection("all");
        try {
            const res = await fetch("/api/ai/mistral/script", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    channel: mission.channel,
                    clientName: mission.client?.name,
                    missionName: mission.name,
                    campaignName: campaignData?.name || mission.name,
                    campaignDescription: mission.objective,
                    icp: strategyForm.icp,
                    pitch: strategyForm.pitch,
                    section: "all",
                    suggestionsCount: 3,
                }),
            });
            const json = await res.json();
            if (json.success && (json.data?.suggestions || json.data?.script)) {
                const suggestions = json.data?.suggestions || {};
                const fallbackScript = json.data?.script || {};
                const toSingleScript = (source: Record<string, unknown>): string => {
                    const ordered = [
                        ["Introduction", source.intro],
                        ["Decouverte", source.discovery],
                        ["Objections", source.objection],
                        ["Closing", source.closing],
                    ]
                        .map(([label, value]) =>
                            typeof value === "string" && value.trim() ? `--- ${label} ---\n${value.trim()}` : null
                        )
                        .filter((v): v is string => Boolean(v));
                    return ordered.join("\n\n");
                };
                const maxLen = Math.max(
                    suggestions?.intro?.length ?? 0,
                    suggestions?.discovery?.length ?? 0,
                    suggestions?.objection?.length ?? 0,
                    suggestions?.closing?.length ?? 0,
                );
                const mergedSuggestions =
                    maxLen > 0
                        ? Array.from({ length: maxLen }, (_, idx) =>
                            toSingleScript({
                                intro: suggestions?.intro?.[idx] ?? fallbackScript?.intro ?? "",
                                discovery: suggestions?.discovery?.[idx] ?? fallbackScript?.discovery ?? "",
                                objection: suggestions?.objection?.[idx] ?? fallbackScript?.objection ?? "",
                                closing: suggestions?.closing?.[idx] ?? fallbackScript?.closing ?? "",
                            })
                        ).filter((s) => s.trim().length > 0)
                        : [toSingleScript(fallbackScript)].filter((s) => s.trim().length > 0);
                setAiSuggestions(mergedSuggestions);
                setAiSelectedIndex(0);
                setAiModalOpen(true);
            } else {
                showError("Erreur", json.error || "Impossible de générer le script");
            }
        } catch {
            showError("Erreur", "Erreur de connexion à Mistral AI");
        } finally {
            setIsGenerating(false);
            setGeneratingSection(null);
        }
    };

    const applySelectedSuggestion = () => {
        const value = aiSuggestions[aiSelectedIndex] ?? "";
        setBaseScript(value);
        success("Suggestion appliquée", "La suggestion a été appliquée");
        setAiModalOpen(false);
    };

    const copyScript = () => {
        navigator.clipboard.writeText(baseScript || "");
        success("Script copié", "Copié dans le presse-papier");
    };

    const handleSaveAdditionalScript = async () => {
        if (!campaignData) return;
        setIsSavingAdditionalScript(true);
        try {
            const res = await fetch(`/api/campaigns/${campaignData.id}/script-companion`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ draft: additionalScriptDraft, kind: "additional" }),
            });
            const json = await res.json();
            if (!json.success) {
                showError("Erreur", json.error || "Impossible de sauvegarder le script additionel");
                return;
            }
            success("Brouillon sauvegardé", "Le script additionel a été enregistré.");
            await fetchCampaignStrategy();
        } catch {
            showError("Erreur", "Impossible de sauvegarder le script additionel");
        } finally {
            setIsSavingAdditionalScript(false);
        }
    };

    const handleShareAdditionalScript = async () => {
        if (!campaignData) return;
        setIsSharingAdditionalScript(true);
        try {
            const res = await fetch(`/api/campaigns/${campaignData.id}/script-companion`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: additionalScriptDraft, kind: "additional" }),
            });
            const json = await res.json();
            if (!json.success) {
                showError("Erreur", json.error || "Impossible de partager le script additionel");
                return;
            }
            success("Script partagé", "Le script additionel est maintenant partagé à l'équipe.");
            await fetchCampaignStrategy();
        } catch {
            showError("Erreur", "Impossible de partager le script additionel");
        } finally {
            setIsSharingAdditionalScript(false);
        }
    };

    const handleSaveAiEnhancedScript = async () => {
        if (!campaignData) return;
        setIsSavingAiEnhancedScript(true);
        try {
            const res = await fetch(`/api/campaigns/${campaignData.id}/script-companion`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ draft: aiEnhancedScriptDraft, kind: "ai" }),
            });
            const json = await res.json();
            if (!json.success) {
                showError("Erreur", json.error || "Impossible de sauvegarder le script IA");
                return;
            }
            success("Brouillon sauvegardé", "Le script amélioré par IA a été enregistré.");
            await fetchCampaignStrategy();
        } catch {
            showError("Erreur", "Impossible de sauvegarder le script IA");
        } finally {
            setIsSavingAiEnhancedScript(false);
        }
    };

    const handleShareAiEnhancedScript = async () => {
        if (!campaignData) return;
        setIsSharingAiEnhancedScript(true);
        try {
            const res = await fetch(`/api/campaigns/${campaignData.id}/script-companion`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: aiEnhancedScriptDraft, kind: "ai" }),
            });
            const json = await res.json();
            if (!json.success) {
                showError("Erreur", json.error || "Impossible de partager le script IA");
                return;
            }
            success("Script IA partagé", "Le script amélioré par IA est maintenant partagé à l'équipe.");
            await fetchCampaignStrategy();
        } catch {
            showError("Erreur", "Impossible de partager le script IA");
        } finally {
            setIsSharingAiEnhancedScript(false);
        }
    };

    const handleRefreshAiEnhancedScript = async () => {
        if (!campaignData) return;
        setIsRefreshingAiEnhancedScript(true);
        try {
            const res = await fetch(`/api/campaigns/${campaignData.id}/script-companion`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ force: true, source: "manual" }),
            });
            const json = await res.json();
            if (!json.success) {
                showError("Erreur", json.error || "Impossible de générer le script IA");
                return;
            }
            if (json.refreshed && json.aiScript) {
                success("Script IA régénéré", "Le script a été recalculé depuis les commentaires d'appels.");
            } else {
                success("Script IA inchangé", "Aucun nouveau commentaire d'appel exploitable (ou génération vide).");
            }
            await fetchCampaignStrategy();
        } catch {
            showError("Erreur", "Impossible de régénérer le script IA");
        } finally {
            setIsRefreshingAiEnhancedScript(false);
        }
    };

    const handleDefaultScriptTabChange = async (tab: "base" | "additional" | "ai") => {
        if (!campaignData) return;
        setDefaultScriptTab(tab);
        setIsSavingDefaultScriptTab(true);
        try {
            const res = await fetch(`/api/campaigns/${campaignData.id}/script-companion`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ defaultTab: tab }),
            });
            const json = await res.json();
            if (!json.success) {
                showError("Erreur", json.error || "Impossible d'enregistrer l'onglet par défaut");
                return;
            }
            success("Onglet par défaut mis à jour", "Les SDR ouvriront directement cet onglet.");
        } catch {
            showError("Erreur", "Impossible d'enregistrer l'onglet par défaut");
        } finally {
            setIsSavingDefaultScriptTab(false);
        }
    };

    // ============================================
    // EMAIL TEMPLATES
    // ============================================

    const fetchMissionTemplates = async () => {
        if (!mission) return;
        setIsLoadingTemplates(true);
        try {
            const res = await fetch(`/api/missions/${mission.id}/templates`);
            const json = await res.json();
            if (json.success) {
                setMissionTemplates(json.data || []);
            }
        } catch (err) {
            console.error("Failed to fetch mission templates:", err);
        } finally {
            setIsLoadingTemplates(false);
        }
    };

    const fetchAvailableTemplates = async () => {
        try {
            const res = await fetch("/api/email/templates?isShared=true");
            const json = await res.json();
            if (json.success) {
                // Filter out already assigned templates
                const assignedIds = missionTemplates.map(mt => mt.template.id);
                const available = (json.data || []).filter((t: EmailTemplate) => !assignedIds.includes(t.id));
                setAvailableTemplates(available);
            }
        } catch (err) {
            console.error("Failed to fetch available templates:", err);
        }
    };

    useEffect(() => {
        if (mission) {
            fetchMissionTemplates();
        }
    }, [mission?.id]);

    const handleAddTemplate = async () => {
        if (!mission || !selectedTemplateToAdd) return;
        setIsAddingTemplate(true);
        try {
            const res = await fetch(`/api/missions/${mission.id}/templates`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ templateId: selectedTemplateToAdd }),
            });
            const json = await res.json();
            if (json.success) {
                success("Template ajouté", "Le template a été assigné à la mission");
                setShowAddTemplateModal(false);
                setSelectedTemplateToAdd("");
                fetchMissionTemplates();
            } else {
                showError("Erreur", json.error);
            }
        } catch (err) {
            showError("Erreur", "Impossible d'ajouter le template");
        } finally {
            setIsAddingTemplate(false);
        }
    };

    const handleRemoveTemplate = async (templateId: string) => {
        if (!mission) return;
        setRemovingTemplateId(templateId);
        try {
            const res = await fetch(`/api/missions/${mission.id}/templates?templateId=${templateId}`, {
                method: "DELETE",
            });
            const json = await res.json();
            if (json.success) {
                success("Template retiré", "Le template a été retiré de la mission");
                fetchMissionTemplates();
            } else {
                showError("Erreur", json.error);
            }
        } catch (err) {
            showError("Erreur", "Impossible de retirer le template");
        } finally {
            setRemovingTemplateId(null);
        }
    };

    const handleCreateTemplate = async () => {
        if (!mission || !templateForm.name || !templateForm.subject || !templateForm.bodyHtml) return;
        setIsSavingTemplate(true);
        try {
            const res = await fetch(`/api/missions/${mission.id}/templates`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    createNew: true,
                    name: templateForm.name,
                    subject: templateForm.subject,
                    bodyHtml: templateForm.bodyHtml,
                    category: templateForm.category,
                }),
            });
            const json = await res.json();
            if (json.success) {
                success("Template créé", "Le template a été créé et assigné à la mission");
                setShowCreateTemplateModal(false);
                setTemplateForm({ name: "", subject: "", bodyHtml: "", category: "OUTREACH" });
                fetchMissionTemplates();
            } else {
                showError("Erreur", json.error);
            }
        } catch {
            showError("Erreur", "Impossible de créer le template");
        } finally {
            setIsSavingTemplate(false);
        }
    };

    const handleEditTemplate = async () => {
        if (!mission || !editingTemplate) return;
        setIsSavingTemplate(true);
        try {
            const res = await fetch(`/api/missions/${mission.id}/templates`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "update",
                    templateId: editingTemplate.id,
                    name: templateForm.name,
                    subject: templateForm.subject,
                    bodyHtml: templateForm.bodyHtml,
                    category: templateForm.category,
                }),
            });
            const json = await res.json();
            if (json.success) {
                success("Template mis à jour", "Les modifications ont été enregistrées");
                setShowEditTemplateModal(false);
                setEditingTemplate(null);
                fetchMissionTemplates();
            } else {
                showError("Erreur", json.error);
            }
        } catch {
            showError("Erreur", "Impossible de mettre à jour le template");
        } finally {
            setIsSavingTemplate(false);
        }
    };

    const handleDuplicateTemplate = async (templateId: string) => {
        if (!mission) return;
        setDuplicatingTemplateId(templateId);
        try {
            const res = await fetch(`/api/missions/${mission.id}/templates`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "duplicate", templateId }),
            });
            const json = await res.json();
            if (json.success) {
                success("Template dupliqué", "Une copie a été créée et assignée à la mission");
                fetchMissionTemplates();
            } else {
                showError("Erreur", json.error);
            }
        } catch {
            showError("Erreur", "Impossible de dupliquer le template");
        } finally {
            setDuplicatingTemplateId(null);
        }
    };

    const handleReorderTemplates = async (newTemplates: MissionTemplate[]) => {
        if (!mission) return;
        setMissionTemplates(newTemplates);
        try {
            await fetch(`/api/missions/${mission.id}/templates`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "reorder",
                    orders: newTemplates.map((mt, i) => ({ missionTemplateId: mt.id, order: i + 1 })),
                }),
            });
        } catch {
            // Silent reorder failure - list stays optimistically updated
        }
    };

    const handleDragStart = (index: number) => setDraggedTemplateIndex(index);

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedTemplateIndex === null || draggedTemplateIndex === index) return;
        const reordered = [...missionTemplates];
        const [moved] = reordered.splice(draggedTemplateIndex, 1);
        reordered.splice(index, 0, moved);
        setDraggedTemplateIndex(index);
        handleReorderTemplates(reordered);
    };

    const handleDragEnd = () => setDraggedTemplateIndex(null);

    const handleGenerateTemplateAi = async () => {
        if (!templateAiPrompt.trim() || isGeneratingTemplateAi) return;
        setIsGeneratingTemplateAi(true);
        try {
            const res = await fetch("/api/ai/mistral/email-template", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    instruction: templateAiPrompt,
                    subject: templateForm.subject || undefined,
                    category: templateForm.category,
                    missionName: mission?.name,
                    clientName: mission?.client?.name,
                    icp: campaignData?.icp || undefined,
                    pitch: campaignData?.pitch || undefined,
                    currentBody: templateForm.bodyHtml || undefined,
                }),
            });
            const json = await res.json();
            if (json.success && json.data?.bodyHtml) {
                setTemplateAiSuggestions(prev => [json.data.bodyHtml, ...prev.slice(0, 2)]);
                // If subject was suggested and current subject is empty, auto-fill
                if (json.data.suggestedSubject && !templateForm.subject) {
                    setTemplateForm(f => ({ ...f, subject: json.data.suggestedSubject }));
                }
            } else {
                showError("Erreur IA", json.error || "Impossible de générer le template");
            }
        } catch {
            showError("Erreur IA", "Erreur de connexion à Mistral AI");
        } finally {
            setIsGeneratingTemplateAi(false);
        }
    };

    // ============================================
    // TOGGLE ACTIVE STATUS
    // ============================================

    const toggleActive = async () => {
        if (!mission) return;
        const nextStatus = mission.status === "ACTIVE" ? "PAUSED" : "ACTIVE";

        setIsToggling(true);
        try {
            const res = await fetch(`/api/missions/${mission.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: nextStatus }),
            });

            const json = await res.json();

            if (json.success) {
                setMission(prev => prev ? { ...prev, status: nextStatus, isActive: nextStatus === "ACTIVE" } : null);
                success(
                    nextStatus === "PAUSED" ? "Mission mise en pause" : "Mission activée",
                    `${mission.name} est maintenant ${nextStatus === "ACTIVE" ? "active" : "en pause"}`
                );
            } else {
                showError("Erreur", json.error);
            }
        } catch (err) {
            showError("Erreur", "Impossible de modifier le statut");
        } finally {
            setIsToggling(false);
        }
    };

    const startPortalLaunch = async () => {
        if (!mission) return;
        setIsUpdatingPortalLaunch(true);
        try {
            const res = await fetch(`/api/missions/${mission.id}/portal-launch`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ days: portalLaunchDays }),
            });
            const json = await res.json();
            if (!json.success) {
                showError("Erreur", json.error || "Impossible de démarrer la mission");
                return;
            }
            setMission((prev) => prev ? { ...prev, ...json.data } : prev);
            setShowPortalLaunchModal(false);
            success(
                "Phase de démarrage activée",
                `Les portails afficheront l'écran de lancement pendant ${portalLaunchDays} jours.`
            );
        } catch {
            showError("Erreur", "Impossible de démarrer la phase de lancement");
        } finally {
            setIsUpdatingPortalLaunch(false);
        }
    };

    const revealPortalActivity = async () => {
        if (!mission) return;
        setIsUpdatingPortalLaunch(true);
        try {
            const res = await fetch(`/api/missions/${mission.id}/portal-launch`, {
                method: "DELETE",
            });
            const json = await res.json();
            if (!json.success) {
                showError("Erreur", json.error || "Impossible de publier les résultats");
                return;
            }
            setMission((prev) => prev ? { ...prev, ...json.data } : prev);
            setShowPortalLaunchModal(false);
            success("Résultats publiés", "Le client et les commerciaux voient maintenant l'activité.");
        } catch {
            showError("Erreur", "Impossible de publier les résultats");
        } finally {
            setIsUpdatingPortalLaunch(false);
        }
    };

    // ============================================
    // DELETE MISSION
    // ============================================

    const handleDelete = async () => {
        if (!mission) return;

        setIsDeleting(true);
        try {
            const res = await fetch(`/api/missions/${mission.id}`, {
                method: "DELETE",
            });

            const json = await res.json();

            if (json.success) {
                success("Mission supprimée", `${mission.name} a été supprimée`);
                router.push("/manager/missions");
            } else {
                showError("Erreur", json.error);
            }
        } catch (err) {
            showError("Erreur", "Impossible de supprimer la mission");
        } finally {
            setIsDeleting(false);
            setShowDeleteModal(false);
        }
    };

    const handleDeleteList = async () => {
        if (!listToDelete) return;

        setIsDeletingList(true);
        try {
            const res = await fetch(`/api/lists/${listToDelete.id}`, { method: "DELETE" });
            const json = await res.json();

            if (json.success) {
                success("Liste supprimée", `${listToDelete.name} a été supprimée`);
                setShowDeleteListModal(false);
                setListToDelete(null);
                fetchMission();
            } else {
                showError("Erreur", json.error || "Impossible de supprimer la liste");
            }
        } catch (err) {
            showError("Erreur", "Impossible de supprimer la liste");
        } finally {
            setIsDeletingList(false);
        }
    };

    const handleToggleListActive = async (list: Mission["lists"][0]) => {
        const nextActive = !(list.isActive !== false);
        setTogglingListId(list.id);
        try {
            const res = await fetch(`/api/lists/${list.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: nextActive }),
            });
            const json = await res.json();
            if (!json.success) {
                showError("Erreur", json.error || "Impossible de modifier l’état de la liste");
                return;
            }
            await fetchMission();
            success(
                nextActive ? "Liste activée" : "Liste désactivée",
                nextActive ? `"${list.name}" est de nouveau active.` : `"${list.name}" est désactivée pour cette mission.`
            );
        } catch (err) {
            console.error(err);
            showError("Erreur", "Impossible de modifier l’état de la liste");
        } finally {
            setTogglingListId(null);
        }
    };

    const listContextMenuItems = listMenuData
        ? [
            {
                label: "Supprimer",
                icon: <Trash2 className="w-4 h-4" />,
                onClick: () => {
                    setListToDelete(listMenuData);
                    setShowDeleteListModal(true);
                },
                variant: "danger" as const,
            },
        ]
        : [];

    // ============================================
    // LOADING STATE
    // ============================================

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                    <p className="text-sm text-slate-500">Chargement de la mission...</p>
                </div>
            </div>
        );
    }

    if (!mission) {
        return null;
    }

    const channelsList = mission.channels?.length ? mission.channels : [mission.channel];
    const channel = CHANNEL_CONFIG[mission.channel];
    const ChannelIcon = channel.icon;
    const isPortalLaunching = Boolean(
        mission.portalVisibleAt && new Date(mission.portalVisibleAt).getTime() > Date.now()
    );

    const dateRangeStr = mission.startDate
        ? `${new Date(mission.startDate).toLocaleDateString("fr-FR")} → ${mission.endDate ? new Date(mission.endDate).toLocaleDateString("fr-FR") : "En cours"}`
        : "—";

    return (
        <div className="space-y-6">
            {/* Compact header with inline stats */}
            <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-6 text-white">
                <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-wrap">
                        <Link
                            href="/manager/missions"
                            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors shrink-0"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </Link>
                        <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center text-lg font-bold shrink-0">
                            {mission.client?.name?.[0] || "M"}
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                <h1 className="text-xl font-bold">{mission.name}</h1>
                                <span className={mission.status === "ACTIVE" ? "mgr-badge-active" : "mgr-badge-paused"}>
                                    {MISSION_STATUS_CONFIG[mission.status]?.label ?? mission.status}
                                </span>
                                {channelsList.length === 1 ? (
                                    <span className={`mgr-channel-badge ${channel.className}`}>
                                        <ChannelIcon className="w-3 h-3" />
                                        {channel.label}
                                    </span>
                                ) : (
                                    channelsList.map((ch) => {
                                        const cfg = CHANNEL_CONFIG[ch];
                                        const Icon = cfg?.icon ?? ChannelIcon;
                                        return (
                                            <span key={ch} className={`mgr-channel-badge ${cfg?.className ?? channel.className}`}>
                                                <Icon className="w-3 h-3" />
                                                {cfg?.label ?? ch}
                                            </span>
                                        );
                                    })
                                )}
                            </div>
                            <p className="text-sm text-slate-400">
                                {mission._count.lists} liste{mission._count.lists !== 1 ? "s" : ""} · {mission.sdrAssignments.length} membre{mission.sdrAssignments.length !== 1 ? "s" : ""} · {dateRangeStr}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowPortalLaunchModal(true)}
                            className={cn(
                                "flex items-center gap-2 h-9 px-3 text-sm font-medium rounded-lg transition-colors",
                                isPortalLaunching
                                    ? "bg-amber-400 text-slate-950 hover:bg-amber-300"
                                    : "bg-emerald-500 text-white hover:bg-emerald-400"
                            )}
                        >
                            {isPortalLaunching ? <Clock3 className="w-4 h-4" /> : <Rocket className="w-4 h-4" />}
                            {isPortalLaunching ? "Démarrage en cours" : "Démarrer"}
                        </button>
                        <button
                            onClick={toggleActive}
                            disabled={isToggling}
                            className="flex items-center gap-2 h-9 px-3 text-sm font-medium bg-white/10 hover:bg-white/20 disabled:opacity-50 rounded-lg transition-colors"
                        >
                            {isToggling ? <Loader2 className="w-4 h-4 animate-spin" /> : mission.status === "ACTIVE" ? <PauseCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                            {mission.status === "ACTIVE" ? "Pause" : "Activer"}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowEditMissionDialog(true)}
                            className="flex items-center gap-2 h-9 px-3 text-sm font-medium bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                        >
                            <Edit className="w-4 h-4" />
                            Modifier
                        </button>
                        <button
                            onClick={() => setShowDeleteModal(true)}
                            className="flex items-center gap-2 h-9 px-3 text-sm font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {isPortalLaunching && mission.portalVisibleAt && (
                <div className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                            <EyeOff className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-amber-950">Activité masquée sur les portails</p>
                            <p className="mt-1 text-xs leading-5 text-amber-800">
                                Les SDR continuent de travailler normalement. Publication automatique le{" "}
                                {new Date(mission.portalVisibleAt).toLocaleDateString("fr-FR", {
                                    day: "numeric",
                                    month: "long",
                                    year: "numeric",
                                })}.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowPortalLaunchModal(true)}
                        className="h-9 shrink-0 rounded-lg border border-amber-300 bg-white px-4 text-xs font-bold text-amber-900 transition-colors hover:bg-amber-100"
                    >
                        Gérer la visibilité
                    </button>
                </div>
            )}


            {/* READINESS PANEL */}
            <ReadinessPanel
                readiness={mission.missionReadiness}
                onConfigureClick={() => setActiveTab("strategies")}
            />

            {/* TABS NAVIGATION */}
            <div className="mt-6 border-b border-slate-200">
                <Tabs
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    tabs={[
                        { id: "general", label: "Général", icon: <Activity className="w-4 h-4" /> },
                        { id: "strategies", label: "Stratégies par liste", icon: <Target className="w-4 h-4" /> },
                        { id: "strategy", label: "Stratégie & Scripts (avancé)", icon: <FileText className="w-4 h-4" /> },
                        { id: "audience", label: "BDD", icon: <Users className="w-4 h-4" /> },
                        { id: "feedback", label: "Avis SDR", icon: <MessageSquare className="w-4 h-4" /> },
                    ]}
                />
            </div>

            {/* TAB CONTENT */}
            <div className="mt-8">
                {activeTab === "general" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        {/* KPI Dashboard — Real Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                                        <Activity className="w-5 h-5 text-indigo-600" />
                                    </div>
                                    <span className="px-2 py-1 text-xs font-semibold text-slate-500 bg-slate-100 rounded-lg flex items-center gap-1">
                                        total
                                    </span>
                                </div>
                                <h3 className="text-2xl font-bold text-slate-900">{mission.stats?.totalActions ?? 0}</h3>
                                <p className="text-sm text-slate-500 font-medium">Actions réalisées</p>
                            </div>
                            <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                                        <Target className="w-5 h-5 text-emerald-600" />
                                    </div>
                                    <span className="px-2 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-lg flex items-center gap-1">
                                        <TrendingUp className="w-3 h-3" /> RDV
                                    </span>
                                </div>
                                <h3 className="text-2xl font-bold text-slate-900">{mission.stats?.meetingsBooked ?? 0}</h3>
                                <p className="text-sm text-slate-500 font-medium">Rendez-vous bookés</p>
                            </div>
                            <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                                        <BarChart3 className="w-5 h-5 text-violet-600" />
                                    </div>
                                    <span className="px-2 py-1 text-xs font-semibold text-violet-700 bg-violet-50 rounded-lg flex items-center gap-1">
                                        <TrendingUp className="w-3 h-3" /> Opps
                                    </span>
                                </div>
                                <h3 className="text-2xl font-bold text-slate-900">{mission.stats?.opportunities ?? 0}</h3>
                                <p className="text-sm text-slate-500 font-medium">Opportunités créées</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Infos mission */}
                            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                                <h2 className="text-lg font-semibold text-slate-900 mb-4">Infos mission</h2>
                                <dl className="space-y-3 text-sm">
                                    <div>
                                        <dt className="text-slate-500 font-medium">Canal</dt>
                                        <dd className="text-slate-900 flex items-center gap-2 mt-0.5">
                                            <ChannelIcon className="w-4 h-4 text-slate-500" />
                                            {channel.label}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-slate-500 font-medium">Client</dt>
                                        <dd className="text-slate-900 mt-0.5">{mission.client?.name ?? "—"}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-slate-500 font-medium">Commercial par défaut</dt>
                                        <dd className="mt-1">
                                            <select
                                                className="w-full max-w-xs rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                                                value={mission.defaultInterlocuteur?.id ?? ""}
                                                onChange={async (e) => {
                                                    const value = e.target.value || null;
                                                    try {
                                                        const res = await fetch(`/api/missions/${mission.id}`, {
                                                            method: "PUT",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify({ defaultInterlocuteurId: value }),
                                                        });
                                                        const json = await res.json();
                                                        if (!json.success) {
                                                            showError("Erreur", json.error || "Impossible de mettre à jour le commercial par défaut");
                                                            return;
                                                        }
                                                        await fetchMission();
                                                        success("Commercial mis à jour", "Le commercial par défaut de la mission a été mis à jour.");
                                                    } catch (err) {
                                                        console.error(err);
                                                        showError("Erreur", "Impossible de mettre à jour le commercial par défaut");
                                                    }
                                                }}
                                            >
                                                <option value="">Aucun (par liste uniquement)</option>
                                                {mission.client?.interlocuteurs?.map((it) => (
                                                    <option key={it.id} value={it.id}>
                                                        {it.firstName} {it.lastName}
                                                        {it.title ? ` — ${it.title}` : ""}
                                                    </option>
                                                ))}
                                            </select>
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-slate-500 font-medium">Début</dt>
                                        <dd className="text-slate-900 mt-0.5">
                                            {mission.startDate ? new Date(mission.startDate).toLocaleDateString("fr-FR") : "—"}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-slate-500 font-medium">Fin</dt>
                                        <dd className="text-slate-900 mt-0.5">
                                            {mission.endDate ? new Date(mission.endDate).toLocaleDateString("fr-FR") : "En cours"}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-slate-500 font-medium">Boîte mail par défaut</dt>
                                        <dd className="text-slate-900 mt-0.5 flex items-center gap-3">
                                            {isLoadingMailboxes ? (
                                                <span className="text-slate-400 text-sm">Chargement…</span>
                                            ) : mailboxes.length === 0 ? (
                                                <span className="text-slate-400 text-xs">
                                                    Aucune boîte mail disponible. Configurez-les dans{" "}
                                                    <a href="/manager/email/mailboxes" className="text-indigo-600 hover:underline">
                                                        Boîtes mail
                                                    </a>.
                                                </span>
                                            ) : (
                                                <>
                                                    <span className="text-sm">
                                                        {(() => {
                                                            if (!mission.defaultMailboxId) {
                                                                return "Hériter du client / choix SDR";
                                                            }
                                                            const mb = mailboxes.find(m => m.id === mission.defaultMailboxId);
                                                            if (!mb) return "Boîte mail introuvable";
                                                            return mb.displayName ? `${mb.displayName} <${mb.email}>` : mb.email;
                                                        })()}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowMailboxModal(true)}
                                                        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
                                                    >
                                                        Configurer…
                                                    </button>
                                                </>
                                            )}
                                        </dd>
                                    </div>
                                </dl>
                            </div>

                            {/* Statuts et workflow */}
                            <div className="space-y-6">
                                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Activity className="w-4 h-4 text-teal-500" />
                                            <h3 className="text-sm font-semibold text-slate-900">Statuts et workflow</h3>
                                        </div>
                                        <button
                                            onClick={() => setShowStatusWorkflowDrawer(true)}
                                            className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-teal-600 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors"
                                        >
                                            Gérer
                                            <ChevronRight className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Email accounts / mailboxes */}
                                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <Mail className="w-4 h-4 text-indigo-500" />
                                            <div>
                                                <h3 className="text-sm font-semibold text-slate-900">Comptes email</h3>
                                                <p className="text-xs text-slate-500">
                                                    {isLoadingMailboxes
                                                        ? "Chargement…"
                                                        : `${mailboxes.length} boîte${mailboxes.length > 1 ? "s" : ""} disponible${mailboxes.length > 1 ? "s" : ""}`}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setShowMailboxManager(true)}
                                            className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                                        >
                                            Gérer
                                            <ChevronRight className="w-3.5 h-3.5" />
                                        </button>
                                    </div>

                                    <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                                        {mailboxes.length === 0 ? (
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="text-xs text-slate-600">
                                                    Aucune boîte mail connectée. Connectez Gmail/Outlook ou configurez IMAP/SMTP.
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowMailboxManager(true)}
                                                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                                                >
                                                    Connecter
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="text-xs text-slate-600">
                                                    Boîte par défaut mission :{" "}
                                                    <span className="font-semibold text-slate-800">
                                                        {(() => {
                                                            if (!mission.defaultMailboxId) return "Hériter du client / choix SDR";
                                                            const mb = mailboxes.find((m) => m.id === mission.defaultMailboxId);
                                                            if (!mb) return "Introuvable";
                                                            return mb.displayName ? `${mb.displayName} <${mb.email}>` : mb.email;
                                                        })()}
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowMailboxModal(true)}
                                                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                                                >
                                                    Configurer
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "strategies" && (
                    <StrategyByListTab
                        missionId={mission.id}
                        lists={mission.lists}
                        campaigns={mission.campaigns}
                        onChange={fetchMission}
                    />
                )}

                {activeTab === "strategy" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        {/* Inline Strategy Editor */}
                        {mission.campaigns.length === 0 ? (
                            <div className="space-y-6">
                                {!isCreatingStrategy ? (
                                    <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">
                                        <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                                            <Target className="w-8 h-8 text-emerald-400" />
                                        </div>
                                        <p className="text-slate-900 font-semibold text-base mb-1">Aucune stratégie configurée</p>
                                        <p className="text-slate-500 text-sm mb-5">Créez une stratégie pour définir l&apos;ICP, le pitch et le script d&apos;appel de cette mission.</p>
                                        <button
                                            onClick={() => {
                                                setStrategyForm({ icp: "", pitch: "" });
                                                setBaseScript("");
                                                setIsCreatingStrategy(true);
                                            }}
                                            className="inline-flex items-center gap-2 h-10 px-5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm"
                                        >
                                            <Plus className="w-4 h-4" />
                                            Créer une stratégie
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        {/* ICP & Pitch — creation mode */}
                                        <div className="bg-white border border-emerald-200 rounded-2xl p-6 shadow-sm">
                                            <div className="flex items-center justify-between mb-5">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                                                        <Target className="w-5 h-5 text-emerald-600" />
                                                    </div>
                                                    <div>
                                                        <h2 className="text-lg font-semibold text-slate-900">Nouvelle stratégie</h2>
                                                        <p className="text-sm text-slate-500">Définissez l&apos;ICP et le pitch de prospection</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => setIsCreatingStrategy(false)}
                                                        className="h-9 px-4 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                                                    >
                                                        Annuler
                                                    </button>
                                                    <button
                                                        onClick={handleCreateStrategy}
                                                        disabled={isSavingStrategy}
                                                        className="flex items-center gap-2 h-9 px-4 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors"
                                                    >
                                                        {isSavingStrategy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                        Créer la stratégie
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-2">ICP (Profil Client Idéal)</label>
                                                    <textarea
                                                        value={strategyForm.icp}
                                                        onChange={(e) => setStrategyForm(prev => ({ ...prev, icp: e.target.value }))}
                                                        rows={3}
                                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none text-sm"
                                                        placeholder="Décrivez votre client idéal..."
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-2">Pitch</label>
                                                    <textarea
                                                        value={strategyForm.pitch}
                                                        onChange={(e) => setStrategyForm(prev => ({ ...prev, pitch: e.target.value }))}
                                                        rows={3}
                                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none text-sm"
                                                        placeholder="Votre message clé..."
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Script — creation mode */}
                                        <div className="bg-white border border-emerald-200 rounded-2xl p-6 shadow-sm">
                                            <div className="flex items-center gap-3 mb-5">
                                                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                                                    <Sparkles className="w-5 h-5 text-indigo-600" />
                                                </div>
                                                <div>
                                                    <h2 className="text-lg font-semibold text-slate-900">Script d&apos;appel</h2>
                                                    <p className="text-sm text-slate-500">Optionnel — vous pourrez le compléter plus tard</p>
                                                </div>
                                            </div>
                                            <textarea
                                                value={baseScript}
                                                onChange={(e) => setBaseScript(e.target.value)}
                                                rows={8}
                                                placeholder="Ajoutez un script de base unique..."
                                                className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none font-mono text-sm"
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : (
                            <>
                                {/* ICP & Pitch */}
                                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                                    <div className="flex items-center justify-between mb-5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                                                <Target className="w-5 h-5 text-emerald-600" />
                                            </div>
                                            <div>
                                                <h2 className="text-lg font-semibold text-slate-900">Cible & Message</h2>
                                                <p className="text-sm text-slate-500">ICP et pitch de prospection</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {isStrategyEditing ? (
                                                <>
                                                    <button
                                                        onClick={() => setIsStrategyEditing(false)}
                                                        className="h-9 px-4 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                                                    >
                                                        Annuler
                                                    </button>
                                                    <button
                                                        onClick={handleSaveStrategy}
                                                        disabled={isSavingStrategy}
                                                        className="flex items-center gap-2 h-9 px-4 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors"
                                                    >
                                                        {isSavingStrategy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                        Enregistrer
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    onClick={() => setIsStrategyEditing(true)}
                                                    className="flex items-center gap-2 h-9 px-4 text-sm font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                    Modifier
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-2">ICP (Profil Client Idéal)</label>
                                            {isStrategyEditing ? (
                                                <textarea
                                                    value={strategyForm.icp}
                                                    onChange={(e) => setStrategyForm(prev => ({ ...prev, icp: e.target.value }))}
                                                    rows={3}
                                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none text-sm"
                                                    placeholder="Décrivez votre client idéal..."
                                                />
                                            ) : (
                                                <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg min-h-[60px]">{campaignData?.icp || <span className="text-slate-400 italic">Non défini</span>}</p>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-2">Pitch</label>
                                            {isStrategyEditing ? (
                                                <textarea
                                                    value={strategyForm.pitch}
                                                    onChange={(e) => setStrategyForm(prev => ({ ...prev, pitch: e.target.value }))}
                                                    rows={3}
                                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none text-sm"
                                                    placeholder="Votre message clé..."
                                                />
                                            ) : (
                                                <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg min-h-[60px]">{campaignData?.pitch || <span className="text-slate-400 italic">Non défini</span>}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Script Editor */}
                                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                                    <div className="flex items-center justify-between mb-5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                                                <Sparkles className="w-5 h-5 text-indigo-600" />
                                            </div>
                                            <div>
                                                <h2 className="text-lg font-semibold text-slate-900">Script d'appel</h2>
                                                <p className="text-sm text-slate-500">Script unique (non divisé)</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {isStrategyEditing ? (
                                                <>
                                                    <button
                                                        onClick={generateWithMistral}
                                                        disabled={isGenerating || !strategyForm.icp || !strategyForm.pitch}
                                                        className="flex items-center gap-2 h-9 px-4 text-sm font-medium text-indigo-700 bg-gradient-to-r from-purple-50 to-indigo-50 border border-indigo-200 hover:from-purple-100 hover:to-indigo-100 disabled:opacity-50 rounded-lg transition-colors"
                                                    >
                                                        {isGenerating && generatingSection === "all" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                                                        Générer avec IA
                                                    </button>
                                                    <button
                                                        onClick={() => setIsStrategyEditing(false)}
                                                        className="h-9 px-4 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                                                    >
                                                        Annuler
                                                    </button>
                                                    <button
                                                        onClick={handleSaveStrategy}
                                                        disabled={isSavingStrategy}
                                                        className="flex items-center gap-2 h-9 px-4 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors"
                                                    >
                                                        {isSavingStrategy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                        Enregistrer
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button onClick={copyScript} className="flex items-center gap-2 h-9 px-3 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                                                        <Copy className="w-4 h-4" />
                                                        Copier
                                                    </button>
                                                    <button
                                                        onClick={() => setIsStrategyEditing(true)}
                                                        className="flex items-center gap-2 h-9 px-4 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                                                    >
                                                        <Edit className="w-4 h-4" />
                                                        Modifier
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <div className="flex flex-wrap items-center gap-3">
                                            <p className="text-sm font-medium text-slate-700">Onglet script par défaut (SDR)</p>
                                            <select
                                                value={defaultScriptTab}
                                                onChange={(e) => handleDefaultScriptTabChange(e.target.value as "base" | "additional" | "ai")}
                                                disabled={!isStrategyEditing || isSavingDefaultScriptTab}
                                                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                <option value="base">Script de base</option>
                                                <option value="additional">Script additionel</option>
                                                <option value="ai">Script amélioré par IA</option>
                                            </select>
                                            {isSavingDefaultScriptTab && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
                                        </div>
                                    </div>

                                    {isStrategyEditing ? (
                                        <div className="space-y-2">
                                            <textarea
                                                value={baseScript}
                                                onChange={(e) => setBaseScript(e.target.value)}
                                                rows={10}
                                                placeholder="Ajoutez un script de base unique..."
                                                className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none font-mono text-sm"
                                            />
                                        </div>
                                    ) : (
                                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 min-h-[180px]">
                                            {baseScript ? (
                                                <p className="text-sm text-slate-700 whitespace-pre-wrap">{baseScript}</p>
                                            ) : (
                                                <div className="text-center py-8 text-sm text-slate-400">
                                                    <Sparkles className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                                                    Aucun script de base
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                                    <div className="flex items-center justify-between mb-5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                                                <FileText className="w-5 h-5 text-violet-600" />
                                            </div>
                                            <div>
                                                <h2 className="text-lg font-semibold text-slate-900">Script additionel</h2>
                                                <p className="text-sm text-slate-500">Variante éditable et partageable à l'équipe</p>
                                            </div>
                                        </div>
                                    </div>
                                    {additionalScriptShared && !isStrategyEditing && (
                                        <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                                            <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-1">Version partagée</p>
                                            <p className="text-sm text-indigo-900 whitespace-pre-wrap">{additionalScriptShared}</p>
                                        </div>
                                    )}
                                    {isStrategyEditing ? (
                                        <div className="space-y-3">
                                            <textarea
                                                value={additionalScriptDraft}
                                                onChange={(e) => setAdditionalScriptDraft(e.target.value)}
                                                rows={9}
                                                placeholder="Ajoutez un script additionel partagé avec l'équipe..."
                                                className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none text-sm"
                                            />
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={handleSaveAdditionalScript}
                                                    disabled={isSavingAdditionalScript || isSharingAdditionalScript}
                                                    className="flex items-center gap-2 h-9 px-4 text-sm font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 disabled:opacity-50 rounded-lg transition-colors"
                                                >
                                                    {isSavingAdditionalScript ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                    Sauvegarder brouillon
                                                </button>
                                                <button
                                                    onClick={handleShareAdditionalScript}
                                                    disabled={isSavingAdditionalScript || isSharingAdditionalScript || !additionalScriptDraft.trim()}
                                                    className="flex items-center gap-2 h-9 px-4 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-lg transition-colors"
                                                >
                                                    {isSharingAdditionalScript ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                                                    Partager avec l'équipe
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 min-h-[140px]">
                                            {additionalScriptShared ? (
                                                <p className="text-sm text-slate-700 whitespace-pre-wrap">{additionalScriptShared}</p>
                                            ) : (
                                                <p className="text-sm text-slate-400 italic">Aucun script additionel partagé</p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                                    <div className="flex items-center justify-between mb-5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                                                <Sparkles className="w-5 h-5 text-emerald-600" />
                                            </div>
                                            <div>
                                                <h2 className="text-lg font-semibold text-slate-900">Script amélioré par IA</h2>
                                                <p className="text-sm text-slate-500">Version enrichie et partageable à l'équipe</p>
                                            </div>
                                        </div>
                                        {isStrategyEditing && (
                                            <button
                                                onClick={handleRefreshAiEnhancedScript}
                                                disabled={isRefreshingAiEnhancedScript}
                                                className="flex items-center gap-2 h-9 px-4 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 rounded-lg transition-colors"
                                            >
                                                {isRefreshingAiEnhancedScript ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                                                Régénérer via commentaires d'appels
                                            </button>
                                        )}
                                    </div>
                                    {aiGeneratedAt && (
                                        <p className="text-xs text-slate-500 mb-3">
                                            Dernière génération IA: {new Date(aiGeneratedAt).toLocaleString("fr-FR")}
                                        </p>
                                    )}
                                    {aiEnhancedScriptShared && !isStrategyEditing && (
                                        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                                            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1">Version partagée</p>
                                            <p className="text-sm text-emerald-900 whitespace-pre-wrap">{aiEnhancedScriptShared}</p>
                                        </div>
                                    )}
                                    {isStrategyEditing ? (
                                        <div className="space-y-3">
                                            <textarea
                                                value={aiEnhancedScriptDraft}
                                                onChange={(e) => setAiEnhancedScriptDraft(e.target.value)}
                                                rows={9}
                                                placeholder="Ajoutez une version du script améliorée par IA..."
                                                className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none text-sm"
                                            />
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={handleSaveAiEnhancedScript}
                                                    disabled={isSavingAiEnhancedScript || isSharingAiEnhancedScript}
                                                    className="flex items-center gap-2 h-9 px-4 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 rounded-lg transition-colors"
                                                >
                                                    {isSavingAiEnhancedScript ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                                    Sauvegarder brouillon
                                                </button>
                                                <button
                                                    onClick={handleShareAiEnhancedScript}
                                                    disabled={isSavingAiEnhancedScript || isSharingAiEnhancedScript || !aiEnhancedScriptDraft.trim()}
                                                    className="flex items-center gap-2 h-9 px-4 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors"
                                                >
                                                    {isSharingAiEnhancedScript ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                                                    Partager avec l'équipe
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 min-h-[140px]">
                                            {aiEnhancedScriptShared ? (
                                                <p className="text-sm text-slate-700 whitespace-pre-wrap">{aiEnhancedScriptShared}</p>
                                            ) : (
                                                <p className="text-sm text-slate-400 italic">Aucun script IA partagé</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {/* Email Templates */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm border-l-4 border-l-indigo-500">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center">
                                        <Mail className="w-5 h-5 text-indigo-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-semibold text-slate-900">Email Templates</h2>
                                        <p className="text-sm text-slate-500">Templates pour envoi rapide</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => {
                                            setTemplateForm({ name: "", subject: "", bodyHtml: "", category: "OUTREACH" });
                                            setTemplateModalTab("write");
                                            setTemplateAiPrompt("");
                                            setTemplateAiSuggestions([]);
                                            setShowCreateTemplateModal(true);
                                        }}
                                        className="flex items-center gap-2 h-9 px-4 text-sm font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Nouveau
                                    </button>
                                    <button
                                        onClick={() => {
                                            fetchAvailableTemplates();
                                            setShowAddTemplateModal(true);
                                        }}
                                        className="flex items-center gap-2 h-9 px-4 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                                    >
                                        <FileText className="w-4 h-4" />
                                        Existant
                                    </button>
                                </div>
                            </div>
                            {isLoadingTemplates ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                                </div>
                            ) : missionTemplates.length === 0 ? (
                                <p className="text-sm text-slate-500 mb-3">Aucun template.</p>
                            ) : (
                                <div className="grid gap-2">
                                    {missionTemplates.map((mt, index) => (
                                        <div
                                            key={mt.id}
                                            draggable
                                            onDragStart={() => handleDragStart(index)}
                                            onDragOver={(e) => handleDragOver(e, index)}
                                            onDragEnd={handleDragEnd}
                                            className={`group flex items-center gap-4 p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-grab active:cursor-grabbing ${draggedTemplateIndex === index ? "opacity-50 border-indigo-400 bg-indigo-50" : ""}`}
                                        >
                                            <div className="text-slate-300 hover:text-slate-500 flex-shrink-0 cursor-grab">
                                                <GripVertical className="w-4 h-4" />
                                            </div>
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center flex-shrink-0">
                                                <Sparkles className="w-5 h-5 text-white" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-slate-900 truncate text-sm">{mt.template.name}</p>
                                                <p className="text-xs text-slate-500 truncate">{mt.template.subject}</p>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => { setPreviewTemplate(mt.template); setShowPreviewModal(true); }}
                                                    className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                                                    title="Prévisualiser"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setEditingTemplate(mt.template);
                                                        setTemplateForm({ name: mt.template.name, subject: mt.template.subject, bodyHtml: mt.template.bodyHtml, category: mt.template.category });
                                                        setTemplateModalTab("write");
                                                        setTemplateAiPrompt("");
                                                        setTemplateAiSuggestions([]);
                                                        setShowEditTemplateModal(true);
                                                    }}
                                                    className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                                                    title="Modifier"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDuplicateTemplate(mt.template.id)}
                                                    disabled={duplicatingTemplateId === mt.template.id}
                                                    className="p-1.5 text-slate-500 hover:text-violet-600 hover:bg-violet-50 rounded-lg disabled:opacity-50"
                                                    title="Dupliquer"
                                                >
                                                    {duplicatingTemplateId === mt.template.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                                                </button>
                                                <button
                                                    onClick={() => handleRemoveTemplate(mt.template.id)}
                                                    disabled={removingTemplateId === mt.template.id}
                                                    className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                                                    title="Retirer"
                                                >
                                                    {removingTemplateId === mt.template.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {missionTemplates.length === 0 && (
                                <button
                                    onClick={() => {
                                        setTemplateForm({ name: "", subject: "", bodyHtml: "", category: "OUTREACH" });
                                        setTemplateModalTab("write");
                                        setTemplateAiPrompt("");
                                        setTemplateAiSuggestions([]);
                                        setShowCreateTemplateModal(true);
                                    }}
                                    className="inline-flex items-center gap-2 mt-2 text-sm font-medium text-indigo-600 hover:underline"
                                >
                                    <Plus className="w-4 h-4" />
                                    Créer votre premier template
                                </button>
                            )}
                        </div>
                    </div>
                )}


                {activeTab === "audience" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        {/* Listes de contacts */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                                        <ListIcon className="w-5 h-5 text-amber-600" />
                                    </div>
                                    <h2 className="text-lg font-semibold text-slate-900">Listes de contacts</h2>
                                </div>
                                <Link
                                    href={`/manager/lists/new?missionId=${mission.id}`}
                                    className="flex items-center gap-2 h-9 px-4 text-sm font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"
                                >
                                    <ListIcon className="w-4 h-4" />
                                    Nouvelle
                                </Link>
                            </div>
                            {mission.lists.length === 0 ? (
                                <p className="text-sm text-slate-500">Aucune liste</p>
                            ) : (
                                <div className="space-y-2">
                                    {/* Bulk assign commercial to all lists */}
                                    <div className="flex items-center justify-between mb-1">
                                        <p className="text-xs text-slate-500">
                                            Assigner un commercial à chaque liste pour router les RDV côté client. Les SDR ne voient que les listes actives. Pour qu’un contact ou une société apparaisse dans la file d’actions : mission avec au moins une campagne active, et contacts avec téléphone / email / LinkedIn selon le canal (ou société avec téléphone pour l’appel si aucun contact éligible).
                                        </p>
                                        <button
                                            type="button"
                                            className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
                                            onClick={async () => {
                                                if (!mission.client?.interlocuteurs || mission.client.interlocuteurs.length === 0) return;
                                                const first = mission.client.interlocuteurs[0];
                                                try {
                                                    await Promise.all(
                                                        mission.lists.map((list) =>
                                                            fetch(`/api/lists/${list.id}`, {
                                                                method: "PATCH",
                                                                headers: { "Content-Type": "application/json" },
                                                                body: JSON.stringify({ commercialInterlocuteurId: first.id }),
                                                            })
                                                        )
                                                    );
                                                    await fetchMission();
                                                    success("Commerciaux assignés", "Toutes les listes utilisent maintenant ce commercial.");
                                                } catch (err) {
                                                    console.error(err);
                                                    showError("Erreur", "Impossible d’assigner le commercial à toutes les listes");
                                                }
                                            }}
                                        >
                                            Assigner le premier commercial à toutes les listes
                                        </button>
                                    </div>
                                    {mission.lists.map((list) => {
                                        const isListActive = list.isActive !== false;
                                        return (
                                        <div
                                            key={list.id}
                                            className="relative"
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                handleListContextMenu(e, list);
                                            }}
                                        >
                                            <div className={`mgr-mission-card group flex items-center gap-4 p-4 ${!isListActive ? "opacity-70 bg-slate-50" : ""}`}>
                                                <Link
                                                    href={`/manager/lists/${list.id}`}
                                                    className="flex items-center gap-4 flex-1 min-w-0"
                                                >
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform ${isListActive ? "bg-amber-100" : "bg-slate-200"}`}>
                                                        <ListIcon className={`w-5 h-5 ${isListActive ? "text-amber-600" : "text-slate-500"}`} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className={`font-medium truncate transition-colors ${isListActive ? "text-slate-900 group-hover:text-indigo-600" : "text-slate-500"}`}>
                                                            {list.name}
                                                        </p>
                                                        <p className="text-sm text-slate-500">
                                                            {list._count?.companies || 0} sociétés · {Array.isArray((list as any).companies)
                                                                ? (list as any).companies.reduce(
                                                                    (acc: number, c: { _count?: { contacts?: number } }) =>
                                                                        acc + (c._count?.contacts || 0),
                                                                    0
                                                                )
                                                                : 0} contacts
                                                        </p>
                                                    </div>
                                                </Link>
                                                {!isListActive && (
                                                    <span className="text-xs font-medium text-slate-500 px-2 py-1 bg-slate-200 rounded">
                                                        Désactivée
                                                    </span>
                                                )}
                                                {(() => {
                                                    const r = list.readiness;
                                                    if (!r) return null;
                                                    if (!r.hasStrategy) {
                                                        return (
                                                            <span
                                                                className="text-xs font-medium text-amber-700 px-2 py-1 bg-amber-50 border border-amber-200 rounded"
                                                                title="Cette liste n'a pas de stratégie/script liée"
                                                            >
                                                                Sans stratégie
                                                            </span>
                                                        );
                                                    }
                                                    if (r.isReady) {
                                                        return (
                                                            <span
                                                                className="text-xs font-medium text-emerald-700 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded"
                                                                title={`Stratégie: ${list.campaign?.name ?? ""}`}
                                                            >
                                                                Stratégie prête
                                                            </span>
                                                        );
                                                    }
                                                    const missing: string[] = [];
                                                    if (!r.hasIcp) missing.push("ICP");
                                                    if (!r.hasPitch) missing.push("pitch");
                                                    if (!r.hasScript) missing.push("script");
                                                    return (
                                                        <span
                                                            className="text-xs font-medium text-sky-700 px-2 py-1 bg-sky-50 border border-sky-200 rounded"
                                                            title={`Stratégie: ${list.campaign?.name ?? ""}`}
                                                        >
                                                            {`Manque ${missing.join(", ")}`}
                                                        </span>
                                                    );
                                                })()}
                                                <button
                                                    type="button"
                                                    disabled={togglingListId === list.id}
                                                    onClick={() => handleToggleListActive(list)}
                                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isListActive ? "text-slate-600 border-slate-200 bg-white hover:bg-slate-50" : "text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100"}`}
                                                    title={isListActive ? "Désactiver la liste pour cette mission" : "Activer la liste"}
                                                >
                                                    {togglingListId === list.id ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : isListActive ? (
                                                        "Désactiver"
                                                    ) : (
                                                        "Activer"
                                                    )}
                                                </button>
                                                <span className="text-xs font-medium text-slate-500 px-2 py-1 bg-slate-100 rounded">
                                                    {list.type}
                                                </span>
                                                {/* Per-list commercial selector */}
                                                <select
                                                    className="ml-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                                                    value={list.commercialInterlocuteurId ?? ""}
                                                    onChange={async (e) => {
                                                        const value = e.target.value || null;
                                                        try {
                                                            const res = await fetch(`/api/lists/${list.id}`, {
                                                                method: "PATCH",
                                                                headers: { "Content-Type": "application/json" },
                                                                body: JSON.stringify({ commercialInterlocuteurId: value }),
                                                            });
                                                            const json = await res.json();
                                                            if (!json.success) {
                                                                showError("Erreur", json.error || "Impossible de mettre à jour le commercial de la liste");
                                                                return;
                                                            }
                                                            await fetchMission();
                                                            success("Commercial mis à jour", `Commercial mis à jour pour la liste "${list.name}".`);
                                                        } catch (err) {
                                                            console.error(err);
                                                            showError("Erreur", "Impossible de mettre à jour le commercial de la liste");
                                                        }
                                                    }}
                                                >
                                                    <option value="">{mission.defaultInterlocuteur ? "Hériter de la mission" : "Aucun"}</option>
                                                    {mission.client?.interlocuteurs?.map((it) => (
                                                        <option key={it.id} value={it.id}>
                                                            {it.firstName} {it.lastName}
                                                            {it.title ? ` — ${it.title}` : ""}
                                                        </option>
                                                    ))}
                                                </select>
                                                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
                                            </div>
                                        </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                    </div>
                )}

                {activeTab === "feedback" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-900">Feedback SDR mission</h2>
                                    <p className="text-sm text-slate-500">
                                        Retours des SDR assignés ayant sélectionné cette mission.
                                    </p>
                                </div>
                                <div className="flex items-end gap-2">
                                    <div>
                                        <label className="block text-[11px] text-slate-500 mb-1">Du</label>
                                        <input
                                            type="date"
                                            value={feedbackFrom}
                                            onChange={(e) => setFeedbackFrom(e.target.value)}
                                            className="h-9 px-2.5 rounded-lg border border-slate-200 text-xs bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] text-slate-500 mb-1">Au</label>
                                        <input
                                            type="date"
                                            value={feedbackTo}
                                            onChange={(e) => setFeedbackTo(e.target.value)}
                                            className="h-9 px-2.5 rounded-lg border border-slate-200 text-xs bg-white"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => void fetchMissionFeedback()}
                                        className="h-9 px-3 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
                                    >
                                        Actualiser
                                    </button>
                                </div>
                            </div>

                            {feedbackLoading ? (
                                <div className="py-16 flex items-center justify-center">
                                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                                </div>
                            ) : feedbackItems.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
                                    <p className="text-sm font-medium text-slate-700">Aucun avis SDR sur cette période</p>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Les retours apparaîtront ici dès la première soumission.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/60">
                                            <p className="text-[11px] text-slate-500">Nombre d'avis</p>
                                            <p className="text-2xl font-bold text-slate-900">{feedbackItems.length}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/60">
                                            <p className="text-[11px] text-slate-500">Score moyen</p>
                                            <p className="text-2xl font-bold text-slate-900">
                                                {(feedbackItems.reduce((sum, item) => sum + item.score, 0) / feedbackItems.length).toFixed(1)} / 5
                                            </p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/60">
                                            <p className="text-[11px] text-slate-500">Avec objections</p>
                                            <p className="text-2xl font-bold text-slate-900">
                                                {feedbackItems.filter((item) => !!item.objections?.trim()).length}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        {feedbackItems.map((item) => (
                                            <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <p className="text-sm font-semibold text-slate-900">{item.sdr.name}</p>
                                                    <span className="text-slate-300">•</span>
                                                    <p className="text-xs text-slate-500">
                                                        {new Date(item.submittedAt).toLocaleString("fr-FR")}
                                                    </p>
                                                    <span className={cn(
                                                        "ml-auto px-2 py-0.5 rounded-full text-[11px] font-semibold",
                                                        item.score >= 4
                                                            ? "bg-emerald-50 text-emerald-700"
                                                            : item.score >= 3
                                                              ? "bg-amber-50 text-amber-700"
                                                              : "bg-red-50 text-red-700",
                                                    )}>
                                                        {item.score}/5
                                                    </span>
                                                </div>
                                                <p className="text-sm text-slate-800 whitespace-pre-wrap">{item.review}</p>
                                                {item.objections && (
                                                    <p className="text-xs text-slate-600 mt-2">
                                                        <span className="font-semibold text-slate-800">Objections:</span>{" "}
                                                        {item.objections}
                                                    </p>
                                                )}
                                                {item.missionComment && (
                                                    <p className="text-xs text-slate-600 mt-1">
                                                        <span className="font-semibold text-slate-800">Commentaire mission:</span>{" "}
                                                        {item.missionComment}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Create Template Modal */}
            {showCreateTemplateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowCreateTemplateModal(false)} />
                    <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-emerald-600 to-teal-600 flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                                    <Plus className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-white">Nouveau template</h2>
                                    <p className="text-xs text-white/70">Créez et assignez un template email à cette mission</p>
                                </div>
                            </div>
                            <button onClick={() => setShowCreateTemplateModal(false)} className="p-2 rounded-lg hover:bg-white/20 text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Tab bar */}
                        <div className="flex gap-1 px-6 pt-3 pb-0 border-b border-slate-200 bg-white flex-shrink-0">
                            {(["write", "preview", "ai"] as const).map((tab) => {
                                const labels = { write: "✏️ Éditeur", preview: "👁 Prévisualisation", ai: "✨ IA Mistral" };
                                return (
                                    <button
                                        key={tab}
                                        onClick={() => setTemplateModalTab(tab)}
                                        className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-all ${templateModalTab === tab ? "text-emerald-700 border-emerald-600 bg-emerald-50/60" : "text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-50"}`}
                                    >
                                        {labels[tab]}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto">
                            {/* ── WRITE TAB ── */}
                            {templateModalTab === "write" && (
                                <div className="p-6 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Nom du template <span className="text-red-500">*</span></label>
                                            <input type="text" value={templateForm.name} onChange={(e) => setTemplateForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Introduction prospect chaud" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Catégorie</label>
                                            <select value={templateForm.category} onChange={(e) => setTemplateForm(f => ({ ...f, category: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                                                <option value="OUTREACH">Outreach</option>
                                                <option value="FOLLOW_UP">Follow-up</option>
                                                <option value="NURTURE">Nurture</option>
                                                <option value="CLOSING">Closing</option>
                                                <option value="OTHER">Autre</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Objet de l&apos;email <span className="text-red-500">*</span></label>
                                        <input type="text" value={templateForm.subject} onChange={(e) => setTemplateForm(f => ({ ...f, subject: e.target.value }))} placeholder="Ex: À propos de {{company}}" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                                    </div>
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <label className="block text-sm font-medium text-slate-700">Contenu HTML <span className="text-red-500">*</span></label>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-slate-400">Variables : </span>
                                                {["{{firstName}}", "{{company}}", "{{fullName}}"].map(v => (
                                                    <button key={v} onClick={() => setTemplateForm(f => ({ ...f, bodyHtml: f.bodyHtml + v }))} className="text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200 font-mono transition-colors">
                                                        {v}
                                                    </button>
                                                ))}
                                                <button
                                                    onClick={() => setTemplateModalTab("preview")}
                                                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 px-2 py-0.5 rounded border border-slate-200 transition-colors"
                                                >
                                                    <Eye className="w-3.5 h-3.5" /> Prévisualiser
                                                </button>
                                            </div>
                                        </div>
                                        <textarea
                                            value={templateForm.bodyHtml}
                                            onChange={(e) => setTemplateForm(f => ({ ...f, bodyHtml: e.target.value }))}
                                            rows={14}
                                            placeholder="<p>Bonjour {{firstName}},</p>&#10;<p>Je me permets de vous contacter au sujet de...</p>"
                                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* ── PREVIEW TAB ── */}
                            {templateModalTab === "preview" && (
                                <div className="p-6">
                                    <div className="mb-3 flex items-center gap-2">
                                        <Eye className="w-4 h-4 text-slate-500" />
                                        <span className="text-sm font-medium text-slate-700">Aperçu de l&apos;email</span>
                                        <span className="text-xs text-slate-400 ml-2">Les variables sont affichées telles quelles</span>
                                    </div>
                                    {templateForm.subject && (
                                        <div className="mb-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Objet : </span>
                                            <span className="text-sm font-medium text-slate-800">{templateForm.subject}</span>
                                        </div>
                                    )}
                                    {templateForm.bodyHtml ? (
                                        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                            <div className="bg-gradient-to-r from-slate-100 to-slate-50 px-4 py-2 border-b border-slate-200 flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full bg-red-400" />
                                                <div className="w-3 h-3 rounded-full bg-amber-400" />
                                                <div className="w-3 h-3 rounded-full bg-emerald-400" />
                                                <span className="text-xs text-slate-400 ml-2">Aperçu email</span>
                                            </div>
                                            <div className="bg-white p-6">
                                                <div
                                                    className="prose prose-sm max-w-none"
                                                    style={{ fontFamily: "Arial, sans-serif", fontSize: "15px", lineHeight: "1.6" }}
                                                    dangerouslySetInnerHTML={{ __html: templateForm.bodyHtml }}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl">
                                            <Eye className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                                            <p className="text-sm text-slate-500">Rédigez le contenu HTML dans l&apos;onglet <strong>Éditeur</strong> pour voir l&apos;aperçu</p>
                                            <button onClick={() => setTemplateModalTab("write")} className="mt-3 text-xs text-indigo-600 hover:underline">Aller à l&apos;éditeur →</button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── AI TAB ── */}
                            {templateModalTab === "ai" && (
                                <div className="p-6 space-y-5">
                                    {/* AI context summary */}
                                    {(mission?.name || campaignData?.icp) && (
                                        <div className="flex flex-wrap gap-2 p-3 bg-violet-50 border border-violet-200 rounded-xl">
                                            <span className="text-xs font-medium text-violet-700">Contexte automatique :</span>
                                            {mission?.name && <span className="text-xs bg-white text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full">Mission : {mission.name}</span>}
                                            {mission?.client?.name && <span className="text-xs bg-white text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full">Client : {mission.client.name}</span>}
                                            {campaignData?.icp && <span className="text-xs bg-white text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full">ICP défini</span>}
                                            {campaignData?.pitch && <span className="text-xs bg-white text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full">Pitch défini</span>}
                                        </div>
                                    )}

                                    {/* Quick prompts */}
                                    <div>
                                        <p className="text-sm font-medium text-slate-700 mb-2">Suggestions rapides</p>
                                        <div className="flex flex-wrap gap-2">
                                            {[
                                                "Rédige un email de prospection court et percutant pour un premier contact",
                                                "Génère un email de follow-up chaleureux pour relancer un prospect sans réponse",
                                                "Crée un email de closing avec un CTA clair pour fixer un rendez-vous",
                                                "Rédige un email de nurture avec de la valeur ajoutée et un contenu informatif",
                                                "Améliore et reformule l'email actuel pour le rendre plus professionnel et engageant",
                                            ].map((p) => (
                                                <button
                                                    key={p}
                                                    onClick={() => setTemplateAiPrompt(p)}
                                                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${templateAiPrompt === p ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-400 hover:text-violet-600"}`}
                                                >
                                                    {p.length > 55 ? p.slice(0, 55) + "…" : p}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Prompt input */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Votre instruction <span className="text-red-500">*</span></label>
                                        <div className="flex gap-2">
                                            <textarea
                                                value={templateAiPrompt}
                                                onChange={(e) => setTemplateAiPrompt(e.target.value)}
                                                rows={3}
                                                placeholder="Ex: Rédige un email de prospection B2B court et percutant pour présenter notre solution à des directeurs commerciaux..."
                                                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                                                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerateTemplateAi(); }}
                                            />
                                            <button
                                                onClick={handleGenerateTemplateAi}
                                                disabled={!templateAiPrompt.trim() || isGeneratingTemplateAi}
                                                className="flex flex-col items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-br from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 rounded-xl disabled:opacity-50 transition-all min-w-[80px]"
                                            >
                                                {isGeneratingTemplateAi ? (
                                                    <><Loader2 className="w-4 h-4 animate-spin" /><span className="text-[11px]">Génère…</span></>
                                                ) : (
                                                    <><Sparkles className="w-4 h-4" /><span className="text-[11px]">Générer</span></>
                                                )}
                                            </button>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-1">Ctrl+Entrée pour générer · Le contexte de la mission est automatiquement inclus</p>
                                    </div>

                                    {/* Suggestions */}
                                    {templateAiSuggestions.length > 0 && (
                                        <div className="space-y-3">
                                            <p className="text-sm font-medium text-slate-700">Résultats générés — cliquez sur <strong>Utiliser</strong> pour l&apos;appliquer à l&apos;éditeur :</p>
                                            {templateAiSuggestions.map((html, idx) => (
                                                <div key={idx} className="border border-slate-200 rounded-xl overflow-hidden">
                                                    <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200">
                                                        <span className="text-xs font-semibold text-slate-600">Version {templateAiSuggestions.length - idx}</span>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    setTemplateForm(f => ({ ...f, bodyHtml: html }));
                                                                    setTemplateModalTab("write");
                                                                    success("Appliqué", "Le contenu généré a été appliqué à l'éditeur");
                                                                }}
                                                                className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1 rounded-lg border border-emerald-200 transition-colors"
                                                            >
                                                                <CheckCircle2 className="w-3 h-3" /> Utiliser
                                                            </button>
                                                            <button
                                                                onClick={() => setTemplateModalTab("preview")}
                                                                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 px-2 py-1 rounded-lg hover:bg-indigo-50 border border-slate-200 transition-colors"
                                                                title="Prévisualiser dans l'onglet preview"
                                                            >
                                                                <Eye className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div
                                                        className="p-4 bg-white prose prose-sm max-w-none text-sm"
                                                        style={{ fontFamily: "Arial, sans-serif", fontSize: "14px", lineHeight: "1.6", maxHeight: "220px", overflowY: "auto" }}
                                                        dangerouslySetInnerHTML={{ __html: html }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {templateAiSuggestions.length === 0 && !isGeneratingTemplateAi && (
                                        <div className="text-center py-10 border-2 border-dashed border-violet-200 rounded-xl bg-violet-50/30">
                                            <Sparkles className="w-10 h-10 text-violet-300 mx-auto mb-3" />
                                            <p className="text-sm font-medium text-slate-600">L&apos;IA va générer un email HTML professionnel</p>
                                            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">Elle utilise automatiquement le contexte de la mission, du client, de l&apos;ICP et du pitch définis</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex justify-between items-center gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
                            <div className="text-xs text-slate-400">
                                {templateModalTab === "write" && templateForm.bodyHtml && (
                                    <button onClick={() => setTemplateModalTab("preview")} className="text-indigo-500 hover:underline flex items-center gap-1">
                                        <Eye className="w-3 h-3" /> Voir l&apos;aperçu
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                <button onClick={() => setShowCreateTemplateModal(false)} className="px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition-colors">
                                    Annuler
                                </button>
                                <button
                                    onClick={handleCreateTemplate}
                                    disabled={!templateForm.name || !templateForm.subject || !templateForm.bodyHtml || isSavingTemplate}
                                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-lg disabled:opacity-50 transition-all shadow-sm"
                                >
                                    {isSavingTemplate ? <><Loader2 className="w-4 h-4 animate-spin" />Création...</> : <><Plus className="w-4 h-4" />Créer et assigner</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Template Modal */}
            {showEditTemplateModal && editingTemplate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowEditTemplateModal(false)} />
                    <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-600 to-indigo-600 flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                                    <Pencil className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-white">Modifier le template</h2>
                                    <p className="text-xs text-white/70 truncate max-w-[300px]">{editingTemplate.name}</p>
                                </div>
                            </div>
                            <button onClick={() => setShowEditTemplateModal(false)} className="p-2 rounded-lg hover:bg-white/20 text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Tab bar */}
                        <div className="flex gap-1 px-6 pt-3 pb-0 border-b border-slate-200 bg-white flex-shrink-0">
                            {(["write", "preview", "ai"] as const).map((tab) => {
                                const labels = { write: "✏️ Éditeur", preview: "👁 Prévisualisation", ai: "✨ IA Mistral" };
                                return (
                                    <button
                                        key={tab}
                                        onClick={() => setTemplateModalTab(tab)}
                                        className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-all ${templateModalTab === tab ? "text-blue-700 border-blue-600 bg-blue-50/60" : "text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-50"}`}
                                    >
                                        {labels[tab]}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto">
                            {/* ── WRITE TAB ── */}
                            {templateModalTab === "write" && (
                                <div className="p-6 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Nom du template</label>
                                            <input type="text" value={templateForm.name} onChange={(e) => setTemplateForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Catégorie</label>
                                            <select value={templateForm.category} onChange={(e) => setTemplateForm(f => ({ ...f, category: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                                                <option value="OUTREACH">Outreach</option>
                                                <option value="FOLLOW_UP">Follow-up</option>
                                                <option value="NURTURE">Nurture</option>
                                                <option value="CLOSING">Closing</option>
                                                <option value="OTHER">Autre</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Objet de l&apos;email</label>
                                        <input type="text" value={templateForm.subject} onChange={(e) => setTemplateForm(f => ({ ...f, subject: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                    </div>
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <label className="block text-sm font-medium text-slate-700">Contenu HTML</label>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-slate-400">Variables : </span>
                                                {["{{firstName}}", "{{company}}", "{{fullName}}"].map(v => (
                                                    <button key={v} onClick={() => setTemplateForm(f => ({ ...f, bodyHtml: f.bodyHtml + v }))} className="text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200 font-mono transition-colors">
                                                        {v}
                                                    </button>
                                                ))}
                                                <button
                                                    onClick={() => setTemplateModalTab("preview")}
                                                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 px-2 py-0.5 rounded border border-slate-200 transition-colors"
                                                >
                                                    <Eye className="w-3.5 h-3.5" /> Prévisualiser
                                                </button>
                                            </div>
                                        </div>
                                        <textarea
                                            value={templateForm.bodyHtml}
                                            onChange={(e) => setTemplateForm(f => ({ ...f, bodyHtml: e.target.value }))}
                                            rows={14}
                                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* ── PREVIEW TAB ── */}
                            {templateModalTab === "preview" && (
                                <div className="p-6">
                                    <div className="mb-3 flex items-center gap-2">
                                        <Eye className="w-4 h-4 text-slate-500" />
                                        <span className="text-sm font-medium text-slate-700">Aperçu de l&apos;email</span>
                                        <span className="text-xs text-slate-400 ml-2">Les variables sont affichées telles quelles</span>
                                    </div>
                                    {templateForm.subject && (
                                        <div className="mb-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Objet : </span>
                                            <span className="text-sm font-medium text-slate-800">{templateForm.subject}</span>
                                        </div>
                                    )}
                                    {templateForm.bodyHtml ? (
                                        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                            <div className="bg-gradient-to-r from-slate-100 to-slate-50 px-4 py-2 border-b border-slate-200 flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full bg-red-400" />
                                                <div className="w-3 h-3 rounded-full bg-amber-400" />
                                                <div className="w-3 h-3 rounded-full bg-emerald-400" />
                                                <span className="text-xs text-slate-400 ml-2">Aperçu email</span>
                                            </div>
                                            <div className="bg-white p-6">
                                                <div
                                                    className="prose prose-sm max-w-none"
                                                    style={{ fontFamily: "Arial, sans-serif", fontSize: "15px", lineHeight: "1.6" }}
                                                    dangerouslySetInnerHTML={{ __html: templateForm.bodyHtml }}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl">
                                            <Eye className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                                            <p className="text-sm text-slate-500">Rédigez le contenu HTML dans l&apos;onglet <strong>Éditeur</strong> pour voir l&apos;aperçu</p>
                                            <button onClick={() => setTemplateModalTab("write")} className="mt-3 text-xs text-indigo-600 hover:underline">Aller à l&apos;éditeur →</button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── AI TAB ── */}
                            {templateModalTab === "ai" && (
                                <div className="p-6 space-y-5">
                                    {/* AI context summary */}
                                    {(mission?.name || campaignData?.icp) && (
                                        <div className="flex flex-wrap gap-2 p-3 bg-violet-50 border border-violet-200 rounded-xl">
                                            <span className="text-xs font-medium text-violet-700">Contexte automatique :</span>
                                            {mission?.name && <span className="text-xs bg-white text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full">Mission : {mission.name}</span>}
                                            {mission?.client?.name && <span className="text-xs bg-white text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full">Client : {mission.client.name}</span>}
                                            {campaignData?.icp && <span className="text-xs bg-white text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full">ICP défini</span>}
                                            {campaignData?.pitch && <span className="text-xs bg-white text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full">Pitch défini</span>}
                                        </div>
                                    )}

                                    {/* Quick prompts */}
                                    <div>
                                        <p className="text-sm font-medium text-slate-700 mb-2">Suggestions rapides</p>
                                        <div className="flex flex-wrap gap-2">
                                            {[
                                                "Améliore et reformule l'email actuel pour le rendre plus professionnel et engageant",
                                                "Rédige un email de prospection court et percutant pour un premier contact",
                                                "Génère un email de follow-up chaleureux pour relancer un prospect sans réponse",
                                                "Crée un email de closing avec un CTA clair pour fixer un rendez-vous",
                                                "Simplifie et raccourcis l'email actuel tout en conservant le message clé",
                                            ].map((p) => (
                                                <button
                                                    key={p}
                                                    onClick={() => setTemplateAiPrompt(p)}
                                                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${templateAiPrompt === p ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-400 hover:text-violet-600"}`}
                                                >
                                                    {p.length > 55 ? p.slice(0, 55) + "…" : p}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Prompt input */}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Votre instruction <span className="text-red-500">*</span></label>
                                        <div className="flex gap-2">
                                            <textarea
                                                value={templateAiPrompt}
                                                onChange={(e) => setTemplateAiPrompt(e.target.value)}
                                                rows={3}
                                                placeholder="Ex: Améliore cet email en le rendant plus percutant et en ajoutant un CTA clair..."
                                                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                                                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerateTemplateAi(); }}
                                            />
                                            <button
                                                onClick={handleGenerateTemplateAi}
                                                disabled={!templateAiPrompt.trim() || isGeneratingTemplateAi}
                                                className="flex flex-col items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-br from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 rounded-xl disabled:opacity-50 transition-all min-w-[80px]"
                                            >
                                                {isGeneratingTemplateAi ? (
                                                    <><Loader2 className="w-4 h-4 animate-spin" /><span className="text-[11px]">Génère…</span></>
                                                ) : (
                                                    <><Sparkles className="w-4 h-4" /><span className="text-[11px]">Générer</span></>
                                                )}
                                            </button>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-1">Ctrl+Entrée pour générer · L&apos;email existant est transmis à l&apos;IA comme base</p>
                                    </div>

                                    {/* Suggestions */}
                                    {templateAiSuggestions.length > 0 && (
                                        <div className="space-y-3">
                                            <p className="text-sm font-medium text-slate-700">Résultats générés — cliquez sur <strong>Utiliser</strong> pour l&apos;appliquer à l&apos;éditeur :</p>
                                            {templateAiSuggestions.map((html, idx) => (
                                                <div key={idx} className="border border-slate-200 rounded-xl overflow-hidden">
                                                    <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200">
                                                        <span className="text-xs font-semibold text-slate-600">Version {templateAiSuggestions.length - idx}</span>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    setTemplateForm(f => ({ ...f, bodyHtml: html }));
                                                                    setTemplateModalTab("write");
                                                                    success("Appliqué", "Le contenu généré a été appliqué à l'éditeur");
                                                                }}
                                                                className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1 rounded-lg border border-emerald-200 transition-colors"
                                                            >
                                                                <CheckCircle2 className="w-3 h-3" /> Utiliser
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setTemplateForm(f => ({ ...f, bodyHtml: html }));
                                                                    setTemplateModalTab("preview");
                                                                }}
                                                                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 px-2 py-1 rounded-lg hover:bg-indigo-50 border border-slate-200 transition-colors"
                                                            >
                                                                <Eye className="w-3 h-3" /> Aperçu
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div
                                                        className="p-4 bg-white prose prose-sm max-w-none text-sm"
                                                        style={{ fontFamily: "Arial, sans-serif", fontSize: "14px", lineHeight: "1.6", maxHeight: "220px", overflowY: "auto" }}
                                                        dangerouslySetInnerHTML={{ __html: html }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {templateAiSuggestions.length === 0 && !isGeneratingTemplateAi && (
                                        <div className="text-center py-10 border-2 border-dashed border-violet-200 rounded-xl bg-violet-50/30">
                                            <Sparkles className="w-10 h-10 text-violet-300 mx-auto mb-3" />
                                            <p className="text-sm font-medium text-slate-600">L&apos;IA va améliorer ou réécrire votre email</p>
                                            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">Elle utilise le contenu actuel de l&apos;email + le contexte de la mission comme base de travail</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex justify-between items-center gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
                            <div className="text-xs text-slate-400">
                                {templateModalTab === "write" && templateForm.bodyHtml && (
                                    <button onClick={() => setTemplateModalTab("preview")} className="text-indigo-500 hover:underline flex items-center gap-1">
                                        <Eye className="w-3 h-3" /> Voir l&apos;aperçu
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                <button onClick={() => setShowEditTemplateModal(false)} className="px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition-colors">
                                    Annuler
                                </button>
                                <button
                                    onClick={handleEditTemplate}
                                    disabled={!templateForm.name || !templateForm.subject || !templateForm.bodyHtml || isSavingTemplate}
                                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-lg disabled:opacity-50 transition-all shadow-sm"
                                >
                                    {isSavingTemplate ? <><Loader2 className="w-4 h-4 animate-spin" />Sauvegarde...</> : <><Save className="w-4 h-4" />Enregistrer</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Template Modal */}
            {showAddTemplateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowAddTemplateModal(false)} />
                    <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-600 to-violet-600">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                                    <FileText className="w-5 h-5 text-white" />
                                </div>
                                <h2 className="text-lg font-semibold text-white">Ajouter un template</h2>
                            </div>
                            <button
                                onClick={() => setShowAddTemplateModal(false)}
                                className="p-2 rounded-lg hover:bg-white/20 text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 max-h-[60vh] overflow-y-auto">
                            {availableTemplates.length === 0 ? (
                                <div className="text-center py-8">
                                    <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                    <p className="text-slate-600 mb-2">Aucun template disponible</p>
                                    <p className="text-sm text-slate-500 mb-4">
                                        Créez des templates partagés dans la section Email
                                    </p>
                                    <a
                                        href="/manager/email/templates"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Créer un template
                                        <ExternalLink className="w-4 h-4" />
                                    </a>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {availableTemplates.map((template) => (
                                        <button
                                            key={template.id}
                                            onClick={() => setSelectedTemplateToAdd(template.id)}
                                            className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${selectedTemplateToAdd === template.id
                                                ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/20"
                                                : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
                                                }`}
                                        >
                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${selectedTemplateToAdd === template.id
                                                ? "bg-indigo-500 text-white"
                                                : "bg-slate-100 text-slate-500"
                                                }`}>
                                                <Sparkles className="w-5 h-5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-slate-900 truncate">{template.name}</p>
                                                <p className="text-sm text-slate-500 truncate">{template.subject}</p>
                                            </div>
                                            <span className="px-2 py-0.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-full flex-shrink-0">
                                                {template.category}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
                            <button
                                onClick={() => setShowAddTemplateModal(false)}
                                className="px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleAddTemplate}
                                disabled={!selectedTemplateToAdd || isAddingTemplate}
                                className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-lg disabled:opacity-50 transition-all"
                            >
                                {isAddingTemplate ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Ajout...
                                    </>
                                ) : (
                                    <>
                                        <Plus className="w-4 h-4" />
                                        Ajouter
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Template Preview Modal */}
            {showPreviewModal && previewTemplate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowPreviewModal(false)} />
                    <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-600 to-violet-600 flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                                    <Eye className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-white">{previewTemplate.name}</h2>
                                    <p className="text-sm text-white/80">{previewTemplate.category}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowPreviewModal(false)}
                                className="p-2 rounded-lg hover:bg-white/20 text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="mb-4">
                                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Objet</label>
                                <p className="mt-1 text-lg font-medium text-slate-900">{previewTemplate.subject}</p>
                            </div>
                            {previewTemplate.variables.length > 0 && (
                                <div className="mb-4">
                                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Variables</label>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {previewTemplate.variables.map((v) => (
                                            <span key={v} className="px-2 py-1 text-xs font-medium text-indigo-700 bg-indigo-100 rounded-md">
                                                {`{{${v}}}`}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div>
                                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Contenu</label>
                                <div
                                    className="mt-2 p-4 bg-slate-50 rounded-xl border border-slate-200 prose prose-sm max-w-none"
                                    dangerouslySetInnerHTML={{ __html: previewTemplate.bodyHtml }}
                                />
                            </div>
                        </div>
                        <div className="flex justify-end px-6 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
                            <button
                                onClick={() => setShowPreviewModal(false)}
                                className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg transition-colors"
                            >
                                Fermer
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Suggestions Modal */}
            <Modal
                isOpen={aiModalOpen}
                onClose={() => setAiModalOpen(false)}
                title="Suggestions IA"
                description="Choisissez une proposition avant de l'appliquer à votre script."
                size="xl"
            >
                <div className="space-y-3">
                    {aiSuggestions.length === 0 ? (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                            Aucune suggestion reçue. Réessayez la génération.
                        </div>
                    ) : (
                        aiSuggestions.map((text, idx) => {
                            const selected = aiSelectedIndex === idx;
                            return (
                                <button
                                    key={`suggestion-${idx}`}
                                    type="button"
                                    onClick={() => setAiSelectedIndex(idx)}
                                    className={`w-full text-left rounded-xl border p-4 transition-all ${selected
                                        ? "border-indigo-300 bg-indigo-50"
                                        : "border-slate-200 bg-white hover:bg-slate-50"}`}
                                >
                                    <div className="flex items-center justify-between gap-3 mb-2">
                                        <div className="text-xs font-bold tracking-wide uppercase text-slate-500">
                                            Suggestion {idx + 1}
                                        </div>
                                        <div className={`text-[11px] font-bold px-2 py-1 rounded-full ${selected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                                            {selected ? "Sélectionnée" : "Choisir"}
                                        </div>
                                    </div>
                                    <div className="text-sm text-slate-800 whitespace-pre-wrap">{text}</div>
                                </button>
                            );
                        })
                    )}
                </div>

                <ModalFooter>
                    <button
                        onClick={() => setAiModalOpen(false)}
                        className="h-9 px-4 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                        Annuler
                    </button>
                    <button
                        onClick={applySelectedSuggestion}
                        className="h-9 px-4 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                    >
                        Appliquer
                    </button>
                </ModalFooter>
            </Modal>

            {/* Mission mailbox configuration dialog */}
            <Modal
                isOpen={showMailboxModal}
                onClose={() => setShowMailboxModal(false)}
                title="Boîte mail par défaut de la mission"
                description="Choisissez la boîte mail utilisée par défaut pour les emails envoyés dans cette mission. Les SDRs peuvent toujours choisir une autre boîte si nécessaire."
                size="md"
            >
                {isLoadingMailboxes ? (
                    <div className="py-6 text-sm text-slate-500">Chargement des boîtes mail…</div>
                ) : mailboxes.length === 0 ? (
                    <div className="py-6 space-y-3">
                        <p className="text-sm text-slate-600">
                            Aucune boîte mail disponible pour le moment.
                        </p>
                        <button
                            type="button"
                            onClick={() => {
                                setShowMailboxModal(false);
                                setShowMailboxManager(true);
                            }}
                            className="inline-flex items-center gap-2 h-9 px-4 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                        >
                            <Mail className="w-4 h-4" />
                            Connecter une boîte mail
                        </button>
                        <p className="text-xs text-slate-500">
                            Vous pourrez ensuite revenir choisir la boîte mail par défaut de la mission.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3 py-2">
                        <label className="block text-sm font-medium text-slate-700">
                            Sélectionner une boîte mail
                        </label>
                        <select
                            className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-700"
                            value={mission.defaultMailboxId ?? ""}
                            onChange={(e) => {
                                const value = e.target.value;
                                setMission((prev) => prev ? { ...prev, defaultMailboxId: value || null } : prev);
                            }}
                        >
                            <option value="">Hériter du client / choix SDR</option>
                            {mailboxes.map((mb) => (
                                <option key={mb.id} value={mb.id}>
                                    {mb.displayName ? `${mb.displayName} <${mb.email}>` : mb.email}
                                </option>
                            ))}
                        </select>
                        <p className="text-[11px] text-slate-500">
                            Cette boîte mail sera proposée par défaut pour les emails envoyés depuis cette mission.
                        </p>
                    </div>
                )}
                <ModalFooter>
                    <button
                        onClick={() => setShowMailboxModal(false)}
                        className="h-9 px-4 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                        Fermer
                    </button>
                    {!isLoadingMailboxes && mailboxes.length > 0 && (
                        <>
                            <button
                                type="button"
                                onClick={() => setShowMailboxManager(true)}
                                className="h-9 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
                            >
                                Gérer les boîtes mail…
                            </button>
                            <button
                                onClick={async () => {
                                try {
                                    const res = await fetch(`/api/missions/${mission.id}`, {
                                        method: "PUT",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ defaultMailboxId: mission.defaultMailboxId ?? "" }),
                                    });
                                    const json = await res.json();
                                    if (json.success) {
                                        success("Boîte mail mise à jour", "La boîte mail par défaut de la mission a été mise à jour.");
                                        setShowMailboxModal(false);
                                    } else {
                                        showError("Erreur", json.error || "Impossible de mettre à jour la boîte mail");
                                    }
                                } catch {
                                    showError("Erreur", "Impossible de mettre à jour la boîte mail");
                                }
                                }}
                                className="h-9 px-4 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                            >
                                Enregistrer
                            </button>
                        </>
                    )}
                </ModalFooter>
            </Modal>

            <MailboxManagerDialog
                isOpen={showMailboxManager}
                onClose={() => {
                    setShowMailboxManager(false);
                    refetchMailboxes();
                }}
                onMailboxAdded={() => {
                    refetchMailboxes();
                }}
            />

            <EditMissionDialog
                isOpen={showEditMissionDialog}
                onClose={() => setShowEditMissionDialog(false)}
                mission={mission}
                onSaved={fetchMission}
            />

            <Modal
                isOpen={showPortalLaunchModal}
                onClose={() => setShowPortalLaunchModal(false)}
                title={isPortalLaunching ? "Phase de démarrage" : "Démarrer la mission"}
                description={
                    isPortalLaunching
                        ? "L'activité réelle reste visible par l'équipe interne et masquée sur les portails."
                        : "Activez la mission et laissez les premiers résultats se consolider avant de les publier."
                }
                size="sm"
            >
                {isPortalLaunching && mission.portalVisibleAt ? (
                    <div className="space-y-5">
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                                    <Clock3 className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-amber-950">Écran d&apos;attente actif</p>
                                    <p className="mt-1 text-xs text-amber-800">
                                        Fin prévue le{" "}
                                        {new Date(mission.portalVisibleAt).toLocaleDateString("fr-FR", {
                                            day: "numeric",
                                            month: "long",
                                            year: "numeric",
                                        })}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-start gap-3 rounded-xl border border-slate-200 p-4">
                            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                            <p className="text-sm leading-6 text-slate-600">
                                Les actions sont enregistrées normalement et apparaîtront automatiquement à la fin de la période.
                            </p>
                        </div>
                        <ModalFooter>
                            <button
                                onClick={() => setShowPortalLaunchModal(false)}
                                className="h-10 rounded-lg bg-slate-100 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                            >
                                Fermer
                            </button>
                            <button
                                onClick={revealPortalActivity}
                                disabled={isUpdatingPortalLaunch}
                                className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                                {isUpdatingPortalLaunch && <Loader2 className="h-4 w-4 animate-spin" />}
                                Publier maintenant
                            </button>
                        </ModalFooter>
                    </div>
                ) : (
                    <div>
                        <div className="grid grid-cols-3 gap-3">
                            {[3, 7, 14].map((days) => (
                                <button
                                    key={days}
                                    type="button"
                                    onClick={() => setPortalLaunchDays(days)}
                                    className={cn(
                                        "rounded-xl border px-3 py-4 text-center transition-all active:scale-[0.98]",
                                        portalLaunchDays === days
                                            ? "border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-600/10"
                                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                                    )}
                                >
                                    <span className="block text-2xl font-black">{days}</span>
                                    <span className="mt-1 block text-xs font-semibold">jours</span>
                                </button>
                            ))}
                        </div>
                        <div className="mt-5 flex items-start gap-3 rounded-xl bg-slate-50 p-4">
                            <EyeOff className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
                            <p className="text-sm leading-6 text-slate-600">
                                Le client et les commerciaux verront un écran de lancement. Managers et SDR gardent toute l&apos;activité.
                            </p>
                        </div>
                        <ModalFooter>
                            <button
                                onClick={() => setShowPortalLaunchModal(false)}
                                className="h-10 rounded-lg bg-slate-100 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={startPortalLaunch}
                                disabled={isUpdatingPortalLaunch}
                                className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                                {isUpdatingPortalLaunch ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                                Démarrer pour {portalLaunchDays} jours
                            </button>
                        </ModalFooter>
                    </div>
                )}
            </Modal>


            {/* Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                onConfirm={handleDelete}
                title="Supprimer la mission ?"
                message={`Êtes-vous sûr de vouloir supprimer "${mission.name}" ? Cette action est irréversible.`}
                confirmText="Supprimer"
                variant="danger"
                isLoading={isDeleting}
            />

            {/* Statuts et workflow drawer */}
            <MissionStatusWorkflowDrawer
                isOpen={showStatusWorkflowDrawer}
                onClose={() => setShowStatusWorkflowDrawer(false)}
                missionId={mission.id}
                missionName={mission.name}
            />

            {/* List right-click context menu (delete) */}
            <ContextMenu
                items={listContextMenuItems}
                position={listMenuPosition}
                onClose={closeListMenu}
            />

            {/* Delete list confirmation */}
            <ConfirmModal
                isOpen={showDeleteListModal}
                onClose={() => {
                    setShowDeleteListModal(false);
                    setListToDelete(null);
                    closeListMenu();
                }}
                onConfirm={handleDeleteList}
                title="Supprimer la liste ?"
                message={listToDelete ? `Êtes-vous sûr de vouloir supprimer "${listToDelete.name}" ? Les sociétés et contacts associés seront également supprimés.` : ""}
                confirmText="Supprimer"
                variant="danger"
                isLoading={isDeletingList}
            />

        </div>
    );
}
