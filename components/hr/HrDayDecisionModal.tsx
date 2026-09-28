"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { HrDayDecision } from "@/lib/hr/hr-types";
import { formatDayKey } from "@/lib/hr/hr-rules";

interface HrDayDecisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  monthRecordId: string;
  dateStr: string;
  callCount: number;
  dailyQuota: number;
  currentDecision?: HrDayDecision;
  currentReason?: string;
  onDecisionSaved: () => void;
}

const MIN_REASON = 3;

export function HrDayDecisionModal({
  isOpen,
  onClose,
  monthRecordId,
  dateStr,
  callCount,
  dailyQuota,
  currentDecision,
  currentReason,
  onDecisionSaved,
}: HrDayDecisionModalProps) {
  const [decision, setDecision] = useState<HrDayDecision | undefined>(currentDecision);
  const [reason, setReason] = useState(currentReason || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasonOk = reason.trim().length >= MIN_REASON;
  const canSubmit = Boolean(decision) && reasonOk && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decision) {
      setError("Choisissez si la journée est payée ou non.");
      return;
    }
    if (!reasonOk) {
      setError("Écrivez une courte explication (3 caractères minimum).");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/hr/months/${monthRecordId}/day-decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateStr, decision, reason: reason.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(
          res.status === 403 ? "Vous n’avez pas le droit de statuer sur les journées." : json.error || "L’enregistrement a échoué."
        );
      }
      onDecisionSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formattedDate = formatDayKey(dateStr, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const missing = Math.max(0, dailyQuota - callCount);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cette journée est-elle payée ?" description={formattedDate} size="md">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="space-y-1 text-xs text-amber-900">
            <p className="font-semibold">
              {callCount} appel{callCount > 1 ? "s" : ""} sur {dailyQuota} attendus
              {missing > 0 && ` (il en manque ${missing})`}
            </p>
            <p>Décidez si cette journée compte dans le salaire. Tant que vous n’avez rien décidé, elle reste payée.</p>
          </div>
        </div>

        <fieldset>
          <legend className="sr-only">Décision</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ChoiceButton
              selected={decision === HrDayDecision.PAID}
              onClick={() => setDecision(HrDayDecision.PAID)}
              tone="emerald"
              icon={<CheckCircle2 className="h-4 w-4" />}
              title="Payée"
              desc="Il y avait une bonne raison (panne, formation, réunion client…). Le salaire ne change pas."
            />
            <ChoiceButton
              selected={decision === HrDayDecision.UNPAID}
              onClick={() => setDecision(HrDayDecision.UNPAID)}
              tone="rose"
              icon={<XCircle className="h-4 w-4" />}
              title="Non payée"
              desc="Le travail n’a pas été fait. Une journée est retirée du salaire fixe."
            />
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <label htmlFor="hr-day-reason" className="text-xs font-semibold text-slate-700">
            Pourquoi ? <span className="text-rose-500">*</span>
          </label>
          <textarea
            id="hr-day-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Ex : panne de la téléphonie le matin, formation interne l’après-midi…"
            className="w-full rounded-lg border border-slate-200 bg-white p-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-[11px] text-slate-400">Visible dans l’historique du dossier.</p>
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
            {isSubmitting ? "Enregistrement…" : "Enregistrer la décision"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ChoiceButton({
  selected,
  onClick,
  tone,
  icon,
  title,
  desc,
}: {
  selected: boolean;
  onClick: () => void;
  tone: "emerald" | "rose";
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  const active =
    tone === "emerald"
      ? "border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20 text-emerald-700"
      : "border-rose-600 bg-rose-50/60 ring-2 ring-rose-500/20 text-rose-700";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex flex-col gap-2 rounded-xl border p-4 text-left transition-all ${
        selected ? active : "border-slate-200 bg-white text-slate-300 hover:border-slate-300"
      }`}
    >
      <span className="flex w-full items-center justify-between">
        <span className="text-sm font-semibold text-slate-900">{title}</span>
        {icon}
      </span>
      <span className="text-xs text-slate-500">{desc}</span>
    </button>
  );
}
