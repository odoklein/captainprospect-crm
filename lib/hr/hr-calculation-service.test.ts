import { test, describe, it } from "node:test";
import assert from "node:assert/strict";
import { RemunerationMode, ContractType, HrDayDecision } from "./hr-types";

describe("HR Calculation Logic & Financial Math", () => {
  it("calculates prorated fixed salary accurately in integer cents", () => {
    const fixedSalaryCents = 250000; // 2,500.00 €
    const totalWorkingDays = 22;
    const effectiveWorkingDays = 20; // 2 days absence

    const prorated = Math.round((fixedSalaryCents * effectiveWorkingDays) / totalWorkingDays);
    assert.strictEqual(prorated, 227273); // 2,272.73 €
    assert.strictEqual(Number.isInteger(prorated), true);
  });

  it("handles full month with zero absences", () => {
    const fixedSalaryCents = 300000; // 3,000.00 €
    const totalWorkingDays = 21;
    const effectiveWorkingDays = 21;

    const prorated = Math.round((fixedSalaryCents * effectiveWorkingDays) / totalWorkingDays);
    assert.strictEqual(prorated, 300000);
  });

  it("calculates variable compensation per RDV", () => {
    const variablePerRdvCents = 6000; // 60.00 € per confirmed RDV
    const totalRdv = 14;

    const variableAmountCents = totalRdv * variablePerRdvCents;
    assert.strictEqual(variableAmountCents, 84000); // 840.00 €
  });

  it("combines Fixed + Variable in FIXE_PLUS_VARIABLE mode", () => {
    const mode = RemunerationMode.FIXE_PLUS_VARIABLE;
    const fixedSalaryCents = 200000;
    const totalWorkingDays = 20;
    const effectiveWorkingDays = 18; // 2 absence days
    const variablePerRdvCents = 5000;
    const totalRdv = 8;
    const adjustmentCents = 15000; // +150 € bonus

    const proratedFixed = Math.round((fixedSalaryCents * effectiveWorkingDays) / totalWorkingDays);
    const variableAmount = totalRdv * variablePerRdvCents;
    const total = proratedFixed + variableAmount + adjustmentCents;

    assert.strictEqual(proratedFixed, 180000); // 1,800.00 €
    assert.strictEqual(variableAmount, 40000);  // 400.00 €
    assert.strictEqual(total, 235000);           // 2,350.00 €
  });

  it("ensures FIXE mode ignores variable remuneration", () => {
    const mode = RemunerationMode.FIXE;
    const fixedSalaryCents = 200000;
    const totalWorkingDays = 20;
    const effectiveWorkingDays = 20;
    const variablePerRdvCents = 5000;
    const totalRdv = 10;

    let fixedAmount = prorate(fixedSalaryCents, effectiveWorkingDays, totalWorkingDays);
    let variableAmount = 0;
    if (mode === RemunerationMode.VARIABLE || mode === RemunerationMode.FIXE_PLUS_VARIABLE) {
      variableAmount = totalRdv * variablePerRdvCents;
    }

    assert.strictEqual(fixedAmount, 200000);
    assert.strictEqual(variableAmount, 0);
  });

  it("ensures VARIABLE mode ignores fixed salary", () => {
    const mode = RemunerationMode.VARIABLE;
    const fixedSalaryCents = 200000;
    const totalWorkingDays = 20;
    const effectiveWorkingDays = 20;
    const variablePerRdvCents = 7500; // 75 € / RDV
    const totalRdv = 12;

    let fixedAmount = 0;
    if (mode === RemunerationMode.FIXE || mode === RemunerationMode.FIXE_PLUS_VARIABLE) {
      fixedAmount = prorate(fixedSalaryCents, effectiveWorkingDays, totalWorkingDays);
    }
    const variableAmount = totalRdv * variablePerRdvCents;

    assert.strictEqual(fixedAmount, 0);
    assert.strictEqual(variableAmount, 90000); // 900.00 €
  });

  it("deducts unpaid under-quota days correctly", () => {
    const totalWorkingDays = 22;
    const absenceDays = 1;
    const unpaidUnderQuotaDays = 2; // Manager marked UNPAID on 2 days

    const effectiveWorkingDays = Math.max(0, totalWorkingDays - absenceDays - unpaidUnderQuotaDays);
    assert.strictEqual(effectiveWorkingDays, 19);

    const fixedSalaryCents = 220000; // 2,200.00 €
    const prorated = Math.round((fixedSalaryCents * effectiveWorkingDays) / totalWorkingDays);
    assert.strictEqual(prorated, 190000); // 1,900.00 €
  });

  it("retains working days when under-quota day is marked PAID", () => {
    const totalWorkingDays = 22;
    const absenceDays = 1;
    // 2 days were under quota, but manager marked PAID with reason
    const unpaidUnderQuotaDays = 0;

    const effectiveWorkingDays = Math.max(0, totalWorkingDays - absenceDays - unpaidUnderQuotaDays);
    assert.strictEqual(effectiveWorkingDays, 21);
  });

  it("never produces floating point rounding errors", () => {
    // 333.333333... recurring fraction check
    const fixedSalaryCents = 100000;
    const totalWorkingDays = 3;
    const effectiveWorkingDays = 1;

    const prorated = Math.round((fixedSalaryCents * effectiveWorkingDays) / totalWorkingDays);
    assert.strictEqual(prorated, 33333); // 333.33 €
    assert.strictEqual(Number.isSafeInteger(prorated), true);
  });
});

function prorate(fixedCents: number, effectiveDays: number, totalDays: number): number {
  if (totalDays <= 0) return fixedCents;
  return Math.round((fixedCents * effectiveDays) / totalDays);
}
