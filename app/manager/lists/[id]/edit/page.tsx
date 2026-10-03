"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Select, useToast } from "@/components/ui";
import {
    ArrowLeft,
    List,
    Save,
} from "lucide-react";
import Link from "next/link";

// ============================================
// TYPES
// ============================================

interface ListData {
    id: string;
    name: string;
    type: string;
    source: string | null;
    missionId: string;
}

interface Mission {
    id: string;
    name: string;
}

// ============================================
// EDIT LIST PAGE
// ============================================

export default function EditListPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const { success, error: showError } = useToast();

    const [listId, setListId] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [missions, setMissions] = useState<Mission[]>([]);

    // Form state
    const [name, setName] = useState("");
    const [type, setType] = useState("SUZALI");
    const [source, setSource] = useState("");
    const [missionId, setMissionId] = useState("");

    // Resolve params
    useEffect(() => {
        params.then((p) => setListId(p.id));
    }, [params]);

    // ============================================
    // FETCH DATA
    // ============================================

    useEffect(() => {
        if (!listId) return;

        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [listRes, missionsRes] = await Promise.all([
                    fetch(`/api/lists/${listId}`),
                    fetch("/api/missions?isActive=true"),
                ]);

                const listJson = await listRes.json();
                const missionsJson = await missionsRes.json();

                if (listJson.success) {
                    const list: ListData = listJson.data;
                    setName(list.name);
                    setType(list.type);
                    setSource(list.source || "");
                    setMissionId(list.missionId);
                } else {
                    showError("Erreur", "Liste non trouvée");
                    router.push("/manager/lists");
                }

                if (missionsJson.success) {
                    setMissions(missionsJson.data);
                }
            } catch (err) {
                showError("Erreur", "Impossible de charger les données");
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [listId]);

    // ============================================
    // SAVE
    // ============================================

    const handleSave = async () => {
        if (!name.trim()) {
            showError("Erreur", "Le nom est requis");
            return;
        }

        setIsSaving(true);
        try {
            const res = await fetch(`/api/lists/${listId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    type,
                    source: source || null,
                    missionId,
                }),
            });

            const json = await res.json();

            if (json.success) {
                success("Modifications enregistrées", "La liste a été mise à jour");
                router.push(`/manager/lists/${listId}`);
            } else {
                showError("Erreur", json.error || "Impossible de sauvegarder");
            }
        } catch (err) {
            showError("Erreur", "Impossible de sauvegarder");
        } finally {
            setIsSaving(false);
        }
    };

    // ============================================
    // LOADING
    // ============================================

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-200 rounded-xl animate-pulse" />
                    <div className="h-6 w-48 bg-slate-200 rounded animate-pulse" />
                </div>
                <Card>
                    <div className="space-y-4">
                        <div className="h-10 bg-slate-200 rounded animate-pulse" />
                        <div className="h-10 bg-slate-200 rounded animate-pulse" />
                        <div className="h-10 bg-slate-200 rounded animate-pulse" />
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href={`/manager/lists/${listId}`}>
                        <Button variant="ghost" size="sm">
                            <ArrowLeft className="w-4 h-4" />
                        </Button>
                    </Link>
                    <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center">
                        <List className="w-6 h-6 text-primary-600" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-extrabold text-slate-900">Modifier la liste</h1>
                        <p className="text-slate-500 mt-1">{name}</p>
                    </div>
                </div>
            </div>

            {/* Form */}
            <Card>
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Nom de la liste *
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ex: Prospects Tech Q1"
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <Select
                            label="Mission *"
                            options={missions.map((m) => ({ value: m.id, label: m.name }))}
                            value={missionId}
                            onChange={setMissionId}
                            searchable
                        />

                        <Select
                            label="Type *"
                            options={[
                                { value: "SUZALI", label: "Suzali" },
                                { value: "CLIENT", label: "Client" },
                                { value: "MIXED", label: "Mixte" },
                            ]}
                            value={type}
                            onChange={setType}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Source
                        </label>
                        <input
                            type="text"
                            value={source}
                            onChange={(e) => setSource(e.target.value)}
                            placeholder="Ex: Apollo, Clay, CSV..."
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                        />
                    </div>
                </div>
            </Card>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3">
                <Link href={`/manager/lists/${listId}`}>
                    <Button variant="ghost">Annuler</Button>
                </Link>
                <Button
                    variant="primary"
                    onClick={handleSave}
                    disabled={isSaving || !name.trim()}
                    className="gap-2"
                >
                    {isSaving ? (
                        <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Enregistrement...
                        </>
                    ) : (
                        <>
                            <Save className="w-4 h-4" />
                            Enregistrer
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
