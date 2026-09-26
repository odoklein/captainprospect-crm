"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { HrDayDecision } from "@/lib/hr/hr-types";
import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";

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
  const [decision, setDecision] = useState<HrDayDecision>(
    currentDecision || HrDayDecision.PAID
  );
  const [reason, setReason] = useState(currentReason || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Le motif est obligatoire pour enregistrer cette décision.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const res = await fetch(`/api/hr/months/${monthRecordId}/day-decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateStr,
          decision,
          reason: reason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur lors de l'enregistrement");
      }

      onDecisionSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formattedDate = new Date(dateStr).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Décision sur journée sous le quota"
      description={`Journée du ${formattedDate}`}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Info card */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800">
            <p className="font-semibold mb-1">
              Résultat sous le quota : {callCount} appels réalisés / quota attendu de {dailyQuota}
            </p>
            <p>
              Pour toute journée avec un résultat inférieur au quota ou égal à zéro, vous devez
              spécifier si la journée est maintenue payée ou déduite du calcul fixe, accompagnée d'un motif obligatoire.
            </p>
          </div>
        </div>

        {/* Decision choices */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setDecision(HrDayDecision.PAID)}
            className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between gap-2 ${
              decision === HrDayDecision.PAID
                ? "border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <span className="font-semibold text-sm text-slate-900">Journée payée</span>
              <CheckCircle2
                className={`w-4 h-4 ${
                  decision === HrDayDecision.PAID ? "text-emerald-600" : "text-slate-300"
                }`}
              />
            </div>
            <p className="text-xs text-slate-500">
              La journée est comptabilisée dans les jours effectifs travaillés.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setDecision(HrDayDecision.UNPAID)}
            className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between gap-2 ${
              decision === HrDayDecision.UNPAID
                ? "border-rose-600 bg-rose-50/60 ring-2 ring-rose-500/20"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <span className="font-semibold text-sm text-slate-900">Journée non payée</span>
              <XCircle
                className={`w-4 h-4 ${
                  decision === HrDayDecision.UNPAID ? "text-rose-600" : "text-slate-300"
                }`}
              />
            </div>
            <p className="text-xs text-slate-500">
              La journée est déduite du salaire fixe (prorata déduit).
            </p>
          </button>
        </div>

        {/* Reason */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">
            Motif obligatoire <span className="text-rose-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            required
            placeholder="Ex : Problème technique Allo résolu, séance de formation interne, prospection non effectuée sans justificatif..."
            className="w-full text-xs p-3 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {error && (
          <p className="text-xs font-medium text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-200">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors shadow-sm"
          >
            {isSubmitting ? "Enregistrement..." : "Enregistrer la décision"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
