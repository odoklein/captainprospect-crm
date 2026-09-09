"use client";

import { useState, useMemo } from "react";
import { useToast } from "@/components/ui";
import {
    Target,
    Plus,
    Copy,
    Link2,
    Link2Off,
    Pencil,
    Loader2,
    CheckCircle2,
    AlertCircle,
    Users,
    Sparkles,
    ChevronRight,
    Eye,
    EyeOff,
    Check,
    Power,
    PowerOff,
} from "lucide-react";
import { StrategyEditorDrawer } from "./StrategyEditorDrawer";

interface ListItem {
    id: string;
    name: string;
    type: string;
    isActive?: boolean;
    contactsViewEnabled?: boolean;
    commercialInterlocuteurId?: string | null;
    commercialInterlocuteur?: {
        id: string;
        firstName?: string | null;
        lastName?: string | null;
        title?: string | null;
    } | null;
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
        isCustom?: boolean;
        isInherited?: boolean;
        inheritedCampaignName?: string | null;
        inheritedCampaignId?: string | null;
        hasIcp: boolean;
        hasPitch: boolean;
        hasScript: boolean;
        isReady: boolean;
    };
    _count?: { companies: number };
}

interface CampaignItem {
    id: string;
    name: string;
    isActive: boolean;
    icp?: string | null;
    pitch?: string | null;
    script?: string | null;
}

interface StrategyByListTabProps {
    missionId: string;
    lists: ListItem[];
    campaigns: CampaignItem[];
    onChange: () => void;
}

// Explicit color palette — does not rely on global CSS variables
const COLORS = {
    text: "#0F172A",
    textMuted: "#64748B",
    textSubtle: "#94A3B8",
    border: "#E2E8F0",
    bg: "#FFFFFF",
    bgSubtle: "#F8FAFC",
    indigo: "#4F46E5",
    indigoDark: "#3730A3",
    indigoBg: "#EEF2FF",
    emerald: "#059669",
    emeraldBg: "#ECFDF5",
    amber: "#D97706",
    amberBg: "#FFFBEB",
    sky: "#0284C7",
    skyBg: "#F0F9FF",
    rose: "#E11D48",
    roseBg: "#FFF1F2",
} as const;

