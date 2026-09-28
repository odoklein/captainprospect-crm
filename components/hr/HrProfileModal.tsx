"use client";

import { useCallback, useEffect, useState } from "react";
import { Briefcase, RefreshCw, User } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ContractType, RemunerationMode } from "@/lib/hr/hr-types";
import { formatEuros } from "@/lib/hr/hr-rules";
import { HrHelpTip } from "./HrHelpTip";

interface HrProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  onProfileSaved: () => void;
}

const MODES = [
  { value: RemunerationMode.FIXE, label: "Fixe uniquement", desc: "Un salaire mensuel" },
  { value: RemunerationMode.VARIABLE, label: "Variable uniquement", desc: "Une prime par rendez-vous" },
  { value: RemunerationMode.FIXE_PLUS_VARIABLE, label: "Fixe + variable", desc: "Salaire + prime par RDV" },
];

function toCents(input: string): number | null {
  const n = Number(input.replace(/\s/g, "").replace(",", ".") || "0");
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

function centsToInput(cents: number) {
  return cents ? String(cents / 100).replace(".", ",") : "";
}

export function HrProfileModal({ isOpen, onClose, userId, userName, onProfileSaved }: HrProfileModalProps) {
  const [contractType, setContractType] = useState<ContractType>(ContractType.SALARIE);
  const [remunerationMode, setRemunerationMode] = useState<RemunerationMode>(RemunerationMode.FIXE);
  const [fixedInput, setFixedInput] = useState("");
  const [variableInput, setVariableInput] = useState("");
  const [quotaInput, setQuotaInput] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [managerId, setManagerId] = useState("");
  const [reason, setReason] = useState("");
  const [displayName, setDisplayName] = useState(userName);
  const [isNew, setIsNew] = useState(false);

  const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [profileRes, usersRes] = await Promise.all([
        fetch(`/api/hr/profiles/${userId}`),
        fetch(`/api/users?role=MANAGER&status=active&limit=500`),
      ]);
      const profileData = await profileRes.json().catch(() => ({}));
      const usersData = await usersRes.json().catch(() => ({}));

      if (!profileRes.ok || !profileData.success) {
        throw new Error(profileData.error || "Impossible de charger les règles de ce collaborateur.");
      }

      const list: { id: string; name: string }[] = usersData?.data?.users ?? [];
      setManagers(list.filter((u) => u.id !== userId).map((u) => ({ id: u.id, name: u.name })));

      const { user, profile } = profileData.data;
      setDisplayName(user?.name ?? userName);
      setIsNew(!profile?.id);
      setContractType(profile.contractType ?? ContractType.SALARIE);
      setRemunerationMode(profile.remunerationMode ?? RemunerationMode.FIXE);
      setFixedInput(centsToInput(profile.fixedSalaryCents ?? 0));
      setVariableInput(centsToInput(profile.variablePerRdvCents ?? 0));
      setQuotaInput(String(profile.dailyQuota ?? 0));
      if (profile.effectiveFrom) setEffectiveFrom(new Date(profile.effectiveFrom).toISOString().slice(0, 10));
      setManagerId(user?.managerId ?? "");
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [userId, userName]);

  useEffect(() => {
    if (isOpen && userId) loadData();
  }, [isOpen, userId, loadData]);

  const hasFixed = remunerationMode !== RemunerationMode.VARIABLE;
  const hasVariable = remunerationMode !== RemunerationMode.FIXE;
  const fixedCents = hasFixed ? toCents(fixedInput) : 0;
  const variableCents = hasVariable ? toCents(variableInput) : 0;
  const quota = /^\d*$/.test(quotaInput) ? Number(quotaInput || "0") : null;

  const fieldErrors = {
    fixed: fixedCents === null ? "Montant invalide" : null,
    variable: variableCents === null ? "Montant invalide" : null,
    quota: quota === null ? "Nombre entier attendu" : null,
    date: !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) ? "Date requise" : null,
  };
  const invalid = Object.values(fieldErrors).some(Boolean);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid || fixedCents === null || variableCents === null || quota === null) return;
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/hr/profiles/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractType,
          remunerationMode,
          fixedSalaryCents: fixedCents,
          variablePerRdvCents: variableCents,
          dailyQuota: quota,
          effectiveFrom,
          managerId: managerId || null,
          reason: reason.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(
          res.status === 403 ? "Vous n’avez pas le droit de modifier les règles RH." : json.error || "L’enregistrement a échoué."
        );
      }
      onProfileSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const example = [
    hasFixed && fixedCents ? `${formatEuros(fixedCents)} de fixe pour un mois complet` : null,
    hasVariable && variableCents ? `${formatEuros(variableCents)} par rendez-vous pris` : null,
  ]
    .filter(Boolean)
    .join(", plus ");

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Règles de paie — ${displayName}`}
      description="Ces informations servent à calculer automatiquement la paie chaque mois."
      size="lg"
    >
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin text-indigo-600" />
          Chargement…
        </div>
      ) : loadError ? (
        <div className="space-y-3">
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            {loadError}
          </p>
          <button type="button" onClick={loadData} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200">
            Réessayer
          </button>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-5" noValidate>
          {isNew && (
            <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
              Première configuration : tant que ces règles ne sont pas enregistrées, la paie de {displayName} est calculée à 0 €.
            </p>
          )}

          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-xs font-semibold text-slate-700">Type de contrat</legend>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: ContractType.SALARIE, label: "Salarié (CDI / CDD)", icon: Briefcase },
                { value: ContractType.INDEPENDANT, label: "Indépendant / freelance", icon: User },
              ].map((c) => {
                const Icon = c.icon;
                const selected = contractType === c.value;
                return (
                  <label
                    key={c.value}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-3 text-xs transition-all focus-within:ring-2 focus-within:ring-indigo-500 ${
                      selected ? "border-indigo-600 bg-indigo-50/50 font-semibold text-indigo-950" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <input type="radio" name="contractType" checked={selected} onChange={() => setContractType(c.value)} className="sr-only" />
                    <Icon className="h-4 w-4 text-indigo-600" />
                    {c.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-xs font-semibold text-slate-700">Comment cette personne est-elle payée ?</legend>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {MODES.map((m) => {
                const selected = remunerationMode === m.value;
                return (
                  <label
                    key={m.value}
                    className={`cursor-pointer rounded-xl border p-3 text-left transition-all focus-within:ring-2 focus-within:ring-indigo-500 ${
                      selected ? "border-indigo-600 bg-indigo-50/50 text-indigo-950" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <input type="radio" name="remunerationMode" checked={selected} onChange={() => setRemunerationMode(m.value)} className="sr-only" />
                    <span className="mb-0.5 block text-xs font-semibold">{m.label}</span>
                    <span className="block text-[10px] text-slate-500">{m.desc}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {hasFixed && (
              <MoneyField
                id="hr-fixed"
                label="Salaire fixe mensuel (brut)"
                tip="Le montant pour un mois complet sans absence. Il est réduit automatiquement au prorata des absences."
                value={fixedInput}
                onChange={setFixedInput}
                error={fieldErrors.fixed}
              />
            )}
            {hasVariable && (
              <MoneyField
                id="hr-variable"
                label="Prime par rendez-vous"
                tip="Versée pour chaque rendez-vous pris dans le mois. Les rendez-vous annulés ne comptent pas."
                value={variableInput}
                onChange={setVariableInput}
                error={fieldErrors.variable}
              />
            )}

            <div className="space-y-1">
              <label htmlFor="hr-quota" className="flex items-center gap-1 text-xs font-semibold text-slate-700">
                Appels attendus par jour
                <HrHelpTip title="Objectif d’appels">
                  <p>Si la personne fait moins d’appels qu’attendu un jour travaillé, ce jour vous sera signalé « à statuer ».</p>
                  <p>Mettez 0 pour ne pas suivre d’objectif (par exemple pour un manager).</p>
                </HrHelpTip>
              </label>
              <input
                id="hr-quota"
                type="text"
                inputMode="numeric"
                value={quotaInput}
                onChange={(e) => setQuotaInput(e.target.value)}
                placeholder="Ex : 80"
                aria-invalid={Boolean(fieldErrors.quota)}
                className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 aria-[invalid=true]:border-rose-400"
              />
              {fieldErrors.quota && <p className="text-[11px] text-rose-600">{fieldErrors.quota}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="hr-effective" className="flex items-center gap-1 text-xs font-semibold text-slate-700">
                En vigueur depuis le
                <HrHelpTip title="Date d’effet">
                  <p>Date à laquelle ces règles commencent, gardée pour l’historique.</p>
                  <p>Les nouvelles règles s’appliquent aux mois pas encore validés dès que vous cliquez sur « Recalculer le mois ».</p>
                </HrHelpTip>
              </label>
              <input
                id="hr-effective"
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {example && (
            <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
              En clair : <strong className="text-slate-900">{example}</strong>.
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 md:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="hr-manager" className="text-xs font-semibold text-slate-700">
                Manager responsable
              </label>
              <select
                id="hr-manager"
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Aucun manager</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="hr-reason" className="text-xs font-semibold text-slate-700">
                Raison du changement (pour l’historique)
              </label>
              <input
                id="hr-reason"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex : augmentation annuelle, passage à temps plein…"
                className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs font-medium text-rose-600">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100">
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSaving || invalid}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSaving ? "Enregistrement…" : "Enregistrer les règles"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function MoneyField({
  id,
  label,
  tip,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  tip: string;
  value: string;
  onChange: (v: string) => void;
  error: string | null;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex items-center gap-1 text-xs font-semibold text-slate-700">
        {label}
        <HrHelpTip title={label}>
          <p>{tip}</p>
        </HrHelpTip>
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          aria-invalid={Boolean(error)}
          className="w-full rounded-lg border border-slate-200 bg-white p-2.5 pr-8 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 aria-[invalid=true]:border-rose-400"
        />
        <span className="absolute right-3 top-2.5 text-xs text-slate-400">€</span>
      </div>
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
    </div>
  );
}
