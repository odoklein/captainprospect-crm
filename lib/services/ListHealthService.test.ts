import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeActivityScore,
  computeETAPrediction,
  computeHealthStatus,
  computeVelocityTrend,
  generateHints,
  bulkHealthSql,
} from "./ListHealthService";

describe("ListHealthService pure computations", () => {
  it("marks list as fully prospected when coverage reaches threshold", () => {
    const result = computeHealthStatus({
      totalContacts: 100,
      contactedContacts: 85,
      totalActions: 120,
      daysSinceLastAction: 1,
    });
    assert.equal(result.status, "FULLY_PROSPECTED");
  });

  it("marks list as at risk when low coverage and inactivity", () => {
    const result = computeHealthStatus({
      totalContacts: 100,
      contactedContacts: 10,
      totalActions: 25,
      daysSinceLastAction: 10,
    });
    assert.equal(result.status, "AT_RISK");
  });

  it("classifies velocity trend as rising/declining/stable", () => {
    const rising = computeVelocityTrend({ actionsPerDay7d: 6, actionsPerDay30d: 3 });
    const declining = computeVelocityTrend({ actionsPerDay7d: 1, actionsPerDay30d: 4 });
    const stable = computeVelocityTrend({ actionsPerDay7d: 3.2, actionsPerDay30d: 3 });

    assert.equal(rising.trend, "RISING");
    assert.equal(declining.trend, "DECLINING");
    assert.equal(stable.trend, "STABLE");
  });

  it("produces ETA with confidence when cadence is present", () => {
    const eta = computeETAPrediction({
      totalContacts: 100,
      contactedContacts: 40,
      newContactsPerDay7d: 4,
      newContactsPerDay30d: 3.5,
      totalActions: 40,
      isNewList: false,
    });

    assert.equal(eta.remainingContacts, 60);
    assert.equal(eta.etaDays, 15);
    assert.notEqual(eta.etaDate, null);
    assert.equal(eta.confidence, "HIGH");
  });

  it("returns non-zero activity score for healthy list", () => {
    const score = computeActivityScore({
      coverageRate: 70,
      totalContacts: 100,
      actions7d: 45,
      positiveRate: 35,
      trend: "RISING",
      hasSparseData: false,
    });
    assert.ok(score.score >= 50);
  });

  it("generates warning hints for bad data quality and declining velocity", () => {
    const hints = generateHints({
      status: "IN_PROGRESS",
      coverageRate: 35,
      badContactRate: 40,
      meetingRate: 1,
      positiveRate: 12,
      daysSinceLastAction: 2,
      trend: "DECLINING",
      actionsPerDay7d: 1,
      actionsPerDay30d: 3,
      totalContacts: 120,
      contactedContacts: 42,
      uniqueSdrCount: 1,
      hasSparseData: false,
      isNewList: false,
    });

    assert.ok(hints.some((h) => h.type === "WARNING" && h.message.includes("invalides")));
    assert.ok(hints.some((h) => h.type === "WARNING" && h.message.includes("Cadence en baisse")));
  });
});

describe("bulkHealthSql", () => {
  const now = new Date("2026-10-24T12:00:00Z");

  it("reads time from the now parameter, never from the DB clock", () => {
    const sql = bulkHealthSql(["L1"], [], now);
    assert.ok(!/NOW\(\)/i.test(sql.text));
    const dates = sql.values.filter((v): v is Date => v instanceof Date).map((d) => d.toISOString());
    assert.ok(dates.includes("2026-10-17T12:00:00.000Z"), "7-day cutoff");
    assert.ok(dates.includes("2026-09-24T12:00:00.000Z"), "30-day cutoff");
  });

  it("drives the scan from list members through the contactId / companyId joins", () => {
    const { text } = bulkHealthSql(["L1"], [], now);
    assert.match(text, /INNER JOIN "Action" a ON a."contactId" = lc.id/);
    assert.match(text, /INNER JOIN "Action" a ON a."companyId" = co.id AND a."contactId" IS NULL/);
    assert.ok(!/ OR a."companyId"/.test(text), "no OR across both columns (defeats the indexes)");
  });

  it("counts new contacts on their first action, not on any action in the window", () => {
    const { text } = bulkHealthSql(["L1"], [], now);
    assert.match(text, /MIN\("createdAt"\)\s+AS first_at/);
    assert.match(text, /is_contact AND first_at >= \$\d+\)\s+AS new_contacts_7d/);
  });

  it("binds list and SDR ids as parameters, and only filters SDRs when asked", () => {
    const without = bulkHealthSql(["L1", "L2"], [], now);
    assert.ok(!without.text.includes('"sdrId" IN'));
    const withSdr = bulkHealthSql(["L1"], ["u1'; DROP TABLE x;--"], now);
    assert.equal((withSdr.text.match(/a."sdrId" IN/g) ?? []).length, 2, "both member branches");
    assert.ok(!withSdr.text.includes("DROP TABLE"));
    assert.ok(withSdr.values.includes("u1'; DROP TABLE x;--"));
  });
});
