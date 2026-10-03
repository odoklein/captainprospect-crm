"use client";

import { useState, useEffect } from "react";
import { Button, Select, Input, useToast } from "@/components/ui";
import {
    X,
    List,
    Plus,
    Loader2,
    CheckCircle2,
    Building2,
} from "lucide-react";
import type { ListingResult } from "./ListingSearchTab";

// ============================================
// TYPES
// ============================================

interface ListOption {
    id: string;
    name: string;
    mission?: { id: string; name: string };
    _count: { companies: number };
}

interface MissionOption {
    id: string;
    name: string;
}

interface ImportToListModalProps {
    isOpen: boolean;
    onClose: () => void;
    results: ListingResult[];
    onImportComplete: () => void;
}

// ============================================
// IMPORT TO LIST MODAL
// ============================================

export function ImportToListModal({
    isOpen,
    onClose,
    results,
    onImportComplete,
}: ImportToListModalProps) {
    const { success, error: showError } = useToast();

    const [mode, setMode] = useState<"existing" | "new">("existing");
    const [lists, setLists] = useState<ListOption[]>([]);
    const [missions, setMissions] = useState<MissionOption[]>([]);
    const [listsLoading, setListsLoading] = useState(false);
    const [selectedListId, setSelectedListId] = useState("");
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState(0);

    // New list fields
    const [newListName, setNewListName] = useState("");
    const [newListMissionId, setNewListMissionId] = useState("");
    const [newListType, setNewListType] = useState("SUZALI");

    // Fetch existing lists and missions
    useEffect(() => {
        if (!isOpen) return;

        setListsLoading(true);
        Promise.all([
            fetch("/api/lists").then(r => r.json()),
            fetch("/api/missions?isActive=true&limit=100").then(r => r.json()),
        ])
            .then(([listsJson, missionsJson]) => {
                if (listsJson.success) setLists(listsJson.data);
                if (missionsJson.success && Array.isArray(missionsJson.data)) {
                    setMissions(missionsJson.data);
                }
            })
            .catch(() => {
                showError("Erreur", "Impossible de charger les donnees");
            })
            .finally(() => setListsLoading(false));
    }, [isOpen]);

    // Reset state on close
    useEffect(() => {
        if (!isOpen) {
            setMode("existing");
            setSelectedListId("");
            setNewListName("");
            setNewListMissionId("");
            setNewListType("SUZALI");
            setImportProgress(0);
        }
    }, [isOpen]);

    // ============================================
    // IMPORT
    // ============================================

    const handleImport = async () => {
        let targetListId = selectedListId;

        if (mode === "new") {
            if (!newListName.trim()) {
                showError("Erreur", "Nom de la liste requis");
                return;
            }
            if (!newListMissionId) {
                showError("Erreur", "Mission requise");
                return;
            }

            // Create new list
            setIsImporting(true);
            try {
                const res = await fetch("/api/lists", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: newListName.trim(),
                        missionId: newListMissionId,
                        type: newListType,
                        source: results[0]?.source === "apify-google-maps" ? "Google Maps" : "Apollo",
                    }),
                });
                const json = await res.json();
                if (json.success && json.data?.id) {
                    targetListId = json.data.id;
                } else {
                    showError("Erreur", json.error || "Impossible de creer la liste");
                    setIsImporting(false);
                    return;
                }
            } catch {
                showError("Erreur", "Impossible de creer la liste");
                setIsImporting(false);
                return;
            }
        } else {
            if (!selectedListId) {
                showError("Erreur", "Selectionnez une liste");
                return;
            }
        }

        // Import companies to list
        setIsImporting(true);
        let imported = 0;
        let failed = 0;

        for (const result of results) {
            try {
                const res = await fetch(`/api/lists/${targetListId}/companies`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: result.company.name,
                        industry: result.company.industry || undefined,
                        country: result.company.country || undefined,
                        website: result.company.domain ? `https://${result.company.domain}` : undefined,
                        size: result.company.size || undefined,
                    }),
                });
                const json = await res.json();
                if (json.success) {
                    imported++;
                } else {
                    failed++;
                }
            } catch {
                failed++;
            }
            setImportProgress(Math.round(((imported + failed) / results.length) * 100));
        }

        setIsImporting(false);

        if (imported > 0) {
            success(
                "Import termine",
                `${imported} societe(s) importee(s)${failed > 0 ? `, ${failed} doublon(s) ignore(s)` : ""}`
            );
            onImportComplete();
            onClose();
        } else {
            showError("Erreur", "Aucune societe importee (doublons probables)");
        }
    };

    if (!isOpen) return null;

    const listOptions = [
        { value: "", label: "Choisir une liste..." },
        ...lists.map(l => ({
            value: l.id,
            label: `${l.name} (${l._count.companies} soc.)`,
        })),
    ];

    const missionOptions = [
        { value: "", label: "Choisir une mission..." },
        ...missions.map(m => ({
            value: m.id,
            label: m.name,
        })),
    ];

    const typeOptions = [
        { value: "SUZALI", label: "Suzali" },
        { value: "CLIENT", label: "Client" },
        { value: "MIXED", label: "Mixte" },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center">
                            <List className="w-4.5 h-4.5 text-primary-600" />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-slate-900">Ajouter a une liste</h2>
                            <p className="text-xs text-slate-500">{results.length} societe(s) selectionnee(s)</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                        <X className="w-4 h-4 text-slate-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="px-5 py-4 space-y-4">
                    {/* Mode toggle */}
                    <div className="flex bg-slate-100 rounded-lg p-0.5">
                        <button
                            onClick={() => setMode("existing")}
                            className={`flex-1 text-sm font-medium py-2 rounded-md transition-all ${
                                mode === "existing"
                                    ? "bg-white text-slate-900 shadow-sm"
                                    : "text-slate-500 hover:text-slate-700"
                            }`}
                        >
                            Liste existante
                        </button>
                        <button
                            onClick={() => setMode("new")}
                            className={`flex-1 text-sm font-medium py-2 rounded-md transition-all flex items-center justify-center gap-1.5 ${
                                mode === "new"
                                    ? "bg-white text-slate-900 shadow-sm"
                                    : "text-slate-500 hover:text-slate-700"
                            }`}
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Nouvelle liste
                        </button>
                    </div>

                    {listsLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
                        </div>
                    ) : mode === "existing" ? (
                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Liste cible</label>
                                <Select
                                    options={listOptions}
                                    value={selectedListId}
                                    onChange={setSelectedListId}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Nom de la liste</label>
                                <Input
                                    placeholder="Ex: Leads Google Maps Paris"
                                    value={newListName}
                                    onChange={(e) => setNewListName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Mission</label>
                                <Select
                                    options={missionOptions}
                                    value={newListMissionId}
                                    onChange={setNewListMissionId}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                                <Select
                                    options={typeOptions}
                                    value={newListType}
                                    onChange={setNewListType}
                                />
                            </div>
                        </div>
                    )}

                    {/* Progress bar */}
                    {isImporting && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-500">Import en cours...</span>
                                <span className="font-medium text-primary-600">{importProgress}%</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-primary-500 rounded-full transition-all duration-300"
                                    style={{ width: `${importProgress}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Preview */}
                    <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Apercu</p>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                            {results.slice(0, 5).map((r, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs text-slate-700">
                                    <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span className="truncate">{r.company.name}</span>
                                    {r.company.country && (
                                        <span className="text-slate-400 shrink-0">{r.company.country}</span>
                                    )}
                                </div>
                            ))}
                            {results.length > 5 && (
                                <p className="text-xs text-slate-400">...et {results.length - 5} autre(s)</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50/50">
                    <Button variant="ghost" size="sm" onClick={onClose} disabled={isImporting}>
                        Annuler
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={handleImport}
                        disabled={isImporting}
                        className="gap-2"
                    >
                        {isImporting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Import...
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="w-4 h-4" />
                                Importer {results.length} societe(s)
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
