import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/api-utils";
import {
  CalculationBreakdown,
  ContractType,
  HrDayDecision,
  HrMonthRowData,
  HrMonthStatus,
  RemunerationMode,
} from "./hr-types";
import {
  InvalidMonthError,
  MonthComputation,
  computeMonth,
  dateColumnKey,
  getMonthBounds,
  isLockedStatus,
  parisDayKey,
  resolveStatusTransition,
  todayParisKey,
} from "./hr-rules";

const HR_ROLES = ["SDR", "MANAGER"] as const;

type UserWithProfile = {
  id: string;
  name: string;
  email: string;
  role: string;
  managerId: string | null;
  manager: { id: string; name: string } | null;
  hrProfile: {
    id: string;
    contractType: ContractType;
    remunerationMode: RemunerationMode;
    fixedSalaryCents: number;
    variablePerRdvCents: number;
    dailyQuota: number;
  } | null;
};

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  managerId: true,
  manager: { select: { id: true, name: true } },
  hrProfile: true,
} as const;

function resolveProfile(user: UserWithProfile) {
  if (user.hrProfile) return user.hrProfile;
  return {
    id: null as string | null,
    contractType: ContractType.SALARIE,
    remunerationMode: RemunerationMode.FIXE,
    fixedSalaryCents: 0,
    variablePerRdvCents: 0,
    dailyQuota: user.role === "SDR" || user.role === "BOOKER" ? 80 : 0,
  };
}

function bounds(monthStr: string) {
  try {
    return getMonthBounds(monthStr);
  } catch (e) {
    if (e instanceof InvalidMonthError) throw new ValidationError(e.message);
    throw e;
  }
}

function countByUserDay(rows: { sdrId: string; createdAt: Date }[]) {
  const map = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const key = parisDayKey(r.createdAt);
    let perDay = map.get(r.sdrId);
    if (!perDay) map.set(r.sdrId, (perDay = new Map()));
    perDay.set(key, (perDay.get(key) || 0) + 1);
  }
  return map;
}

async function loadMonthContext(userIds: string[], monthStr: string) {
  const b = bounds(monthStr);

  const [holidays, absences, calls, rdvs, records] = await Promise.all([
    prisma.planningHoliday.findMany({
      where: { scope: "GLOBAL", date: { gte: b.dateStart, lte: b.dateEnd } },
    }),
    prisma.sdrAbsence.findMany({
      where: {
        sdrId: { in: userIds },
        impactsPlanning: true,
        startDate: { lte: b.dateEnd },
        endDate: { gte: b.dateStart },
      },
    }),
    prisma.action.findMany({
      where: {
        sdrId: { in: userIds },
        channel: "CALL",
        createdAt: { gte: b.activityStart, lt: b.activityEndExclusive },
      },
      select: { sdrId: true, createdAt: true },
    }),
    prisma.action.findMany({
      where: {
        sdrId: { in: userIds },
        result: "MEETING_BOOKED",
        confirmationStatus: { not: "CANCELLED" },
        createdAt: { gte: b.activityStart, lt: b.activityEndExclusive },
      },
      select: { sdrId: true, createdAt: true },
    }),
    prisma.hrMonthRecord.findMany({
      where: { userId: { in: userIds }, month: monthStr },
      include: { dayDecisions: true },
    }),
  ]);

  const holidayMap = new Map<string, string>();
  holidays.forEach((h) => holidayMap.set(dateColumnKey(h.date), h.label || "Jour férié"));

  return {
    holidayMap,
    absences,
    callsByUser: countByUserDay(calls),
    rdvByUser: countByUserDay(rdvs),
    recordByUser: new Map(records.map((r) => [r.userId, r])),
  };
}

type MonthContext = Awaited<ReturnType<typeof loadMonthContext>>;
type MonthRecordWithDecisions = NonNullable<ReturnType<MonthContext["recordByUser"]["get"]>>;

