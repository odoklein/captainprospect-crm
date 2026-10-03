"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Select, useToast } from "@/components/ui";
import { ArrowLeft, Save, Loader2, CheckCircle2, PauseCircle } from "lucide-react";
import Link from "next/link";

// ============================================
// TYPES
// ============================================

interface Client {
    id: string;
    name: string;
}

interface Mission {
    id: string;
    name: string;
    objective?: string;
    channel: "CALL" | "EMAIL" | "LINKEDIN";
    isActive: boolean;
    startDate?: string;
    endDate?: string;
    clientId: string;
}

interface FormData {
    name: string;
    objective: string;
    channel: string;
    clientId: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
}

// ============================================
// EDIT MISSION PAGE
// ============================================

export default function EditMissionPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const router = useRouter();
    const { success, error: showError } = useToast();
    const [clients, setClients] = useState<Client[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState<FormData>({
        name: "",
        objective: "",
        channel: "CALL",
        clientId: "",
        startDate: "",
        endDate: "",
        isActive: true,
    });
    const [errors, setErrors] = useState<Record<string, string>>({});

    // ============================================
    // FETCH DATA
    // ============================================

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                // Fetch mission and clients in parallel
                const [missionRes, clientsRes] = await Promise.all([
                    fetch(`/api/missions/${resolvedParams.id}`),
                    fetch("/api/clients"),
                ]);

                const [missionJson, clientsJson] = await Promise.all([
                    missionRes.json(),
                    clientsRes.json(),
                ]);

                if (missionJson.success) {
                    const mission = missionJson.data;
                    setFormData({
                        name: mission.name || "",
                        objective: mission.objective || "",
                        channel: mission.channel || "CALL",
                        clientId: mission.client?.id || "",
                        startDate: mission.startDate ? mission.startDate.split("T")[0] : "",
                        endDate: mission.endDate ? mission.endDate.split("T")[0] : "",
                        isActive: mission.isActive ?? true,
                    });
                } else {
                    showError("Erreur", "Mission non trouvée");
                    router.push("/manager/missions");
                    return;
                }

                if (clientsJson.success) {
                    setClients(clientsJson.data);
                }
            } catch (err) {
                console.error("Failed to fetch data:", err);
                showError("Erreur", "Impossible de charger les données");
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [resolvedParams.id]);

    // ============================================
    // VALIDATION
    // ============================================

    const validate = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!formData.name.trim()) {
            newErrors.name = "Le nom est requis";
        }
        if (!formData.clientId) {
            newErrors.clientId = "Le client est requis";
        }
        if (formData.startDate && formData.endDate) {
            if (new Date(formData.endDate) < new Date(formData.startDate)) {
                newErrors.endDate = "La date de fin doit être après la date de début";
            }
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
            const res = await fetch(`/api/missions/${resolvedParams.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: formData.name,
                    objective: formData.objective || null,
                    channel: formData.channel,
                    clientId: formData.clientId,
                    startDate: formData.startDate || null,
                    endDate: formData.endDate || null,
                    isActive: formData.isActive,
                }),
            });

            const json = await res.json();

            if (json.success) {
                success("Mission modifiée", `${formData.name} a été mise à jour`);
                router.push(`/manager/missions/${resolvedParams.id}`);
            } else {
                showError("Erreur", json.error || "Impossible de modifier la mission");
            }
        } catch (err) {
            console.error("Failed to update mission:", err);
            showError("Erreur", "Impossible de modifier la mission");
        } finally {
            setIsSaving(false);
        }
    };

    // ============================================
    // LOADING STATE
    // ============================================

    if (isLoading) {
        return (
            <div className="max-w-2xl mx-auto space-y-6">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-200 rounded-xl animate-pulse" />
                    <div className="space-y-2">
                        <div className="h-6 w-48 bg-slate-200 rounded animate-pulse" />
                        <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
                    </div>
                </div>
                <Card>
                    <div className="space-y-6">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="space-y-2">
                                <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
                                <div className="h-12 bg-slate-200 rounded-xl animate-pulse" />
                            </div>
                        ))}
                    </div>
                </Card>
            </div>
        );
    }

    // ============================================
    // RENDER
    // ============================================

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href={`/manager/missions/${resolvedParams.id}`}>
                    <Button variant="ghost" size="sm">
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Modifier la mission</h1>
                    <p className="text-slate-500 mt-1">
                        {formData.name}
                    </p>
                </div>
            </div>

            {/* Form */}
            <Card>
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Client */}
                    <Select
                        label="Client *"
                        placeholder="Sélectionner un client..."
                        options={clients.map(c => ({ value: c.id, label: c.name }))}
                        value={formData.clientId}
                        onChange={(value) => setFormData(prev => ({ ...prev, clientId: value }))}
                        error={errors.clientId}
                        searchable
                    />

                    {/* Mission Name */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Nom de la mission *
                        </label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="Ex: Prospection SaaS Q1 2026"
                            className={`w-full px-4 py-3 bg-white border rounded-xl text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 ${errors.name ? "border-red-500" : "border-slate-200"
                                }`}
                        />
                        {errors.name && (
                            <p className="text-sm text-red-500 mt-1">{errors.name}</p>
                        )}
                    </div>

                    {/* Objective */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Objectif
                        </label>
                        <textarea
                            value={formData.objective}
                            onChange={(e) => setFormData(prev => ({ ...prev, objective: e.target.value }))}
                            placeholder="Ex: Générer 50 meetings qualifiés"
                            rows={3}
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 resize-none"
                        />
                    </div>

                    {/* Channel */}
                    <Select
                        label="Canal principal *"
                        options={[
                            { value: "CALL", label: "Appel téléphonique" },
                            { value: "EMAIL", label: "Email" },
                            { value: "LINKEDIN", label: "LinkedIn" },
                        ]}
                        value={formData.channel}
                        onChange={(value) => setFormData(prev => ({ ...prev, channel: value }))}
                    />

                    {/* Status */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Statut
                        </label>
                        <div className="flex gap-4">
                            <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl cursor-pointer border transition-all ${formData.isActive
                                    ? "bg-emerald-50 border-emerald-500 text-emerald-700"
                                    : "bg-white border-slate-200 text-slate-500"
                                }`}>
                                <input
                                    type="radio"
                                    checked={formData.isActive}
                                    onChange={() => setFormData(prev => ({ ...prev, isActive: true }))}
                                    className="hidden"
                                />
                                <CheckCircle2 className="w-4 h-4 shrink-0" />
                                Actif
                            </label>
                            <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl cursor-pointer border transition-all ${!formData.isActive
                                    ? "bg-amber-50 border-amber-500 text-amber-700"
                                    : "bg-white border-slate-200 text-slate-500"
                                }`}>
                                <input
                                    type="radio"
                                    checked={!formData.isActive}
                                    onChange={() => setFormData(prev => ({ ...prev, isActive: false }))}
                                    className="hidden"
                                />
                                <PauseCircle className="w-4 h-4 shrink-0" />
                                En pause
                            </label>
                        </div>
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Date de début
                            </label>
                            <input
                                type="date"
                                value={formData.startDate}
                                onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Date de fin
                            </label>
                            <input
                                type="date"
                                value={formData.endDate}
                                onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                                className={`w-full px-4 py-3 bg-white border rounded-xl text-slate-900 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 ${errors.endDate ? "border-red-500" : "border-slate-200"
                                    }`}
                            />
                            {errors.endDate && (
                                <p className="text-sm text-red-500 mt-1">{errors.endDate}</p>
                            )}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                        <Link href={`/manager/missions/${resolvedParams.id}`}>
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
                </form>
            </Card>
        </div>
    );
}
