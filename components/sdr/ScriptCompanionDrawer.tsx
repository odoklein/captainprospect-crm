"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Drawer, Button, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ScriptReader } from "@/components/sdr/ScriptReader";
import type { ScriptVars } from "@/lib/sdr-queue/script-fill";
import {
    sdrScriptCompanionCampaignsKey,
    sdrScriptCompanionDataKey,
} from "@/lib/query-keys";

interface ScriptCompanionDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    missionId?: string;
    missionName?: string;
    /** Campaign resolved for the row being worked (list strategy, else mission default).
     *  When set, it wins over the mission's first active campaign. */
    campaignId?: string | null;
}

type ScriptTabId = "base" | "additional" | "ai";

type CampaignSummary = {
    id: string;
    name: string;
};

type CompanionData = {
    campaignId: string;
    campaignName: string;
    baseScript: string;
    additionalDraft: string;
    additionalShared: string;
    sharedUpdatedAt: string | null;
    sharedUpdatedBy: string | null;
    aiShared: string;
    aiGeneratedAt: string | null;
    aiGeneratedFrom: string | null;
    defaultTab: "base" | "additional" | "ai";
};

export function ScriptCompanionDrawer({
    isOpen,
    onClose,
    missionId,
    missionName,
    campaignId,
}: ScriptCompanionDrawerProps) {
    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title="Script de campagne"
            description={missionName ? `Mission : ${missionName}` : undefined}
            size="lg"
            side="left"
            closeOnOverlay={false}
            modal={false}
        >
            <ScriptCompanionContent active={isOpen} missionId={missionId} campaignId={campaignId} />
        </Drawer>
    );
}

const SCRIPT_TABS: { id: ScriptTabId; label: string }[] = [
    { id: "base", label: "Script" },
    { id: "additional", label: "Additionnel" },
    { id: "ai", label: "Version IA" },
];

/**
 * The campaign script (base, the team's shared additions, the AI version).
 * Rendered in the script drawer, and as the « Script » tab of the docked
 * action pane.
 */
