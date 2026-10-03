"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Select, useToast } from "@/components/ui";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { ProspectSourceType } from "@prisma/client";

interface Source {
    id: string;
    name: string;
    type: ProspectSourceType;
    isActive: boolean;
    autoActivate: boolean;
    defaultMissionId: string | null;
    clientId: string | null;
    metadata: any;
    defaultMission?: {
        id: string;
        name: string;
    } | null;
}

export default function EditSourcePage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const router = useRouter();
    const { success, error: showError } = useToast();

    const [source, setSource] = useState<Source | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [missions, setMissions] = useState<Array<{ id: string; name: string }>>([]);

    const [formData, setFormData] = useState({
        name: "",
        autoActivate: false,
        defaultMissionId: "",
        isActive: true,
    });

    // Fetch source
    useEffect(() => {
        const fetchSource = async () => {
            setIsLoading(true);
            try {
                const res = await fetch(`/api/prospects/sources/${resolvedParams.id}`);
                const json = await res.json();

                if (json.success) {
                    setSource(json.data);
                    setFormData({
                        name: json.data.name,
                        autoActivate: json.data.autoActivate,
                        defaultMissionId: json.data.defaultMissionId || "",
                        isActive: json.data.isActive,
                    });
                } else {
                    showError("Erreur", json.error || "Source non trouvée");
                    router.push("/manager/prospects/sources");
                }
            } catch (err) {
                console.error("Failed to fetch source:", err);
                showError("Erreur", "Impossible de charger la source");
            } finally {
                setIsLoading(false);
            }
        };

        fetchSource();
    }, [resolvedParams.id]);

    // Fetch missions
    useEffect(() => {
        const fetchMissions = async () => {
            try {
                const res = await fetch("/api/missions");
                const json = await res.json();
                if (json.success) {
                    setMissions(json.data || []);
                }
            } catch (err) {
                console.error("Failed to fetch missions:", err);
            }
        };

        fetchMissions();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch(`/api/prospects/sources/${resolvedParams.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: formData.name,
                    autoActivate: formData.autoActivate,
                    defaultMissionId: formData.defaultMissionId || null,
                    isActive: formData.isActive,
                }),
            });

            const json = await res.json();

            if (json.success) {
                success("Succès", "Source mise à jour");
                router.push("/manager/prospects/sources");
            } else {
                showError("Erreur", json.error || "Impossible de mettre à jour la source");
            }
        } catch (err) {
            console.error("Failed to update source:", err);
            showError("Erreur", "Impossible de mettre à jour la source");
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
            </div>
        );
    }

    if (!source) {
        return null;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push("/manager/prospects/sources")}
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Modifier la source</h1>
                        <p className="text-slate-600 mt-1">{source.name}</p>
                    </div>
                </div>
            </div>

            {/* Form */}
            <Card className="p-6">
                <div className="space-y-6">
                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Nom de la source
                        </label>
                        <Input
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Ex: Formulaire de contact"
                        />
                    </div>

                    {/* Type (read-only) */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Type
                        </label>
                        <Input
                            value={source.type}
                            disabled
                            className="bg-slate-50"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Le type de source ne peut pas être modifié
                        </p>
                    </div>

                    {/* Default Mission */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Mission par défaut
                        </label>
                        <Select
                            options={[
                                { value: "", label: "Aucune" },
                                ...missions.map((m) => ({ value: m.id, label: m.name })),
                            ]}
                            value={formData.defaultMissionId}
                            onChange={(value) => setFormData({ ...formData, defaultMissionId: value })}
                        />
                    </div>

                    {/* Auto Activate */}
                    <div className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            id="autoActivate"
                            checked={formData.autoActivate}
                            onChange={(e) => setFormData({ ...formData, autoActivate: e.target.checked })}
                            className="w-4 h-4 text-primary-600 border-slate-300 rounded focus:ring-primary-500"
                        />
                        <label htmlFor="autoActivate" className="text-sm font-medium text-slate-700">
                            Auto-activation
                        </label>
                        <p className="text-xs text-slate-500">
                            Activer automatiquement les prospects qualifiés sans révision
                        </p>
                    </div>

                    {/* Active Status */}
                    <div className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            id="isActive"
                            checked={formData.isActive}
                            onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                            className="w-4 h-4 text-primary-600 border-slate-300 rounded focus:ring-primary-500"
                        />
                        <label htmlFor="isActive" className="text-sm font-medium text-slate-700">
                            Source active
                        </label>
                        <p className="text-xs text-slate-500">
                            Les sources inactives ne traitent pas de nouveaux leads
                        </p>
                    </div>

                    {/* API Key / Webhook URL (read-only if exists) */}
                    {source.metadata?.apiKey && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Clé API
                            </label>
                            <div className="flex gap-2">
                                <Input
                                    value={source.metadata.apiKey}
                                    disabled
                                    className="bg-slate-50 font-mono text-sm"
                                />
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                        navigator.clipboard.writeText(source.metadata.apiKey);
                                        success("Copié", "Clé API copiée");
                                    }}
                                >
                                    Copier
                                </Button>
                            </div>
                        </div>
                    )}

                    {source.metadata?.webhookUrl && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                URL Webhook
                            </label>
                            <div className="flex gap-2">
                                <Input
                                    value={source.metadata.webhookUrl}
                                    disabled
                                    className="bg-slate-50 font-mono text-sm"
                                />
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                        navigator.clipboard.writeText(source.metadata.webhookUrl);
                                        success("Copié", "URL webhook copiée");
                                    }}
                                >
                                    Copier
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 justify-end pt-4 border-t">
                        <Button
                            variant="secondary"
                            onClick={() => router.push("/manager/prospects/sources")}
                            disabled={isSaving}
                        >
                            Annuler
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={isSaving || !formData.name.trim()}
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Enregistrement...
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4 mr-2" />
                                    Enregistrer
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
}
