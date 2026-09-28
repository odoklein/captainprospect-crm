import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HrDayDecision, HrMonthStatus, RemunerationMode } from "@prisma/client";
import {
  computeMonth,
  getMonthBounds,
  parisDayKey,
  planBulkTransition,
  resolveStatusTransition,
  MonthComputationInput,
} from "./hr-rules";
import { buildPayrollCsv } from "./hr-export";
import type { HrMonthRowData } from "./hr-types";

// September 2026: 30 days, starts on a Tuesday → 22 working days.
function input(overrides: Partial<MonthComputationInput> = {}): MonthComputationInput {
  return {
    monthStr: "2026-09",
    profile: {
      remunerationMode: RemunerationMode.FIXE_PLUS_VARIABLE,
      fixedSalaryCents: 220000,
      variablePerRdvCents: 5000,
      dailyQuota: 80,
    },
    holidays: new Map(),
    absences: [],
    callsByDay: new Map(),
    rdvByDay: new Map(),
    decisions: new Map(),
    adjustmentCents: 0,
    todayKey: "2026-10-01",
    ...overrides,
  };
}

describe("Paris-time day attribution", () => {
  it("counts a 23:30 Paris call on the Paris day, not the next UTC day", () => {
    // 2026-09-10 23:30 in Paris (UTC+2) = 21:30 UTC — same day either way
    assert.equal(parisDayKey(new Date("2026-09-10T21:30:00Z")), "2026-09-10");
    // 2026-09-11 00:30 in Paris = 2026-09-10 22:30 UTC — UTC says the 10th
    assert.equal(parisDayKey(new Date("2026-09-10T22:30:00Z")), "2026-09-11");
  });

  it("uses Paris midnight as month boundaries for activity", () => {
    const b = getMonthBounds("2026-09");
    assert.equal(b.activityStart.toISOString(), "2026-08-31T22:00:00.000Z");
    assert.equal(b.activityEndExclusive.toISOString(), "2026-09-30T22:00:00.000Z");
    assert.equal(b.daysInMonth, 30);
  });

  it("rejects malformed months", () => {
    assert.throws(() => getMonthBounds("2026-13"));
    assert.throws(() => getMonthBounds("26-09"));
  });
});

describe("Monthly computation", () => {
  it("pays the full fixed salary when every past day meets quota", () => {
    const calls = new Map<string, number>();
    for (let d = 1; d <= 30; d++) calls.set(`2026-09-${String(d).padStart(2, "0")}`, 80);
    const r = computeMonth(input({ callsByDay: calls }));
    assert.equal(r.totalWorkingDaysInMonth, 22);
    assert.equal(r.daysUnderQuotaCount, 0);
    assert.equal(r.proratedFixedCents, 220000);
  });

  it("flags under-quota days as pending but does not deduct them without a decision", () => {
    const r = computeMonth(input());
    assert.equal(r.daysUnderQuotaCount, 22);
    assert.equal(r.pendingDecisionCount, 22);
    assert.equal(r.effectiveWorkingDays, 22);
    assert.equal(r.proratedFixedCents, 220000);
  });

  it("deducts only days explicitly ruled unpaid", () => {
    const decisions = new Map([
      ["2026-09-01", { decision: HrDayDecision.UNPAID, reason: "x" }],
      ["2026-09-02", { decision: HrDayDecision.PAID, reason: "x" }],
    ]);
    const r = computeMonth(input({ decisions }));
    assert.equal(r.unpaidDaysUnderQuota, 1);
    assert.equal(r.pendingDecisionCount, 20);
    assert.equal(r.effectiveWorkingDays, 21);
    assert.equal(r.proratedFixedCents, 210000);
  });

  it("does not judge today or future days", () => {
    const r = computeMonth(input({ todayKey: "2026-09-15" }));
    // Working days Sept 1–14: Tue 1 .. Mon 14 → 10 days
    assert.equal(r.daysUnderQuotaCount, 10);
    assert.ok(r.days.find((d) => d.date === "2026-09-15")!.isFuture);
    assert.equal(r.days.find((d) => d.date === "2026-09-15")!.isUnderQuota, false);
  });

  it("removes holidays from working days and absences from paid days", () => {
    const r = computeMonth(
      input({
        holidays: new Map([["2026-09-07", "Test"]]),
        absences: [{ start: "2026-09-08", end: "2026-09-09", type: "VACATION" }],
      })
    );
    assert.equal(r.totalWorkingDaysInMonth, 21);
    assert.equal(r.absenceDays, 2);
    assert.equal(r.effectiveWorkingDays, 19);
    assert.equal(r.proratedFixedCents, Math.round((220000 * 19) / 21));
  });

  it("applies the remuneration mode", () => {
    const rdv = new Map([["2026-09-03", 3]]);
    const fixe = computeMonth(input({ rdvByDay: rdv, profile: { ...input().profile, remunerationMode: RemunerationMode.FIXE } }));
    const variable = computeMonth(input({ rdvByDay: rdv, profile: { ...input().profile, remunerationMode: RemunerationMode.VARIABLE } }));
    const both = computeMonth(input({ rdvByDay: rdv, adjustmentCents: -1000 }));
    assert.equal(fixe.variableAmountCents, 0);
    assert.equal(variable.proratedFixedCents, 0);
    assert.equal(variable.variableAmountCents, 15000);
    assert.equal(both.totalAmountCents, 220000 + 15000 - 1000);
  });

  it("ignores quota when it is zero", () => {
    const r = computeMonth(input({ profile: { ...input().profile, dailyQuota: 0 } }));
    assert.equal(r.daysUnderQuotaCount, 0);
  });
});

