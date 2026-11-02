"use client";

import { useCallback, useEffect, useState } from "react";
import { Briefcase, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { CONTROL_HEIGHT, FIELD_BASE, FIELD_ERROR } from "@/components/ui/recipes";
import { ContractType, RemunerationMode } from "@/lib/hr/hr-types";
import { formatEuros } from "@/lib/hr/hr-rules";
import { PanelMessage, TextButton } from "./HubUI";
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

const LABEL = "mb-1.5 flex items-center gap-1 text-[13px] font-medium text-ink-2";
const field = (error?: string | null) => cn(FIELD_BASE, CONTROL_HEIGHT.md, "px-3", error && FIELD_ERROR);

/** Radio rendered as a card: the selected one carries the primary outline. */
const choiceCard = (selected: boolean) =>
  cn(
    "cursor-pointer rounded-xl border p-3 text-left transition-[border-color,background-color,box-shadow] duration-150 focus-within:ring-2 focus-within:ring-focus focus-within:ring-offset-2 focus-within:ring-offset-surface",
    selected ? "border-primary-500 bg-primary-50/60 shadow-[inset_0_0_0_1px_var(--color-primary-500)]" : "border-line bg-surface hover:border-line-strong"
  );

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
        <div className="space-y-5" aria-busy="true" aria-label="Chargement">
          {[2, 3, 2].map((cols, i) => (
            <div key={i} className="space-y-2">
              <span className="block h-3 w-40 rounded bg-surface-3" />
              <div className={cn("grid gap-3", cols === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2")}>
                {Array.from({ length: cols }).map((_, j) => (
                  <span key={j} className="block h-12 rounded-xl bg-surface-3" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-line">
          <PanelMessage tone="error" action={<TextButton onClick={loadData}>Réessayer</TextButton>}>
            {loadError}
          </PanelMessage>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-5" noValidate>
          {isNew && (
            <Callout tone="info">
              Première configuration : tant que ces règles ne sont pas enregistrées, la paie de {displayName} est calculée à 0 €.
            </Callout>
          )}

          <fieldset>
            <legend className={LABEL}>Type de contrat</legend>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {[
                { value: ContractType.SALARIE, label: "Salarié (CDI / CDD)", icon: Briefcase },
                { value: ContractType.INDEPENDANT, label: "Indépendant / freelance", icon: User },
              ].map((c) => {
                const Icon = c.icon;
                const selected = contractType === c.value;
                return (
                  <label key={c.value} className={cn(choiceCard(selected), "flex items-center gap-2.5 text-[13px]", selected ? "font-semibold text-ink" : "text-ink-2")}>
                    <input type="radio" name="contractType" checked={selected} onChange={() => setContractType(c.value)} className="sr-only" />
                    <Icon className={cn("size-4 shrink-0", selected ? "text-primary-600" : "text-ink-4")} aria-hidden />
                    {c.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className={LABEL}>Comment cette personne est-elle payée ?</legend>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {MODES.map((m) => {
                const selected = remunerationMode === m.value;
                return (
                  <label key={m.value} className={choiceCard(selected)}>
                    <input type="radio" name="remunerationMode" checked={selected} onChange={() => setRemunerationMode(m.value)} className="sr-only" />
                    <span className={cn("block text-[13px] font-semibold", selected ? "text-ink" : "text-ink-2")}>{m.label}</span>
                    <span className="mt-0.5 block text-xs text-ink-3">{m.desc}</span>
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

            <div>
              <label htmlFor="hr-quota" className={LABEL}>
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
                className={cn(field(fieldErrors.quota), "tabular-nums")}
              />
              {fieldErrors.quota && <p role="alert" className="mt-1.5 text-xs font-medium text-danger-ink">{fieldErrors.quota}</p>}
            </div>

            <div>
              <label htmlFor="hr-effective" className={LABEL}>
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
                className={cn(field(fieldErrors.date), "tabular-nums")}
              />
            </div>
          </div>

          {example && (
            <p className="rounded-xl bg-surface-2 px-4 py-3 text-[13px] text-ink-2">
              En clair : <strong className="font-semibold text-ink">{example}</strong>.
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 border-t border-line-subtle pt-5 md:grid-cols-2">
            <div>
              <label htmlFor="hr-manager" className={LABEL}>
                Manager responsable
              </label>
              <select id="hr-manager" value={managerId} onChange={(e) => setManagerId(e.target.value)} className={field()}>
                <option value="">Aucun manager</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="hr-reason" className={LABEL}>
                Raison du changement <span className="font-normal text-ink-3">(pour l’historique)</span>
              </label>
              <input
                id="hr-reason"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex : augmentation annuelle, passage à temps plein…"
                className={field()}
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-[13px] font-medium text-danger-ink">
              {error}
            </p>
          )}

          <ModalFooter className="mt-0">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" size="sm" disabled={invalid} isLoading={isSaving}>
              {isSaving ? "Enregistrement…" : "Enregistrer les règles"}
            </Button>
          </ModalFooter>
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
    <div>
      <label htmlFor={id} className={LABEL}>
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
          className={cn(field(error), "pr-8 tabular-nums")}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">€</span>
      </div>
      {error && <p role="alert" className="mt-1.5 text-xs font-medium text-danger-ink">{error}</p>}
    </div>
  );
}
