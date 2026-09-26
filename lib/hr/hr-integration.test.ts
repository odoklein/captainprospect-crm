import { test, describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../prisma";
import { hrProfileService } from "./hr-profile-service";
import { hrCalculationService } from "./hr-calculation-service";
import { ContractType, RemunerationMode, HrMonthStatus, HrDayDecision } from "./hr-types";

describe("HR Module Database & Service Integration", () => {
  let testUserId: string;
  const testMonth = "2026-09";

  before(async () => {
    // Find or pick a test user
    const user = await prisma.user.findFirst({
      where: { role: "SDR" },
    });
    if (!user) {
      throw new Error("No SDR user found for integration testing");
    }
    testUserId = user.id;
  });

  it("can upsert and retrieve an HR profile with snapshot tracking", async () => {
    const profile = await hrProfileService.upsertProfile(
      {
        userId: testUserId,
        contractType: ContractType.SALARIE,
        remunerationMode: RemunerationMode.FIXE_PLUS_VARIABLE,
        fixedSalaryCents: 240000, // 2,400 €
        variablePerRdvCents: 4500, // 45 €
        dailyQuota: 75,
        effectiveFrom: "2026-09-01",
      },
      "admin-test",
      "Configuration initiale test"
    );

    assert.strictEqual(profile.userId, testUserId);
    assert.strictEqual(profile.fixedSalaryCents, 240000);
    assert.strictEqual(profile.variablePerRdvCents, 4500);
    assert.strictEqual(profile.dailyQuota, 75);

    // Update to verify snapshot is created
    await hrProfileService.upsertProfile(
      {
        userId: testUserId,
        contractType: ContractType.SALARIE,
        remunerationMode: RemunerationMode.FIXE_PLUS_VARIABLE,
        fixedSalaryCents: 260000, // 2,600 €
        variablePerRdvCents: 5000, // 50 €
        dailyQuota: 80,
        effectiveFrom: "2026-09-15",
      },
      "admin-test",
      "Augmentation test"
    );

    const snapshots = await prisma.hrProfileSnapshot.findMany({
      where: { hrProfileId: profile.id },
    });
    assert.ok(snapshots.length >= 1);
    assert.strictEqual(snapshots[0].fixedSalaryCents, 240000);
  });

  it("calculates a monthly breakdown with real actions and working days", async () => {
    const result = await hrCalculationService.calculateUserMonth(
      testUserId,
      testMonth,
      true, // persist
      "admin-test"
    );

    assert.strictEqual(result.month, testMonth);
    assert.strictEqual(result.userId, testUserId);
    assert.ok(result.totalWorkingDaysInMonth > 0);
    assert.ok(result.effectiveWorkingDays >= 0);
    assert.ok(result.totalAmountCents >= 0);
    assert.ok(result.formulas.fixedFormula.length > 0);
    assert.ok(result.formulas.variableFormula.length > 0);

    // Check DB record was saved
    const record = await prisma.hrMonthRecord.findUnique({
      where: {
        userId_month: {
          userId: testUserId,
          month: testMonth,
        },
      },
    });
    assert.ok(record !== null);
    assert.strictEqual(record?.status, HrMonthStatus.DRAFT);
  });

  it("records day decisions on under-quota days and recalculates automatically", async () => {
    const record = await prisma.hrMonthRecord.findUnique({
      where: {
        userId_month: {
          userId: testUserId,
          month: testMonth,
        },
      },
    });
    assert.ok(record !== null);

    const testDate = "2026-09-02";
    const decision = await hrCalculationService.recordDayDecision(
      record.id,
      testDate,
      HrDayDecision.UNPAID,
      "Absence non justifiée le matin",
      "admin-test"
    );

    assert.strictEqual(decision.decision, HrDayDecision.UNPAID);
    assert.strictEqual(decision.reason, "Absence non justifiée le matin");

    // Recalculated record should have the decision
    const updatedRecord = await prisma.hrMonthRecord.findUnique({
      where: { id: record.id },
      include: { dayDecisions: true },
    });
    assert.ok(updatedRecord?.dayDecisions.some((d) => d.decision === HrDayDecision.UNPAID));
  });

  it("updates status and handles manual adjustments", async () => {
    const record = await prisma.hrMonthRecord.findUnique({
      where: {
        userId_month: {
          userId: testUserId,
          month: testMonth,
        },
      },
    });
    assert.ok(record !== null);

    const updated = await hrCalculationService.updateStatus(
      record.id,
      HrMonthStatus.TO_VERIFY,
      "admin-test",
      {
        adjustmentCents: 10000, // +100 €
        adjustmentNote: "Prime exceptionnelle",
      }
    );

    assert.strictEqual(updated.status, HrMonthStatus.TO_VERIFY);
    assert.strictEqual(updated.adjustmentCents, 10000);
    assert.strictEqual(updated.adjustmentNote, "Prime exceptionnelle");
  });

  it("returns month overview data with all active team members", async () => {
    const rows = await hrCalculationService.getMonthOverview(testMonth);
    assert.ok(Array.isArray(rows));
    assert.ok(rows.length > 0);

    const testUserRow = rows.find((r) => r.userId === testUserId);
    assert.ok(testUserRow !== undefined);
    assert.strictEqual(testUserRow?.status, HrMonthStatus.TO_VERIFY);
  });
});
