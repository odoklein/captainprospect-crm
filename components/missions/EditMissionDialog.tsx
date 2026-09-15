"use client";

import { useState, useEffect } from "react";
import { Modal, Button, Select, useToast } from "@/components/ui";
import { Save, Loader2 } from "lucide-react";
import { MISSION_STATUS_TABS } from "@/lib/constants/missionStatus";
import type { MissionStatusValue } from "@/lib/constants/missionStatus";

interface Client {
    id: string;
    name: string;
}

interface MissionData {
    id: string;
    name: string;
    objective?: string;
    channel: "CALL" | "EMAIL" | "LINKEDIN";
    channels?: ("CALL" | "EMAIL" | "LINKEDIN")[];
    status: MissionStatusValue;
    startDate?: string;
    endDate?: string;
    client?: { id: string; name: string };
}

interface FormData {
    name: string;
    objective: string;
    channel: string;
    channels: string[];
    clientId: string;
    startDate: string;
    endDate: string;
    status: MissionStatusValue;
}

interface EditMissionDialogProps {
    isOpen: boolean;
    onClose: () => void;
    mission: MissionData | null;
    onSaved: () => void;
}

export function EditMissionDialog({ isOpen, onClose, mission, onSaved }: EditMissionDialogProps) {
    const { success, error: showError } = useToast();
    const [clients, setClients] = useState<Client[]>([]);
    const [isLoadingClients, setIsLoadingClients] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState<FormData>({
        name: "",
        objective: "",
        channel: "CALL",
        channels: ["CALL"],
        clientId: "",
        startDate: "",
        endDate: "",
        status: "DRAFT",
    });
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (isOpen && mission) {
            const channels = mission.channels?.length ? mission.channels : [mission.channel || "CALL"];
            setFormData({
                name: mission.name || "",
                objective: mission.objective || "",
                channel: channels[0] || "CALL",
                channels: [...channels],
                clientId: mission.client?.id || "",
                startDate: mission.startDate ? mission.startDate.toString().split("T")[0] : "",
                endDate: mission.endDate ? mission.endDate.toString().split("T")[0] : "",
                status: mission.status ?? "ACTIVE",
            });
            setErrors({});
        }
    }, [isOpen, mission]);

    useEffect(() => {
        if (isOpen) {
            setIsLoadingClients(true);
            fetch("/api/clients")
                .then((res) => res.json())
                .then((json) => {
                    if (json.success) setClients(json.data || []);
                })
                .finally(() => setIsLoadingClients(false));
        }
    }, [isOpen]);

    const validate = (): boolean => {
        const newErrors: Record<string, string> = {};
        if (!formData.name.trim()) newErrors.name = "Le nom est requis";
        if (!formData.clientId) newErrors.clientId = "Le client est requis";
        if (!formData.channels?.length) newErrors.channels = "Sélectionnez au moins un canal";
        if (formData.startDate && formData.endDate && new Date(formData.endDate) < new Date(formData.startDate)) {
            newErrors.endDate = "La date de fin doit être après la date de début";
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!mission || !validate()) return;
        setIsSaving(true);
        try {
            const res = await fetch(`/api/missions/${mission.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: formData.name,
                    objective: formData.objective || null,
                    channel: formData.channels[0] ?? formData.channel,
                    channels: formData.channels,
                    clientId: formData.clientId,
                    startDate: formData.startDate || null,
                    endDate: formData.endDate || null,
                    status: formData.status,
                }),
            });
            const json = await res.json();
            if (json.success) {
                success("Mission modifiée", `${formData.name} a été mise à jour`);
                onSaved();
                onClose();
            } else {
                showError("Erreur", json.error || "Impossible de modifier la mission");
            }
        } catch {
            showError("Erreur", "Impossible de modifier la mission");
        } finally {
            setIsSaving(false);
        }
    };

    if (!mission) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Modifier la mission" size="lg">
            <form onSubmit={handleSubmit} className="space-y-5">
                <Select
                    label="Client *"
                    placeholder="Sélectionner un client..."
                    options={clients.map((c) => ({ value: c.id, label: c.name }))}
                    value={formData.clientId}
                    onChange={(value) => setFormData((prev) => ({ ...prev, clientId: value }))}
                    error={errors.clientId}
                    searchable
                    disabled={isLoadingClients}
                />

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Nom de la mission *</label>
                    <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="Ex: Prospection SaaS Q1 2026"
                        className={`w-full px-4 py-3 bg-white border rounded-xl text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 ${errors.name ? "border-red-500" : "border-slate-200"}`}
                    />
                    {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name}</p>}
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Objectif</label>
                    <textarea
                        value={formData.objective}
                        onChange={(e) => setFormData((prev) => ({ ...prev, objective: e.target.value }))}
                        placeholder="Ex: Générer 50 meetings qualifiés"
                        rows={3}
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Canaux *</label>
                    <p className="text-xs text-slate-500 mb-2">Sélectionnez un ou plusieurs canaux pour cette mission.</p>
                    <div className="flex flex-wrap gap-3">
                        {[
                            { value: "CALL", label: "Appel téléphonique" },
                            { value: "EMAIL", label: "Email" },
                            { value: "LINKEDIN", label: "LinkedIn" },
                        ].map((opt) => {
                            const isSelected = formData.channels.includes(opt.value);
                            return (
                                <label
                                    key={opt.value}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 cursor-pointer transition-all ${
                                        isSelected ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white hover:border-slate-300"
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => {
                                            const next = isSelected
                                                ? formData.channels.filter((c) => c !== opt.value)
                                                : [...formData.channels, opt.value];
                                            if (next.length === 0) return;
                                            setFormData((prev) => ({
                                                ...prev,
                                                channels: next,
                                                channel: next[0],
                                            }));
                                        }}
                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="text-sm font-medium text-slate-700">{opt.label}</span>
                                    </label>
                            );
                        })}
                    </div>
                    {errors.channels && <p className="text-sm text-red-500 mt-1">{errors.channels}</p>}
                </div>

                <div>
                    <Select
                        label="Statut"
                        options={MISSION_STATUS_TABS.filter((s) => s.value !== "all").map((s) => ({
                            value: s.value,
                            label: s.label,
                        }))}
                        value={formData.status}
                        onChange={(value) => setFormData((prev) => ({ ...prev, status: value as MissionStatusValue }))}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Date de début</label>
                        <input
                            type="date"
                            value={formData.startDate}
                            onChange={(e) => setFormData((prev) => ({ ...prev, startDate: e.target.value }))}
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Date de fin</label>
                        <input
                            type="date"
                            value={formData.endDate}
                            onChange={(e) => setFormData((prev) => ({ ...prev, endDate: e.target.value }))}
                            className={`w-full px-4 py-3 bg-white border rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 ${errors.endDate ? "border-red-500" : "border-slate-200"}`}
                        />
                        {errors.endDate && <p className="text-sm text-red-500 mt-1">{errors.endDate}</p>}
                        {formData.endDate &&
                            mission.endDate &&
                            new Date(formData.endDate) < new Date(mission.endDate.toString().split("T")[0]) && (
                                <p className="text-sm text-amber-600 mt-1">
                                    La mission se termine avant certains créneaux déjà planifiés. Ces créneaux ne s&apos;afficheront plus sur le planning.
                                </p>
                            )}
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                    <Button variant="secondary" type="button" onClick={onClose}>
                        Annuler
                    </Button>
                    <Button variant="primary" type="submit" disabled={isSaving} className="gap-2">
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
        </Modal>
    );
}
