"use client";

import { useEffect, useState, useCallback } from "react";
import { Drawer, Button, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";

type WeeklyCapacity = 0 | 0.5 | 1;

interface AvailabilityRecord {
  id: string;
  missionId: string;
  month: string;
  weeklyPattern: Record<string, WeeklyCapacity>;
  mission: { id: string; name: string };
}

interface OverrideRecord {
  id: string;
  date: string;
  missionId: string | null;
  capacity: WeeklyCapacity;
  reason: string | null;
}

interface SdrAvailabilityDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sdrId: string;
  sdrName: string;
  month: string;
  onUpdated?: () => void;
}

const WEEKDAYS: { key: string; label: string }[] = [
  { key: "1", label: "Lun" },
  { key: "2", label: "Mar" },
  { key: "3", label: "Mer" },
  { key: "4", label: "Jeu" },
  { key: "5", label: "Ven" },
];

const CAPACITY_OPTIONS: { value: WeeklyCapacity; label: string }[] = [
  { value: 0, label: "0j" },
  { value: 0.5, label: "0,5j" },
  { value: 1, label: "1j" },
];

export function SdrAvailabilityDrawer({
  isOpen,
  onClose,
  sdrId,
  sdrName,
  month,
  onUpdated,
}: SdrAvailabilityDrawerProps) {
  const { success, error: showError } = useToast();
  const [loading, setLoading] = useState(false);
  const [availabilities, setAvailabilities] = useState<AvailabilityRecord[]>([]);
  const [overrides, setOverrides] = useState<OverrideRecord[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newOverride, setNewOverride] = useState<{
    date: string;
    missionId: string | null;
    capacity: WeeklyCapacity;
    reason: string;
  }>({
    date: "",
    missionId: null,
    capacity: 1,
    reason: "",
  });

  const load = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    try {
      const [availRes, ovRes] = await Promise.all([
        fetch(`/api/planning/sdrs/${sdrId}/availability?month=${month}`),
        fetch(`/api/planning/sdrs/${sdrId}/overrides?month=${month}`),
      ]);
      const availJson = await availRes.json();
      const ovJson = await ovRes.json();
      if (availJson.success) setAvailabilities(availJson.data);
      if (ovJson.success) setOverrides(ovJson.data);
      if (availJson.success && availJson.data.length > 0) {
        setSelectedMissionId((prev) => prev ?? availJson.data[0].missionId);
      }
    } catch (e) {
      showError("Erreur", "Impossible de charger la disponibilité");
    } finally {
      setLoading(false);
    }
  }, [isOpen, sdrId, month, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentAvailability = availabilities.find(
    (a) => a.missionId === selectedMissionId
  );

  const setCapacityForDay = (dayKey: string, value: WeeklyCapacity) => {
    if (!currentAvailability) return;
    const updated = availabilities.map((a) =>
      a.id === currentAvailability.id
        ? {
            ...a,
            weeklyPattern: {
              ...currentAvailability.weeklyPattern,
              [dayKey]: value,
            },
          }
        : a
    );
    setAvailabilities(updated);
  };

  const saveCurrentPattern = async () => {
    if (!currentAvailability) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/planning/sdrs/${sdrId}/availability`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            month,
            missionId: currentAvailability.missionId,
            weeklyPattern: currentAvailability.weeklyPattern,
          }),
        }
      );
      const json = await res.json();
      if (!json.success) {
        showError("Erreur", json.error || "Impossible d'enregistrer");
        return;
      }
      success("Enregistré", "Modèle hebdo mis à jour");
      onUpdated?.();
      void load();
    } catch {
      showError("Erreur", "Impossible d'enregistrer");
    } finally {
      setSaving(false);
    }
  };

  const addOverride = async () => {
    if (!newOverride.date) return;
    try {
      const res = await fetch(
        `/api/planning/sdrs/${sdrId}/overrides`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newOverride),
        }
      );
      const json = await res.json();
      if (!json.success) {
        showError("Erreur", json.error || "Impossible d'ajouter l'exception");
        return;
      }
      success("Ajouté", "Exception enregistrée");
      setNewOverride({
        date: "",
        missionId: null,
        capacity: 1,
        reason: "",
      });
      onUpdated?.();
      void load();
    } catch {
      showError("Erreur", "Impossible d'ajouter l'exception");
    }
  };

  const deleteOverride = async (id: string) => {
    try {
      const ov = overrides.find((o) => o.id === id);
      if (!ov) return;
      await fetch(
        `/api/planning/sdrs/${sdrId}/overrides/${id}`,
        { method: "DELETE" }
      );
      setOverrides((prev) => prev.filter((o) => o.id !== id));
      onUpdated?.();
    } catch {
      showError("Erreur", "Impossible de supprimer l'exception");
    }
  };

  const title = `Disponibilité — ${sdrName}`;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={"Modèle hebdo + exceptions par jour"}
      size="md"
      side="right"
      footer={
        <div className="flex justify-between items-center gap-2">
          <span className="text-xs text-slate-500">
            1. Modèle hebdo · 2. Exceptions spécifiques
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Fermer
            </Button>
            <Button
              size="sm"
              onClick={saveCurrentPattern}
              isLoading={saving}
              disabled={!currentAvailability}
            >
              Enregistrer
            </Button>
          </div>
        </div>
      }
    >
      {loading ? (
        <div className="py-8 text-sm text-slate-500">Chargement…</div>
      ) : (
        <div className="space-y-6">
          {/* Mission selector */}
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1 block">
              Mission
            </label>
            <div className="flex flex-wrap gap-2">
              {availabilities.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedMissionId(a.missionId)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    selectedMissionId === a.missionId
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  )}
                >
                  {a.mission.name}
                </button>
              ))}
              {availabilities.length === 0 && (
                <p className="text-xs text-slate-500">
                  Aucune mission assignée pour ce mois.
                </p>
              )}
            </div>
          </div>

          {/* Weekly pattern editor */}
          {currentAvailability && (
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">
                Modèle hebdomadaire ({currentAvailability.mission.name})
              </h3>
              <div className="grid grid-cols-5 gap-2">
                {WEEKDAYS.map((d) => {
                  const current =
                    (currentAvailability.weeklyPattern?.[d.key] as WeeklyCapacity) ??
                    1;
                  return (
                    <div
                      key={d.key}
                      className="flex flex-col items-stretch gap-1 text-center"
                    >
                      <span className="text-xs font-medium text-slate-600">
                        {d.label}
                      </span>
                      <div className="inline-flex rounded-lg overflow-hidden border border-slate-200 bg-white">
                        {CAPACITY_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setCapacityForDay(d.key, opt.value)}
                            className={cn(
                              "px-1.5 py-1 text-[11px] flex-1 border-r last:border-r-0 transition-colors",
                              current === opt.value
                                ? "bg-indigo-500 text-white border-indigo-500"
                                : "bg-white text-slate-600 hover:bg-slate-50"
                            )}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Overrides */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-800">
              Exceptions sur le mois
            </h3>
            {overrides.length === 0 ? (
              <p className="text-xs text-slate-500">
                Aucune exception pour ce mois.
              </p>
            ) : (
              <ul className="space-y-2">
                {overrides.map((ov) => (
                  <li
                    key={ov.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-slate-700">
                        {ov.date.slice(0, 10)} · capacité {ov.capacity}j
                      </span>
                      {ov.reason && (
                        <span className="text-slate-500">{ov.reason}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void deleteOverride(ov.id)}
                      className="text-xs text-red-600 hover:text-red-700"
                    >
                      Supprimer
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="border border-dashed border-slate-300 rounded-lg p-3 space-y-2 bg-slate-50/80">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-slate-500 mb-1">Date</label>
                  <input
                    type="date"
                    value={newOverride.date}
                    onChange={(e) =>
                      setNewOverride((prev) => ({
                        ...prev,
                        date: e.target.value,
                      }))
                    }
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Capacité</label>
                  <select
                    value={newOverride.capacity}
                    onChange={(e) =>
                      setNewOverride((prev) => ({
                        ...prev,
                        capacity: Number(
                          e.target.value
                        ) as WeeklyCapacity,
                      }))
                    }
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    {CAPACITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  Raison (optionnel)
                </label>
                <input
                  type="text"
                  value={newOverride.reason}
                  onChange={(e) =>
                    setNewOverride((prev) => ({
                      ...prev,
                      reason: e.target.value,
                    }))
                  }
                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="Ex: demi-journée formation"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addOverride}
                  disabled={!newOverride.date}
                >
                  Ajouter une exception
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
