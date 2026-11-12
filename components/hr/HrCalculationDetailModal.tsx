"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Calculator, CheckCircle2, ChevronLeft, ChevronRight, CircleHelp, Lock, RefreshCw, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { FOCUS_RING } from "@/components/ui/recipes";
import { CalculationBreakdown, DayActivityDetail, HrDayDecision, HrMonthStatus } from "@/lib/hr/hr-types";
import { REMUNERATION_LABELS, STATUS_LABELS, formatDayKey, formatEuros, formatMonthLabel, isLockedStatus } from "@/lib/hr/hr-rules";
import { Metric, MetricPlaceholder, MetricStrip, Panel, PanelMessage, SkeletonRows, TextButton } from "./HubUI";
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

const CHIP = "inline-flex h-5 items-center whitespace-nowrap rounded-md border px-1.5 text-[11px] font-medium";

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

  const navButton = "inline-flex h-8 min-w-0 items-center gap-1 rounded-lg px-2 font-medium text-ink-2 transition-colors hover:bg-surface hover:text-ink disabled:pointer-events-none disabled:opacity-35";
  const navBar = navigation && onNavigate && navigation.total > 1 && (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 p-1 text-[13px]">
      <button
        type="button"
        onClick={() => navigation.prev && onNavigate(navigation.prev.id)}
        disabled={!navigation.prev || isLoading}
        className={cn(navButton, FOCUS_RING)}
      >
        <ChevronLeft className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{navigation.prev?.name ?? "Précédent"}</span>
      </button>
      <span className="shrink-0 text-xs tabular-nums text-ink-3">
        {navigation.position} / {navigation.total}
      </span>
      <button
        type="button"
        onClick={() => navigation.next && onNavigate(navigation.next.id)}
        disabled={!navigation.next || isLoading}
        className={cn(navButton, FOCUS_RING)}
      >
        <span className="truncate">{navigation.next?.name ?? "Suivant"}</span>
        <ChevronRight className="size-4 shrink-0" aria-hidden />
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
          <div className="space-y-5" aria-busy="true" aria-label="Calcul en cours">
            <MetricStrip>
              {["Salaire fixe", "Primes RDV", "Ajustement", "Total à payer"].map((label) => (
                <Metric key={label} label={label} value={<MetricPlaceholder />} />
              ))}
            </MetricStrip>
            <Panel className="rounded-xl">
              <SkeletonRows rows={5} columns={[14, 24, 8, 8, 6, 12]} pitch="py-3" />
            </Panel>
          </div>
        ) : !data ? (
          <Panel className="rounded-xl">
            <PanelMessage tone="error" action={<TextButton onClick={fetchDetail}>Réessayer</TextButton>}>
              {error}
            </PanelMessage>
          </Panel>
        ) : (
          <div className={cn("space-y-5 transition-opacity duration-150", isLoading && "opacity-60")}>
            {navBar}
            {error && (
              <div role="alert" className="rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-[13px] text-danger-ink">
                {error}
              </div>
            )}

            {/* State banners: exactly one tells the manager what they can do. */}
            {!data.hasProfile ? (
              <Callout
                tone="danger"
                action={
                  onOpenRules && (
                    <Button variant="secondary" size="xs" onClick={onOpenRules}>
                      Configurer les règles
                    </Button>
                  )
                }
              >
                Les règles de paie de {data.userName} ne sont pas encore renseignées : les montants ci-dessous sont à 0.
              </Callout>
            ) : locked ? (
              <Callout tone="primary" icon={Lock}>
                Dossier {data.status === HrMonthStatus.PAID ? "payé" : "validé"} : consultation uniquement.
                {data.savedTotalAmountCents !== undefined && data.savedTotalAmountCents !== data.totalAmountCents && (
                  <>
                    {" "}Montant verrouillé : <strong className="tabular-nums">{formatEuros(data.savedTotalAmountCents)}</strong> (l’activité a changé depuis).
                  </>
                )}
              </Callout>
            ) : !data.monthRecordId ? (
              <Callout
                tone="info"
                icon={Save}
                action={
                  <Button size="xs" onClick={handleSaveCalculation} isLoading={isSaving}>
                    {isSaving ? "Enregistrement…" : "Enregistrer ce calcul"}
                  </Button>
                }
              >
                Ce calcul n’est pas encore enregistré. Enregistrez-le pour pouvoir statuer sur les journées et le faire valider.
              </Callout>
            ) : data.pendingDecisionCount > 0 ? (
              <Callout tone="warning">
                <strong>{data.pendingDecisionCount} journée(s)</strong> sous l’objectif de {data.dailyQuota} appels attendent votre
                décision. Tant que rien n’est décidé, elles restent payées.
              </Callout>
            ) : data.savedTotalAmountCents !== undefined && data.savedTotalAmountCents !== data.totalAmountCents ? (
              <Callout
                tone="info"
                icon={RefreshCw}
                action={
                  <Button size="xs" onClick={handleSaveCalculation} isLoading={isSaving}>
                    {isSaving ? "Mise à jour…" : "Mettre à jour"}
                  </Button>
                }
              >
                De nouvelles activités sont arrivées : montant enregistré <span className="tabular-nums">{formatEuros(data.savedTotalAmountCents)}</span>,
                montant à jour <span className="tabular-nums">{formatEuros(data.totalAmountCents)}</span>.
              </Callout>
            ) : (
              <Callout tone="success" icon={CheckCircle2}>
                Tout est à jour, aucune journée à traiter.
              </Callout>
            )}

            {/* Money breakdown */}
            <MetricStrip data-hr-tour="detail-cards">
              <Metric
                label={<MoneyLabel label="Salaire fixe" tip="Le salaire mensuel, réduit au prorata des absences et des journées non payées." />}
                value={formatEuros(data.proratedFixedCents)}
                hint={`Base : ${formatEuros(data.baseFixedSalaryCents)}`}
              />
              <Metric
                label={<MoneyLabel label="Primes RDV" tip="Un montant fixe pour chaque rendez-vous pris dans le mois. Les rendez-vous annulés ne comptent pas." />}
                value={formatEuros(data.variableAmountCents)}
                hint={`${data.totalRdv} RDV × ${formatEuros(data.variablePerRdvCents)}`}
              />
              <Metric
                label={<MoneyLabel label="Ajustement" tip="Une prime ou une retenue ajoutée à la main depuis « Statut », avec sa justification." />}
                value={formatEuros(data.adjustmentCents)}
                hint={<span title={data.adjustmentNote || undefined}>{data.adjustmentNote || "Aucun ajustement"}</span>}
              />
              <Metric lead label="Total à payer" value={formatEuros(data.totalAmountCents)} hint={REMUNERATION_LABELS[data.remunerationMode]} />
            </MetricStrip>

            {/* Formulas */}
            <div data-hr-tour="detail-formulas" className="overflow-hidden rounded-xl border border-line">
              <p className="flex items-center gap-2 border-b border-line-subtle bg-surface-2 px-4 py-2.5 text-[13px] font-semibold text-ink">
                <Calculator className="size-4 text-ink-3" aria-hidden />
                Le calcul, étape par étape
              </p>
              <dl className="divide-y divide-line-subtle px-4">
                <FormulaLine label="Jours payés" value={data.formulas.workingDaysFormula} />
                <FormulaLine label="Fixe" value={data.formulas.fixedFormula} />
                <FormulaLine label="Primes" value={data.formulas.variableFormula} />
                <FormulaLine label="Total" value={data.formulas.totalFormula} highlight />
              </dl>
            </div>

            {/* Day by day */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[13px] font-semibold text-ink">Le mois jour par jour</h3>
                {data.daysUnderQuotaCount > 0 && (
                  <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
                    <input
                      type="checkbox"
                      checked={filterDays}
                      onChange={(e) => setOnlyToHandle(e.target.checked)}
                      className="size-4 rounded border-line-strong text-primary-600 focus:ring-primary-500"
                    />
                    Seulement les jours sous l’objectif
                    <span className="tabular-nums text-ink-3">{data.daysUnderQuotaCount}</span>
                  </label>
                )}
              </div>
              <div data-hr-tour="detail-days" className="max-h-80 overflow-auto rounded-xl border border-line">
                <table className="w-full min-w-[680px] border-collapse text-left text-[13px]">
                  <thead className="sticky top-0 z-[1] border-b border-line bg-surface-2 text-xs text-ink-3">
                    <tr>
                      <th scope="col" className="py-2.5 pl-4 pr-3 font-medium">Date</th>
                      <th scope="col" className="px-3 py-2.5 font-medium">Mission(s)</th>
                      <th
                        scope="col"
                        className="px-3 py-2.5 text-right font-medium"
                        title="Appels passés sur la ligne Allo. Si Allo n’en compte aucun ce jour-là, ce sont les actions CRM qui comptent."
                      >
                        Appels
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium" title="Appels enregistrés dans le CRM avec un résultat">
                        Actions CRM
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium">RDV</th>
                      <th scope="col" className="px-3 py-2.5 font-medium">Objectif</th>
                      <th scope="col" className="py-2.5 pl-3 pr-4 text-right font-medium">Décision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDays.map((d, i) => {
                      const firstDecidable = canDecide && d.isUnderQuota && visibleDays.findIndex((x) => x.isUnderQuota) === i;
                      return (
                        <tr
                          key={d.date}
                          className={cn(
                            "border-b border-line-subtle last:border-b-0",
                            d.isUnderQuota && (d.decision ? "bg-surface-2/60" : "bg-warning-soft/60")
                          )}
                        >
                          <td className="whitespace-nowrap py-2.5 pl-4 pr-3 font-medium capitalize text-ink">
                            {formatDayKey(d.date, { weekday: "short", day: "2-digit", month: "short" })}
                          </td>
                          <td className="px-3 py-2.5">
                            <DayType d={d} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                            {!d.alloCallCount && d.callCount > 0 && (
                              <span title="Aucun appel Allo ce jour-là : le compte reprend les actions CRM" className={cn(CHIP, "mr-1.5 border-line bg-surface-2 text-ink-3")}>
                                CRM
                              </span>
                            )}
                            <span className="font-semibold text-ink">{d.callCount}</span>
                            {d.isWorkingDay && !d.isAbsence && data.dailyQuota > 0 && <span className="text-ink-4"> / {data.dailyQuota}</span>}
                          </td>
                          <td className={cn("px-3 py-2.5 text-right tabular-nums", d.crmActionCount ? "text-ink-2" : "text-ink-4")}>
                            {d.crmActionCount ? d.crmActionCount : "—"}
                          </td>
                          <td className={cn("px-3 py-2.5 text-right tabular-nums", d.rdvCount > 0 ? "font-semibold text-success-ink" : "text-ink-4")}>
                            {d.rdvCount > 0 ? d.rdvCount : "—"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            <QuotaState d={d} hasQuota={data.dailyQuota > 0} />
                          </td>
                          <td className="py-2 pl-3 pr-4 text-right">
                            {d.isUnderQuota ? (
                              <div className="flex items-center justify-end gap-1.5">
                                {d.decision ? (
                                  <span
                                    title={d.decisionReason}
                                    className={cn(
                                      CHIP,
                                      "rounded-full px-2",
                                      d.decision === HrDayDecision.PAID
                                        ? "border-success-line bg-success-soft text-success-ink"
                                        : "border-danger-line bg-danger-soft text-danger-ink"
                                    )}
                                  >
                                    {d.decision === HrDayDecision.PAID ? "Payée" : "Non payée"}
                                  </span>
                                ) : (
                                  <span className="whitespace-nowrap text-xs font-medium text-warning-ink">À statuer</span>
                                )}
                                {canDecide && (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedDay(d)}
                                    {...(firstDecidable ? { "data-hr-tour": "detail-decide" } : {})}
                                    className={cn(
                                      "h-7 rounded-lg px-2 text-[13px] font-medium text-primary-700 transition-colors hover:bg-primary-50",
                                      FOCUS_RING
                                    )}
                                  >
                                    {d.decision ? "Modifier" : "Statuer"}
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-ink-4">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-line-subtle pt-4">
              <TextButton onClick={guide.start} className="-ml-1.5">
                <CircleHelp className="size-4" aria-hidden />
                Comment lire ce calcul ?
              </TextButton>
              <Button variant="secondary" size="sm" onClick={onClose}>
                Fermer
              </Button>
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

function MoneyLabel({ label, tip }: { label: string; tip: string }) {
  return (
    <>
      {label}
      <HrHelpTip title={label}>
        <p>{tip}</p>
      </HrHelpTip>
    </>
  );
}

function FormulaLine({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <dt className={cn("shrink-0 text-xs", highlight ? "font-semibold text-ink" : "text-ink-3")}>{label}</dt>
      <dd className={cn("font-mono text-xs tabular-nums sm:text-right", highlight ? "font-semibold text-ink" : "text-ink-2")}>{value}</dd>
    </div>
  );
}

function DayType({ d }: { d: DayActivityDetail }) {
  if (d.isHoliday) {
    return <span className={cn(CHIP, "border-line bg-surface-3 text-ink-2")}>{d.holidayLabel || "Férié"}</span>;
  }
  if (!d.isWorkingDay) return <span className="text-xs text-ink-4">Week-end</span>;
  if (d.isAbsence) {
    return (
      <span className={cn(CHIP, "border-warning-line bg-warning-soft text-warning-ink")}>
        Absence{d.absenceType ? ` (${d.absenceType.toLowerCase()})` : ""}
      </span>
    );
  }
  if (d.missions.length > 0) {
    return (
      <span className="flex flex-wrap gap-1">
        {d.missions.map((m) => (
          <span key={m.missionId} className={cn(CHIP, "border-line bg-surface-2 text-ink-2")}>
            {m.missionName}
          </span>
        ))}
      </span>
    );
  }
  return <span className="text-xs text-ink-2">Travaillée</span>;
}

function QuotaState({ d, hasQuota }: { d: DayActivityDetail; hasQuota: boolean }) {
  if (!d.isWorkingDay || d.isAbsence || !hasQuota) return <span className="text-ink-4">—</span>;
  if (d.isFuture) return <span className="text-xs text-ink-3">À venir</span>;
  if (d.isUnderQuota) return <span className="text-xs font-medium text-warning-ink">Non atteint</span>;
  return <span className="text-xs font-medium text-success-ink">Atteint</span>;
}
