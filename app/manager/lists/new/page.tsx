"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Select, useToast } from "@/components/ui";
import { ArrowLeft, List, Loader2 } from "lucide-react";
import Link from "next/link";

// ============================================
// TYPES
// ============================================

interface Mission {
    id: string;
    name: string;
}

interface FormData {
    name: string;
    type: string;
    source: string;
    missionId: string;
}

// ============================================
// NEW LIST PAGE
// ============================================

export default function NewListPage() {
    const router = useRouter();
    const { success, error: showError } = useToast();
    const [missions, setMissions] = useState<Mission[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState<FormData>({
        name: "",
        type: "SUZALI",
        source: "",
        missionId: "",
    });
    const [errors, setErrors] = useState<Record<string, string>>({});

    // ============================================
    // FETCH MISSIONS
    // ============================================

    useEffect(() => {
        const fetchMissions = async () => {
            setIsLoading(true);
            try {
                const res = await fetch("/api/missions?isActive=true");
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
            const res = await fetch("/api/lists", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: formData.name,
                    type: formData.type,
                    source: formData.source || undefined,
                    missionId: formData.missionId,
                }),
            });

            const json = await res.json();

            if (json.success) {
                success("Liste créée", `${formData.name} a été créée avec succès`);
                router.push("/manager/lists");
            } else {
                showError("Erreur", json.error || "Impossible de créer la liste");
            }
        } catch (err) {
            console.error("Failed to create list:", err);
            showError("Erreur", "Impossible de créer la liste");
        } finally {
            setIsSaving(false);
        }
    };

    // ============================================
    // RENDER
    // ============================================

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/manager/lists">
                    <Button variant="ghost" size="sm">
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Nouvelle liste</h1>
                    <p className="text-slate-500 mt-1">
                        Créez une nouvelle liste de contacts
                    </p>
                </div>
            </div>

            {/* Form */}
            <Card>
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Mission */}
                    <Select
                        label="Mission *"
                        placeholder="Sélectionner une mission..."
                        options={missions.map(m => ({ value: m.id, label: m.name }))}
                        value={formData.missionId}
                        onChange={(value) => setFormData(prev => ({ ...prev, missionId: value }))}
                        error={errors.missionId}
                        searchable
                    />

                    {/* List Name */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Nom de la liste *
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="Ex: Tech Startups France Q1"
                            className={`w-full px-4 py-3 bg-white border rounded-xl text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 ${errors.name ? "border-red-500" : "border-slate-200"
                                }`}
                        />
                        {errors.name && (
                            <p className="text-sm text-red-500 mt-1">{errors.name}</p>
                        )}
                    </div>

                    {/* Type */}
                    <Select
                        label="Type de liste *"
                        options={[
                            { value: "SUZALI", label: "Suzali - Liste interne enrichie" },
                            { value: "CLIENT", label: "Client - Données fournies par le client" },
                            { value: "MIXED", label: "Mixte - Fusion de sources" },
                        ]}
                        value={formData.type}
                        onChange={(value) => setFormData(prev => ({ ...prev, type: value }))}
                    />

                    {/* Source */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Source des données
                        </label>
                        <input
                            type="text"
                            value={formData.source}
                            onChange={(e) => setFormData(prev => ({ ...prev, source: e.target.value }))}
                            placeholder="Ex: Apollo, LinkedIn, CSV Import..."
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                        <Link href="/manager/lists">
                            <Button variant="ghost" type="button">
                                Annuler
                            </Button>
                        </Link>
                        <Button
                            variant="primary"
                            type="submit"
                            disabled={isSaving}
                            className="gap-2"
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Création...
                                </>
                            ) : (
                                <>
                                    <List className="w-4 h-4" />
                                    Créer la liste
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </Card>

            {/* Info Card */}
            <Card className="bg-primary-50 border-primary-200">
                <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                        <List className="w-5 h-5 text-primary-600" />
                    </div>
                    <div>
                        <h3 className="font-medium text-slate-900">Prochaine étape</h3>
                        <p className="text-sm text-slate-600 mt-1">
                            Après avoir créé la liste, vous pourrez y ajouter des sociétés et contacts via l&apos;import CSV ou manuellement.
                        </p>
                    </div>
                </div>
            </Card>
        </div>
    );
}
