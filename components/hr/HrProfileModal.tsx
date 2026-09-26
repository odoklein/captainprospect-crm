"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ContractType, RemunerationMode } from "@/lib/hr/hr-types";
import { User, Briefcase, Calendar, DollarSign, Layers } from "lucide-react";

interface HrProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  onProfileSaved: () => void;
}

export function HrProfileModal({
  isOpen,
  onClose,
  userId,
  userName,
  onProfileSaved,
}: HrProfileModalProps) {
  const [contractType, setContractType] = useState<ContractType>(ContractType.SALARIE);
  const [remunerationMode, setRemunerationMode] = useState<RemunerationMode>(RemunerationMode.FIXE);
  const [fixedSalaryEuros, setFixedSalaryEuros] = useState<number>(2000);
  const [variablePerRdvEuros, setVariablePerRdvEuros] = useState<number>(50);
  const [dailyQuota, setDailyQuota] = useState<number>(80);
  const [effectiveFrom, setEffectiveFrom] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [managerId, setManagerId] = useState<string>("");
  const [reason, setReason] = useState<string>("");

  const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing profile & managers
  useEffect(() => {
    if (isOpen && userId) {
      loadData();
    }
  }, [isOpen, userId]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch profile
      const [profileRes, usersRes] = await Promise.all([
        fetch(`/api/hr/profiles/${userId}`),
        fetch(`/api/users?role=MANAGER`),
      ]);

      const profileData = await profileRes.json();
      const usersData = await usersRes.json();

      if (usersData.success && Array.isArray(usersData.data)) {
        setManagers(usersData.data.map((u: any) => ({ id: u.id, name: u.name })));
      }

      if (profileData.success && profileData.data) {
        const { user, profile } = profileData.data;
        if (profile) {
          setContractType(profile.contractType || ContractType.SALARIE);
          setRemunerationMode(profile.remunerationMode || RemunerationMode.FIXE);
          setFixedSalaryEuros((profile.fixedSalaryCents || 0) / 100);
          setVariablePerRdvEuros((profile.variablePerRdvCents || 0) / 100);
          setDailyQuota(profile.dailyQuota || 0);
          if (profile.effectiveFrom) {
            setEffectiveFrom(new Date(profile.effectiveFrom).toISOString().split("T")[0]);
          }
        }
        if (user?.managerId) {
          setManagerId(user.managerId);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setIsSaving(true);
      setError(null);

      const res = await fetch(`/api/hr/profiles/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractType,
          remunerationMode,
          fixedSalaryCents: Math.round(Number(fixedSalaryEuros) * 100),
          variablePerRdvCents: Math.round(Number(variablePerRdvEuros) * 100),
          dailyQuota: Number(dailyQuota),
          effectiveFrom,
          managerId: managerId || null,
          reason: reason || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Erreur lors de la sauvegarde du profil RH");
      }

      onProfileSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Configuration RH — ${userName}`}
      description="Source de vérité pour le calcul de la paie et des objectifs"
      size="lg"
    >
      {isLoading ? (
        <div className="py-8 text-center text-xs text-slate-500">Chargement du profil...</div>
      ) : (
        <form onSubmit={handleSave} className="space-y-5">
          {/* Contract Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 block">
              Type de contrat
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer text-xs transition-all ${
                  contractType === ContractType.SALARIE
                    ? "border-indigo-600 bg-indigo-50/50 text-indigo-950 font-semibold ring-1 ring-indigo-500/20"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="contractType"
                  value={ContractType.SALARIE}
                  checked={contractType === ContractType.SALARIE}
                  onChange={() => setContractType(ContractType.SALARIE)}
                  className="sr-only"
                />
                <Briefcase className="w-4 h-4 text-indigo-600" />
                <span>Salarié (CDI / CDD)</span>
              </label>

              <label
                className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer text-xs transition-all ${
                  contractType === ContractType.INDEPENDANT
                    ? "border-indigo-600 bg-indigo-50/50 text-indigo-950 font-semibold ring-1 ring-indigo-500/20"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="contractType"
                  value={ContractType.INDEPENDANT}
                  checked={contractType === ContractType.INDEPENDANT}
                  onChange={() => setContractType(ContractType.INDEPENDANT)}
                  className="sr-only"
                />
                <User className="w-4 h-4 text-indigo-600" />
                <span>Indépendant / Freelance</span>
              </label>
            </div>
          </div>

          {/* Remuneration Mode */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 block">
              Mode de rémunération
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { value: RemunerationMode.FIXE, label: "Fixe pur", desc: "Salaire fixe uniquement" },
                { value: RemunerationMode.VARIABLE, label: "Variable pur", desc: "Prime par RDV décroché" },
                { value: RemunerationMode.FIXE_PLUS_VARIABLE, label: "Fixe + Variable", desc: "Fixe proratisé + prime RDV" },
              ].map((m) => (
                <label
                  key={m.value}
                  className={`p-3 rounded-xl border cursor-pointer text-left transition-all ${
                    remunerationMode === m.value
                      ? "border-indigo-600 bg-indigo-50/50 text-indigo-950 ring-1 ring-indigo-500/20"
                      : "border-slate-200 bg-white hover:border-slate-300 text-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="remunerationMode"
                    value={m.value}
                    checked={remunerationMode === m.value}
                    onChange={() => setRemunerationMode(m.value)}
                    className="sr-only"
                  />
                  <div className="font-semibold text-xs mb-0.5">{m.label}</div>
                  <div className="text-[10px] text-slate-500">{m.desc}</div>
                </label>
              ))}
            </div>
          </div>

          {/* Salary inputs based on mode */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {remunerationMode !== RemunerationMode.VARIABLE && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Salaire fixe mensuel (€ brut)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={fixedSalaryEuros}
                    onChange={(e) => setFixedSalaryEuros(parseFloat(e.target.value) || 0)}
                    className="w-full text-xs p-2.5 pr-8 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-400">€</span>
                </div>
              </div>
            )}

            {remunerationMode !== RemunerationMode.FIXE && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Rémunération variable par RDV validé (€)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={variablePerRdvEuros}
                    onChange={(e) => setVariablePerRdvEuros(parseFloat(e.target.value) || 0)}
                    className="w-full text-xs p-2.5 pr-8 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-400">€</span>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Quota journalier d'appels attendu
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={dailyQuota}
                onChange={(e) => setDailyQuota(parseInt(e.target.value, 10) || 0)}
                placeholder="Ex : 80"
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-[10px] text-slate-400">Seuil journalier sous lequel une décision est requise.</span>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Date d'effet des règles
              </label>
              <input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Manager & Reason */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Manager responsable
              </label>
              <select
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Aucun manager assigné</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Motif de modification (historique / audit)
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex : Augmentation annuelle, passage plein temps..."
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs font-medium text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-200">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors shadow-sm"
            >
              {isSaving ? "Enregistrement..." : "Enregistrer la configuration"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
