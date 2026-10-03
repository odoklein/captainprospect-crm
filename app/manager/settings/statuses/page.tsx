"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
    ArrowLeft,
    Save,
    Loader2,
    Tag,
    ListOrdered,
    Plus,
    Pencil,
    Trash2,
    CheckCircle2,
    AlertCircle,
    Settings2,
    ArrowRightLeft,
    Eye,
    EyeOff,
    Target,
    Clock,
    MessageSquare,
    Search,
    Info,
    ToggleLeft,
    ToggleRight,
} from "lucide-react";

// ============================================
// TYPES
// ============================================

type PriorityLabel = "CALLBACK" | "FOLLOW_UP" | "NEW" | "RETRY" | "SKIP";

interface ResultCategory {
    id: string;
    code: string;
    label: string;
    color: string | null;
    sortOrder: number;
    description: string | null;
}

interface GlobalStatus {
    id: string;
    code: string;
    label: string | null;
    color: string | null;
    sortOrder: number;
    requiresNote: boolean;
    priorityLabel: PriorityLabel;
    priorityOrder: number | null;
    triggersOpportunity: boolean;
    triggersCallback: boolean;
    resultCategoryCode: string | null;
    isActive: boolean;
}

interface RemapData {
    resultCodes: Array<{ code: string; count: number }>;
    globalStatuses: Array<{ code: string; label: string | null; isActive: boolean }>;
    validEnumValues: string[];
    orphanCodes: string[];
    totalActions: number;
}

// ============================================
// CONSTANTS
// ============================================

const PRIORITY_OPTIONS: { value: PriorityLabel; label: string; color: string }[] = [
    { value: "CALLBACK", label: "Rappel", color: "bg-amber-100 text-amber-700" },
    { value: "FOLLOW_UP", label: "Suivi", color: "bg-blue-100 text-blue-700" },
    { value: "NEW", label: "Nouveau", color: "bg-emerald-100 text-emerald-700" },
    { value: "RETRY", label: "Réessayer", color: "bg-slate-100 text-slate-700" },
    { value: "SKIP", label: "Ignorer", color: "bg-gray-100 text-gray-500" },
];

const TAB_KEYS = ["statuses", "categories", "mapping"] as const;
type TabKey = (typeof TAB_KEYS)[number];

// ============================================
// COMPONENT
// ============================================

