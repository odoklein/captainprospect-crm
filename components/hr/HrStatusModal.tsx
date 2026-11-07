"use client";

import { useState } from "react";
import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { CONTROL_HEIGHT, FIELD_BASE, FIELD_ERROR, FOCUS_RING } from "@/components/ui/recipes";
import { HrMonthStatus } from "@/lib/hr/hr-types";
import { STATUS_LABELS, formatEuros, formatMonthLabel, isLockedStatus, resolveStatusTransition } from "@/lib/hr/hr-rules";
import { HrHelpTip } from "./HrHelpTip";

interface HrStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  monthRecordId: string;
  userName: string;
  month: string;
  currentStatus: HrMonthStatus;
  currentAdjustmentCents?: number;
  currentAdjustmentNote?: string;
  baseAmountCents: number;
  pendingDecisionCount: number;
  isStale: boolean;
  onStatusUpdated: (statusLabel: string) => void;
}

// Same step dots as the Paie tabs.
const OPTIONS: { value: HrMonthStatus; desc: string; dot: string }[] = [
  { value: HrMonthStatus.DRAFT, desc: "Le mois est en cours, les chiffres peuvent encore bouger.", dot: "bg-line-strong" },
  { value: HrMonthStatus.TO_VERIFY, desc: "Prêt à être relu avant validation.", dot: "bg-warning" },
  { value: HrMonthStatus.VALIDATED, desc: "Chiffres vérifiés et verrouillés pour la paie.", dot: "bg-primary-500" },
  { value: HrMonthStatus.PAID, desc: "Le virement a été effectué.", dot: "bg-success" },
];

const LABEL = "mb-1.5 flex items-center gap-1 text-[13px] font-medium text-ink-2";

