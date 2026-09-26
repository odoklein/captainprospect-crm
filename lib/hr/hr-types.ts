import { ContractType, RemunerationMode, HrMonthStatus, HrDayDecision } from "@prisma/client";

export { ContractType, RemunerationMode, HrMonthStatus, HrDayDecision };

export interface HrProfileData {
  id?: string;
  userId: string;
  contractType: ContractType;
  remunerationMode: RemunerationMode;
  fixedSalaryCents: number;       // e.g. 250000 = 2,500.00 €
  variablePerRdvCents: number;    // e.g. 5000 = 50.00 €
  dailyQuota: number;             // e.g. 80 calls/day
  effectiveFrom: string;          // ISO date "YYYY-MM-DD"
  managerId?: string | null;
}

export interface DayActivityDetail {
  date: string; // YYYY-MM-DD
  isWorkingDay: boolean; // Mon-Fri not holiday
  isHoliday: boolean;
  holidayLabel?: string;
  isAbsence: boolean;
  absenceType?: string;
  callCount: number;
  rdvCount: number;
  isUnderQuota: boolean; // callCount < dailyQuota or callCount === 0 on a working day
  decision?: HrDayDecision;
  decisionReason?: string;
  decidedAt?: string;
}

export interface CalculationBreakdown {
  month: string;
  userId: string;
  userName: string;
  userRole: string;
  contractType: ContractType;
  remunerationMode: RemunerationMode;

  // Working days breakdown
  calendarDaysInMonth: number;
  totalWorkingDaysInMonth: number; // base working days (Mon-Fri minus bank holidays)
  absenceDays: number;
  effectiveWorkingDays: number;    // totalWorkingDaysInMonth - absenceDays - unpaidDays
  unpaidDaysUnderQuota: number;

  // Activity breakdown
  totalCalls: number;
  totalRdv: number;
  dailyQuota: number;

  // Financial calculation (all in cents)
  baseFixedSalaryCents: number;
  proratedFixedCents: number;
  variablePerRdvCents: number;
  variableAmountCents: number;
  adjustmentCents: number;
  adjustmentNote?: string;
  totalAmountCents: number;

  // Transparent explanation formulas
  formulas: {
    workingDaysFormula: string;
    fixedFormula: string;
    variableFormula: string;
    totalFormula: string;
  };

  // Day by day details
  days: DayActivityDetail[];
  daysUnderQuotaCount: number;
}

export interface HrMonthRowData {
  id?: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  managerId?: string | null;
  managerName?: string | null;
  contractType: ContractType;
  remunerationMode: RemunerationMode;
  status: HrMonthStatus;

  // Metrics
  workingDays: number;
  totalWorkingDays: number;
  absenceDays: number;
  totalCalls: number;
  totalRdv: number;
  dailyQuota: number;

  // Amounts in cents & formatted
  fixedAmountCents: number;
  variableAmountCents: number;
  adjustmentCents: number;
  totalAmountCents: number;

  // Flags
  hasUnderQuotaPendingDecision: boolean;
  underQuotaDaysCount: number;
  validatedAt?: string | null;
  paidAt?: string | null;
}
