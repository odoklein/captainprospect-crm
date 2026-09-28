"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Calculator, CheckCircle2, ChevronLeft, ChevronRight, Lock, RefreshCw, Save } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { CalculationBreakdown, DayActivityDetail, HrDayDecision, HrMonthStatus } from "@/lib/hr/hr-types";
import { REMUNERATION_LABELS, STATUS_LABELS, formatDayKey, formatEuros, formatMonthLabel, isLockedStatus } from "@/lib/hr/hr-rules";
import { HrDayDecisionModal } from "./HrDayDecisionModal";
import { HrHelpTip } from "./HrHelpTip";
import { HrGuide, useHrGuide } from "./HrGuide";
import { HR_DETAIL_GUIDE, HR_DETAIL_GUIDE_KEY } from "./hr-guide-steps";

interface HrCalculationDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  month: string;
  onCalculationUpdated?: () => void;
  onOpenRules?: () => void;
  navigation?: {
    position: number;
    total: number;
    prev?: { id: string; name: string };
    next?: { id: string; name: string };
  };
  onNavigate?: (userId: string) => void;
}

export function HrCalculationDetailModal({
  isOpen,
  onClose,
  userId,
  month,
  onCalculationUpdated,
  onOpenRules,
  navigation,
  onNavigate,
}: HrCalculationDetailModalProps) {
  const [data, setData] = useState<CalculationBreakdown | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyToHandle, setOnlyToHandle] = useState(false);
  const [selectedDay, setSelectedDay] = useState<DayActivityDetail | null>(null);
  const seq = useRef(0);

  const fetchDetail = useCallback(async () => {
    const mine = ++seq.current;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/hr/months/calculate?userId=${encodeURIComponent(userId)}&month=${encodeURIComponent(month)}`
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || "Impossible de charger le détail du calcul.");
      if (mine !== seq.current) return;
      setData(json.data);
      setOnlyToHandle((prev) => prev || json.data.pendingDecisionCount > 0);
    } catch (err) {
      if (mine === seq.current) setError((err as Error).message);
    } finally {
      if (mine === seq.current) setIsLoading(false);
    }
  }, [userId, month]);

  useEffect(() => {
    if (isOpen) fetchDetail();
  }, [isOpen, fetchDetail]);

  const handleSaveCalculation = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/hr/months/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, month }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || "L’enregistrement a échoué.");
      setData(json.data);
      onCalculationUpdated?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDecisionSaved = () => {
    fetchDetail();
    onCalculationUpdated?.();
  };

  const locked = isLockedStatus(data?.status);
  const canDecide = Boolean(data?.monthRecordId) && !locked;
  const guide = useHrGuide(HR_DETAIL_GUIDE_KEY, isOpen && Boolean(data) && !isLoading);

  const filterDays = onlyToHandle && (data?.daysUnderQuotaCount ?? 0) > 0;
  const visibleDays = data ? (filterDays ? data.days.filter((d) => d.isUnderQuota) : data.days) : [];

  const navBar = navigation && onNavigate && navigation.total > 1 && (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-2 py-1.5 text-xs">
      <button
        type="button"
        onClick={() => navigation.prev && onNavigate(navigation.prev.id)}
        disabled={!navigation.prev || isLoading}
        className="inline-flex min-w-0 items-center gap-1 rounded-lg px-2 py-1 font-medium text-slate-700 hover:bg-white disabled:opacity-30"
      >
        <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{navigation.prev?.name ?? "Précédent"}</span>
      </button>
      <span className="shrink-0 tabular-nums text-slate-500">
        {navigation.position} / {navigation.total}
      </span>
      <button
        type="button"
        onClick={() => navigation.next && onNavigate(navigation.next.id)}
        disabled={!navigation.next || isLoading}
        className="inline-flex min-w-0 items-center gap-1 rounded-lg px-2 py-1 font-medium text-slate-700 hover:bg-white disabled:opacity-30"
      >
        <span className="truncate">{navigation.next?.name ?? "Suivant"}</span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
      </button>
    </div>
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Détail du calcul — ${data?.userName || "Collaborateur"}`}
        description={`${formatMonthLabel(month)}${data?.status ? ` · ${STATUS_LABELS[data.status]}` : " · non enregistré"}`}
        size="xl"
      >
        {isLoading && !data ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
            <p className="text-xs text-slate-500">Calcul en cours…</p>
          </div>
        ) : !data ? (
          <div className="space-y-3">
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
              {error}
            </div>
            <button type="button" onClick={fetchDetail} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200">
              Réessayer
            </button>
          </div>
        ) : (
          <div className={`space-y-5 transition-opacity ${isLoading ? "opacity-60" : ""}`}>
            {navBar}
            {error && (
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                {error}
              </div>
            )}

            {/* State banners: exactly one tells the manager what they can do. */}
            {!data.hasProfile ? (
              <Banner
                tone="rose"
                icon={<AlertTriangle className="h-4 w-4" />}
                action={
                  onOpenRules && (
                    <button type="button" onClick={onOpenRules} className="shrink-0 rounded-lg bg-white px-3 py-1.5 font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100">
                      Configurer les règles
                    </button>
                  )
                }
              >
                Les règles de paie de {data.userName} ne sont pas encore renseignées : les montants ci-dessous sont à 0.
              </Banner>
            ) : locked ? (
              <Banner tone="indigo" icon={<Lock className="h-4 w-4" />}>
                Dossier {data.status === HrMonthStatus.PAID ? "payé" : "validé"} : consultation uniquement.
                {data.savedTotalAmountCents !== undefined && data.savedTotalAmountCents !== data.totalAmountCents && (
                  <>
                    {" "}Montant verrouillé : <strong>{formatEuros(data.savedTotalAmountCents)}</strong> (l’activité a changé depuis).
                  </>
                )}
              </Banner>
            ) : !data.monthRecordId ? (
              <Banner
                tone="sky"
                icon={<Save className="h-4 w-4" />}
                action={
                  <button
                    type="button"
                    onClick={handleSaveCalculation}
                    disabled={isSaving}
                    className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isSaving ? "Enregistrement…" : "Enregistrer ce calcul"}
                  </button>
                }
              >
                Ce calcul n’est pas encore enregistré. Enregistrez-le pour pouvoir statuer sur les journées et le faire valider.
              </Banner>
            ) : data.pendingDecisionCount > 0 ? (
              <Banner tone="amber" icon={<AlertTriangle className="h-4 w-4" />}>
                <strong>{data.pendingDecisionCount} journée(s)</strong> sous l’objectif de {data.dailyQuota} appels attendent votre
                décision. Tant que rien n’est décidé, elles restent payées.
              </Banner>
            ) : data.savedTotalAmountCents !== undefined && data.savedTotalAmountCents !== data.totalAmountCents ? (
              <Banner
                tone="sky"
                icon={<RefreshCw className="h-4 w-4" />}
                action={
                  <button
                    type="button"
                    onClick={handleSaveCalculation}
                    disabled={isSaving}
                    className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isSaving ? "Mise à jour…" : "Mettre à jour"}
                  </button>
                }
              >
                De nouvelles activités sont arrivées : montant enregistré {formatEuros(data.savedTotalAmountCents)}, montant à
                jour {formatEuros(data.totalAmountCents)}.
              </Banner>
            ) : (
              <Banner tone="emerald" icon={<CheckCircle2 className="h-4 w-4" />}>
                Tout est à jour, aucune journée à traiter.
              </Banner>
            )}

            {/* Money breakdown */}
            <div data-hr-tour="detail-cards" className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <MoneyCard
                label="Salaire fixe"
                tip="Le salaire mensuel, réduit au prorata des absences et des journées non payées."
                value={formatEuros(data.proratedFixedCents)}
                hint={`Base : ${formatEuros(data.baseFixedSalaryCents)}`}
              />
              <MoneyCard
                label="Primes RDV"
                tip="Un montant fixe pour chaque rendez-vous pris dans le mois. Les rendez-vous annulés ne comptent pas."
                value={formatEuros(data.variableAmountCents)}
                valueClass="text-emerald-700"
                hint={`${data.totalRdv} RDV × ${formatEuros(data.variablePerRdvCents)}`}
              />
              <MoneyCard
                label="Ajustement"
                tip="Une prime ou une retenue ajoutée à la main depuis « Statut », avec sa justification."
                value={formatEuros(data.adjustmentCents)}
                valueClass="text-indigo-700"
                hint={data.adjustmentNote || "Aucun ajustement"}
              />
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3.5">
                <span className="mb-1 block text-[11px] font-medium text-indigo-700">Total à payer</span>
                <p className="text-xl font-black tabular-nums text-indigo-900">{formatEuros(data.totalAmountCents)}</p>
                <span className="mt-0.5 block text-[10px] text-indigo-600">{REMUNERATION_LABELS[data.remunerationMode]}</span>
              </div>
            </div>

            {/* Formulas */}
            <div data-hr-tour="detail-formulas" className="space-y-3 rounded-xl bg-slate-900 p-4 text-xs text-slate-100">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
                <Calculator className="h-4 w-4" />
                Le calcul, étape par étape
              </div>
              <dl className="space-y-1.5 font-mono">
                <FormulaLine label="Jours payés" value={data.formulas.workingDaysFormula} />
                <FormulaLine label="Fixe" value={data.formulas.fixedFormula} />
                <FormulaLine label="Primes" value={data.formulas.variableFormula} />
                <FormulaLine label="Total" value={data.formulas.totalFormula} highlight />
              </dl>
            </div>

            {/* Day by day */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Le mois jour par jour
                </h4>
                {data.daysUnderQuotaCount > 0 && (
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={filterDays}
                      onChange={(e) => setOnlyToHandle(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Seulement les jours sous l’objectif ({data.daysUnderQuotaCount})
                  </label>
                )}
              </div>
              <div data-hr-tour="detail-days" className="max-h-80 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 font-medium text-slate-600">
                    <tr>
                      <th scope="col" className="px-3 py-2.5">Date</th>
                      <th scope="col" className="px-3 py-2.5">Journée</th>
                      <th scope="col" className="px-3 py-2.5">Appels</th>
                      <th scope="col" className="px-3 py-2.5">RDV</th>
                      <th scope="col" className="px-3 py-2.5">Objectif</th>
                      <th scope="col" className="px-3 py-2.5 text-right">Décision</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleDays.map((d, i) => {
                      const firstDecidable = canDecide && d.isUnderQuota && visibleDays.findIndex((x) => x.isUnderQuota) === i;
                      return (
                        <tr key={d.date} className={d.isUnderQuota ? (d.decision ? "bg-slate-50/50" : "bg-amber-50/50") : ""}>
                          <td className="whitespace-nowrap px-3 py-2 font-medium capitalize text-slate-900">
                            {formatDayKey(d.date, { weekday: "short", day: "2-digit", month: "short" })}
                          </td>
                          <td className="px-3 py-2">
                            <DayType d={d} />
                          </td>
                          <td className="px-3 py-2 font-semibold tabular-nums text-slate-800">
                            {d.callCount}
                            {d.isWorkingDay && !d.isAbsence && data.dailyQuota > 0 && (
                              <span className="font-normal text-slate-400"> / {data.dailyQuota}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-semibold tabular-nums text-emerald-700">{d.rdvCount > 0 ? d.rdvCount : "—"}</td>
                          <td className="px-3 py-2">
                            <QuotaState d={d} hasQuota={data.dailyQuota > 0} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            {d.isUnderQuota ? (
                              <div className="flex items-center justify-end gap-2">
                                {d.decision ? (
                                  <span
                                    title={d.decisionReason}
                                    className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                                      d.decision === HrDayDecision.PAID ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                                    }`}
                                  >
                                    {d.decision === HrDayDecision.PAID ? "Payée" : "Non payée"}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-medium text-amber-700">À statuer</span>
                                )}
                                {canDecide && (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedDay(d)}
                                    {...(firstDecidable ? { "data-hr-tour": "detail-decide" } : {})}
                                    className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                                  >
                                    {d.decision ? "Modifier" : "Statuer"}
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <button type="button" onClick={guide.start} className="text-xs font-medium text-indigo-700 hover:underline">
                Comment lire ce calcul ?
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200"
              >
                Fermer
              </button>
            </div>
          </div>
        )}
        <HrGuide steps={HR_DETAIL_GUIDE} open={guide.open} onClose={guide.close} />
      </Modal>

      {selectedDay && data?.monthRecordId && (
        <HrDayDecisionModal
          isOpen
          onClose={() => setSelectedDay(null)}
          monthRecordId={data.monthRecordId}
          dateStr={selectedDay.date}
          callCount={selectedDay.callCount}
          dailyQuota={data.dailyQuota}
          currentDecision={selectedDay.decision}
          currentReason={selectedDay.decisionReason}
          onDecisionSaved={handleDecisionSaved}
        />
      )}
    </>
  );
}

function Banner({
  tone,
  icon,
  action,
  children,
}: {
  tone: "rose" | "amber" | "sky" | "indigo" | "emerald";
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const styles = {
    rose: "border-rose-200 bg-rose-50 text-rose-800",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    sky: "border-sky-200 bg-sky-50 text-sky-900",
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
  }[tone];
  return (
    <div className={`flex flex-col gap-2 rounded-xl border p-3 text-xs sm:flex-row sm:items-center sm:justify-between ${styles}`}>
      <div className="flex items-start gap-2">
        <span className="mt-px shrink-0">{icon}</span>
        <span>{children}</span>
      </div>
      {action}
    </div>
  );
}

function MoneyCard({
  label,
  tip,
  value,
  hint,
  valueClass = "text-slate-900",
}: {
  label: string;
  tip: string;
  value: string;
  hint: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
      <span className="mb-1 flex items-center gap-1 text-[11px] font-medium text-slate-500">
        {label}
        <HrHelpTip title={label}>
          <p>{tip}</p>
        </HrHelpTip>
      </span>
      <p className={`text-lg font-bold tabular-nums ${valueClass}`}>{value}</p>
      <span className="mt-0.5 block truncate text-[10px] text-slate-400" title={hint}>
        {hint}
      </span>
    </div>
  );
}

function FormulaLine({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex flex-col gap-0.5 border-b border-slate-800 py-1 last:border-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4 ${highlight ? "font-bold text-emerald-300" : ""}`}>
      <dt className={highlight ? "" : "text-slate-400"}>{label}</dt>
      <dd className={`sm:text-right ${highlight ? "" : "text-white"}`}>{value}</dd>
    </div>
  );
}

function DayType({ d }: { d: DayActivityDetail }) {
  if (d.isHoliday) {
    return <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">{d.holidayLabel || "Férié"}</span>;
  }
  if (!d.isWorkingDay) return <span className="text-[10px] text-slate-400">Week-end</span>;
  if (d.isAbsence) {
    return <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Absence{d.absenceType ? ` (${d.absenceType.toLowerCase()})` : ""}</span>;
  }
  return <span className="text-[10px] text-slate-700">Travaillée</span>;
}

function QuotaState({ d, hasQuota }: { d: DayActivityDetail; hasQuota: boolean }) {
  if (!d.isWorkingDay || d.isAbsence || !hasQuota) return <span className="text-[10px] text-slate-300">—</span>;
  if (d.isFuture) return <span className="text-[10px] text-slate-400">À venir</span>;
  if (d.isUnderQuota) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
        <AlertTriangle className="h-3 w-3" />
        Non atteint
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
      <CheckCircle2 className="h-3 w-3" />
      Atteint
    </span>
  );
}
