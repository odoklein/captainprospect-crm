import { test } from "node:test";
import assert from "node:assert/strict";
import { collectAttention, missionAttention } from "./attention";

const NOW = Date.parse("2026-11-12T10:00:00Z");
const ready = { activeLists: 2, readyLists: 2, customStrategyLists: 0, inheritedStrategyLists: 2, missingStrategy: 0, missingIcp: 0, missingPitch: 0, missingScript: 0 };

test("a draft without lists asks for a list first", () => {
    const item = missionAttention({ id: "m", name: "Q4", status: "DRAFT", readiness: { ...ready, activeLists: 0, readyLists: 0 }, openPoints: 1, sdrCount: 2 }, NOW);
    assert.equal(item?.tab, "audience");
    assert.equal(item?.tone, "warning");
});

test("a draft with missing scripts points to the launch checklist", () => {
    const item = missionAttention({ id: "m", name: "Q4", status: "DRAFT", readiness: { ...ready, readyLists: 1, missingScript: 1 }, openPoints: 1, sdrCount: 1 }, NOW);
    assert.equal(item?.label, "1 point avant le lancement");
    assert.equal(item?.tab, "lancement");
});

test("a late draft start is urgent", () => {
    const item = missionAttention({ id: "m", name: "Q4", status: "DRAFT", startDate: "2026-11-01", readiness: { ...ready, readyLists: 1, missingPitch: 1 }, openPoints: 1, sdrCount: 1 }, NOW);
    assert.equal(item?.tone, "danger");
    assert.match(item?.detail ?? "", /dépassée/);
});

test("a complete draft is ready to launch", () => {
    const item = missionAttention({ id: "m", name: "Q4", status: "DRAFT", readiness: ready, openPoints: 0, sdrCount: 3 }, NOW);
    assert.equal(item?.label, "Prête à lancer");
    assert.equal(item?.action, "Lancer");
});

test("an active mission without SDR outranks an ending one", () => {
    const items = collectAttention([
        { id: "a", name: "Alpha", status: "ACTIVE", missions: [{ id: "1", name: "Fin", status: "ACTIVE", endDate: "2026-11-20", readiness: ready, openPoints: 0, sdrCount: 2 }] },
        { id: "b", name: "Beta", status: "ACTIVE", missions: [{ id: "2", name: "Vide", status: "ACTIVE", readiness: ready, openPoints: 0, sdrCount: 0 }] },
    ], NOW);
    assert.deepEqual(items.map((item) => item.mission.id), ["2", "1"]);
    assert.equal(items[1].label, "Se termine dans 8 jours");
});

test("paused clients and healthy missions stay quiet", () => {
    const items = collectAttention([
        { id: "a", name: "Alpha", status: "PAUSED", missions: [{ id: "1", name: "X", status: "DRAFT", readiness: ready, openPoints: 0, sdrCount: 0 }] },
        { id: "b", name: "Beta", status: "ACTIVE", missions: [{ id: "2", name: "Y", status: "ACTIVE", endDate: "2027-03-01", readiness: ready, openPoints: 0, sdrCount: 2 }] },
    ], NOW);
    assert.equal(items.length, 0);
});