function parseEuros(input: string): number | null {
  const normalized = input.replace(/\s/g, "").replace(",", ".");
  if (normalized === "" || normalized === "-") return 0;
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function HrStatusModal({
  isOpen,
  onClose,
  monthRecordId,
  userName,
  month,
  currentStatus,
  currentAdjustmentCents = 0,
  currentAdjustmentNote = "",
  baseAmountCents,
  pendingDecisionCount,
  isStale,
  onStatusUpdated,
}: HrStatusModalProps) {
  const [status, setStatus] = useState<HrMonthStatus>(currentStatus);
  const [adjustmentInput, setAdjustmentInput] = useState(
    currentAdjustmentCents ? String(currentAdjustmentCents / 100).replace(".", ",") : ""
  );
  const [adjustmentNote, setAdjustmentNote] = useState(currentAdjustmentNote);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adjustmentCents = parseEuros(adjustmentInput);
  const adjustmentLocked = isLockedStatus(currentStatus) && isLockedStatus(status);
  const adjustmentChanged = adjustmentCents !== currentAdjustmentCents || adjustmentNote !== currentAdjustmentNote;
  const noteMissing = adjustmentCents !== null && adjustmentCents !== 0 && adjustmentNote.trim() === "";
  const validationBlocked =
    status === HrMonthStatus.VALIDATED && currentStatus !== HrMonthStatus.VALIDATED && (pendingDecisionCount > 0 || isStale);
  const reopening = isLockedStatus(currentStatus) && !isLockedStatus(status);

  const canSubmit =
    !isSubmitting &&
    adjustmentCents !== null &&
    !noteMissing &&
    !validationBlocked &&
    (status !== currentStatus || (!adjustmentLocked && adjustmentChanged));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || adjustmentCents === null) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/hr/months/${monthRecordId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          adjustmentLocked
            ? { status }
            : { status, adjustmentCents, adjustmentNote: adjustmentNote.trim() }
        ),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(
          res.status === 403
            ? "Vous n’avez pas le droit d’effectuer ce changement. Demandez à un administrateur."
            : json.error || "La mise à jour a échoué."
        );
      }
      onStatusUpdated(STATUS_LABELS[status]);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Étape du dossier — ${userName}`} description={formatMonthLabel(month)} size="md">
      <form onSubmit={handleSubmit} className="space-y-5">
        <fieldset>
          <legend className={LABEL}>
            Où en est ce dossier ?
            <HrHelpTip title="Pourquoi ces étapes ?">
              <p>Elles évitent de payer un mois qui n’a pas été relu.</p>
              <p>« Payé » n’est possible qu’après « Validé ». Revenir en arrière sur un dossier validé demande un droit spécial.</p>
            </HrHelpTip>
          </legend>
          <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {OPTIONS.map((opt, i) => {
              const t = resolveStatusTransition(currentStatus, opt.value);
              const selected = status === opt.value;
              return (
                <li key={opt.value}>
                  <button
                    type="button"
                    onClick={() => t.allowed && setStatus(opt.value)}
                    disabled={!t.allowed}
                    aria-pressed={selected}
                    title={t.reason}
                    className={cn(
                      "flex h-full w-full flex-col gap-1 rounded-xl border p-3 text-left transition-[border-color,background-color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-45",
                      FOCUS_RING,
                      selected
                        ? "border-primary-500 bg-primary-50/60 shadow-[inset_0_0_0_1px_var(--color-primary-500)]"
                        : "border-line bg-surface hover:border-line-strong"
                    )}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                        <span className={cn("size-2 shrink-0 rounded-full", opt.dot)} aria-hidden />
                        {i + 1}. {STATUS_LABELS[opt.value]}
                        {opt.value === currentStatus && <span className="font-normal text-ink-3">(actuel)</span>}
                      </span>
                      {selected && <Check className="size-4 shrink-0 text-primary-600" aria-hidden />}
                    </span>
                    <span className="pl-4 text-xs leading-snug text-ink-3">{t.allowed ? opt.desc : t.reason}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </fieldset>

        {validationBlocked && (
          <Callout tone="warning">
            {pendingDecisionCount > 0
              ? `Il reste ${pendingDecisionCount} journée(s) à statuer. Ouvrez « Détail » pour les traiter avant de valider.`
              : "De nouvelles activités sont arrivées. Cliquez sur « Recalculer le mois » avant de valider."}
          </Callout>
        )}

        {reopening && (
          <Callout tone="neutral">
            Vous rouvrez un dossier verrouillé : les chiffres pourront de nouveau changer. Ce changement est tracé dans l’historique.
          </Callout>
        )}

        <div className="space-y-4 border-t border-line-subtle pt-5">
          {adjustmentLocked ? (
            <p className="flex items-center gap-2 text-[13px] text-ink-3">
              <Lock className="size-3.5 shrink-0" aria-hidden />
              <span>
                Ajustement verrouillé (<span className="tabular-nums">{formatEuros(currentAdjustmentCents)}</span>). Repassez en « À vérifier » pour le modifier.
              </span>
            </p>
          ) : (
            <>
              <div>
                <label htmlFor="hr-adjustment" className={LABEL}>
                  Ajustement manuel <span className="font-normal text-ink-3">(facultatif)</span>
                  <HrHelpTip title="Ajustement">
                    <p>Un montant ajouté (prime) ou retiré (retenue) du total, par exemple une prime de challenge ou un trop-perçu.</p>
                    <p>Tapez un nombre négatif pour une retenue, par exemple « -50 ».</p>
                  </HrHelpTip>
                </label>
                <div className="relative">
                  <input
                    id="hr-adjustment"
                    type="text"
                    inputMode="decimal"
                    value={adjustmentInput}
                    onChange={(e) => setAdjustmentInput(e.target.value)}
                    placeholder="0"
                    aria-invalid={adjustmentCents === null}
                    className={cn(FIELD_BASE, CONTROL_HEIGHT.md, "pl-3 pr-8 tabular-nums", adjustmentCents === null && FIELD_ERROR)}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">€</span>
                </div>
                {adjustmentCents === null && <p role="alert" className="mt-1.5 text-xs font-medium text-danger-ink">Montant invalide. Exemple : 150 ou -50,25</p>}
              </div>
              <div>
                <label htmlFor="hr-adjustment-note" className={LABEL}>
                  Justification {adjustmentCents ? <span className="text-danger-ink" aria-hidden>*</span> : null}
                </label>
                <input
                  id="hr-adjustment-note"
                  type="text"
                  maxLength={500}
                  value={adjustmentNote}
                  onChange={(e) => setAdjustmentNote(e.target.value)}
                  placeholder="Ex : prime challenge de septembre, régularisation transport…"
                  aria-invalid={noteMissing}
                  className={cn(FIELD_BASE, CONTROL_HEIGHT.md, "px-3", noteMissing && FIELD_ERROR)}
                />
                {noteMissing && <p className="mt-1.5 text-xs font-medium text-danger-ink">Expliquez pourquoi cet ajustement est appliqué.</p>}
              </div>
            </>
          )}

          <div className="flex items-center justify-between gap-4 rounded-xl bg-surface-2 px-4 py-3">
            <span className="text-[13px] text-ink-3">Total à payer après ce changement</span>
            <span className="font-display text-lg font-semibold tabular-nums text-ink">
              {formatEuros(baseAmountCents + (adjustmentLocked ? currentAdjustmentCents : adjustmentCents ?? currentAdjustmentCents))}
            </span>
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
          <Button type="submit" size="sm" disabled={!canSubmit} isLoading={isSubmitting}>
            {isSubmitting ? "Enregistrement…" : status !== currentStatus ? `Passer en « ${STATUS_LABELS[status]} »` : "Enregistrer"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
