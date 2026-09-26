"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { HrMonthStatus } from "@/lib/hr/hr-types";
import { ShieldAlert, CheckCircle2, Clock, Check, CreditCard } from "lucide-react";

interface HrStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  monthRecordId: string;
  userName: string;
  month: string;
  currentStatus: HrMonthStatus;
  currentAdjustmentCents?: number;
  currentAdjustmentNote?: string;
  onStatusUpdated: () => void;
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
  onStatusUpdated,
}: HrStatusModalProps) {
  const [status, setStatus] = useState<HrMonthStatus>(currentStatus);
  const [adjustmentEuros, setAdjustmentEuros] = useState<number>(currentAdjustmentCents / 100);
  const [adjustmentNote, setAdjustmentNote] = useState<string>(currentAdjustmentNote);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setIsSubmitting(true);
      setError(null);

      const res = await fetch(`/api/hr/months/${monthRecordId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          adjustmentCents: Math.round(Number(adjustmentEuros) * 100),
          adjustmentNote: adjustmentNote || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Erreur lors de la mise à jour du statut");
      }

      onStatusUpdated();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusOptions = [
    {
      value: HrMonthStatus.DRAFT,
      label: "Brouillon",
      desc: "Calcul provisoire en cours de mois",
      icon: Clock,
      color: "border-slate-300 text-slate-700",
    },
    {
      value: HrMonthStatus.TO_VERIFY,
      label: "À vérifier",
      desc: "Prêt pour la revue managériale de fin de mois",
      icon: ShieldAlert,
      color: "border-amber-400 text-amber-800",
    },
    {
      value: HrMonthStatus.VALIDATED,
      label: "Validé",
      desc: "Chiffres vérifiés et verrouillés pour la paie",
      icon: CheckCircle2,
      color: "border-indigo-500 text-indigo-900",
    },
    {
      value: HrMonthStatus.PAID,
      label: "Payé",
      desc: "Virement bancaire exécuté",
      icon: CreditCard,
      color: "border-emerald-500 text-emerald-900",
    },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Statut & Ajustements — ${userName}`}
      description={`Période : ${month}`}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Status choices */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700 block">
            Statut du dossier mensuel
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            {statusOptions.map((opt) => {
              const Icon = opt.icon;
              const isSelected = status === opt.value;
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setStatus(opt.value)}
                  className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between gap-1.5 ${
                    isSelected
                      ? "border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/20"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-semibold text-xs text-slate-900">{opt.label}</span>
                    <Icon className={`w-4 h-4 ${isSelected ? "text-indigo-600" : "text-slate-400"}`} />
                  </div>
                  <p className="text-[10px] text-slate-500 leading-snug">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Adjustments */}
        <div className="pt-2 border-t border-slate-100 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 block">
              Ajustement manuel (€ positif pour prime, négatif pour retenue)
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                value={adjustmentEuros}
                onChange={(e) => setAdjustmentEuros(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full text-xs p-2.5 pr-8 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="absolute right-3 top-2.5 text-xs text-slate-400">€</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 block">
              Motif de l'ajustement (justificatif)
            </label>
            <input
              type="text"
              value={adjustmentNote}
              onChange={(e) => setAdjustmentNote(e.target.value)}
              placeholder="Ex : Prime exceptionnelle challenge de rentrée, régularisation transport..."
              className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
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
            {isSubmitting ? "Enregistrement..." : "Appliquer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