export function StrategyByListTab({ missionId, lists, campaigns, onChange }: StrategyByListTabProps) {
    const { success, error: showError } = useToast();

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
    const [initialAssignToListId, setInitialAssignToListId] = useState<string | null>(null);
    const [busyListId, setBusyListId] = useState<string | null>(null);
    const [pickerListId, setPickerListId] = useState<string | null>(null);
    const [togglingContactsListId, setTogglingContactsListId] = useState<string | null>(null);
    const [successContactsListId, setSuccessContactsListId] = useState<string | null>(null);
    const [togglingActiveListId, setTogglingActiveListId] = useState<string | null>(null);
    const [successActiveListId, setSuccessActiveListId] = useState<string | null>(null);

    const defaultCampaign = campaigns.find((c) => c.isActive) || campaigns[0] || null;

    const defaultCampaignReadiness = useMemo(() => {
        if (!defaultCampaign) return null;
        const hasIcp = !!defaultCampaign.icp?.trim();
        const hasPitch = !!defaultCampaign.pitch?.trim();
        const hasScript = !!defaultCampaign.script?.trim();
        return {
            hasIcp,
            hasPitch,
            hasScript,
            isReady: hasIcp && hasPitch && hasScript,
        };
    }, [defaultCampaign]);

    const sortedLists = useMemo(() => {
        return [...lists].sort((a, b) => {
            const score = (l: ListItem) => {
                const hasCustom = !!l.campaign;
                const isInherited = !hasCustom && !!defaultCampaign;
                if (hasCustom && l.readiness?.isReady) return 0;
                if (isInherited && defaultCampaignReadiness?.isReady) return 1;
                if (l.readiness?.hasStrategy) return 2;
                return 3;
            };
            const diff = score(a) - score(b);
            if (diff !== 0) return diff;
            return a.name.localeCompare(b.name);
        });
    }, [lists, defaultCampaign, defaultCampaignReadiness]);

    const openEdit = (campaignId: string) => {
        setEditingCampaignId(campaignId);
        setInitialAssignToListId(null);
        setDrawerOpen(true);
    };
    const openCreateForList = (listId: string) => {
        setEditingCampaignId(null);
        setInitialAssignToListId(listId);
        setDrawerOpen(true);
    };

    const handleDuplicate = async (sourceCampaignId: string, list: ListItem) => {
        setBusyListId(list.id);
        try {
            const res = await fetch(`/api/campaigns/${sourceCampaignId}/duplicate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: `Stratégie — ${list.name}`,
                    assignToListId: list.id,
                }),
            });
            const json = await res.json();
            if (!json.success) {
                showError("Erreur", json.error || "Duplication échouée");
                return;
            }
            success("Stratégie dédiée créée", `Liée à la liste « ${list.name} »`);
            onChange();
            setEditingCampaignId(json.data.id);
            setInitialAssignToListId(null);
            setDrawerOpen(true);
        } catch {
            showError("Erreur", "Duplication échouée");
        } finally {
            setBusyListId(null);
        }
    };

    const handleAssign = async (list: ListItem, campaignId: string | null) => {
        setBusyListId(list.id);
        setPickerListId(null);
        try {
            const res = await fetch(`/api/lists/${list.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ campaignId }),
            });
            const json = await res.json();
            if (!json.success) {
                showError("Erreur", json.error || "Mise à jour échouée");
                return;
            }
            success(
                campaignId ? "Stratégie liée" : "Stratégie détachée",
                campaignId
                    ? `Liste « ${list.name} » mise à jour avec stratégie dédiée`
                    : `Liste « ${list.name} » basculée sur la stratégie par défaut de la mission`
            );
            onChange();
        } catch {
            showError("Erreur", "Mise à jour échouée");
        } finally {
            setBusyListId(null);
        }
    };

    const handleToggleContactsView = async (list: ListItem) => {
        if (togglingContactsListId === list.id || busyListId === list.id) return;
        setTogglingContactsListId(list.id);
        const targetValue = !(list.contactsViewEnabled ?? false);
        try {
            const res = await fetch(`/api/lists/${list.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contactsViewEnabled: targetValue }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
                showError("Erreur", json.error || "Impossible de modifier la visibilité des contacts de cette base");
                return;
            }
            const confirmedValue = typeof json.data?.contactsViewEnabled === "boolean"
                ? json.data.contactsViewEnabled
                : targetValue;

            setSuccessContactsListId(list.id);
            setTimeout(() => {
                setSuccessContactsListId((prev) => (prev === list.id ? null : prev));
            }, 2000);

            success(
                confirmedValue ? "Accès contacts activé" : "Accès contacts désactivé",
                `La base « ${list.name} » est désormais ${confirmedValue ? "visible" : "masquée"} pour son commercial référent.`
            );
            onChange();
        } catch (err) {
            showError("Erreur réseau", err instanceof Error ? err.message : "Échec de la communication avec le serveur");
        } finally {
            setTogglingContactsListId(null);
        }
    };

    const handleToggleListActive = async (list: ListItem) => {
        if (togglingActiveListId === list.id || busyListId === list.id) return;
        setTogglingActiveListId(list.id);
        const targetValue = list.isActive === false;
        try {
            const res = await fetch(`/api/lists/${list.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: targetValue }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
                showError("Erreur", json.error || "Impossible de modifier le statut de la liste");
                return;
            }
            const confirmedValue = typeof json.data?.isActive === "boolean"
                ? json.data.isActive
                : targetValue;

            setSuccessActiveListId(list.id);
            setTimeout(() => {
                setSuccessActiveListId((prev) => (prev === list.id ? null : prev));
            }, 2000);

            success(
                confirmedValue ? "Liste activée" : "Liste désactivée",
                `La liste « ${list.name} » est désormais ${confirmedValue ? "active" : "désactivée"} pour cette mission.`
            );
            onChange();
        } catch (err) {
            showError("Erreur réseau", err instanceof Error ? err.message : "Échec de la communication avec le serveur");
        } finally {
            setTogglingActiveListId(null);
        }
    };

    return (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ color: COLORS.text }}>
            {/* Header / explainer */}
            <div
                style={{
                    background: `linear-gradient(135deg, ${COLORS.indigoBg} 0%, #FFFFFF 60%)`,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 20,
                    padding: 24,
                    marginBottom: 20,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 16,
                }}
            >
                <div
                    style={{
                        width: 48,
                        height: 48,
                        borderRadius: 14,
                        background: `linear-gradient(135deg, ${COLORS.indigo}, ${COLORS.indigoDark})`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        boxShadow: "0 8px 24px rgba(79, 70, 229, 0.25)",
                    }}
                >
                    <Sparkles style={{ width: 24, height: 24, color: "#FFFFFF" }} />
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                        <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, margin: 0 }}>
                            Une stratégie par liste (avec fallback automatique)
                        </h2>
                        {defaultCampaign && (
                            <button
                                type="button"
                                onClick={() => openEdit(defaultCampaign.id)}
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: COLORS.indigoDark,
                                    background: COLORS.indigoBg,
                                    padding: "6px 12px",
                                    borderRadius: 999,
                                    border: `1px solid ${COLORS.indigo}33`,
                                    cursor: "pointer",
                                    transition: "background 120ms ease",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "#E0E7FF")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = COLORS.indigoBg)}
                            >
                                <Target style={{ width: 14, height: 14, color: COLORS.indigo }} />
                                Stratégie par défaut : {defaultCampaign.name}
                                <Pencil style={{ width: 12, height: 12, marginLeft: 2 }} />
                            </button>
                        )}
                    </div>
                    <p style={{ fontSize: 14, color: COLORS.textMuted, margin: "6px 0 0", lineHeight: 1.5 }}>
                        Définissez un pitch et script spécifique pour chaque liste. Lorsqu’une liste n’a pas de stratégie dédiée, elle applique automatiquement le pitch et le script par défaut de la mission.
                    </p>
                </div>
            </div>

            {sortedLists.length === 0 ? (
                <div
                    style={{
                        background: COLORS.bg,
                        border: `2px dashed ${COLORS.border}`,
                        borderRadius: 20,
                        padding: 48,
                        textAlign: "center",
                        color: COLORS.textMuted,
                    }}
                >
                    <Users style={{ width: 32, height: 32, color: COLORS.textSubtle, margin: "0 auto 12px" }} />
                    <p style={{ fontSize: 15, fontWeight: 600, color: COLORS.text, margin: 0 }}>
                        Aucune liste dans cette mission
                    </p>
                    <p style={{ fontSize: 13, marginTop: 6 }}>
                        Importez ou créez une liste pour commencer.
                    </p>
                </div>
            ) : (
                <div style={{ display: "grid", gap: 16 }}>
                    {sortedLists.map((list) => {
                        const r = list.readiness;
                        const hasCustomStrategy = !!list.campaign;
                        const isInherited = !hasCustomStrategy && !!defaultCampaign;
                        const hasAnyStrategy = hasCustomStrategy || isInherited;
                        const isReady = hasCustomStrategy ? !!r?.isReady : !!defaultCampaignReadiness?.isReady;
                        const inactive = list.isActive === false;
                        const isBusy = busyListId === list.id;

                        // Card accent + status colors
                        const statusColor = !hasAnyStrategy
                            ? COLORS.amber
                            : hasCustomStrategy
                                ? (isReady ? COLORS.emerald : COLORS.sky)
                                : (isReady ? COLORS.indigo : COLORS.sky);

                        const statusBg = !hasAnyStrategy
                            ? COLORS.amberBg
                            : hasCustomStrategy
                                ? (isReady ? COLORS.emeraldBg : COLORS.skyBg)
                                : COLORS.indigoBg;

                        const statusLabel = !hasAnyStrategy
                            ? "Aucune stratégie"
                            : hasCustomStrategy
                                ? (isReady ? "Stratégie dédiée prête" : "Stratégie dédiée à compléter")
                                : (isReady ? "Stratégie par défaut (Héritée)" : "Par défaut (À compléter)");

                        const availableCampaigns = campaigns.filter(
                            (c) => c.isActive && c.id !== list.campaignId
                        );

                        return (
                            <div
                                key={list.id}
                                style={{
                                    background: COLORS.bg,
                                    border: `1px solid ${COLORS.border}`,
                                    borderRadius: 20,
                                    boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
                                    overflow: "hidden",
                                    opacity: inactive ? 0.7 : 1,
                                    transition: "box-shadow 200ms ease",
                                }}
                            >
                                {/* Top bar: list name + status */}
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        padding: "18px 24px",
                                        borderBottom: `1px solid ${COLORS.border}`,
                                        gap: 16,
                                    }}
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                                        <div
                                            style={{
                                                width: 44,
                                                height: 44,
                                                borderRadius: 12,
                                                background: hasCustomStrategy ? COLORS.emeraldBg : COLORS.indigoBg,
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                flexShrink: 0,
                                            }}
                                        >
                                            <Users style={{ width: 22, height: 22, color: hasCustomStrategy ? COLORS.emerald : COLORS.indigo }} />
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                            <div
                                                style={{
                                                    fontSize: 17,
                                                    fontWeight: 700,
                                                    color: COLORS.text,
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                {list.name}
                                            </div>
                                            <div style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 2 }}>
                                                {list._count?.companies ?? 0} sociétés · {list.type}
                                                {inactive ? " · Désactivée" : ""}
                                            </div>
                                        </div>
                                    </div>

                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 10,
                                            flexWrap: "wrap",
                                            justifyContent: "flex-end",
                                        }}
                                    >
                                        {/* Toggle Active / Inactive for mission */}
                                        <button
                                            type="button"
                                            onClick={() => handleToggleListActive(list)}
                                            disabled={isBusy || togglingActiveListId === list.id}
                                            style={{
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: 6,
                                                fontSize: 12,
                                                fontWeight: 600,
                                                padding: "6px 12px",
                                                borderRadius: 10,
                                                border: !inactive
                                                    ? `1px solid ${COLORS.emerald}33`
                                                    : `1px solid ${COLORS.rose}33`,
                                                background: !inactive
                                                    ? COLORS.emeraldBg
                                                    : COLORS.roseBg,
                                                color: !inactive
                                                    ? COLORS.emerald
                                                    : COLORS.rose,
                                                cursor: (isBusy || togglingActiveListId === list.id) ? "not-allowed" : "pointer",
                                                opacity: (isBusy || togglingActiveListId === list.id) ? 0.6 : 1,
                                                transition: "all 150ms ease",
                                            }}
                                            title={inactive ? "Cliquer pour réactiver la liste pour cette mission" : "Cliquer pour désactiver la liste pour cette mission"}
                                        >
                                            {togglingActiveListId === list.id ? (
                                                <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
                                            ) : successActiveListId === list.id ? (
                                                <Check style={{ width: 14, height: 14 }} />
                                            ) : !inactive ? (
                                                <Power style={{ width: 14, height: 14 }} />
                                            ) : (
                                                <PowerOff style={{ width: 14, height: 14 }} />
                                            )}
                                            <span>{!inactive ? "Active" : "Désactivée"}</span>
                                        </button>

                                        {/* Toggle Commercial contacts view */}
                                        <button
                                            type="button"
                                            onClick={() => handleToggleContactsView(list)}
                                            disabled={isBusy || togglingContactsListId === list.id}
                                            style={{
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: 6,
                                                fontSize: 12,
                                                fontWeight: 600,
                                                padding: "6px 12px",
                                                borderRadius: 10,
                                                border: list.contactsViewEnabled
                                                    ? `1px solid ${COLORS.indigo}44`
                                                    : `1px solid ${COLORS.border}`,
                                                background: list.contactsViewEnabled
                                                    ? COLORS.indigoBg
                                                    : COLORS.bgSubtle,
                                                color: list.contactsViewEnabled
                                                    ? COLORS.indigo
                                                    : COLORS.textMuted,
                                                cursor: (isBusy || togglingContactsListId === list.id) ? "not-allowed" : "pointer",
                                                opacity: (isBusy || togglingContactsListId === list.id) ? 0.6 : 1,
                                                transition: "all 150ms ease",
                                            }}
                                            title={
                                                list.commercialInterlocuteur
                                                    ? `Accès contacts pour ${[list.commercialInterlocuteur.firstName, list.commercialInterlocuteur.lastName].filter(Boolean).join(" ")} : ${list.contactsViewEnabled ? "Activé" : "Désactivé"}`
                                                    : `Aucun commercial assigné. Accès contacts : ${list.contactsViewEnabled ? "Activé" : "Désactivé"}`
                                            }
                                        >
                                            {togglingContactsListId === list.id ? (
                                                <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
                                            ) : successContactsListId === list.id ? (
                                                <Check style={{ width: 14, height: 14, color: COLORS.emerald }} />
                                            ) : list.contactsViewEnabled ? (
                                                <Eye style={{ width: 14, height: 14 }} />
                                            ) : (
                                                <EyeOff style={{ width: 14, height: 14 }} />
                                            )}
                                            <span>
                                                Vue contacts : {list.contactsViewEnabled ? "Activée" : "Désactivée"}
                                            </span>
                                            {list.commercialInterlocuteur && (
                                                <span
                                                    style={{
                                                        fontSize: 11,
                                                        opacity: 0.85,
                                                        marginLeft: 2,
                                                        paddingLeft: 6,
                                                        borderLeft: `1px solid ${list.contactsViewEnabled ? COLORS.indigo + "33" : COLORS.border}`,
                                                    }}
                                                >
                                                    {[list.commercialInterlocuteur.firstName, list.commercialInterlocuteur.lastName].filter(Boolean).join(" ")}
                                                </span>
                                            )}
                                        </button>

                                        {/* Readiness status pill */}
                                        <span
                                            style={{
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: 6,
                                                fontSize: 13,
                                                fontWeight: 600,
                                                color: statusColor,
                                                background: statusBg,
                                                padding: "6px 14px",
                                                borderRadius: 999,
                                                border: `1px solid ${statusColor}33`,
                                                flexShrink: 0,
                                            }}
                                        >
                                            {hasAnyStrategy && isReady ? (
                                                <CheckCircle2 style={{ width: 16, height: 16 }} />
                                            ) : (
                                                <AlertCircle style={{ width: 16, height: 16 }} />
                                            )}
                                            {statusLabel}
                                        </span>
                                    </div>
                                </div>

                                {/* Body */}
                                <div style={{ padding: "20px 24px" }}>
                                    {hasCustomStrategy ? (
                                        <>
                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 10,
                                                    marginBottom: 14,
                                                }}
                                            >
                                                <Target style={{ width: 18, height: 18, color: COLORS.indigo }} />
                                                <span style={{ fontSize: 14, color: COLORS.textMuted }}>
                                                    Stratégie dédiée :
                                                </span>
                                                <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>
                                                    {list.campaign!.name}
                                                </span>
                                                <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.emerald, background: COLORS.emeraldBg, padding: "2px 8px", borderRadius: 6 }}>
                                                    Personnalisée
                                                </span>
                                            </div>

                                            {/* Readiness pills */}
                                            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
                                                <ReadinessPill label="ICP" ok={!!r?.hasIcp} />
                                                <ReadinessPill label="Pitch" ok={!!r?.hasPitch} />
                                                <ReadinessPill label="Script" ok={!!r?.hasScript} />
                                            </div>
                                        </>
                                    ) : defaultCampaign ? (
                                        <>
                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 10,
                                                    marginBottom: 8,
                                                }}
                                            >
                                                <Sparkles style={{ width: 18, height: 18, color: COLORS.indigo }} />
                                                <span style={{ fontSize: 14, color: COLORS.textMuted }}>
                                                    Stratégie appliquée :
                                                </span>
                                                <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>
                                                    {defaultCampaign.name}
                                                </span>
                                                <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.indigo, background: COLORS.indigoBg, padding: "2px 8px", borderRadius: 6 }}>
                                                    Par défaut de la mission
                                                </span>
                                            </div>
                                            <p
                                                style={{
                                                    fontSize: 13,
                                                    color: COLORS.textMuted,
                                                    margin: "0 0 14px",
                                                    lineHeight: 1.5,
                                                }}
                                            >
                                                Cette liste n’a pas de stratégie unique : les SDR utiliseront automatiquement le pitch et le script par défaut de la mission lors de leurs appels.
                                            </p>

                                            {/* Readiness pills */}
                                            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
                                                <ReadinessPill label="ICP" ok={!!defaultCampaignReadiness?.hasIcp} />
                                                <ReadinessPill label="Pitch" ok={!!defaultCampaignReadiness?.hasPitch} />
                                                <ReadinessPill label="Script" ok={!!defaultCampaignReadiness?.hasScript} />
                                            </div>
                                        </>
                                    ) : (
                                        <p
                                            style={{
                                                fontSize: 14,
                                                color: COLORS.textMuted,
                                                margin: "0 0 18px",
                                                lineHeight: 1.5,
                                            }}
                                        >
                                            Cette liste n’a pas de stratégie et aucune stratégie par défaut n’est configurée sur la mission.
                                        </p>
                                    )}

                                    {/* Action buttons */}
                                    <div
                                        style={{
                                            display: "flex",
                                            flexWrap: "wrap",
                                            alignItems: "center",
                                            gap: 10,
                                        }}
                                    >
                                        {hasCustomStrategy ? (
                                            <>
                                                <PrimaryButton
                                                    onClick={() => openEdit(list.campaign!.id)}
                                                    icon={<Pencil style={{ width: 16, height: 16 }} />}
                                                    disabled={isBusy}
                                                >
                                                    Modifier la stratégie
                                                </PrimaryButton>

                                                {availableCampaigns.length > 0 && (
                                                    <div style={{ position: "relative" }}>
                                                        <SecondaryButton
                                                            onClick={() => setPickerListId(pickerListId === list.id ? null : list.id)}
                                                            icon={<Link2 style={{ width: 16, height: 16 }} />}
                                                            disabled={isBusy}
                                                        >
                                                            Changer de stratégie
                                                        </SecondaryButton>
                                                        {pickerListId === list.id && (
                                                            <>
                                                                <div
                                                                    onClick={() => setPickerListId(null)}
                                                                    style={{
                                                                        position: "fixed",
                                                                        inset: 0,
                                                                        zIndex: 10,
                                                                    }}
                                                                />
                                                                <div
                                                                    style={{
                                                                        position: "absolute",
                                                                        top: "calc(100% + 6px)",
                                                                        left: 0,
                                                                        zIndex: 20,
                                                                        minWidth: 260,
                                                                        maxHeight: 280,
                                                                        overflowY: "auto",
                                                                        background: COLORS.bg,
                                                                        border: `1px solid ${COLORS.border}`,
                                                                        borderRadius: 12,
                                                                        boxShadow: "0 12px 32px rgba(15, 23, 42, 0.12)",
                                                                        padding: 6,
                                                                    }}
                                                                >
                                                                    {availableCampaigns.map((c) => (
                                                                        <button
                                                                            key={c.id}
                                                                            type="button"
                                                                            onClick={() => handleAssign(list, c.id)}
                                                                            style={{
                                                                                width: "100%",
                                                                                textAlign: "left",
                                                                                padding: "10px 12px",
                                                                                fontSize: 14,
                                                                                color: COLORS.text,
                                                                                background: "transparent",
                                                                                border: "none",
                                                                                borderRadius: 8,
                                                                                cursor: "pointer",
                                                                                display: "flex",
                                                                                alignItems: "center",
                                                                                gap: 8,
                                                                            }}
                                                                            onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.bgSubtle)}
                                                                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                                                        >
                                                                            <Target style={{ width: 14, height: 14, color: COLORS.indigo }} />
                                                                            {c.name}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                )}

                                                <button
                                                    type="button"
                                                    onClick={() => handleAssign(list, null)}
                                                    disabled={isBusy}
                                                    style={{
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        gap: 8,
                                                        padding: "10px 16px",
                                                        fontSize: 14,
                                                        fontWeight: 500,
                                                        color: COLORS.rose,
                                                        background: "transparent",
                                                        border: "none",
                                                        cursor: isBusy ? "not-allowed" : "pointer",
                                                        borderRadius: 10,
                                                        marginLeft: "auto",
                                                        opacity: isBusy ? 0.6 : 1,
                                                    }}
                                                    onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.roseBg)}
                                                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                                    title="Détacher pour réutiliser la stratégie par défaut"
                                                >
                                                    <Link2Off style={{ width: 16, height: 16 }} />
                                                    Revenir au défaut
                                                </button>
                                            </>
                                        ) : defaultCampaign ? (
                                            <>
                                                <PrimaryButton
                                                    onClick={() => handleDuplicate(defaultCampaign.id, list)}
                                                    icon={isBusy ? <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" /> : <Copy style={{ width: 16, height: 16 }} />}
                                                    disabled={isBusy}
                                                >
                                                    Personnaliser pour cette liste
                                                </PrimaryButton>

                                                <SecondaryButton
                                                    onClick={() => openEdit(defaultCampaign.id)}
                                                    icon={<Pencil style={{ width: 16, height: 16 }} />}
                                                    disabled={isBusy}
                                                >
                                                    Modifier le script par défaut
                                                </SecondaryButton>

                                                {availableCampaigns.length > 0 && (
                                                    <div style={{ position: "relative" }}>
                                                        <SecondaryButton
                                                            onClick={() => setPickerListId(pickerListId === list.id ? null : list.id)}
                                                            icon={<Link2 style={{ width: 16, height: 16 }} />}
                                                            disabled={isBusy}
                                                        >
                                                            Associer une autre stratégie
                                                        </SecondaryButton>
                                                        {pickerListId === list.id && (
                                                            <>
                                                                <div
                                                                    onClick={() => setPickerListId(null)}
                                                                    style={{
                                                                        position: "fixed",
                                                                        inset: 0,
                                                                        zIndex: 10,
                                                                    }}
                                                                />
                                                                <div
                                                                    style={{
                                                                        position: "absolute",
                                                                        top: "calc(100% + 6px)",
                                                                        left: 0,
                                                                        zIndex: 20,
                                                                        minWidth: 260,
                                                                        maxHeight: 280,
                                                                        overflowY: "auto",
                                                                        background: COLORS.bg,
                                                                        border: `1px solid ${COLORS.border}`,
                                                                        borderRadius: 12,
                                                                        boxShadow: "0 12px 32px rgba(15, 23, 42, 0.12)",
                                                                        padding: 6,
                                                                    }}
                                                                >
                                                                    {availableCampaigns.map((c) => (
                                                                        <button
                                                                            key={c.id}
                                                                            type="button"
                                                                            onClick={() => handleAssign(list, c.id)}
                                                                            style={{
                                                                                width: "100%",
                                                                                textAlign: "left",
                                                                                padding: "10px 12px",
                                                                                fontSize: 14,
                                                                                color: COLORS.text,
                                                                                background: "transparent",
                                                                                border: "none",
                                                                                borderRadius: 8,
                                                                                cursor: "pointer",
                                                                                display: "flex",
                                                                                alignItems: "center",
                                                                                gap: 8,
                                                                            }}
                                                                            onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.bgSubtle)}
                                                                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                                                        >
                                                                            <Target style={{ width: 14, height: 14, color: COLORS.indigo }} />
                                                                            {c.name}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <PrimaryButton
                                                onClick={() => openCreateForList(list.id)}
                                                icon={<Plus style={{ width: 16, height: 16 }} />}
                                                disabled={isBusy}
                                            >
                                                Créer une stratégie
                                            </PrimaryButton>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <StrategyEditorDrawer
                isOpen={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                campaignId={editingCampaignId}
                missionId={missionId}
                lists={lists}
                initialAssignToListId={initialAssignToListId}
                onSaved={onChange}
            />
        </div>
    );
}

function ReadinessPill({ label, ok }: { label: string; ok: boolean }) {
    const color = ok ? COLORS.emerald : COLORS.amber;
    const bg = ok ? COLORS.emeraldBg : COLORS.amberBg;
    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                fontWeight: 500,
                color,
                background: bg,
                padding: "6px 12px",
                borderRadius: 8,
                border: `1px solid ${color}33`,
            }}
        >
            {ok ? <CheckCircle2 style={{ width: 14, height: 14 }} /> : <AlertCircle style={{ width: 14, height: 14 }} />}
            {label} {ok ? "OK" : "manquant"}
        </span>
    );
}

function PrimaryButton({
    children,
    onClick,
    icon,
    disabled,
}: {
    children: React.ReactNode;
    onClick: () => void;
    icon?: React.ReactNode;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "11px 18px",
                fontSize: 14,
                fontWeight: 600,
                color: "#FFFFFF",
                background: `linear-gradient(135deg, ${COLORS.indigo}, ${COLORS.indigoDark})`,
                border: "none",
                borderRadius: 10,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.6 : 1,
                boxShadow: "0 4px 12px rgba(79, 70, 229, 0.25)",
                transition: "transform 120ms ease, box-shadow 120ms ease",
            }}
            onMouseEnter={(e) => {
                if (disabled) return;
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 6px 18px rgba(79, 70, 229, 0.35)";
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(79, 70, 229, 0.25)";
            }}
        >
            {icon}
            {children}
            <ChevronRight style={{ width: 16, height: 16, marginLeft: 2 }} />
        </button>
    );
}

function SecondaryButton({
    children,
    onClick,
    icon,
    disabled,
}: {
    children: React.ReactNode;
    onClick: () => void;
    icon?: React.ReactNode;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "11px 16px",
                fontSize: 14,
                fontWeight: 500,
                color: COLORS.text,
                background: COLORS.bg,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 10,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.6 : 1,
                transition: "border-color 120ms ease, background 120ms ease",
            }}
            onMouseEnter={(e) => {
                if (disabled) return;
                e.currentTarget.style.borderColor = COLORS.indigo;
                e.currentTarget.style.background = COLORS.indigoBg;
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = COLORS.border;
                e.currentTarget.style.background = COLORS.bg;
            }}
        >
            {icon}
            {children}
        </button>
    );
}
