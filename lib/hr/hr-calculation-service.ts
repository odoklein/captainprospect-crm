import { prisma } from "@/lib/prisma";
import {
  CalculationBreakdown,
  DayActivityDetail,
  HrMonthRowData,
  HrMonthStatus,
  RemunerationMode,
  ContractType,
  HrDayDecision,
} from "./hr-types";
import { hrProfileService } from "./hr-profile-service";

export class HrCalculationService {
  /**
   * Helper to parse "YYYY-MM" into start and end Dates
   */
  private getMonthRange(monthStr: string) {
    const [yearStr, monthNumStr] = monthStr.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthNumStr, 10); // 1-12

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      throw new Error(`Format de mois invalide: ${monthStr} (attendu: YYYY-MM)`);
    }

    const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    // Last day of month
    const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    const daysInMonth = new Date(year, month, 0).getDate();

    return { year, month, startOfMonth, endOfMonth, daysInMonth };
  }

  /**
   * Calculate detailed activity and salary metrics for a user and month.
   */
  async calculateUserMonth(
    userId: string,
    monthStr: string,
    persist: boolean = true,
    actorId?: string,
    options?: { forceReopen?: boolean }
  ): Promise<CalculationBreakdown> {
    const { year, month, startOfMonth, endOfMonth, daysInMonth } = this.getMonthRange(monthStr);

    // 1. Get User and HR Profile
    const { user, profile } = await hrProfileService.getProfile(userId);

    // 2. Check existing record
    const existingRecord = await prisma.hrMonthRecord.findUnique({
      where: {
        userId_month: {
          userId,
          month: monthStr,
        },
      },
      include: {
        dayDecisions: true,
      },
    });

    if (existingRecord) {
      if (
        (existingRecord.status === HrMonthStatus.VALIDATED || existingRecord.status === HrMonthStatus.PAID) &&
        !options?.forceReopen
      ) {
        throw new Error(
          `Ce mois est déjà ${existingRecord.status === HrMonthStatus.VALIDATED ? "validé" : "payé"}. Une permission de réouverture est nécessaire pour le recalculer.`
        );
      }
    }

    // 3. Holidays in month
    const holidays = await prisma.planningHoliday.findMany({
      where: {
        date: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });
    const holidayMap = new Map<string, string>();
    holidays.forEach((h) => {
      const dateStr = h.date.toISOString().split("T")[0];
      holidayMap.set(dateStr, h.label || "Jour férié");
    });

    // 4. Absences in month
    const absences = await prisma.sdrAbsence.findMany({
      where: {
        sdrId: userId,
        impactsPlanning: true,
        OR: [
          {
            startDate: { lte: endOfMonth },
            endDate: { gte: startOfMonth },
          },
        ],
      },
    });

    // 5. Calls in month
    const callActions = await prisma.action.findMany({
      where: {
        sdrId: userId,
        channel: "CALL",
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      select: {
        createdAt: true,
      },
    });

    // Group calls by date YYYY-MM-DD
    const callsByDay = new Map<string, number>();
    callActions.forEach((a) => {
      const dateStr = a.createdAt.toISOString().split("T")[0];
      callsByDay.set(dateStr, (callsByDay.get(dateStr) || 0) + 1);
    });

    // 6. Valid RDVs in month
    const rdvActions = await prisma.action.findMany({
      where: {
        sdrId: userId,
        result: "MEETING_BOOKED",
        confirmationStatus: {
          not: "CANCELLED",
        },
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      select: {
        id: true,
        createdAt: true,
        confirmationStatus: true,
      },
    });

    // Group RDVs by date YYYY-MM-DD
    const rdvByDay = new Map<string, number>();
    rdvActions.forEach((a) => {
      const dateStr = a.createdAt.toISOString().split("T")[0];
      rdvByDay.set(dateStr, (rdvByDay.get(dateStr) || 0) + 1);
    });

    // Existing decisions map
    const decisionsMap = new Map<string, { decision: HrDayDecision; reason: string; decidedAt: Date }>();
    if (existingRecord?.dayDecisions) {
      existingRecord.dayDecisions.forEach((d) => {
        const dateStr = d.date.toISOString().split("T")[0];
        decisionsMap.set(dateStr, {
          decision: d.decision,
          reason: d.reason,
          decidedAt: d.decidedAt,
        });
      });
    }

    // 7. Day by day analysis
    const days: DayActivityDetail[] = [];
    let totalWorkingDaysInMonth = 0;
    let absenceDays = 0;
    let unpaidDaysUnderQuota = 0;
    let daysUnderQuotaCount = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(Date.UTC(year, month - 1, day));
      const dayOfWeek = dateObj.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
      const dateStr = dateObj.toISOString().split("T")[0];

      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const holidayLabel = holidayMap.get(dateStr);
      const isHoliday = Boolean(holidayLabel);

      // Mon-Fri and not a holiday is a standard working day
      const isWorkingDay = !isWeekend && !isHoliday;
      if (isWorkingDay) {
        totalWorkingDaysInMonth++;
      }

      // Check absence on this day
      let isAbsence = false;
      let absenceType: string | undefined;
      for (const abs of absences) {
        const start = abs.startDate.toISOString().split("T")[0];
        const end = abs.endDate.toISOString().split("T")[0];
        if (dateStr >= start && dateStr <= end) {
          isAbsence = true;
          absenceType = abs.type;
          break;
        }
      }

      if (isWorkingDay && isAbsence) {
        absenceDays++;
      }

      const callCount = callsByDay.get(dateStr) || 0;
      const rdvCount = rdvByDay.get(dateStr) || 0;

      // Under-quota logic: on a working day without absence, did user meet quota?
      const isUnderQuota =
        isWorkingDay &&
        !isAbsence &&
        profile.dailyQuota > 0 &&
        (callCount < profile.dailyQuota || callCount === 0);

      if (isUnderQuota) {
        daysUnderQuotaCount++;
      }

      const existingDecision = decisionsMap.get(dateStr);
      if (isUnderQuota && existingDecision?.decision === HrDayDecision.UNPAID) {
        unpaidDaysUnderQuota++;
      }

      days.push({
        date: dateStr,
        isWorkingDay,
        isHoliday,
        holidayLabel,
        isAbsence,
        absenceType,
        callCount,
        rdvCount,
        isUnderQuota,
        decision: existingDecision?.decision,
        decisionReason: existingDecision?.reason,
        decidedAt: existingDecision?.decidedAt ? existingDecision.decidedAt.toISOString() : undefined,
      });
    }

    // 8. Effective Working Days
    const effectiveWorkingDays = Math.max(
      0,
      totalWorkingDaysInMonth - absenceDays - unpaidDaysUnderQuota
    );

    // 9. Financial calculation (all in integer cents)
    const baseFixedSalaryCents = profile.fixedSalaryCents;
    const variablePerRdvCents = profile.variablePerRdvCents;
    const totalCalls = callActions.length;
    const totalRdv = rdvActions.length;

    let proratedFixedCents = 0;
    if (
      profile.remunerationMode === RemunerationMode.FIXE ||
      profile.remunerationMode === RemunerationMode.FIXE_PLUS_VARIABLE
    ) {
      if (totalWorkingDaysInMonth > 0) {
        proratedFixedCents = Math.round(
          (baseFixedSalaryCents * effectiveWorkingDays) / totalWorkingDaysInMonth
        );
      } else {
        proratedFixedCents = baseFixedSalaryCents;
      }
    }

    let variableAmountCents = 0;
    if (
      profile.remunerationMode === RemunerationMode.VARIABLE ||
      profile.remunerationMode === RemunerationMode.FIXE_PLUS_VARIABLE
    ) {
      variableAmountCents = totalRdv * variablePerRdvCents;
    }

    const adjustmentCents = existingRecord?.adjustmentCents || 0;
    const adjustmentNote = existingRecord?.adjustmentNote || undefined;
    const totalAmountCents = proratedFixedCents + variableAmountCents + adjustmentCents;

    // 10. Transparent calculation formulas in French
    const workingDaysFormula = `${totalWorkingDaysInMonth} j ouvrés - ${absenceDays} j absence${
      unpaidDaysUnderQuota > 0 ? ` - ${unpaidDaysUnderQuota} j sous-quota non payé` : ""
    } = ${effectiveWorkingDays} j effectifs`;

    const fixedFormula =
      profile.remunerationMode === RemunerationMode.VARIABLE
        ? "Non applicable (Mode Variable pur)"
        : totalWorkingDaysInMonth > 0
        ? `(${ (baseFixedSalaryCents / 100).toFixed(2) } € × ${effectiveWorkingDays} j) / ${totalWorkingDaysInMonth} j = ${ (proratedFixedCents / 100).toFixed(2) } €`
        : `${ (baseFixedSalaryCents / 100).toFixed(2) } €`;

    const variableFormula =
      profile.remunerationMode === RemunerationMode.FIXE
        ? "Non applicable (Mode Fixe pur)"
        : `${totalRdv} RDV × ${ (variablePerRdvCents / 100).toFixed(2) } € = ${ (variableAmountCents / 100).toFixed(2) } €`;

    const totalFormula = `${ (proratedFixedCents / 100).toFixed(2) } € (fixe) + ${ (variableAmountCents / 100).toFixed(2) } € (variable)${
      adjustmentCents !== 0
        ? ` ${adjustmentCents > 0 ? "+" : "-"} ${Math.abs(adjustmentCents / 100).toFixed(2)} € (ajustement)`
        : ""
    } = ${ (totalAmountCents / 100).toFixed(2) } €`;

    const breakdown: CalculationBreakdown = {
      month: monthStr,
      userId,
      userName: user.name,
      userRole: user.role,
      contractType: profile.contractType,
      remunerationMode: profile.remunerationMode,
      calendarDaysInMonth: daysInMonth,
      totalWorkingDaysInMonth,
      absenceDays,
      effectiveWorkingDays,
      unpaidDaysUnderQuota,
      totalCalls,
      totalRdv,
      dailyQuota: profile.dailyQuota,
      baseFixedSalaryCents,
      proratedFixedCents,
      variablePerRdvCents,
      variableAmountCents,
      adjustmentCents,
      adjustmentNote,
      totalAmountCents,
      formulas: {
        workingDaysFormula,
        fixedFormula,
        variableFormula,
        totalFormula,
      },
      days,
      daysUnderQuotaCount,
    };

    // 11. Persist to HrMonthRecord if requested
    if (persist && profile.id) {
      const rulesSnapshot = {
        contractType: profile.contractType,
        remunerationMode: profile.remunerationMode,
        fixedSalaryCents: profile.fixedSalaryCents,
        variablePerRdvCents: profile.variablePerRdvCents,
        dailyQuota: profile.dailyQuota,
        totalWorkingDaysInMonth,
      };

      await prisma.hrMonthRecord.upsert({
        where: {
          userId_month: {
            userId,
            month: monthStr,
          },
        },
        create: {
          hrProfileId: profile.id,
          userId,
          month: monthStr,
          workingDays: effectiveWorkingDays,
          absenceDays,
          totalCalls,
          totalRdv,
          dailyQuota: profile.dailyQuota,
          fixedAmountCents: proratedFixedCents,
          variableAmountCents,
          adjustmentCents,
          totalAmountCents,
          rulesSnapshot,
          status: HrMonthStatus.DRAFT,
          adjustmentNote,
        },
        update: {
          workingDays: effectiveWorkingDays,
          absenceDays,
          totalCalls,
          totalRdv,
          dailyQuota: profile.dailyQuota,
          fixedAmountCents: proratedFixedCents,
          variableAmountCents,
          totalAmountCents,
          rulesSnapshot,
          status:
            existingRecord?.status === HrMonthStatus.DRAFT || !existingRecord?.status
              ? HrMonthStatus.DRAFT
              : existingRecord.status,
        },
      });

      if (actorId) {
        await prisma.hrAuditLog.create({
          data: {
            userId,
            actorId,
            action: existingRecord ? "MONTH_RECALCULATED" : "MONTH_CALCULATED",
            details: {
              month: monthStr,
              totalAmountCents,
              effectiveWorkingDays,
              totalCalls,
              totalRdv,
            },
          },
        });
      }
    }

    return breakdown;
  }

  /**
   * Get table rows for all eligible team members for a given month.
   */
  async getMonthOverview(monthStr: string): Promise<HrMonthRowData[]> {
    this.getMonthRange(monthStr); // validate format

    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        role: {
          notIn: ["CLIENT", "COMMERCIAL"],
        },
      },
      include: {
        manager: {
          select: { id: true, name: true },
        },
        hrProfile: true,
        hrMonthRecords: {
          where: { month: monthStr },
          include: { dayDecisions: true },
        },
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });

    const rows: HrMonthRowData[] = [];

    for (const u of users) {
      let record = u.hrMonthRecords[0];

      // If no record exists or no HR profile, compute on-the-fly preview
      if (!record || !u.hrProfile) {
        try {
          const breakdown = await this.calculateUserMonth(u.id, monthStr, false);
          rows.push({
            id: undefined,
            userId: u.id,
            userName: u.name,
            userEmail: u.email,
            userRole: u.role,
            managerId: u.managerId,
            managerName: u.manager?.name,
            contractType: breakdown.contractType,
            remunerationMode: breakdown.remunerationMode,
            status: HrMonthStatus.DRAFT,
            workingDays: breakdown.effectiveWorkingDays,
            totalWorkingDays: breakdown.totalWorkingDaysInMonth,
            absenceDays: breakdown.absenceDays,
            totalCalls: breakdown.totalCalls,
            totalRdv: breakdown.totalRdv,
            dailyQuota: breakdown.dailyQuota,
            fixedAmountCents: breakdown.proratedFixedCents,
            variableAmountCents: breakdown.variableAmountCents,
            adjustmentCents: breakdown.adjustmentCents,
            totalAmountCents: breakdown.totalAmountCents,
            hasUnderQuotaPendingDecision: breakdown.daysUnderQuotaCount > 0,
            underQuotaDaysCount: breakdown.daysUnderQuotaCount,
            validatedAt: null,
            paidAt: null,
          });
          continue;
        } catch (e) {
          console.warn(`Failed preview for user ${u.id}:`, e);
        }
      }

      if (record) {
        rows.push({
          id: record.id,
          userId: u.id,
          userName: u.name,
          userEmail: u.email,
          userRole: u.role,
          managerId: u.managerId,
          managerName: u.manager?.name,
          contractType: u.hrProfile?.contractType || ContractType.SALARIE,
          remunerationMode: u.hrProfile?.remunerationMode || RemunerationMode.FIXE,
          status: record.status,
          workingDays: record.workingDays,
          totalWorkingDays:
            (record.rulesSnapshot as any)?.totalWorkingDaysInMonth || record.workingDays + record.absenceDays,
          absenceDays: record.absenceDays,
          totalCalls: record.totalCalls,
          totalRdv: record.totalRdv,
          dailyQuota: record.dailyQuota,
          fixedAmountCents: record.fixedAmountCents,
          variableAmountCents: record.variableAmountCents,
          adjustmentCents: record.adjustmentCents,
          totalAmountCents: record.totalAmountCents,
          hasUnderQuotaPendingDecision: false,
          underQuotaDaysCount: 0,
          validatedAt: record.validatedAt ? record.validatedAt.toISOString() : null,
          paidAt: record.paidAt ? record.paidAt.toISOString() : null,
        });
      }
    }

    return rows;
  }

  /**
   * Bulk calculate/refresh all active team members for a month.
   */
  async calculateAllForMonth(monthStr: string, actorId: string) {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        role: {
          notIn: ["CLIENT", "COMMERCIAL"],
        },
      },
      select: { id: true, name: true },
    });

    const results = [];
    for (const u of users) {
      try {
        const res = await this.calculateUserMonth(u.id, monthStr, true, actorId);
        results.push({ userId: u.id, name: u.name, success: true, total: res.totalAmountCents });
      } catch (err: any) {
        results.push({ userId: u.id, name: u.name, success: false, error: err.message });
      }
    }

    return results;
  }

  /**
   * Set status on HrMonthRecord (DRAFT -> TO_VERIFY -> VALIDATED -> PAID)
   */
  async updateStatus(
    monthRecordId: string,
    newStatus: HrMonthStatus,
    actorId: string,
    options?: { adjustmentCents?: number; adjustmentNote?: string }
  ) {
    const record = await prisma.hrMonthRecord.findUnique({
      where: { id: monthRecordId },
    });

    if (!record) {
      throw new Error("Dossier mensuel introuvable");
    }

    const data: any = {
      status: newStatus,
    };

    if (newStatus === HrMonthStatus.VALIDATED) {
      data.validatedAt = new Date();
      data.validatedById = actorId;
    } else if (newStatus === HrMonthStatus.PAID) {
      data.paidAt = new Date();
    }

    if (options?.adjustmentCents !== undefined) {
      data.adjustmentCents = options.adjustmentCents;
      data.totalAmountCents = record.fixedAmountCents + record.variableAmountCents + options.adjustmentCents;
    }

    if (options?.adjustmentNote !== undefined) {
      data.adjustmentNote = options.adjustmentNote;
    }

    const updated = await prisma.hrMonthRecord.update({
      where: { id: monthRecordId },
      data,
    });

    await prisma.hrAuditLog.create({
      data: {
        monthRecordId,
        userId: record.userId,
        actorId,
        action: "STATUS_CHANGED",
        details: {
          previousStatus: record.status,
          newStatus,
          adjustmentCents: options?.adjustmentCents,
        },
      },
    });

    return updated;
  }

  /**
   * Record decision on an under-quota or zero-call day.
   */
  async recordDayDecision(
    monthRecordId: string,
    dateStr: string,
    decision: HrDayDecision,
    reason: string,
    actorId: string
  ) {
    if (!reason || reason.trim().length === 0) {
      throw new Error("Le motif est obligatoire pour valider une décision de journée.");
    }

    const record = await prisma.hrMonthRecord.findUnique({
      where: { id: monthRecordId },
    });

    if (!record) {
      throw new Error("Dossier mensuel introuvable");
    }

    const targetDate = new Date(dateStr);

    const decisionRecord = await prisma.hrDayDecisionRecord.upsert({
      where: {
        monthRecordId_date: {
          monthRecordId,
          date: targetDate,
        },
      },
      create: {
        monthRecordId,
        date: targetDate,
        decision,
        reason: reason.trim(),
        decidedById: actorId,
      },
      update: {
        decision,
        reason: reason.trim(),
        decidedById: actorId,
        decidedAt: new Date(),
      },
    });

    // Recalculate month with this new decision taken into account
    await this.calculateUserMonth(record.userId, record.month, true, actorId);

    await prisma.hrAuditLog.create({
      data: {
        monthRecordId,
        userId: record.userId,
        actorId,
        action: "DAY_DECISION",
        details: {
          date: dateStr,
          decision,
          reason,
        },
      },
    });

    return decisionRecord;
  }
}

export const hrCalculationService = new HrCalculationService();