describe("Status workflow", () => {
  it("blocks paying a month that was never validated", () => {
    assert.equal(resolveStatusTransition(HrMonthStatus.DRAFT, HrMonthStatus.PAID).allowed, false);
    assert.equal(resolveStatusTransition(HrMonthStatus.TO_VERIFY, HrMonthStatus.PAID).allowed, false);
    assert.equal(resolveStatusTransition(HrMonthStatus.VALIDATED, HrMonthStatus.PAID).allowed, true);
  });

  it("requires the validate permission to validate", () => {
    const t = resolveStatusTransition(HrMonthStatus.TO_VERIFY, HrMonthStatus.VALIDATED);
    assert.deepEqual(t.permissions, ["features.hr_validate"]);
  });

  it("requires the reopen permission to move a locked month backwards", () => {
    assert.ok(resolveStatusTransition(HrMonthStatus.PAID, HrMonthStatus.DRAFT).permissions.includes("features.hr_reopen"));
    assert.ok(resolveStatusTransition(HrMonthStatus.VALIDATED, HrMonthStatus.TO_VERIFY).permissions.includes("features.hr_reopen"));
    assert.ok(!resolveStatusTransition(HrMonthStatus.TO_VERIFY, HrMonthStatus.DRAFT).permissions.includes("features.hr_reopen"));
  });
});

function row(overrides: Partial<HrMonthRowData> = {}): HrMonthRowData {
  return {
    id: "rec1",
    userId: "u1",
    userName: "Alice Martin",
    userEmail: "alice@example.com",
    userRole: "SDR",
    managerId: "admin-001",
    managerName: "Admin",
    contractType: "SALARIE" as HrMonthRowData["contractType"],
    remunerationMode: RemunerationMode.FIXE,
    status: HrMonthStatus.TO_VERIFY,
    workingDays: 21,
    totalWorkingDays: 22,
    absenceDays: 1,
    totalCalls: 1500,
    totalRdv: 4,
    dailyQuota: 80,
    fixedAmountCents: 210000,
    variableAmountCents: 0,
    adjustmentCents: -5025,
    adjustmentNote: 'Retenue "transport"; avance',
    totalAmountCents: 204975,
    hasProfile: true,
    pendingDecisionCount: 0,
    underQuotaDaysCount: 0,
    isStale: false,
    ...overrides,
  };
}

describe("Bulk status changes", () => {
  it("only moves records that are allowed to move, and says why for the rest", () => {
    const rows = [
      row({ userName: "ok" }),
      row({ userName: "unsaved", id: undefined }),
      row({ userName: "pending", pendingDecisionCount: 3 }),
      row({ userName: "stale", isStale: true }),
      row({ userName: "already", status: HrMonthStatus.VALIDATED }),
    ];
    const { eligible, skipped } = planBulkTransition(rows, HrMonthStatus.VALIDATED);
    assert.deepEqual(eligible.map((r) => r.userName), ["ok"]);
    assert.deepEqual(
      skipped.map((s) => [s.row.userName, s.reason]),
      [
        ["unsaved", "pas encore enregistré"],
        ["pending", "3 j à statuer"],
        ["stale", "à recalculer"],
        ["already", "déjà « Validé »"],
      ]
    );
  });

  it("never pays a record that is not validated, and never reopens in bulk", () => {
    const pay = planBulkTransition([row({ status: HrMonthStatus.DRAFT }), row({ status: HrMonthStatus.VALIDATED })], HrMonthStatus.PAID);
    assert.equal(pay.eligible.length, 1);
    const reopen = planBulkTransition([row({ status: HrMonthStatus.PAID })], HrMonthStatus.DRAFT);
    assert.equal(reopen.eligible.length, 0);
  });
});

describe("Payroll CSV export", () => {
  it("uses French Excel conventions and escapes risky cells", () => {
    const csv = buildPayrollCsv([row()], "2026-09");
    assert.ok(csv.startsWith("\uFEFF"));
    const [, line] = csv.slice(1).split("\r\n");
    assert.ok(line.includes(";2100,00;0,00;-50,25;"));
    assert.ok(line.includes('"Retenue ""transport""; avance"'));
    assert.ok(line.endsWith(";2049,75;"));
  });
});