function computeForUser(user: UserWithProfile, monthStr: string, ctx: MonthContext) {
  const profile = resolveProfile(user);
  const record = ctx.recordByUser.get(user.id);

  const decisions = new Map<string, { decision: HrDayDecision; reason: string; decidedAt?: string }>();
  record?.dayDecisions.forEach((d) =>
    decisions.set(dateColumnKey(d.date), {
      decision: d.decision,
      reason: d.reason,
      decidedAt: d.decidedAt.toISOString(),
    })
  );

  const computation = computeMonth({
    monthStr,
    profile,
    holidays: ctx.holidayMap,
    absences: ctx.absences
      .filter((a) => a.sdrId === user.id)
      .map((a) => ({ start: dateColumnKey(a.startDate), end: dateColumnKey(a.endDate), type: a.type })),
    callsByDay: ctx.callsByUser.get(user.id) ?? new Map(),
    rdvByDay: ctx.rdvByUser.get(user.id) ?? new Map(),
    decisions,
    adjustmentCents: record?.adjustmentCents ?? 0,
    todayKey: todayParisKey(),
  });

  return { profile, record, computation };
}

function toBreakdown(
  user: UserWithProfile,
  monthStr: string,
  profile: ReturnType<typeof resolveProfile>,
  record: MonthRecordWithDecisions | undefined,
  c: MonthComputation
): CalculationBreakdown {
  return {
    month: monthStr,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    contractType: profile.contractType,
    remunerationMode: profile.remunerationMode,
    calendarDaysInMonth: c.calendarDaysInMonth,
    totalWorkingDaysInMonth: c.totalWorkingDaysInMonth,
    absenceDays: c.absenceDays,
    effectiveWorkingDays: c.effectiveWorkingDays,
    unpaidDaysUnderQuota: c.unpaidDaysUnderQuota,
    totalCalls: c.totalCalls,
    totalRdv: c.totalRdv,
    dailyQuota: profile.dailyQuota,
    baseFixedSalaryCents: profile.fixedSalaryCents,
    proratedFixedCents: c.proratedFixedCents,
    variablePerRdvCents: profile.variablePerRdvCents,
    variableAmountCents: c.variableAmountCents,
    adjustmentCents: record?.adjustmentCents ?? 0,
    adjustmentNote: record?.adjustmentNote ?? undefined,
    totalAmountCents: c.totalAmountCents,
    savedTotalAmountCents: record?.totalAmountCents,
    formulas: c.formulas,
    days: c.days,
    daysUnderQuotaCount: c.daysUnderQuotaCount,
    pendingDecisionCount: c.pendingDecisionCount,
    hasProfile: Boolean(profile.id),
    monthRecordId: record?.id,
    status: record?.status,
  };
}

function differsFromRecord(record: MonthRecordWithDecisions, c: MonthComputation) {
  return (
    record.totalAmountCents !== c.totalAmountCents ||
    record.totalCalls !== c.totalCalls ||
    record.totalRdv !== c.totalRdv ||
    record.workingDays !== c.effectiveWorkingDays ||
    record.absenceDays !== c.absenceDays
  );
}

