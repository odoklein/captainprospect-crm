"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Drawer,
    DrawerSection,
    Button,
    Input,
    Select,
    useToast,
} from "@/components/ui";
import {
    Loader2,
    RotateCcw,
    Copy,
    ChevronRight,
    Save,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================
// TYPES
// ============================================

export interface MissionStatusItem {
    id?: string;
    code: string;
    label: string | null;
    color: string | null;
    sortOrder: number;
    requiresNote: boolean;
    priorityLabel: string;
    priorityOrder: number | null;
    triggersOpportunity: boolean;
    triggersCallback: boolean;
    resultCategoryCode?: string | null;
}

interface MissionStatusWorkflowDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    missionId: string;
    missionName?: string;
    onSaved?: () => void;
}

const PRIORITY_OPTIONS = [
    { value: "CALLBACK", label: "Rappel" },
    { value: "FOLLOW_UP", label: "Suivi" },
    { value: "NEW", label: "Nouveau" },
    { value: "RETRY", label: "Réessayer" },
    { value: "SKIP", label: "Ignorer" },
];

const PRESET_COLORS = [
    "#F5F5DC", "#90EE90", "#FFB6C1", "#FFA07A", "#87CEEB", "#DDA0DD", "#D3D3D3",
    "#E8E8E8", "#FFCDD2", "#C8E6C9", "#BBDEFB", "#A5D6A7", "#FFCC80", "#D7CCC8", "#B39DDB",
];

// ============================================
// MISSION STATUS WORKFLOW DRAWER
// ============================================