export default function ManagerSettingsStatusesPage() {
    const [activeTab, setActiveTab] = useState<TabKey>("statuses");

    // Data
    const [categories, setCategories] = useState<ResultCategory[]>([]);
    const [statuses, setStatuses] = useState<GlobalStatus[]>([]);
    const [remapData, setRemapData] = useState<RemapData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Status form
    const [editingStatus, setEditingStatus] = useState<string | null>(null);
    const [showAddStatus, setShowAddStatus] = useState(false);
    const [newStatus, setNewStatus] = useState({
        code: "", label: "", color: "#64748b", requiresNote: false,
        priorityLabel: "SKIP" as PriorityLabel, triggersOpportunity: false, triggersCallback: false,
        resultCategoryCode: null as string | null,
    });
    const [statusSearch, setStatusSearch] = useState("");
    const [showInactive, setShowInactive] = useState(false);

    // Category form
    const [editingCategory, setEditingCategory] = useState<ResultCategory | null>(null);
    const [newCategoryCode, setNewCategoryCode] = useState("");
    const [newCategoryLabel, setNewCategoryLabel] = useState("");
    const [newCategoryColor, setNewCategoryColor] = useState("#64748b");
    const [newCategorySortOrder, setNewCategorySortOrder] = useState(0);
    const [showAddCategory, setShowAddCategory] = useState(false);
    const [categorySaving, setCategorySaving] = useState(false);
    const [categoryDeleting, setCategoryDeleting] = useState<string | null>(null);

    // Mapping
    const [mappings, setMappings] = useState<Record<string, string>>({});
    const [remapping, setRemapping] = useState(false);

    // ============================================
    // DATA LOADING
    // ============================================

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [catRes, statusRes] = await Promise.all([
                fetch("/api/manager/result-categories").then((r) => r.json()),
                fetch("/api/manager/action-statuses/global?includeInactive=true").then((r) => r.json()),
            ]);
            if (catRes.success) setCategories(catRes.data);
            if (statusRes.success) setStatuses(statusRes.data);
        } finally {
            setLoading(false);
        }
    }, []);

    const loadRemapData = useCallback(async () => {
        try {
            const res = await fetch("/api/manager/action-statuses/remap");
            const json = await res.json();
            if (json.success) setRemapData(json.data);
        } catch { /* ignore */ }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);
    useEffect(() => { if (activeTab === "mapping") loadRemapData(); }, [activeTab, loadRemapData]);

    // ============================================
    // MESSAGE HELPER
    // ============================================

    function showMsg(type: "success" | "error", text: string) {
        setMessage({ type, text });
        if (type === "success") setTimeout(() => setMessage(null), 4000);
    }

    // ============================================
    // STATUS HANDLERS
    // ============================================

    function updateStatusField(code: string, field: keyof GlobalStatus, value: unknown) {
        setStatuses((prev) =>
            prev.map((s) => (s.code === code ? { ...s, [field]: value } : s))
        );
    }

    async function handleSaveStatuses() {
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch("/api/manager/action-statuses/global", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    statuses: statuses.map((s) => ({
                        code: s.code,
                        label: s.label,
                        color: s.color,
                        sortOrder: s.sortOrder,
                        requiresNote: s.requiresNote,
                        priorityLabel: s.priorityLabel,
                        triggersOpportunity: s.triggersOpportunity,
                        triggersCallback: s.triggersCallback,
                        resultCategoryCode: s.resultCategoryCode,
                        isActive: s.isActive,
                    })),
                }),
            });
            const json = await res.json();
            if (json.success) {
                setStatuses(json.data);
                showMsg("success", "Statuts enregistrés avec succès");
            } else {
                showMsg("error", json.error || "Erreur");
            }
        } catch {
            showMsg("error", "Erreur de connexion");
        } finally {
            setSaving(false);
        }
    }

    async function handleCreateStatus() {
        if (!newStatus.code.trim() || !newStatus.label.trim()) return;
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch("/api/manager/action-statuses/global", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    code: newStatus.code.toUpperCase().replace(/\s+/g, "_"),
                    label: newStatus.label,
                    color: newStatus.color,
                    requiresNote: newStatus.requiresNote,
                    priorityLabel: newStatus.priorityLabel,
                    triggersOpportunity: newStatus.triggersOpportunity,
                    triggersCallback: newStatus.triggersCallback,
                    resultCategoryCode: newStatus.resultCategoryCode,
                }),
            });
            const json = await res.json();
            if (json.success) {
                setStatuses((prev) => [...prev, json.data].sort((a, b) => a.sortOrder - b.sortOrder));
                setShowAddStatus(false);
                setNewStatus({
                    code: "", label: "", color: "#64748b", requiresNote: false,
                    priorityLabel: "SKIP", triggersOpportunity: false, triggersCallback: false,
                    resultCategoryCode: null,
                });
                showMsg("success", "Statut créé avec succès");
            } else {
                showMsg("error", json.error || "Erreur");
            }
        } catch {
            showMsg("error", "Erreur de connexion");
        } finally {
            setSaving(false);
        }
    }

    async function handleToggleActive(code: string, isActive: boolean) {
        setSaving(true);
        try {
            const res = await fetch("/api/manager/action-statuses/global", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ statuses: [{ code, isActive }] }),
            });
            const json = await res.json();
            if (json.success) {
                setStatuses(json.data);
                showMsg("success", isActive ? "Statut réactivé" : "Statut désactivé");
            }
        } catch {
            showMsg("error", "Erreur de connexion");
        } finally {
            setSaving(false);
        }
    }

    // ============================================
    // CATEGORY HANDLERS
    // ============================================

    async function handleCreateCategory() {
        if (!newCategoryCode.trim() || !newCategoryLabel.trim()) return;
        const code = newCategoryCode.trim().toUpperCase().replace(/\s+/g, "_");
        setCategorySaving(true);
        setMessage(null);
        try {
            const res = await fetch("/api/manager/result-categories", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    code,
                    label: newCategoryLabel.trim(),
                    color: newCategoryColor,
                    sortOrder: newCategorySortOrder,
                }),
            });
            const json = await res.json();
            if (json.success) {
                setCategories((prev) => [...prev, json.data].sort((a, b) => a.sortOrder - b.sortOrder));
                setShowAddCategory(false);
                setNewCategoryCode("");
                setNewCategoryLabel("");
                setNewCategoryColor("#64748b");
                setNewCategorySortOrder(categories.length);
                showMsg("success", "Catégorie créée");
            } else {
                showMsg("error", json.error || "Erreur");
            }
        } catch {
            showMsg("error", "Erreur de connexion");
        } finally {
            setCategorySaving(false);
        }
    }

    async function handleUpdateCategory(cat: ResultCategory, updates: Partial<ResultCategory>) {
        setCategorySaving(true);
        setMessage(null);
        try {
            const res = await fetch(`/api/manager/result-categories/${cat.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updates),
            });
            const json = await res.json();
            if (json.success) {
                setCategories((prev) =>
                    prev.map((c) => (c.id === cat.id ? json.data : c)).sort((a, b) => a.sortOrder - b.sortOrder)
                );
                setEditingCategory(null);
                showMsg("success", "Catégorie mise à jour");
            } else {
                showMsg("error", json.error || "Erreur");
            }
        } catch {
            showMsg("error", "Erreur de connexion");
        } finally {
            setCategorySaving(false);
        }
    }

    async function handleDeleteCategory(cat: ResultCategory) {
        if (!window.confirm("Supprimer cette catégorie ? Les statuts qui y sont rattachés n'auront plus de catégorie.")) return;
        setCategoryDeleting(cat.id);
        setMessage(null);
        try {
            const res = await fetch(`/api/manager/result-categories/${cat.id}`, { method: "DELETE" });
            const json = await res.json();
            if (json.success) {
                setCategories((prev) => prev.filter((c) => c.id !== cat.id));
                setStatuses((prev) =>
                    prev.map((s) => (s.resultCategoryCode === cat.code ? { ...s, resultCategoryCode: null } : s))
                );
                showMsg("success", "Catégorie supprimée");
            } else {
                showMsg("error", json.error || "Erreur");
            }
        } catch {
            showMsg("error", "Erreur de connexion");
        } finally {
            setCategoryDeleting(null);
        }
    }

    // ============================================
    // MAPPING HANDLERS
    // ============================================

    async function handleApplyMappings() {
        const entries = selectedMappings;
        if (entries.length === 0) return;
        const activeTargetCodes = new Set(activeGlobalStatuses.map((s) => s.code));
        const invalidEntry = entries.find(([, to]) => !activeTargetCodes.has(to));
        if (invalidEntry) {
            showMsg("error", `Code cible invalide ou inactif: ${invalidEntry[1]}`);
            return;
        }
        if (
            !window.confirm(
                `Remapper ${entries.length} statut(s) pour ${selectedImpactCount.toLocaleString()} action(s) ? Les statuts MISSION hérités correspondants seront désactivés.`
            )
        ) return;

        setRemapping(true);
        setMessage(null);
        try {
            const res = await fetch("/api/manager/action-statuses/remap", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mappings: entries.map(([fromCode, toCode]) => ({ fromCode, toCode })),
                }),
            });
            const json = await res.json();
            if (json.success) {
                showMsg("success", `${json.data.totalUpdated} action(s) remappée(s) avec succès`);
                setMappings({});
                loadRemapData();
            } else {
                showMsg("error", json.error || "Erreur");
            }
        } catch {
            showMsg("error", "Erreur de connexion");
        } finally {
            setRemapping(false);
        }
    }

    // ============================================
    // DERIVED DATA
    // ============================================

    const filteredStatuses = useMemo(() => {
        let items = statuses;
        if (!showInactive) items = items.filter((s) => s.isActive);
        if (statusSearch.trim()) {
            const q = statusSearch.toLowerCase();
            items = items.filter(
                (s) =>
                    s.code.toLowerCase().includes(q) ||
                    (s.label ?? "").toLowerCase().includes(q)
            );
        }
        return items;
    }, [statuses, showInactive, statusSearch]);

    const actionCountMap = useMemo(() => {
        if (!remapData) return new Map<string, number>();
        return new Map(remapData.resultCodes.map((r) => [r.code, r.count]));
    }, [remapData]);

    const activeGlobalStatuses = useMemo(
        () => remapData?.globalStatuses.filter((gs) => gs.isActive) ?? [],
        [remapData]
    );

    const selectedMappings = useMemo(
        () => Object.entries(mappings).filter(([from, to]) => from !== to && !!to),
        [mappings]
    );

    const selectedImpactCount = useMemo(
        () => selectedMappings.reduce((sum, [from]) => sum + (actionCountMap.get(from) ?? 0), 0),
        [selectedMappings, actionCountMap]
    );

    const activeCount = statuses.filter((s) => s.isActive).length;
    const inactiveCount = statuses.filter((s) => !s.isActive).length;

    // ============================================
    // RENDER
    // ============================================

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                <p className="text-sm text-slate-500">Chargement des statuts…</p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link
                    href="/manager/settings"
                    className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4 text-slate-600" />
                </Link>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        <Settings2 className="w-6 h-6 text-primary-500" />
                        Gestion des statuts
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Configurez les statuts d&apos;action, catégories de résultat et migrez les données existantes.
                    </p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
                    <p className="text-xs font-medium text-slate-500">Statuts actifs</p>
                    <p className="text-2xl font-bold text-slate-900">{activeCount}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
                    <p className="text-xs font-medium text-slate-500">Statuts inactifs</p>
                    <p className="text-2xl font-bold text-slate-400">{inactiveCount}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
                    <p className="text-xs font-medium text-slate-500">Catégories</p>
                    <p className="text-2xl font-bold text-slate-900">{categories.length}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
                    <p className="text-xs font-medium text-slate-500">Codes orphelins</p>
                    <p className="text-2xl font-bold text-amber-600">{remapData?.orphanCodes.length ?? "—"}</p>
                </div>
            </div>

            {/* Toast */}
            {message && (
                <div
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
                        message.type === "success"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-red-50 text-red-700 border border-red-200"
                    }`}
                >
                    {message.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    {message.text}
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                {[
                    { key: "statuses" as TabKey, label: "Statuts d'action", icon: ListOrdered },
                    { key: "categories" as TabKey, label: "Catégories", icon: Tag },
                    { key: "mapping" as TabKey, label: "Migration & Mapping", icon: ArrowRightLeft },
                ].map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                            activeTab === tab.key
                                ? "bg-white text-slate-900 shadow-sm"
                                : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
                        }`}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ============================================ */}
            {/* TAB: STATUSES */}
            {/* ============================================ */}
            {activeTab === "statuses" && (
                <div className="space-y-4">
                    {/* Toolbar */}
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-[200px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Rechercher un statut…"
                                value={statusSearch}
                                onChange={(e) => setStatusSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowInactive(!showInactive)}
                            className={`inline-flex items-center gap-2 px-3 py-2.5 text-sm font-medium rounded-xl border transition-colors ${
                                showInactive
                                    ? "bg-amber-50 border-amber-200 text-amber-700"
                                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                            }`}
                        >
                            {showInactive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            {showInactive ? "Masquer inactifs" : "Voir inactifs"}
                            {inactiveCount > 0 && (
                                <span className="bg-amber-200 text-amber-800 text-xs px-1.5 py-0.5 rounded-full">{inactiveCount}</span>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowAddStatus(true)}
                            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-xl hover:bg-primary-700 transition-colors"
                        >
                            <Plus className="w-4 h-4" /> Nouveau statut
                        </button>
                        <button
                            type="button"
                            onClick={handleSaveStatuses}
                            disabled={saving}
                            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Enregistrer tout
                        </button>
                    </div>

                    {/* Add status form */}
                    {showAddStatus && (
                        <div className="bg-primary-50/50 border-2 border-primary-200 rounded-2xl p-5 space-y-4">
                            <h3 className="text-sm font-semibold text-primary-900 flex items-center gap-2">
                                <Plus className="w-4 h-4" /> Créer un nouveau statut
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Code *</label>
                                    <input
                                        type="text"
                                        value={newStatus.code}
                                        onChange={(e) => setNewStatus((p) => ({ ...p, code: e.target.value.toUpperCase().replace(/\s/g, "_") }))}
                                        placeholder="MON_STATUT"
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-400 focus:outline-none font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Libellé *</label>
                                    <input
                                        type="text"
                                        value={newStatus.label}
                                        onChange={(e) => setNewStatus((p) => ({ ...p, label: e.target.value }))}
                                        placeholder="Mon statut"
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-400 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Couleur</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="color"
                                            value={newStatus.color}
                                            onChange={(e) => setNewStatus((p) => ({ ...p, color: e.target.value }))}
                                            className="h-9 w-14 rounded border border-slate-200 cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            value={newStatus.color}
                                            onChange={(e) => setNewStatus((p) => ({ ...p, color: e.target.value }))}
                                            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono focus:ring-2 focus:ring-primary-400 focus:outline-none"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Priorité</label>
                                    <select
                                        value={newStatus.priorityLabel}
                                        onChange={(e) => setNewStatus((p) => ({ ...p, priorityLabel: e.target.value as PriorityLabel }))}
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-400 focus:outline-none bg-white"
                                    >
                                        {PRIORITY_OPTIONS.map((o) => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Catégorie</label>
                                    <select
                                        value={newStatus.resultCategoryCode ?? ""}
                                        onChange={(e) => setNewStatus((p) => ({ ...p, resultCategoryCode: e.target.value || null }))}
                                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-400 focus:outline-none bg-white"
                                    >
                                        <option value="">— Aucune —</option>
                                        {categories.map((c) => (
                                            <option key={c.id} value={c.code}>{c.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-4">
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input type="checkbox" checked={newStatus.requiresNote}
                                        onChange={(e) => setNewStatus((p) => ({ ...p, requiresNote: e.target.checked }))}
                                        className="rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                                    <MessageSquare className="w-3.5 h-3.5 text-slate-500" /> Note obligatoire
                                </label>
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input type="checkbox" checked={newStatus.triggersCallback}
                                        onChange={(e) => setNewStatus((p) => ({ ...p, triggersCallback: e.target.checked }))}
                                        className="rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                                    <Clock className="w-3.5 h-3.5 text-slate-500" /> Déclenche rappel
                                </label>
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input type="checkbox" checked={newStatus.triggersOpportunity}
                                        onChange={(e) => setNewStatus((p) => ({ ...p, triggersOpportunity: e.target.checked }))}
                                        className="rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                                    <Target className="w-3.5 h-3.5 text-slate-500" /> Crée opportunité
                                </label>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={handleCreateStatus}
                                    disabled={saving || !newStatus.code.trim() || !newStatus.label.trim()}
                                    className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
                                >
                                    {saving ? "Création…" : "Créer le statut"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowAddStatus(false)}
                                    className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                                >
                                    Annuler
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Status table */}
                    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50/80">
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-10">#</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Couleur</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Code</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Libellé</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Priorité</th>
                                        <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Note</th>
                                        <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Rappel</th>
                                        <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Opportunité</th>
                                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Catégorie</th>
                                        <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actif</th>
                                        <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-10"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredStatuses.length === 0 && (
                                        <tr>
                                            <td colSpan={11} className="py-12 text-center text-sm text-slate-400">
                                                Aucun statut trouvé
                                            </td>
                                        </tr>
                                    )}
                                    {filteredStatuses.map((s) => {
                                        const isEditing = editingStatus === s.code;
                                        const priority = PRIORITY_OPTIONS.find((p) => p.value === s.priorityLabel);
                                        return (
                                            <tr
                                                key={s.id}
                                                className={`border-b border-slate-50 transition-colors ${
                                                    !s.isActive ? "opacity-50 bg-slate-50/50" : "hover:bg-slate-50/50"
                                                }`}
                                            >
                                                <td className="py-2.5 px-4 text-xs text-slate-400 font-mono">{s.sortOrder}</td>
                                                <td className="py-2.5 px-4">
                                                    {isEditing ? (
                                                        <input
                                                            type="color"
                                                            value={s.color ?? "#64748b"}
                                                            onChange={(e) => updateStatusField(s.code, "color", e.target.value)}
                                                            className="w-8 h-8 rounded border border-slate-200 cursor-pointer"
                                                        />
                                                    ) : (
                                                        <span
                                                            className="inline-block w-6 h-6 rounded-lg border border-slate-200"
                                                            style={{ backgroundColor: s.color ?? "#e2e8f0" }}
                                                        />
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-4 font-mono text-sm text-slate-700">{s.code}</td>
                                                <td className="py-2.5 px-4">
                                                    {isEditing ? (
                                                        <input
                                                            type="text"
                                                            value={s.label ?? ""}
                                                            onChange={(e) => updateStatusField(s.code, "label", e.target.value)}
                                                            className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-400 focus:outline-none"
                                                        />
                                                    ) : (
                                                        <span className="text-sm text-slate-800">{s.label ?? s.code}</span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-4">
                                                    {isEditing ? (
                                                        <select
                                                            value={s.priorityLabel}
                                                            onChange={(e) => updateStatusField(s.code, "priorityLabel", e.target.value)}
                                                            className="text-xs px-2 py-1.5 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-primary-400 focus:outline-none"
                                                        >
                                                            {PRIORITY_OPTIONS.map((o) => (
                                                                <option key={o.value} value={o.value}>{o.label}</option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${priority?.color ?? "bg-gray-100 text-gray-500"}`}>
                                                            {priority?.label ?? s.priorityLabel}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-4 text-center">
                                                    {isEditing ? (
                                                        <input
                                                            type="checkbox"
                                                            checked={s.requiresNote}
                                                            onChange={(e) => updateStatusField(s.code, "requiresNote", e.target.checked)}
                                                            className="rounded border-slate-300 text-primary-600"
                                                        />
                                                    ) : (
                                                        s.requiresNote && <MessageSquare className="w-4 h-4 text-blue-500 mx-auto" />
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-4 text-center">
                                                    {isEditing ? (
                                                        <input
                                                            type="checkbox"
                                                            checked={s.triggersCallback}
                                                            onChange={(e) => updateStatusField(s.code, "triggersCallback", e.target.checked)}
                                                            className="rounded border-slate-300 text-primary-600"
                                                        />
                                                    ) : (
                                                        s.triggersCallback && <Clock className="w-4 h-4 text-amber-500 mx-auto" />
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-4 text-center">
                                                    {isEditing ? (
                                                        <input
                                                            type="checkbox"
                                                            checked={s.triggersOpportunity}
                                                            onChange={(e) => updateStatusField(s.code, "triggersOpportunity", e.target.checked)}
                                                            className="rounded border-slate-300 text-primary-600"
                                                        />
                                                    ) : (
                                                        s.triggersOpportunity && <Target className="w-4 h-4 text-emerald-500 mx-auto" />
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-4">
                                                    {isEditing ? (
                                                        <select
                                                            value={s.resultCategoryCode ?? ""}
                                                            onChange={(e) => updateStatusField(s.code, "resultCategoryCode", e.target.value || null)}
                                                            className="text-xs px-2 py-1.5 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-primary-400 focus:outline-none min-w-[120px]"
                                                        >
                                                            <option value="">—</option>
                                                            {categories.map((c) => (
                                                                <option key={c.id} value={c.code}>{c.label}</option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        s.resultCategoryCode && (
                                                            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                                                {categories.find((c) => c.code === s.resultCategoryCode)?.label ?? s.resultCategoryCode}
                                                            </span>
                                                        )
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-4 text-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleActive(s.code, !s.isActive)}
                                                        disabled={saving}
                                                        className="text-slate-400 hover:text-slate-700"
                                                        title={s.isActive ? "Désactiver" : "Réactiver"}
                                                    >
                                                        {s.isActive
                                                            ? <ToggleRight className="w-5 h-5 text-emerald-500" />
                                                            : <ToggleLeft className="w-5 h-5 text-slate-300" />
                                                        }
                                                    </button>
                                                </td>
                                                <td className="py-2.5 px-4 text-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingStatus(isEditing ? null : s.code)}
                                                        className={`p-1.5 rounded-lg transition-colors ${
                                                            isEditing
                                                                ? "bg-primary-100 text-primary-600"
                                                                : "text-slate-400 hover:text-primary-600 hover:bg-primary-50"
                                                        }`}
                                                        title={isEditing ? "Terminer" : "Modifier"}
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-slate-50/50">
                            <p className="text-xs text-slate-400">
                                {filteredStatuses.length} statut(s) affiché(s) sur {statuses.length} total
                            </p>
                            <p className="text-xs text-slate-400">
                                Les scopes CLIENT / MISSION / CAMPAIGN peuvent surcharger ces statuts globaux.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================ */}
            {/* TAB: CATEGORIES */}
            {/* ============================================ */}
            {activeTab === "categories" && (
                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
                                <Tag className="w-4 h-4 text-primary-600" />
                            </div>
                            <div>
                                <span className="font-semibold text-slate-800">Catégories de résultat</span>
                                <p className="text-xs text-slate-500">Utilisées dans les rapports et le portail client pour grouper les statuts.</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowAddCategory(true)}
                            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        >
                            <Plus className="w-4 h-4" /> Nouvelle catégorie
                        </button>
                    </div>
                    <div className="p-6 space-y-4">
                        {showAddCategory && (
                            <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100">
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Code</label>
                                    <input
                                        type="text"
                                        value={newCategoryCode}
                                        onChange={(e) => setNewCategoryCode(e.target.value.toUpperCase().replace(/\s/g, "_"))}
                                        placeholder="EXEMPLE"
                                        className="w-48 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400 font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Libellé</label>
                                    <input
                                        type="text"
                                        value={newCategoryLabel}
                                        onChange={(e) => setNewCategoryLabel(e.target.value)}
                                        placeholder="Exemple catégorie"
                                        className="w-48 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Couleur</label>
                                    <input
                                        type="color"
                                        value={newCategoryColor}
                                        onChange={(e) => setNewCategoryColor(e.target.value)}
                                        className="h-9 w-14 rounded border border-slate-200 cursor-pointer"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Ordre</label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={newCategorySortOrder}
                                        onChange={(e) => setNewCategorySortOrder(parseInt(e.target.value, 10) || 0)}
                                        className="w-20 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={handleCreateCategory}
                                        disabled={categorySaving || !newCategoryCode.trim() || !newCategoryLabel.trim()}
                                        className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
                                    >
                                        {categorySaving ? "Création…" : "Créer"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowAddCategory(false);
                                            setNewCategoryCode("");
                                            setNewCategoryLabel("");
                                        }}
                                        className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                                    >
                                        Annuler
                                    </button>
                                </div>
                            </div>
                        )}

                        {categories.length === 0 && (
                            <div className="text-center py-12 text-slate-400 text-sm">
                                Aucune catégorie définie. Créez-en une pour grouper vos statuts.
                            </div>
                        )}

                        <div className="space-y-2">
                            {categories.map((cat) => (
                                <div
                                    key={cat.id}
                                    className="flex items-center gap-4 py-3 px-4 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors"
                                >
                                    <span
                                        className="w-5 h-5 rounded-lg shrink-0 border border-slate-200"
                                        style={{ backgroundColor: cat.color ?? "#e2e8f0" }}
                                    />
                                    <span className="font-mono text-sm text-slate-700 w-40">{cat.code}</span>
                                    {editingCategory?.id === cat.id ? (
                                        <>
                                            <input
                                                type="text"
                                                value={editingCategory.label}
                                                onChange={(e) => setEditingCategory((p) => (p ? { ...p, label: e.target.value } : null))}
                                                className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                                            />
                                            <input
                                                type="color"
                                                value={editingCategory.color ?? "#64748b"}
                                                onChange={(e) => setEditingCategory((p) => (p ? { ...p, color: e.target.value } : null))}
                                                className="w-10 h-8 rounded border border-slate-200 cursor-pointer"
                                            />
                                            <input
                                                type="number"
                                                min={0}
                                                value={editingCategory.sortOrder}
                                                onChange={(e) =>
                                                    setEditingCategory((p) =>
                                                        p ? { ...p, sortOrder: parseInt(e.target.value, 10) || 0 } : null
                                                    )
                                                }
                                                className="w-16 px-2 py-1.5 text-sm border border-slate-200 rounded-lg"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => editingCategory && handleUpdateCategory(cat, editingCategory)}
                                                disabled={categorySaving}
                                                className="px-3 py-1.5 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg"
                                            >
                                                OK
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setEditingCategory(null)}
                                                className="px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 rounded-lg"
                                            >
                                                Annuler
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <span className="flex-1 text-sm text-slate-800">{cat.label}</span>
                                            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                                {statuses.filter((s) => s.resultCategoryCode === cat.code).length} statut(s)
                                            </span>
                                            <span className="text-xs text-slate-400">Ordre {cat.sortOrder}</span>
                                            <button
                                                type="button"
                                                onClick={() => setEditingCategory({ ...cat })}
                                                className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
                                                title="Modifier"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteCategory(cat)}
                                                disabled={categoryDeleting === cat.id}
                                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                                title="Supprimer"
                                            >
                                                {categoryDeleting === cat.id ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="w-4 h-4" />
                                                )}
                                            </button>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================ */}
            {/* TAB: MAPPING */}
            {/* ============================================ */}
            {activeTab === "mapping" && (
                <div className="space-y-6">
                    {/* Info banner */}
                    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex gap-3">
                        <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                        <div className="text-sm text-blue-800">
                            <p className="font-medium mb-1">Migration de statuts</p>
                            <p>
                                Cet outil vous permet de remapper les actions existantes d&apos;un ancien code de statut vers un nouveau.
                                C&apos;est utile quand vous consolidez des statuts ou migrez vers une nouvelle nomenclature.
                                <strong> Les codes cibles doivent exister dans l&apos;enum ActionResult du schéma Prisma.</strong>
                            </p>
                        </div>
                    </div>

                    {!remapData ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-4">
                            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                            <p className="text-sm text-slate-500">Chargement des données…</p>
                        </div>
                    ) : (
                        <>
                            {/* Summary */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
                                    <p className="text-xs font-medium text-slate-500">Total actions</p>
                                    <p className="text-2xl font-bold text-slate-900">{remapData.totalActions.toLocaleString()}</p>
                                </div>
                                <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
                                    <p className="text-xs font-medium text-slate-500">Codes distincts utilisés</p>
                                    <p className="text-2xl font-bold text-slate-900">{remapData.resultCodes.length}</p>
                                </div>
                                <div className="bg-white rounded-xl border border-amber-200 px-4 py-3 border-2">
                                    <p className="text-xs font-medium text-amber-600">Codes orphelins (non définis globalement)</p>
                                    <p className="text-2xl font-bold text-amber-600">{remapData.orphanCodes.length}</p>
                                </div>
                            </div>

                            {/* Mapping table */}
                            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-lg bg-accent-100 flex items-center justify-center">
                                            <ArrowRightLeft className="w-4 h-4 text-accent-600" />
                                        </div>
                                        <span className="font-semibold text-slate-800">Actions par statut</span>
                                    </div>
                                    {selectedMappings.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={handleApplyMappings}
                                            disabled={remapping}
                                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-accent-600 rounded-lg hover:bg-accent-700 disabled:opacity-50"
                                        >
                                            {remapping ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
                                            Appliquer {selectedMappings.length} mapping(s)
                                        </button>
                                    )}
                                </div>
                                {selectedMappings.length > 0 && (
                                    <div className="px-6 py-3 border-b border-accent-100 bg-accent-50/60">
                                        <p className="text-xs text-accent-700">
                                            {selectedMappings.length} mapping(s) sélectionné(s), impact estimé:{" "}
                                            <strong>{selectedImpactCount.toLocaleString()} action(s)</strong>.
                                        </p>
                                    </div>
                                )}
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-slate-100 bg-slate-50/50">
                                                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Code actuel</th>
                                                <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                                                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Défini</th>
                                                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">→ Remapper vers</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {remapData.resultCodes.map((rc) => {
                                                const isDefined = remapData.globalStatuses.some((gs) => gs.code === rc.code && gs.isActive);
                                                const isOrphan = remapData.orphanCodes.includes(rc.code);
                                                return (
                                                    <tr
                                                        key={rc.code}
                                                        className={`border-b border-slate-50 ${
                                                            isOrphan ? "bg-amber-50/50" : "hover:bg-slate-50/50"
                                                        }`}
                                                    >
                                                        <td className="py-3 px-4">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-mono text-sm text-slate-700">{rc.code}</span>
                                                                {isOrphan && (
                                                                    <span className="text-[10px] font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                                                                        orphelin
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="py-3 px-4 text-right">
                                                            <span className="font-mono text-sm font-semibold text-slate-900">
                                                                {rc.count.toLocaleString()}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-4 text-center">
                                                            {isDefined ? (
                                                                <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                                                            ) : (
                                                                <AlertCircle className="w-4 h-4 text-amber-500 mx-auto" />
                                                            )}
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            <select
                                                                value={mappings[rc.code] ?? ""}
                                                                onChange={(e) =>
                                                                    setMappings((prev) => ({
                                                                        ...prev,
                                                                        [rc.code]: e.target.value,
                                                                    }))
                                                                }
                                                                className={`text-sm border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-accent-400 min-w-[200px] ${
                                                                    mappings[rc.code] && mappings[rc.code] !== rc.code
                                                                        ? "border-accent-300 bg-accent-50"
                                                                        : "border-slate-200"
                                                                }`}
                                                            >
                                                                <option value="">— Ne pas remapper —</option>
                                                                {activeGlobalStatuses
                                                                    .filter((gs) => gs.code !== rc.code && (remapData.validEnumValues?.includes(gs.code) ?? true))
                                                                    .map((gs) => (
                                                                        <option key={gs.code} value={gs.code}>
                                                                            {gs.label ?? gs.code} ({gs.code})
                                                                        </option>
                                                                    ))}
                                                            </select>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50">
                                    <p className="text-xs text-slate-400">
                                        Les remappages modifient le champ <code className="bg-slate-200 px-1 rounded">result</code> de toutes les actions concernées.
                                        Cette opération est irréversible et désactive les statuts <code className="bg-slate-200 px-1 rounded">MISSION</code> remappés.
                                    </p>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