export class HrCalculationService {
  private async getUser(userId: string): Promise<UserWithProfile> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: userSelect });
    if (!user) throw new NotFoundError("Collaborateur introuvable");
    return user;
  }

  private async persist(
    user: UserWithProfile,
    monthStr: string,
    profile: ReturnType<typeof resolveProfile>,
    record: MonthRecordWithDecisions | undefined,
    c: MonthComputation,
    actorId?: string,
    reopen = false
  ) {
    if (!profile.id) {
      throw new ValidationError(
        `Les règles RH de ${user.name} ne sont pas encore configurées. Cliquez sur « Règles » pour les renseigner.`
      );
    }

    const figures = {
      workingDays: c.effectiveWorkingDays,
      absenceDays: c.absenceDays,
      totalCalls: c.totalCalls,
      totalRdv: c.totalRdv,
      dailyQuota: profile.dailyQuota,
      fixedAmountCents: c.proratedFixedCents,
      variableAmountCents: c.variableAmountCents,
      totalAmountCents: c.totalAmountCents,
      rulesSnapshot: {
        contractType: profile.contractType,
        remunerationMode: profile.remunerationMode,
        fixedSalaryCents: profile.fixedSalaryCents,
        variablePerRdvCents: profile.variablePerRdvCents,
        dailyQuota: profile.dailyQuota,
        totalWorkingDaysInMonth: c.totalWorkingDaysInMonth,
      },
    };

    const saved = await prisma.hrMonthRecord.upsert({
      where: { userId_month: { userId: user.id, month: monthStr } },
      create: {
        hrProfileId: profile.id,
        userId: user.id,
        month: monthStr,
        adjustmentCents: 0,
        status: HrMonthStatus.DRAFT,
        ...figures,
      },
      update: {
        hrProfileId: profile.id,
        ...figures,
        ...(reopen
          ? { status: HrMonthStatus.TO_VERIFY, validatedAt: null, validatedById: null, paidAt: null }
          : {}),
      },
    });

    if (actorId) {
      await prisma.hrAuditLog.create({
        data: {
          monthRecordId: saved.id,
          userId: user.id,
          actorId,
          action: reopen ? "MONTH_REOPENED" : record ? "MONTH_RECALCULATED" : "MONTH_CALCULATED",
          details: {
            month: monthStr,
            totalAmountCents: c.totalAmountCents,
            effectiveWorkingDays: c.effectiveWorkingDays,
            totalCalls: c.totalCalls,
            totalRdv: c.totalRdv,
          },
        },
      });
    }

    return saved;
  }

  /**
   * Detailed calculation for one person and month. With persist=false it is a
   * read-only preview and works on validated/paid months too.
   */
  async calculateUserMonth(
    userId: string,
    monthStr: string,
    persist: boolean = true,
    actorId?: string,
    options?: { forceReopen?: boolean }
  ): Promise<CalculationBreakdown> {
    const user = await this.getUser(userId);
    const ctx = await loadMonthContext([user.id], monthStr);
    const { profile, record, computation } = computeForUser(user, monthStr, ctx);

    if (!persist) return toBreakdown(user, monthStr, profile, record, computation);

    const locked = isLockedStatus(record?.status);
    if (locked && !options?.forceReopen) {
      throw new ValidationError(
        `Ce mois est déjà ${record?.status === HrMonthStatus.VALIDATED ? "validé" : "payé"}. Rouvrez le dossier (bouton « Statut ») pour le recalculer.`
      );
    }

    const saved = await this.persist(user, monthStr, profile, record, computation, actorId, locked);
    return {
      ...toBreakdown(user, monthStr, profile, record, computation),
      monthRecordId: saved.id,
      status: saved.status,
      savedTotalAmountCents: saved.totalAmountCents,
    };
  }

  /**
   * Table rows for every active SDR/manager. Saved figures are shown when a
   * record exists; a fresh calculation drives the "needs attention" flags.
   */
  async getMonthOverview(monthStr: string): Promise<HrMonthRowData[]> {
    bounds(monthStr);

    const users = await prisma.user.findMany({
      where: { isActive: true, role: { in: [...HR_ROLES] } },
      select: userSelect,
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });
    if (users.length === 0) return [];

    const ctx = await loadMonthContext(
      users.map((u) => u.id),
      monthStr
    );

    return users.map((u) => {
      const { profile, record, computation: c } = computeForUser(u, monthStr, ctx);
      const locked = isLockedStatus(record?.status);
      const base = {
        userId: u.id,
        userName: u.name,
        userEmail: u.email,
        userRole: u.role,
        managerId: u.managerId,
        managerName: u.manager?.name,
        contractType: profile.contractType,
        remunerationMode: profile.remunerationMode,
        hasProfile: Boolean(profile.id),
        underQuotaDaysCount: c.daysUnderQuotaCount,
        pendingDecisionCount: locked ? 0 : c.pendingDecisionCount,
      };

      if (!record) {
        return {
          ...base,
          id: undefined,
          status: HrMonthStatus.DRAFT,
          workingDays: c.effectiveWorkingDays,
          totalWorkingDays: c.totalWorkingDaysInMonth,
          absenceDays: c.absenceDays,
          totalCalls: c.totalCalls,
          totalRdv: c.totalRdv,
          dailyQuota: profile.dailyQuota,
          fixedAmountCents: c.proratedFixedCents,
          variableAmountCents: c.variableAmountCents,
          adjustmentCents: 0,
          adjustmentNote: null,
          totalAmountCents: c.totalAmountCents,
          isStale: false,
          validatedAt: null,
          paidAt: null,
        };
      }

      const snapshot = record.rulesSnapshot as { totalWorkingDaysInMonth?: number } | null;
      return {
        ...base,
        id: record.id,
        status: record.status,
        workingDays: record.workingDays,
        totalWorkingDays: snapshot?.totalWorkingDaysInMonth ?? c.totalWorkingDaysInMonth,
        absenceDays: record.absenceDays,
        totalCalls: record.totalCalls,
        totalRdv: record.totalRdv,
        dailyQuota: record.dailyQuota,
        fixedAmountCents: record.fixedAmountCents,
        variableAmountCents: record.variableAmountCents,
        adjustmentCents: record.adjustmentCents,
        adjustmentNote: record.adjustmentNote,
        totalAmountCents: record.totalAmountCents,
        isStale: !locked && differsFromRecord(record, c),
        validatedAt: record.validatedAt?.toISOString() ?? null,
        paidAt: record.paidAt?.toISOString() ?? null,
      };
    });
  }

  /**
   * Save fresh figures for everyone. Validated/paid months and people without
   * HR rules are skipped, not failed.
   */
  async calculateAllForMonth(monthStr: string, actorId: string) {
    const users = await prisma.user.findMany({
      where: { isActive: true, role: { in: [...HR_ROLES] } },
      select: userSelect,
    });
    const ctx = await loadMonthContext(
      users.map((u) => u.id),
      monthStr
    );

    const results: {
      userId: string;
      name: string;
      outcome: "updated" | "skipped" | "failed";
      message?: string;
    }[] = [];

    for (const u of users) {
      const { profile, record, computation } = computeForUser(u, monthStr, ctx);
      if (!profile.id) {
        results.push({ userId: u.id, name: u.name, outcome: "skipped", message: "Règles RH non configurées" });
        continue;
      }
      if (isLockedStatus(record?.status)) {
        results.push({ userId: u.id, name: u.name, outcome: "skipped", message: "Dossier déjà validé ou payé" });
        continue;
      }
      try {
        await this.persist(u, monthStr, profile, record, computation, actorId);
        results.push({ userId: u.id, name: u.name, outcome: "updated" });
      } catch (err) {
        results.push({ userId: u.id, name: u.name, outcome: "failed", message: (err as Error)?.message });
      }
    }

    return {
      updated: results.filter((r) => r.outcome === "updated").length,
      skipped: results.filter((r) => r.outcome === "skipped").length,
      failed: results.filter((r) => r.outcome === "failed").length,
      results,
    };
  }

  async getMonthRecordStatus(monthRecordId: string): Promise<HrMonthStatus> {
    const record = await prisma.hrMonthRecord.findUnique({
      where: { id: monthRecordId },
      select: { status: true },
    });
    if (!record) throw new NotFoundError("Dossier mensuel introuvable");
    return record.status;
  }

  /**
   * DRAFT → TO_VERIFY → VALIDATED → PAID. Permission checks live in the route;
   * this enforces the workflow itself.
   */
  async updateStatus(
    monthRecordId: string,
    newStatus: HrMonthStatus,
    actorId: string,
    options?: { adjustmentCents?: number; adjustmentNote?: string }
  ) {
    const record = await prisma.hrMonthRecord.findUnique({ where: { id: monthRecordId } });
    if (!record) throw new NotFoundError("Dossier mensuel introuvable");

    const transition = resolveStatusTransition(record.status, newStatus);
    if (!transition.allowed) throw new ValidationError(transition.reason!);

    const adjustmentChanged =
      (options?.adjustmentCents !== undefined && options.adjustmentCents !== record.adjustmentCents) ||
      (options?.adjustmentNote !== undefined && options.adjustmentNote !== (record.adjustmentNote ?? ""));
    if (adjustmentChanged && isLockedStatus(record.status) && isLockedStatus(newStatus)) {
      throw new ValidationError(
        "Ce dossier est verrouillé. Repassez-le « À vérifier » pour modifier l'ajustement."
      );
    }

    if (newStatus === HrMonthStatus.VALIDATED && record.status !== HrMonthStatus.VALIDATED) {
      const live = await this.calculateUserMonth(record.userId, record.month, false);
      if (live.pendingDecisionCount > 0) {
        throw new ValidationError(
          `Il reste ${live.pendingDecisionCount} journée(s) sous le quota à statuer avant de pouvoir valider. Ouvrez « Détail » pour les traiter.`
        );
      }
      if (live.totalAmountCents !== record.totalAmountCents || live.totalCalls !== record.totalCalls) {
        throw new ValidationError(
          "L'activité a changé depuis le dernier calcul. Cliquez sur « Recalculer le mois » avant de valider."
        );
      }
    }

    const data: Record<string, unknown> = { status: newStatus };
    if (newStatus === HrMonthStatus.VALIDATED && record.status !== HrMonthStatus.VALIDATED) {
      data.validatedAt = new Date();
      data.validatedById = actorId;
    }
    if (newStatus === HrMonthStatus.PAID && record.status !== HrMonthStatus.PAID) {
      data.paidAt = new Date();
    }
    if (!isLockedStatus(newStatus)) {
      data.validatedAt = null;
      data.validatedById = null;
    }
    if (newStatus !== HrMonthStatus.PAID) {
      data.paidAt = null;
    }

    if (options?.adjustmentCents !== undefined) {
      data.adjustmentCents = options.adjustmentCents;
      data.totalAmountCents = record.fixedAmountCents + record.variableAmountCents + options.adjustmentCents;
    }
    if (options?.adjustmentNote !== undefined) {
      data.adjustmentNote = options.adjustmentNote || null;
    }

    const updated = await prisma.hrMonthRecord.update({ where: { id: monthRecordId }, data });

    await prisma.hrAuditLog.create({
      data: {
        monthRecordId,
        userId: record.userId,
        actorId,
        action: "STATUS_CHANGED",
        details: {
          previousStatus: record.status,
          newStatus,
          previousAdjustmentCents: record.adjustmentCents,
          adjustmentCents: options?.adjustmentCents,
          adjustmentNote: options?.adjustmentNote,
        },
      },
    });

    return updated;
  }

  /**
   * Paid/unpaid ruling on a past under-quota day, then the month is re-saved.
   */
  async recordDayDecision(
    monthRecordId: string,
    dateStr: string,
    decision: HrDayDecision,
    reason: string,
    actorId: string
  ) {
    const trimmed = (reason ?? "").trim();
    if (trimmed.length < 3) {
      throw new ValidationError("Le motif est obligatoire (3 caractères minimum).");
    }

    const record = await prisma.hrMonthRecord.findUnique({ where: { id: monthRecordId } });
    if (!record) throw new NotFoundError("Dossier mensuel introuvable");
    if (isLockedStatus(record.status)) {
      throw new ValidationError(
        "Ce dossier est validé ou payé. Repassez-le « À vérifier » pour modifier une journée."
      );
    }
    if (!dateStr.startsWith(`${record.month}-`)) {
      throw new ValidationError("Cette journée n'appartient pas au mois du dossier.");
    }

    const preview = await this.calculateUserMonth(record.userId, record.month, false);
    const day = preview.days.find((d) => d.date === dateStr);
    if (!day?.isUnderQuota) {
      throw new ValidationError("Cette journée n'est pas sous le quota : aucune décision n'est nécessaire.");
    }

    const targetDate = new Date(`${dateStr}T00:00:00Z`);
    const decisionRecord = await prisma.hrDayDecisionRecord.upsert({
      where: { monthRecordId_date: { monthRecordId, date: targetDate } },
      create: {
        monthRecordId,
        date: targetDate,
        callCount: day.callCount,
        rdvCount: day.rdvCount,
        decision,
        reason: trimmed,
        decidedById: actorId,
      },
      update: {
        callCount: day.callCount,
        rdvCount: day.rdvCount,
        decision,
        reason: trimmed,
        decidedById: actorId,
        decidedAt: new Date(),
      },
    });

    await prisma.hrAuditLog.create({
      data: {
        monthRecordId,
        userId: record.userId,
        actorId,
        action: "DAY_DECISION",
        details: { date: dateStr, decision, reason: trimmed, callCount: day.callCount },
      },
    });

    await this.calculateUserMonth(record.userId, record.month, true, actorId);

    return decisionRecord;
  }
}

export const hrCalculationService = new HrCalculationService();
