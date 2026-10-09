import { DateTime } from "luxon";
import { HrDayDecision, HrMonthStatus, RemunerationMode } from "@prisma/client";
import type { DayActivityDetail } from "./hr-types";

// Pure payroll rules — no DB access, so they can be unit-tested directly.

export const HR_TIMEZONE = "Europe/Paris";

export function parisDayKey(date: Date): string {
  return DateTime.fromJSDate(date, { zone: HR_TIMEZONE }).toISODate() as string;
}

// @db.Date columns come back from Prisma as UTC midnight.
export function dateColumnKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayParisKey(now: Date = new Date()): string {
  return parisDayKey(now);
}

export function currentParisMonth(now: Date = new Date()): string {
  return DateTime.fromJSDate(now, { zone: HR_TIMEZONE }).toFormat("yyyy-MM");
}

export class InvalidMonthError extends Error {}

export function getMonthBounds(monthStr: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthStr ?? "");
  const year = match ? Number(match[1]) : NaN;
  const month = match ? Number(match[2]) : NaN;
  if (!match || month < 1 || month > 12) {
    throw new InvalidMonthError(`Format de mois invalide : ${monthStr} (attendu : AAAA-MM)`);
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startLocal = DateTime.fromObject({ year, month, day: 1 }, { zone: HR_TIMEZONE });

  return {
    year,
    month,
    daysInMonth,
    // For @db.Date columns (holidays, absences, day decisions)
    dateStart: new Date(Date.UTC(year, month - 1, 1)),
    dateEnd: new Date(Date.UTC(year, month - 1, daysInMonth)),
    // For timestamp columns (actions): Paris-local month, end exclusive
    activityStart: startLocal.toJSDate(),
    activityEndExclusive: startLocal.plus({ months: 1 }).toJSDate(),
  };
}

export interface HrRulesProfile {
  remunerationMode: RemunerationMode;
  fixedSalaryCents: number;
  variablePerRdvCents: number;
  dailyQuota: number;
}

export interface MonthComputationInput {
  monthStr: string;
  profile: HrRulesProfile;
  holidays: Map<string, string>;
  absences: { start: string; end: string; type: string }[];
  callsByDay: Map<string, number>;
  alloCallsByDay?: Map<string, number>;
  crmCallsByDay?: Map<string, number>;
  rdvByDay: Map<string, number>;
  missionsByDay: Map<string, { missionId: string; missionName: string; calls: number; rdv: number }[]>;
  decisions: Map<string, { decision: HrDayDecision; reason: string; decidedAt?: string }>;
  adjustmentCents: number;
  todayKey: string;
}

export interface MonthComputation {
  calendarDaysInMonth: number;
  totalWorkingDaysInMonth: number;
  absenceDays: number;
  unpaidDaysUnderQuota: number;
  effectiveWorkingDays: number;
  totalCalls: number;
  totalRdv: number;
  proratedFixedCents: number;
  variableAmountCents: number;
  totalAmountCents: number;
  daysUnderQuotaCount: number;
  pendingDecisionCount: number;
  days: DayActivityDetail[];
  formulas: {
    workingDaysFormula: string;
    fixedFormula: string;
    variableFormula: string;
    totalFormula: string;
  };
}

