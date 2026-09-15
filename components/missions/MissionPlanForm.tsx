"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button, ConfirmModal, useToast } from "@/components/ui";
import { DayToggleChips, type DayOfWeek } from "./DayToggleChips";
import { Calendar, Loader2, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const FREQUENCY_OPTIONS = [
    { value: 1, label: "1 jour/semaine" },
    { value: 2, label: "2 jours/semaine" },
    { value: 3, label: "3 jours/semaine" },
    { value: 4, label: "4 jours/semaine" },
    { value: 5, label: "5 jours/semaine" },
];

const TIME_PREFERENCE_OPTIONS = [
    { value: "MORNING", label: "Matin (8h–12h)" },
    { value: "AFTERNOON", label: "Après-midi (14h–18h)" },
    { value: "FULL_DAY", label: "Journée complète (8h–18h)" },
    { value: "CUSTOM", label: "Personnalisé" },
];

const HOUR_OPTIONS = Array.from({ length: 11 }, (_, i) => {
    const h = 8 + i;
    return `${h.toString().padStart(2, "0")}:00`;
});

function nextMonday(): string {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
}

function toDateStr(d: Date | string | null): string {
    if (!d) return "";
    const x = typeof d === "string" ? new Date(d) : d;
    return x.toISOString().slice(0, 10);
}

interface SdrOption {
    id: string;
    name: string;
    email: string;
    role?: string;
}

interface MissionPlanData {
    id: string;
    missionId: string;
    frequency: number;
    preferredDays: DayOfWeek[];
    timePreference: string;
    customStartTime: string | null;
    customEndTime: string | null;
    startDate: string;
    endDate: string | null;
    status: string;
    assignedSdrs: Array<{ sdrId: string; sdr: SdrOption }>;
}

interface MissionPlanFormProps {
    missionId: string;
    missionName: string;
    sdrAssignments: Array<{ id: string; sdr: SdrOption }>;
    existingPlan: MissionPlanData | null;
    onPlanSaved?: () => void;
}

export function MissionPlanForm({
    missionId,
    missionName,
    sdrAssignments,
    existingPlan,
    onPlanSaved,
}: MissionPlanFormProps) {
    const router = useRouter();
    const { success, error: showError } = useToast();

    const [frequency, setFrequency] = useState(2);
    const [preferredDays, setPreferredDays] = useState<DayOfWeek[]>([]);
    const [timePreference, setTimePreference] = useState<string>("MORNING");
    const [customStartTime, setCustomStartTime] = useState("08:00");
    const [customEndTime, setCustomEndTime] = useState("12:00");
    const [startDate, setStartDate] = useState(nextMonday);
    const [endDate, setEndDate] = useState<string>("");
    const [selectedSdrIds, setSelectedSdrIds] = useState<string[]>([]);

    const [isLoadingPlan, setIsLoadingPlan] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
    const [showSaveWithBlocksConfirm, setShowSaveWithBlocksConfirm] = useState(false);

    const availableSdrs = sdrAssignments.map((a) => a.sdr);
    const selectedSdrs = availableSdrs.filter((s) => selectedSdrIds.includes(s.id));

    const loadExisting = useCallback(() => {
        if (!existingPlan) return;
        setFrequency(existingPlan.frequency);
        setPreferredDays(existingPlan.preferredDays as DayOfWeek[]);
        setTimePreference(existingPlan.timePreference);
        setCustomStartTime(existingPlan.customStartTime || "08:00");
        setCustomEndTime(existingPlan.customEndTime || "12:00");
        setStartDate(toDateStr(existingPlan.startDate));
        setEndDate(existingPlan.endDate ? toDateStr(existingPlan.endDate) : "");
        setSelectedSdrIds(existingPlan.assignedSdrs.map((a) => a.sdrId));
    }, [existingPlan]);

    useEffect(() => {
        loadExisting();
    }, [loadExisting]);

    useEffect(() => {
        if (preferredDays.length > frequency) {
            setPreferredDays((prev) => prev.slice(0, frequency));
        }
    }, [frequency]);

    const canSave =
        preferredDays.length === frequency &&
        selectedSdrIds.length >= 1 &&
        startDate &&
        (timePreference !== "CUSTOM" || (customStartTime < customEndTime));

    const payload = () => ({
        missionId,
        frequency,
        preferredDays,
        timePreference,
        customStartTime: timePreference === "CUSTOM" ? customStartTime : null,
        customEndTime: timePreference === "CUSTOM" ? customEndTime : null,
        startDate,
        endDate: endDate || null,
        assignedSdrIds: selectedSdrIds,
    });

    const doSaveDraft = async () => {
        setIsSaving(true);
        try {
            if (existingPlan) {
                const res = await fetch(`/api/mission-plans/${existingPlan.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        ...payload(),
                        assignedSdrIds: selectedSdrIds,
                    }),
                });
                const json = await res.json();
                if (json.success) {
                    success("Brouillon enregistré", "Le plan a été mis à jour");
                    onPlanSaved?.();
                } else {
                    showError("Erreur", json.error || "Impossible d'enregistrer");
                }
            } else {
                const res = await fetch("/api/mission-plans", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload()),
                });
                const json = await res.json();
                if (json.success) {
                    success("Brouillon enregistré", "Le plan a été créé");
                    onPlanSaved?.();
                } else {
                    showError("Erreur", json.error || "Impossible d'enregistrer");
                }
            }
        } catch {
            showError("Erreur", "Une erreur est survenue");
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveDraft = async () => {
        if (!existingPlan?.id) {
            await doSaveDraft();
            return;
        }
        const rangeEnd = endDate || (() => {
            const d = new Date(startDate);
            d.setDate(d.getDate() + 28);
            return d.toISOString().slice(0, 10);
        })();
        try {
            const res = await fetch(
                `/api/planning?missionId=${encodeURIComponent(missionId)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(rangeEnd)}`
            );
            const json = await res.json();
            if (json.success && Array.isArray(json.data) && json.data.length > 0) {
                setShowSaveWithBlocksConfirm(true);
                return;
            }
        } catch {
            // If check fails, save anyway
        }
        await doSaveDraft();
    };

    const doGenerate = async (planId: string) => {
        setIsGenerating(true);
        setShowGenerateConfirm(false);
        try {
            const res = await fetch(`/api/mission-plans/${planId}/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });
            const json = await res.json();
            if (json.success) {
                const { generated, conflicts } = json.data;
                success(
                    "Planning généré",
                    `${generated} créneaux suggérés créés${conflicts > 0 ? ` (${conflicts} conflits non résolus)` : ""}`
                );
                router.push(`/manager/planning?missionId=${missionId}`);
            } else {
                showError("Erreur", json.error || "Impossible de générer le planning");
            }
        } catch {
            showError("Erreur", "Une erreur est survenue");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGenerate = async () => {
        if (!canSave) return;
        if (existingPlan?.status === "ACTIVE" && existingPlan.id) {
            setShowGenerateConfirm(true);
            return;
        }
        setIsGenerating(true);
        try {
            let planId = existingPlan?.id;
            if (!planId) {
                const createRes = await fetch("/api/mission-plans", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...payload(), status: "ACTIVE" }),
                });
                const createJson = await createRes.json();
                if (!createJson.success) {
                    showError("Erreur", createJson.error || "Impossible de créer le plan");
                    return;
                }
                planId = createJson.data.id;
            } else {
                await fetch(`/api/mission-plans/${existingPlan.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...payload(), status: "ACTIVE" }),
                });
            }
            await doGenerate(planId);
        } catch {
            showError("Erreur", "Une erreur est survenue");
        } finally {
            setIsGenerating(false);
        }
    };

    const confirmGenerate = async () => {
        if (!existingPlan?.id) return;
        setIsGenerating(true);
        setShowGenerateConfirm(false);
        try {
            await fetch(`/api/mission-plans/${existingPlan.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...payload(), assignedSdrIds: selectedSdrIds }),
            });
            await doGenerate(existingPlan.id);
        } catch {
            showError("Erreur", "Une erreur est survenue");
        } finally {
            setIsGenerating(false);
        }
    };

    const addSdr = (id: string) => {
        if (!selectedSdrIds.includes(id)) setSelectedSdrIds((prev) => [...prev, id]);
    };

    const removeSdr = (id: string) => {
        setSelectedSdrIds((prev) => prev.filter((x) => x !== id));
    };

    if (isLoadingPlan) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Fréquence</label>
                <select
                    value={frequency}
                    onChange={(e) => setFrequency(Number(e.target.value))}
                    className="w-full max-w-xs h-10 px-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                    {FREQUENCY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Jours préférés</label>
                <DayToggleChips
                    value={preferredDays}
                    onChange={setPreferredDays}
                    frequency={frequency}
                />
                {preferredDays.length !== frequency && preferredDays.length > 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                        Sélectionnez exactement {frequency} jour{frequency > 1 ? "s" : ""}.
                    </p>
                )}
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Créneau préféré</label>
                <div className="flex flex-wrap gap-2 mb-2">
                    {TIME_PREFERENCE_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => setTimePreference(opt.value)}
                            className={cn(
                                "px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors",
                                timePreference === opt.value
                                    ? "bg-indigo-500 text-white border-indigo-500"
                                    : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300"
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
                {timePreference === "CUSTOM" && (
                    <div className="flex gap-4 mt-2">
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">Début</label>
                            <select
                                value={customStartTime}
                                onChange={(e) => setCustomStartTime(e.target.value)}
                                className="h-10 px-3 border border-slate-200 rounded-lg"
                            >
                                {HOUR_OPTIONS.map((h) => (
                                    <option key={h} value={h}>{h}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-slate-500 mb-1">Fin</label>
                            <select
                                value={customEndTime}
                                onChange={(e) => setCustomEndTime(e.target.value)}
                                className="h-10 px-3 border border-slate-200 rounded-lg"
                            >
                                {HOUR_OPTIONS.map((h) => (
                                    <option key={h} value={h}>{h}</option>
                                ))}
                            </select>
                        </div>
                        {customStartTime >= customEndTime && (
                            <p className="text-xs text-red-600 self-end">Début doit être avant fin</p>
                        )}
                    </div>
                )}
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Durée</label>
                <div className="flex flex-wrap gap-4 items-end">
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">Date de début</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="h-10 px-3 border border-slate-200 rounded-lg"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">Date de fin (optionnel)</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="h-10 px-3 border border-slate-200 rounded-lg"
                        />
                    </div>
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">SDRs assignés</label>
                <div className="flex flex-wrap gap-2 mb-2">
                    {selectedSdrs.map((sdr) => (
                        <span
                            key={sdr.id}
                            className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-slate-100 text-slate-800"
                        >
                            <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
                                {sdr.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                            </span>
                            <span className="text-sm">{sdr.name}</span>
                            <button
                                type="button"
                                onClick={() => removeSdr(sdr.id)}
                                className="p-0.5 rounded hover:bg-slate-200 text-slate-500"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </span>
                    ))}
                </div>
                <div className="flex flex-wrap gap-2">
                    {availableSdrs
                        .filter((s) => !selectedSdrIds.includes(s.id))
                        .map((sdr) => (
                            <button
                                key={sdr.id}
                                type="button"
                                onClick={() => addSdr(sdr.id)}
                                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-dashed border-slate-300 rounded-lg text-slate-600 hover:border-indigo-400 hover:text-indigo-600"
                            >
                                <UserPlus className="w-4 h-4" />
                                {sdr.name}
                            </button>
                        ))}
                </div>
                {selectedSdrIds.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">Au moins un SDR est requis pour générer le planning.</p>
                )}
            </div>

            <p className="text-xs text-slate-500 border-l-2 border-slate-200 pl-3">
                Si vous modifiez le plan (jours, SDRs, créneaux) après avoir déjà généré ou confirmé des créneaux, les créneaux déjà confirmés ne sont pas modifiés. Relancer « Générer le planning » ajoute de nouvelles suggestions sans supprimer les créneaux confirmés.
            </p>

            <div className="flex flex-wrap gap-3 pt-2">
                <Button
                    variant="secondary"
                    onClick={handleSaveDraft}
                    disabled={!canSave || isSaving}
                    isLoading={isSaving}
                >
                    Enregistrer brouillon
                </Button>
                <Button
                    variant="primary"
                    onClick={handleGenerate}
                    disabled={!canSave || isGenerating}
                    isLoading={isGenerating}
                >
                    Générer le planning
                </Button>
            </div>

            <ConfirmModal
                isOpen={showGenerateConfirm}
                onClose={() => setShowGenerateConfirm(false)}
                onConfirm={confirmGenerate}
                title="Remplacer les créneaux suggérés ?"
                message="Les créneaux suggérés non confirmés seront remplacés. Les créneaux déjà confirmés ne seront pas modifiés. Continuer ?"
                confirmText="Continuer"
                variant="danger"
                isLoading={isGenerating}
            />

            <ConfirmModal
                isOpen={showSaveWithBlocksConfirm}
                onClose={() => setShowSaveWithBlocksConfirm(false)}
                onConfirm={async () => {
                    setShowSaveWithBlocksConfirm(false);
                    await doSaveDraft();
                }}
                title="Ce plan a déjà des créneaux planifiés"
                message="Les modifier ne met pas à jour les créneaux existants. Souhaitez-vous quand même enregistrer ?"
                confirmText="Enregistrer"
                variant="default"
                isLoading={isSaving}
            />
        </div>
    );
}
