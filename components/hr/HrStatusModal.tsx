"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, CreditCard, Lock, ShieldAlert } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
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

const OPTIONS: { value: HrMonthStatus; desc: string; icon: typeof Clock }[] = [
  { value: HrMonthStatus.DRAFT, desc: "Le mois est en cours, les chiffres peuvent encore bouger.", icon: Clock },
  { value: HrMonthStatus.TO_VERIFY, desc: "Prêt à être relu avant validation.", icon: ShieldAlert },
  { value: HrMonthStatus.VALIDATED, desc: "Chiffres vérifiés et verrouillés pour la paie.", icon: CheckCircle2 },
  { value: HrMonthStatus.PAID, desc: "Le virement a été effectué.", icon: CreditCard },
];

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
        <fieldset className="space-y-2">
          <legend className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-700">
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
              const Icon = opt.icon;
              return (
                <li key={opt.value}>
                  <button
                    type="button"
                    onClick={() => t.allowed && setStatus(opt.value)}
                    disabled={!t.allowed}
                    aria-pressed={selected}
                    title={t.reason}
                    className={`flex h-full w-full flex-col gap-1 rounded-xl border p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-45 ${
                      selected ? "border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/20" : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <span className="flex w-full items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900">
                        {i + 1}. {STATUS_LABELS[opt.value]}
                        {opt.value === currentStatus && <span className="ml-1 font-normal text-slate-400">(actuel)</span>}
                      </span>
                      <Icon className={`h-4 w-4 ${selected ? "text-indigo-600" : "text-slate-400"}`} />
                    </span>
                    <span className="text-[10px] leading-snug text-slate-500">{t.allowed ? opt.desc : t.reason}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </fieldset>

        {validationBlocked && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
            <span>
              {pendingDecisionCount > 0
                ? `Il reste ${pendingDecisionCount} journée(s) à statuer. Ouvrez « Détail » pour les traiter avant de valider.`
                : "De nouvelles activités sont arrivées. Cliquez sur « Recalculer le mois » avant de valider."}
            </span>
          </div>
        )}

        {reopening && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            Vous rouvrez un dossier verrouillé : les chiffres pourront de nouveau changer. Ce changement est tracé dans l’historique.
          </p>
        )}

        <div className="space-y-3 border-t border-slate-100 pt-4">
          {adjustmentLocked ? (
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <Lock className="h-3.5 w-3.5" />
              Ajustement verrouillé ({formatEuros(currentAdjustmentCents)}). Repassez en « À vérifier » pour le modifier.
            </p>
          ) : (
            <>
              <div className="space-y-1">
                <label htmlFor="hr-adjustment" className="flex items-center gap-1 text-xs font-semibold text-slate-700">
                  Ajustement manuel (facultatif)
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
                    className="w-full rounded-lg border border-slate-200 bg-white p-2.5 pr-8 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 aria-[invalid=true]:border-rose-400"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-400">€</span>
                </div>
                {adjustmentCents === null && <p className="text-[11px] text-rose-600">Montant invalide. Exemple : 150 ou -50,25</p>}
              </div>
              <div className="space-y-1">
                <label htmlFor="hr-adjustment-note" className="text-xs font-semibold text-slate-700">
                  Justification {adjustmentCents ? <span className="text-rose-500">*</span> : null}
                </label>
                <input
                  id="hr-adjustment-note"
                  type="text"
                  maxLength={500}
                  value={adjustmentNote}
                  onChange={(e) => setAdjustmentNote(e.target.value)}
                  placeholder="Ex : prime challenge de septembre, régularisation transport…"
                  className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {noteMissing && <p className="text-[11px] text-rose-600">Expliquez pourquoi cet ajustement est appliqué.</p>}
              </div>
            </>
          )}

          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-xs">
            <span className="text-slate-500">Total à payer après ce changement</span>
            <span className="text-sm font-bold tabular-nums text-slate-900">
              {formatEuros(baseAmountCents + (adjustmentLocked ? currentAdjustmentCents : adjustmentCents ?? currentAdjustmentCents))}
            </span>
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
            disabled={!canSubmit}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSubmitting ? "Enregistrement…" : status !== currentStatus ? `Passer en « ${STATUS_LABELS[status]} »` : "Enregistrer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