export function computeMonth(input: MonthComputationInput): MonthComputation {
  const { year, month, daysInMonth } = getMonthBounds(input.monthStr);
  const { profile } = input;

  const days: DayActivityDetail[] = [];
  let totalWorkingDaysInMonth = 0;
  let absenceDays = 0;
  let unpaidDaysUnderQuota = 0;
  let daysUnderQuotaCount = 0;
  let pendingDecisionCount = 0;
  let totalCalls = 0;
  let totalRdv = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = dateObj.getUTCDay();
    const date = dateColumnKey(dateObj);

    const holidayLabel = input.holidays.get(date);
    const isHoliday = Boolean(holidayLabel);
    const isWorkingDay = dayOfWeek !== 0 && dayOfWeek !== 6 && !isHoliday;
    if (isWorkingDay) totalWorkingDaysInMonth++;

    const absence = input.absences.find((a) => date >= a.start && date <= a.end);
    const isAbsence = Boolean(absence);
    if (isWorkingDay && isAbsence) absenceDays++;

    // Today and later can't be judged yet: the day isn't over.
    const isFuture = date >= input.todayKey;

    const alloCallCount = input.alloCallsByDay?.get(date);
    const crmActionCount = input.crmCallsByDay?.get(date);
    const callCount =
      input.alloCallsByDay !== undefined
        ? (alloCallCount && alloCallCount > 0 ? alloCallCount : (crmActionCount ?? input.callsByDay.get(date) ?? 0))
        : (input.callsByDay.get(date) || 0);
    const rdvCount = input.rdvByDay.get(date) || 0;
    totalCalls += callCount;
    totalRdv += rdvCount;

    const isUnderQuota =
      isWorkingDay && !isAbsence && !isFuture && profile.dailyQuota > 0 && callCount < profile.dailyQuota;

    const decision = input.decisions.get(date);
    if (isUnderQuota) {
      daysUnderQuotaCount++;
      if (!decision) pendingDecisionCount++;
      if (decision?.decision === HrDayDecision.UNPAID) unpaidDaysUnderQuota++;
    }

    days.push({
      date,
      isWorkingDay,
      isHoliday,
      holidayLabel,
      isAbsence,
      absenceType: absence?.type,
      isFuture,
      callCount,
      alloCallCount,
      crmActionCount,
      rdvCount,
      missions: input.missionsByDay.get(date) ?? [],
      isUnderQuota,
      decision: decision?.decision,
      decisionReason: decision?.reason,
      decidedAt: decision?.decidedAt,
    });
  }

  const effectiveWorkingDays = Math.max(0, totalWorkingDaysInMonth - absenceDays - unpaidDaysUnderQuota);

  const hasFixed =
    profile.remunerationMode === RemunerationMode.FIXE ||
    profile.remunerationMode === RemunerationMode.FIXE_PLUS_VARIABLE;
  const hasVariable =
    profile.remunerationMode === RemunerationMode.VARIABLE ||
    profile.remunerationMode === RemunerationMode.FIXE_PLUS_VARIABLE;

  const proratedFixedCents = !hasFixed
    ? 0
    : totalWorkingDaysInMonth > 0
    ? Math.round((profile.fixedSalaryCents * effectiveWorkingDays) / totalWorkingDaysInMonth)
    : profile.fixedSalaryCents;

  const variableAmountCents = hasVariable ? totalRdv * profile.variablePerRdvCents : 0;
  const totalAmountCents = proratedFixedCents + variableAmountCents + input.adjustmentCents;

  const workingDaysFormula = `${totalWorkingDaysInMonth} j ouvrés − ${absenceDays} j d'absence${
    unpaidDaysUnderQuota > 0 ? ` − ${unpaidDaysUnderQuota} j non payé(s)` : ""
  } = ${effectiveWorkingDays} j payés`;

  const fixedFormula = !hasFixed
    ? "Non applicable (variable uniquement)"
    : totalWorkingDaysInMonth > 0
    ? `${formatEuros(profile.fixedSalaryCents)} × ${effectiveWorkingDays} / ${totalWorkingDaysInMonth} j = ${formatEuros(proratedFixedCents)}`
    : formatEuros(profile.fixedSalaryCents);

  const variableFormula = !hasVariable
    ? "Non applicable (fixe uniquement)"
    : `${totalRdv} RDV × ${formatEuros(profile.variablePerRdvCents)} = ${formatEuros(variableAmountCents)}`;

  const adj = input.adjustmentCents;
  const totalFormula = `${formatEuros(proratedFixedCents)} (fixe) + ${formatEuros(variableAmountCents)} (variable)${
    adj !== 0 ? ` ${adj > 0 ? "+" : "−"} ${formatEuros(Math.abs(adj))} (ajustement)` : ""
  } = ${formatEuros(totalAmountCents)}`;

  return {
    calendarDaysInMonth: daysInMonth,
    totalWorkingDaysInMonth,
    absenceDays,
    unpaidDaysUnderQuota,
    effectiveWorkingDays,
    totalCalls,
    totalRdv,
    proratedFixedCents,
    variableAmountCents,
    totalAmountCents,
    daysUnderQuotaCount,
    pendingDecisionCount,
    days,
    formulas: { workingDaysFormula, fixedFormula, variableFormula, totalFormula },
  };
}