export function ScriptCompanionContent({
    active = true,
    missionId,
    campaignId,
    vars,
    inPane = false,
}: {
    /** Loads only while shown. */
    active?: boolean;
    missionId?: string;
    campaignId?: string | null;
    /** Fills {prénom}, {société}… with the prospect on screen. */
    vars?: ScriptVars;
    /** Rendered under the docked pane's sticky tabs (the step bar sticks below them). */
    inPane?: boolean;
}) {
    const isOpen = active;
    const queryClient = useQueryClient();
    const { success, error: showError } = useToast();
    const [activeTab, setActiveTab] = useState<ScriptTabId>("base");
    const [additionalDraft, setAdditionalDraft] = useState("");
    const [isSavingDraft, setIsSavingDraft] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);

    const { data: campaigns = [], isFetching: campaignsLoading } = useQuery<CampaignSummary[]>({
        queryKey: sdrScriptCompanionCampaignsKey(isOpen && missionId ? missionId : null),
        queryFn: async () => {
            const res = await fetch(`/api/campaigns?missionId=${missionId}&isActive=true&limit=50`);
            const json = await res.json();
            if (!json.success || !Array.isArray(json.data)) return [];
            return json.data as CampaignSummary[];
        },
        enabled: isOpen && !!missionId,
        staleTime: 60_000,
    });

    // Per-list strategy: the row's campaign comes from its list (see /api/sdr/action-queue).
    // Falling back to campaigns[0] would always show the mission default script.
    const selectedCampaign: CampaignSummary | null = campaignId
        ? campaigns.find((c) => c.id === campaignId) ?? { id: campaignId, name: "" }
        : campaigns[0] ?? null;

    const {
        data: companionData,
        isFetching: companionLoading,
        refetch: refetchCompanionData,
    } = useQuery<CompanionData | null>({
        queryKey: sdrScriptCompanionDataKey(isOpen && selectedCampaign ? selectedCampaign.id : null),
        queryFn: async () => {
            if (!selectedCampaign) return null;
            const res = await fetch(`/api/campaigns/${selectedCampaign.id}/script-companion`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error || "Impossible de charger le script");
            return json.data as CompanionData;
        },
        enabled: isOpen && !!selectedCampaign,
        staleTime: 0,
    });

    useEffect(() => {
        if (companionData) {
            setAdditionalDraft(companionData.additionalDraft || companionData.additionalShared || "");
            if (companionData.defaultTab === "ai" || companionData.defaultTab === "base" || companionData.defaultTab === "additional") {
                setActiveTab(companionData.defaultTab);
            }
        } else {
            setAdditionalDraft("");
        }
    }, [companionData]);

    const hasUnsavedChanges = useMemo(
        () => (companionData?.additionalDraft ?? companionData?.additionalShared ?? "") !== additionalDraft,
        [companionData, additionalDraft]
    );

    const handleSaveDraft = async () => {
        if (!selectedCampaign) return;
        setIsSavingDraft(true);
        try {
            const res = await fetch(`/api/campaigns/${selectedCampaign.id}/script-companion`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ draft: additionalDraft }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || "Impossible de sauvegarder le brouillon");
            await refetchCompanionData();
            success("Brouillon sauvegardé", "Votre script additionel a bien été enregistré.");
        } catch (err) {
            const message = err instanceof Error ? err.message : "Erreur inattendue";
            showError("Sauvegarde", message);
        } finally {
            setIsSavingDraft(false);
        }
    };

    const handleShare = async () => {
        if (!selectedCampaign) return;
        setIsPublishing(true);
        try {
            const res = await fetch(`/api/campaigns/${selectedCampaign.id}/script-companion`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: additionalDraft }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || "Impossible de partager le script");
            await Promise.all([
                refetchCompanionData(),
                queryClient.invalidateQueries({
                    queryKey: sdrScriptCompanionDataKey(selectedCampaign.id),
                }),
            ]);
            success("Script partagé", "Le script additionel est maintenant partagé avec l'équipe.");
        } catch (err) {
            const message = err instanceof Error ? err.message : "Erreur inattendue";
            showError("Partage", message);
        } finally {
            setIsPublishing(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-0.5 rounded-lg bg-surface-2 p-0.5 ring-1 ring-inset ring-line-subtle" role="tablist" aria-label="Version du script">
                    {SCRIPT_TABS.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={cn(
                                "h-7 rounded-md px-2.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                                activeTab === t.id ? "bg-surface text-ink shadow-xs ring-1 ring-line-subtle" : "text-ink-3 hover:text-ink",
                            )}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
                {companionData?.campaignName && (
                    <p className="ml-auto min-w-0 truncate text-[12px] text-ink-4" title={`Campagne ${companionData.campaignName}`}>
                        {companionData.campaignName}
                    </p>
                )}
            </div>

            {(campaignsLoading || companionLoading) && !companionData && (
                <div className="space-y-2.5 pt-1">
                    {[92, 84, 96, 70, 88, 60].map((w, i) => (
                        <div key={i} className="cp-shimmer h-2.5 rounded" style={{ width: `${w}%` }} />
                    ))}
                </div>
            )}

            {!campaignsLoading && campaigns.length === 0 && (
                <p className="rounded-control bg-surface-2 px-3 py-4 text-[13px] text-ink-3">Aucune campagne active disponible pour cette mission.</p>
            )}

            {!campaignsLoading && campaigns.length > 0 && companionData && (
                <div key={activeTab} className="cp-rise">
                    {activeTab === "base" ? (
                        <ScriptReader content={companionData.baseScript} vars={vars} stickyTop={inPane ? 45 : 0} emptyText="Aucun script de base configuré sur cette campagne." />
                    ) : activeTab === "ai" ? (
                        <div className="space-y-3">
                            {companionData.aiShared && companionData.aiGeneratedAt && (
                                <p className="text-[11.5px] text-ink-4">
                                    Généré{companionData.aiGeneratedFrom ? ` depuis ${companionData.aiGeneratedFrom}` : ""} le{" "}
                                    {new Date(companionData.aiGeneratedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                                </p>
                            )}
                            <ScriptReader content={companionData.aiShared} vars={vars} stickyTop={inPane ? 45 : 0} emptyText="Aucune version IA pour cette campagne." />
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            <textarea
                                value={additionalDraft}
                                onChange={(e) => setAdditionalDraft(e.target.value)}
                                rows={14}
                                placeholder="Ajoutez votre script additionnel ici…"
                                className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-ink placeholder:text-ink-4 focus:border-primary-400 focus:outline-none focus:ring-4 focus:ring-primary-500/10"
                            />
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-ink-4">
                                <span className={cn(hasUnsavedChanges && "text-warning-ink")}>{hasUnsavedChanges ? "Modifications non sauvegardées" : "Brouillon à jour"}</span>
                                {companionData.sharedUpdatedAt && (
                                    <span>
                                        Partagé le {new Date(companionData.sharedUpdatedAt).toLocaleString("fr-FR")}
                                        {companionData.sharedUpdatedBy ? ` par ${companionData.sharedUpdatedBy}` : ""}
                                    </span>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <Button size="sm" onClick={handleSaveDraft} variant="secondary" disabled={isSavingDraft || isPublishing} isLoading={isSavingDraft}>
                                    Sauvegarder le brouillon
                                </Button>
                                <Button size="sm" onClick={handleShare} disabled={isPublishing || isSavingDraft || !additionalDraft.trim()} isLoading={isPublishing}>
                                    Partager avec l&apos;équipe
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
