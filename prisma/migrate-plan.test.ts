/**
 * Rules of prisma/migrate-instance.ts:
 *     npm run test:migrate-plan
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { planMigration } from "./migrate-plan";

const all = ["20250101_a", "20250202_b", "20250303_c"];
const state = (over: Partial<Parameters<typeof planMigration>[0]> = {}) => ({ hasUser: false, hasHistory: false, applied: new Set<string>(), all, ...over });

test("empty database: record the newest, push the schema, record the rest newest first", () => {
    assert.deepEqual(planMigration(state()), { action: "baseline", recordFirst: "20250303_c", push: true, record: ["20250202_b", "20250101_a"] });
});

test("tables without history (a database kept by hand) are refused, never touched", () => {
    const p = planMigration(state({ hasUser: true }));
    assert.equal(p.action, "refuse");
    if (p.action === "refuse") assert.match(p.reason, /managed by hand/);
});

test("a baselined database just deploys what is new", () => {
    assert.deepEqual(planMigration(state({ hasUser: true, hasHistory: true, applied: new Set(all) })), { action: "deploy" });
    // an older image's database with one migration still to come
    assert.deepEqual(planMigration(state({ hasUser: true, hasHistory: true, applied: new Set(all.slice(0, 2)) })), { action: "deploy" });
});

test("an interrupted baseline resumes, wherever it stopped", () => {
    // stopped after recording the newest (history exists, no schema yet)
    assert.deepEqual(planMigration(state({ hasHistory: true, applied: new Set(["20250303_c"]) })), { action: "baseline", recordFirst: null, push: true, record: ["20250202_b", "20250101_a"] });
    // stopped after the push, some recorded, the oldest not yet
    assert.deepEqual(planMigration(state({ hasUser: true, hasHistory: true, applied: new Set(["20250303_c", "20250202_b"]) })), { action: "baseline", recordFirst: null, push: false, record: ["20250101_a"] });
});

test("no migrations in the image: nothing to record, still builds the schema", () => {
    assert.deepEqual(planMigration(state({ all: [] })), { action: "baseline", recordFirst: null, push: true, record: [] });
});