// ============================================
// Status workflow
// ============================================

const STATUS_ORDER: HrMonthStatus[] = [
  HrMonthStatus.DRAFT,
  HrMonthStatus.TO_VERIFY,
  HrMonthStatus.VALIDATED,
  HrMonthStatus.PAID,
];

export function isLockedStatus(status: HrMonthStatus | null | undefined): boolean {
  return status === HrMonthStatus.VALIDATED || status === HrMonthStatus.PAID;
}

export interface StatusTransition {
  allowed: boolean;
  reason?: string;
  permissions: string[];
}

export function resolveStatusTransition(current: HrMonthStatus, next: HrMonthStatus): StatusTransition {
  const from = STATUS_ORDER.indexOf(current);
  const to = STATUS_ORDER.indexOf(next);

  if (next === HrMonthStatus.PAID && current !== HrMonthStatus.PAID && current !== HrMonthStatus.VALIDATED) {
    return {
      allowed: false,
      reason: "Un dossier doit d'abord être validé avant d'être marqué comme payé.",
      permissions: [],
    };
  }

  const permissions = [next === HrMonthStatus.VALIDATED ? "features.hr_validate" : "features.hr_configure"];
  if (to < from && isLockedStatus(current)) {
    permissions.push("features.hr_reopen");
  }

  return { allowed: true, permissions };
}

export interface BulkCandidate {
  userName: string;
  id?: string;
  status: HrMonthStatus;
  pendingDecisionCount: number;
  isStale: boolean;
  hasProfile: boolean;
}

/** Splits a selection into records that can move to `next` and those that can't (with why). */
export function planBulkTransition<T extends BulkCandidate>(rows: T[], next: HrMonthStatus) {
  const eligible: T[] = [];
  const skipped: { row: T; reason: string }[] = [];

  for (const row of rows) {
    if (!row.id) {
      skipped.push({ row, reason: "pas encore enregistré" });
    } else if (row.status === next) {
      skipped.push({ row, reason: `déjà « ${STATUS_LABELS[next]} »` });
    } else if (isLockedStatus(row.status) && STATUS_ORDER.indexOf(next) < STATUS_ORDER.indexOf(row.status)) {
      skipped.push({ row, reason: "dossier verrouillé : à rouvrir un par un" });
    } else {
      const t = resolveStatusTransition(row.status, next);
      if (!t.allowed) {
        skipped.push({ row, reason: "doit d’abord être validé" });
      } else if (next === HrMonthStatus.VALIDATED && row.pendingDecisionCount > 0) {
        skipped.push({ row, reason: `${row.pendingDecisionCount} j à statuer` });
      } else if (next === HrMonthStatus.VALIDATED && row.isStale) {
        skipped.push({ row, reason: "à recalculer" });
      } else {
        eligible.push(row);
      }
    }
  }

  return { eligible, skipped };
}

// ============================================
// Display helpers (shared by server formulas and UI)
// ============================================

const eurosFormatter = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

export function formatEuros(cents: number): string {
  return eurosFormatter.format((cents || 0) / 100);
}

export function formatMonthLabel(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDayKey(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("fr-FR", { ...options, timeZone: "UTC" });
}

export function shiftMonth(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const REMUNERATION_LABELS: Record<RemunerationMode, string> = {
  FIXE: "Fixe uniquement",
  VARIABLE: "Variable uniquement",
  FIXE_PLUS_VARIABLE: "Fixe + variable",
};

export const STATUS_LABELS: Record<HrMonthStatus, string> = {
  DRAFT: "Brouillon",
  TO_VERIFY: "À vérifier",
  VALIDATED: "Validé",
  PAID: "Payé",
};
