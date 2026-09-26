"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { CalculationBreakdown, HrDayDecision } from "@/lib/hr/hr-types";
import { HrDayDecisionModal } from "./HrDayDecisionModal";
import {
  Calendar,
  Phone,
  Target,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertTriangle,
  RefreshCw,
  Calculator,
} from "lucide-react";

interface HrCalculationDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  month: string;
  monthRecordId?: string;
  onCalculationUpdated?: () => void;
}

export function HrCalculationDetailModal({
  isOpen,
  onClose,
  userId,
  month,
  monthRecordId,
  onCalculationUpdated,
}: HrCalculationDetailModalProps) {
  const [data, setData] = useState<CalculationBreakdown | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected day for under-quota decision modal
  const [selectedDay, setSelectedDay] = useState<{
    dateStr: string;
    callCount: number;
    dailyQuota: number;
    decision?: HrDayDecision;
    decisionReason?: string;
  } | null>(null);

  const fetchDetail = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch(`/api/hr/months/calculate?userId=${userId}&month=${month}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || "Impossible de charger le détail du calcul");
      }

      setData(json.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && userId && month) {
      fetchDetail();
    }
  }, [isOpen, userId, month]);

  const handleDecisionSaved = () => {
    fetchDetail();
    onCalculationUpdated?.();
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Détail du calcul RH — ${data?.userName || "Collaborateur"}`}
        description={`Mois de ${month} • Formule et ventilation transparente`}
        size="xl"
      >
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin" />
            <p className="text-xs text-slate-500">Calcul transparent en cours...</p>
          </div>
        ) : error ? (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
            {error}
          </div>
        ) : data ? (
          <div className="space-y-6">
            {/* Top Financial Breakdown Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <span className="text-[11px] font-medium text-slate-500 block mb-1">
                  Salaire Fixe Proratisé
                </span>
                <p className="text-lg font-bold text-slate-900">
                  {(data.proratedFixedCents / 100).toFixed(2)} €
                </p>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Base: {(data.baseFixedSalaryCents / 100).toFixed(2)} €
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <span className="text-[11px] font-medium text-slate-500 block mb-1">
                  Montant Variable (RDV)
                </span>
                <p className="text-lg font-bold text-emerald-600">
                  {(data.variableAmountCents / 100).toFixed(2)} €
                </p>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  {data.totalRdv} RDV × {(data.variablePerRdvCents / 100).toFixed(2)} €
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <span className="text-[11px] font-medium text-slate-500 block mb-1">
                  Ajustements Manuels
                </span>
                <p className="text-lg font-bold text-indigo-600">
                  {(data.adjustmentCents / 100).toFixed(2)} €
                </p>
                <span className="text-[10px] text-slate-400 block mt-0.5 truncate" title={data.adjustmentNote}>
                  {data.adjustmentNote || "Aucun ajustement"}
                </span>
              </div>

              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3.5">
                <span className="text-[11px] font-medium text-indigo-700 block mb-1">
                  Total Estimé à Payer
                </span>
                <p className="text-xl font-black text-indigo-900">
                  {(data.totalAmountCents / 100).toFixed(2)} €
                </p>
                <span className="text-[10px] text-indigo-600 block mt-0.5">
                  Mode: {data.remunerationMode}
                </span>
              </div>
            </div>

            {/* Transparent Formulas Box */}
            <div className="bg-slate-900 text-slate-100 rounded-xl p-4 space-y-3 font-mono text-xs">
              <div className="flex items-center gap-2 text-indigo-400 font-semibold uppercase tracking-wider text-[11px]">
                <Calculator className="w-4 h-4" />
                Formules appliquées (Transparence de calcul)
              </div>
              <div className="space-y-1.5 text-slate-300">
                <div className="flex items-start justify-between gap-4 py-1 border-b border-slate-800">
                  <span className="text-slate-400">Jours travaillés :</span>
                  <span className="text-right text-white font-medium">{data.formulas.workingDaysFormula}</span>
                </div>
                <div className="flex items-start justify-between gap-4 py-1 border-b border-slate-800">
                  <span className="text-slate-400">Calcul du fixe :</span>
                  <span className="text-right text-white font-medium">{data.formulas.fixedFormula}</span>
                </div>
                <div className="flex items-start justify-between gap-4 py-1 border-b border-slate-800">
                  <span className="text-slate-400">Calcul du variable :</span>
                  <span className="text-right text-white font-medium">{data.formulas.variableFormula}</span>
                </div>
                <div className="flex items-start justify-between gap-4 pt-1 text-emerald-400 font-bold">
                  <span>Montant total :</span>
                  <span className="text-right">{data.formulas.totalFormula}</span>
                </div>
              </div>
            </div>

            {/* Under-quota Warning if pending */}
            {data.daysUnderQuotaCount > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between text-xs text-amber-800">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    <strong>{data.daysUnderQuotaCount} journée(s)</strong> avec un résultat inférieur
                    au quota ({data.dailyQuota} appels/j).
                  </span>
                </div>
                <span className="text-[11px] text-amber-700">
                  Cliquez sur une journée ci-dessous pour statuer (Payé / Non payé).
                </span>
              </div>
            )}

            {/* Day by Day Activity Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Suivi journalier du mois ({data.days.length} jours)
              </h4>
              <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Appels</th>
                      <th className="py-2.5 px-3">RDV</th>
                      <th className="py-2.5 px-3">Statut Quota</th>
                      <th className="py-2.5 px-3 text-right">Décision / Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.days.map((d) => {
                      const dateObj = new Date(d.date);
                      const dayName = dateObj.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" });

                      return (
                        <tr
                          key={d.date}
                          className={`hover:bg-slate-50 transition-colors ${
                            d.isUnderQuota ? "bg-amber-50/30" : ""
                          }`}
                        >
                          <td className="py-2 px-3 font-medium text-slate-900 capitalize">
                            {dayName}
                          </td>
                          <td className="py-2 px-3 text-slate-500">
                            {d.isHoliday ? (
                              <span className="text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                {d.holidayLabel || "Férié"}
                              </span>
                            ) : d.isAbsence ? (
                              <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                Absence ({d.absenceType || "Congé"})
                              </span>
                            ) : !d.isWorkingDay ? (
                              <span className="text-slate-400 text-[10px]">Week-end</span>
                            ) : (
                              <span className="text-slate-700 text-[10px]">Ouvré</span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-800">
                            {d.callCount}
                            {d.isWorkingDay && !d.isAbsence && data.dailyQuota > 0 && (
                              <span className="text-slate-400 font-normal text-[10px]"> / {data.dailyQuota}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-semibold text-emerald-600">
                            {d.rdvCount > 0 ? `+${d.rdvCount}` : "-"}
                          </td>
                          <td className="py-2 px-3">
                            {d.isUnderQuota ? (
                              <span className="text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded text-[10px] font-medium inline-flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                Sous quota
                              </span>
                            ) : d.isWorkingDay && !d.isAbsence ? (
                              <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px] font-medium inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Quota atteint
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[10px]">-</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {d.isUnderQuota ? (
                              <div className="flex items-center justify-end gap-1.5">
                                {d.decision ? (
                                  <span
                                    title={d.decisionReason}
                                    className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-help inline-flex items-center gap-1 ${
                                      d.decision === HrDayDecision.PAID
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-rose-100 text-rose-800"
                                    }`}
                                  >
                                    {d.decision === HrDayDecision.PAID ? "Payé" : "Non payé"}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-amber-600 font-medium">À statuer</span>
                                )}
                                {monthRecordId && (
                                  <button
                                    onClick={() =>
                                      setSelectedDay({
                                        dateStr: d.date,
                                        callCount: d.callCount,
                                        dailyQuota: data.dailyQuota,
                                        decision: d.decision,
                                        decisionReason: d.decisionReason,
                                      })
                                    }
                                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium underline"
                                  >
                                    Statuer
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-300 text-[10px]">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Decision modal child */}
      {selectedDay && monthRecordId && (
        <HrDayDecisionModal
          isOpen={Boolean(selectedDay)}
          onClose={() => setSelectedDay(null)}
          monthRecordId={monthRecordId}
          dateStr={selectedDay.dateStr}
          callCount={selectedDay.callCount}
          dailyQuota={selectedDay.dailyQuota}
          currentDecision={selectedDay.decision}
          currentReason={selectedDay.decisionReason}
          onDecisionSaved={handleDecisionSaved}
        />
      )}
    </>
  );
}