export function MissionStatusWorkflowDrawer({
    isOpen,
    onClose,
    missionId,
    missionName,
    onSaved,
}: MissionStatusWorkflowDrawerProps) {
    const { success, error: showError } = useToast();
    const [loading, setLoading] = useState(true);
    const [source, setSource] = useState<"MISSION" | "GLOBAL">("GLOBAL");
    const [statuses, setStatuses] = useState<MissionStatusItem[]>([]);
    const [categories, setCategories] = useState<{ id: string; code: string; label: string }[]>([]);
    const [expandedCode, setExpandedCode] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState<MissionStatusItem | null>(null);
    const [saving, setSaving] = useState(false);
    const [copying, setCopying] = useState<"short" | "full" | null>(null);
    const [resetting, setResetting] = useState(false);
    const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string>("");

    const fetchStatuses = useCallback(async () => {
        if (!missionId || !isOpen) return;
        setLoading(true);
        try {
            const [statusRes, catRes] = await Promise.all([
                fetch(`/api/missions/${missionId}/action-statuses`),
                fetch("/api/manager/result-categories").catch(() => ({ json: async () => ({ success: false }) })),
            ]);
            const json = await statusRes.json();
            if (json.success && json.data) {
                setSource(json.data.source);
                const list = json.data.statuses || [];
                setStatuses(list);
                setLastSavedSnapshot(JSON.stringify(list));
                setExpandedCode(null);
                setEditDraft(null);
            } else {
                showError("Erreur", json.error || "Impossible de charger les statuts");
            }
            const catJson = await catRes.json();
            if (catJson.success && Array.isArray(catJson.data)) {
                setCategories(catJson.data.map((c: { id: string; code: string; label: string }) => ({ id: c.id, code: c.code, label: c.label })));
            }
        } catch (err) {
            console.error(err);
            showError("Erreur", "Impossible de charger les statuts");
        } finally {
            setLoading(false);
        }
    }, [missionId, isOpen, showError]);

    useEffect(() => {
        fetchStatuses();
    }, [fetchStatuses]);

    const handleCopyDefault = async (preset: "short" | "full") => {
        setCopying(preset);
        try {
            const res = await fetch(`/api/missions/${missionId}/action-statuses/copy-default`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ preset }),
            });
            const json = await res.json();
            if (json.success && json.data) {
                setSource("MISSION");
                const list = json.data.statuses || [];
                setStatuses(list);
                setLastSavedSnapshot(JSON.stringify(list));
                setExpandedCode(null);
                setEditDraft(null);
                success("Statuts appliqués", preset === "short" ? "Défaut court (9) appliqué." : "Défaut complet (8) appliqué.");
                onSaved?.();
            } else {
                showError("Erreur", json.error || "Échec de l'application du défaut");
            }
        } catch (err) {
            console.error(err);
            showError("Erreur", "Échec de l'application du défaut");
        } finally {
            setCopying(null);
        }
    };

    const handleReset = async () => {
        setResetting(true);
        try {
            const res = await fetch(`/api/missions/${missionId}/action-statuses`, { method: "DELETE" });
            const json = await res.json();
            if (json.success) {
                await fetchStatuses();
                success("Réinitialisation", "Les statuts de la mission utilisent à nouveau le défaut global.");
                onSaved?.();
            } else {
                showError("Erreur", json.error || "Échec de la réinitialisation");
            }
        } catch (err) {
            console.error(err);
            showError("Erreur", "Échec de la réinitialisation");
        } finally {
            setResetting(false);
        }
    };

    const handleSaveAll = async () => {
        if (source !== "MISSION" || statuses.length === 0) return;
        setSaving(true);
        try {
            const payload = statuses.map((s) => ({
                code: s.code,
                label: s.label ?? s.code,
                color: s.color ?? null,
                sortOrder: s.sortOrder,
                requiresNote: s.requiresNote,
                priorityLabel: s.priorityLabel,
                priorityOrder: s.priorityOrder,
                triggersOpportunity: s.triggersOpportunity,
                triggersCallback: s.triggersCallback,
                resultCategoryCode: s.resultCategoryCode ?? null,
            }));
            const res = await fetch(`/api/missions/${missionId}/action-statuses`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ statuses: payload }),
            });
            const json = await res.json();
            if (json.success && json.data) {
                setSource("MISSION");
                const list = json.data.statuses || [];
                setStatuses(list);
                setLastSavedSnapshot(JSON.stringify(list));
                setExpandedCode(null);
                setEditDraft(null);
                success("Enregistré", "Les statuts ont été mis à jour.");
                onSaved?.();
            } else {
                showError("Erreur", json.error || "Échec de l'enregistrement");
            }
        } catch (err) {
            console.error(err);
            showError("Erreur", "Échec de l'enregistrement");
        } finally {
            setSaving(false);
        }
    };

    const startEdit = (item: MissionStatusItem) => {
        setExpandedCode(item.code);
        setEditDraft({ ...item, label: item.label ?? item.code });
    };

    const cancelEdit = () => {
        setExpandedCode(null);
        setEditDraft(null);
    };

    const applyEdit = () => {
        if (!editDraft) return;
        setStatuses((prev) =>
            prev.map((s) => (s.code === editDraft.code ? { ...editDraft, label: editDraft.label || editDraft.code } : s))
        );
        setExpandedCode(null);
        setEditDraft(null);
    };

    const updateDraft = (updates: Partial<MissionStatusItem>) => {
        setEditDraft((d) => (d ? { ...d, ...updates } : null));
    };

    const isDirty =
        source === "MISSION" &&
        statuses.length > 0 &&
        JSON.stringify(statuses) !== lastSavedSnapshot;

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title="Statuts et workflow"
            description={missionName ? `Mission : ${missionName}` : "Définir les statuts d'appel pour cette mission."}
            size="xl"
            footer={
                source === "MISSION" && statuses.length > 0 ? (
                    <div className="flex items-center justify-between gap-4">
                        <Button
                            variant="ghost"
                            onClick={onClose}
                            disabled={saving}
                        >
                            Fermer
                        </Button>
                        <div className="flex items-center gap-2">
                            {expandedCode && editDraft && (
                                <Button variant="secondary" onClick={cancelEdit} disabled={saving}>
                                    Annuler
                                </Button>
                            )}
                            <Button
                                variant="primary"
                                onClick={handleSaveAll}
                                disabled={saving || !isDirty}
                                isLoading={saving}
                            >
                                <Save className="w-4 h-4" />
                                Enregistrer
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex justify-end">
                        <Button variant="ghost" onClick={onClose}>
                            Fermer
                        </Button>
                    </div>
                )
            }
        >
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                </div>
            ) : (
                <div className="space-y-8">
                    {/* Vue d'ensemble */}
                    <DrawerSection title="Vue d'ensemble">
                        <div className="flex flex-wrap items-center gap-4">
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-sm">
                                <span className="font-medium">{statuses.length}</span>
                                <span>statuts</span>
                                <span className="text-slate-400">·</span>
                                <span className={source === "MISSION" ? "text-primary-600 font-medium" : "text-slate-500"}>
                                    {source === "MISSION" ? "Personnalisés (mission)" : "Défaut global"}
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => handleCopyDefault("short")}
                                    disabled={!!copying}
                                    isLoading={copying === "short"}
                                >
                                    <Copy className="w-4 h-4" />
                                    Défaut court (9)
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => handleCopyDefault("full")}
                                    disabled={!!copying}
                                    isLoading={copying === "full"}
                                >
                                    <Copy className="w-4 h-4" />
                                    Défaut complet (8)
                                </Button>
                                {source === "MISSION" && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleReset}
                                        disabled={resetting}
                                        isLoading={resetting}
                                    >
                                        <RotateCcw className="w-4 h-4" />
                                        Tout réinitialiser
                                    </Button>
                                )}
                            </div>
                        </div>
                    </DrawerSection>

                    {/* Liste des statuts */}
                    <DrawerSection title="Statuts">
                        <div className="space-y-3">
                            {statuses.map((item) => {
                                const isExpanded = expandedCode === item.code;
                                const draft = isExpanded ? editDraft : null;

                                return (
                                    <div
                                        key={item.code}
                                        className={cn(
                                            "rounded-xl border transition-all",
                                            isExpanded
                                                ? "border-primary-200 bg-primary-50/30 shadow-sm"
                                                : "border-slate-200 bg-white hover:border-slate-300"
                                        )}
                                    >
                                        {/* Row: color + label + priority + modifier */}
                                        <div className="flex items-center gap-4 p-4">
                                            <div
                                                className="w-5 h-5 rounded-full shrink-0 border border-slate-200"
                                                style={{ backgroundColor: item.color || "var(--ds-line)" }}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-slate-900 truncate">
                                                    {item.label || item.code}
                                                </p>
                                                <p className="text-xs text-slate-500 mt-0.5">{item.code}</p>
                                            </div>
                                            <span className="text-xs px-2 py-1 rounded-md bg-slate-100 text-slate-600 shrink-0">
                                                {PRIORITY_OPTIONS.find((o) => o.value === item.priorityLabel)?.label ?? item.priorityLabel}
                                            </span>
                                            {item.resultCategoryCode && categories.length > 0 && (
                                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-primary-50 text-primary-700 shrink-0">
                                                    {categories.find((c) => c.code === item.resultCategoryCode)?.label ?? item.resultCategoryCode}
                                                </span>
                                            )}
                                            {source === "MISSION" && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => (isExpanded ? cancelEdit() : startEdit(item))}
                                                >
                                                    {isExpanded ? "Annuler" : "Modifier"}
                                                </Button>
                                            )}
                                            {!isExpanded && source === "MISSION" && (
                                                <button
                                                    type="button"
                                                    onClick={() => startEdit(item)}
                                                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                                                    aria-label="Ouvrir"
                                                >
                                                    <ChevronRight className="w-4 h-4" />
                                                </button>
                                            )}
                                            {isExpanded && (
                                                <button
                                                    type="button"
                                                    onClick={applyEdit}
                                                    className="p-1.5 text-primary-600 hover:bg-primary-100 rounded-lg"
                                                    aria-label="Appliquer"
                                                >
                                                    <Save className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>

                                        {/* Expanded form */}
                                        {isExpanded && draft && (
                                            <div className="px-4 pb-4 pt-0 border-t border-slate-100 mt-0 pt-4 space-y-4">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <Input
                                                        label="Libellé"
                                                        value={draft.label ?? ""}
                                                        onChange={(e) => updateDraft({ label: e.target.value || null })}
                                                        placeholder={draft.code}
                                                    />
                                                    <div>
                                                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                                            Couleur
                                                        </label>
                                                        <div className="flex flex-wrap gap-2 items-center">
                                                            <input
                                                                type="color"
                                                                value={draft.color || "#e2e8f0"}
                                                                onChange={(e) => updateDraft({ color: e.target.value })}
                                                                className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
                                                            />
                                                            <Input
                                                                value={draft.color ?? ""}
                                                                onChange={(e) => updateDraft({ color: e.target.value || null })}
                                                                placeholder="#hex"
                                                                className="flex-1 min-w-[100px]"
                                                            />
                                                            <div className="flex flex-wrap gap-1">
                                                                {PRESET_COLORS.slice(0, 8).map((c) => (
                                                                    <button
                                                                        key={c}
                                                                        type="button"
                                                                        onClick={() => updateDraft({ color: c })}
                                                                        className="w-6 h-6 rounded-full border-2 border-slate-200 hover:border-primary-400 transition-colors"
                                                                        style={{ backgroundColor: c }}
                                                                        title={c}
                                                                    />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-6">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={draft.requiresNote}
                                                            onChange={(e) => updateDraft({ requiresNote: e.target.checked })}
                                                            className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                                                        />
                                                        <span className="text-sm text-slate-700">Note obligatoire</span>
                                                    </label>
                                                    <div className="flex items-center gap-2 min-w-[180px]">
                                                        <label className="text-sm font-medium text-slate-700 shrink-0">Priorité</label>
                                                        <Select
                                                            value={draft.priorityLabel}
                                                            onChange={(v) => updateDraft({ priorityLabel: v })}
                                                            options={PRIORITY_OPTIONS}
                                                        />
                                                    </div>
                                                    {categories.length > 0 && (
                                                        <div className="flex items-center gap-2 min-w-[200px]">
                                                            <label className="text-sm font-medium text-slate-700 shrink-0">Catégorie résultat</label>
                                                            <Select
                                                                value={draft.resultCategoryCode ?? ""}
                                                                onChange={(v) => updateDraft({ resultCategoryCode: v || null })}
                                                                options={[
                                                                    { value: "", label: "— Aucune —" },
                                                                    ...categories.map((c) => ({ value: c.code, label: c.label })),
                                                                ]}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        {statuses.length === 0 && (
                            <p className="text-sm text-slate-500 py-4">
                                Aucun statut. Utilisez « Défaut court » ou « Défaut complet » pour en ajouter.
                            </p>
                        )}
                    </DrawerSection>
                </div>
            )}
        </Drawer>
    );
}
