import { test } from "node:test";
import assert from "node:assert/strict";
import {
    addDays,
    autoFromLabels,
    dayDiff,
    dayToDate,
    DEFAULT_TEMPLATE,
    instantiate,
    isDay,
    parisDayOf,
    parseTemplate,
    templateFromChecklist,
} from "./checklist-template";

test("instantiate puts due dates at J0 + offset, across month ends", () => {
    const sections = instantiate(DEFAULT_TEMPLATE, "2026-10-28");
    const contract = sections[0];
    assert.equal(contract.title, "Contractualisation");
    assert.equal(contract.steps[0].dueDay, "2026-10-28");
    assert.equal(contract.steps[1].dueDay, "2026-10-31");
    assert.equal(contract.steps[3].dueDay, "2026-11-07");
    assert.ok(contract.steps[2].labels.includes("onboarding:auto:setup-invoiced"));
    assert.ok(contract.labels.includes("onboarding:section:contractualisation"));
    const launch = sections.at(-1)!;
    assert.equal(launch.steps.at(-1)!.dueDay, "2026-11-11");
});

test("an invalid saved template falls back to the default", () => {
    assert.equal(parseTemplate(null), DEFAULT_TEMPLATE);
    assert.equal(parseTemplate("not json"), DEFAULT_TEMPLATE);
    assert.equal(parseTemplate(JSON.stringify({ version: 2, sections: [] })), DEFAULT_TEMPLATE);
    assert.equal(parseTemplate(JSON.stringify({ version: 1, sections: [] })), DEFAULT_TEMPLATE);
});

test("a saved template is cleaned: missing keys slugged, bad offsets dropped", () => {
    const t = parseTemplate(
        JSON.stringify({
            version: 1,
            sections: [{ title: " Démarrage ", steps: [{ title: "Kick-off été", offsetDays: 2.6 }, { title: "Sans date", offsetDays: "x" }, { title: "" }] }],
        }),
    );
    assert.equal(t.sections[0].key, "demarrage");
    assert.equal(t.sections[0].title, "Démarrage");
    assert.deepEqual(
        t.sections[0].steps.map((s) => [s.key, s.offsetDays]),
        [
            ["kick-off-ete", 3],
            ["sans-date", null],
        ],
    );
});

test("templateFromChecklist round-trips offsets, custom steps and auto markers", () => {
    const sections = instantiate(DEFAULT_TEMPLATE, "2026-11-02");
    const rows = sections.map((s) => ({
        title: s.title,
        labels: s.labels,
        steps: [
            ...s.steps.map((st) => ({ title: st.title, labels: st.labels, startDay: st.startDay, dueDay: st.dueDay })),
        ],
    }));
    rows[1].steps.push({ title: "Étape ajoutée", labels: ["onboarding"], startDay: "2026-11-02", dueDay: null });

    const back = templateFromChecklist(rows);
    assert.deepEqual(back.sections[0].steps.map((s) => s.offsetDays), [0, 3, 3, 10]);
    assert.equal(back.sections[0].steps[3].auto, "setup-paid");
    assert.deepEqual(back.sections[1].steps.at(-1), { key: "etape-ajoutee", title: "Étape ajoutée", offsetDays: null });
    assert.deepEqual(instantiate(back, "2026-11-02")[3].steps.map((s) => s.dueDay), instantiate(DEFAULT_TEMPLATE, "2026-11-02")[3].steps.map((s) => s.dueDay));
});

test("day helpers", () => {
    assert.equal(addDays("2028-02-28", 1), "2028-02-29");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2026-03-02", -3), "2026-02-27");
    assert.equal(dayDiff("2026-10-25", "2026-11-01"), 7);
    assert.ok(isDay("2028-02-29"));
    assert.ok(!isDay("2026-02-29"));
    assert.ok(!isDay("2026-1-01"));
    // Paris is UTC+1 in winter: 22:30 UTC on 31 Dec is still 31 Dec, 23:30 UTC is 1 Jan
    assert.equal(parisDayOf(new Date("2026-12-31T22:30:00Z")), "2026-12-31");
    assert.equal(parisDayOf(new Date("2026-12-31T23:30:00Z")), "2027-01-01");
    assert.equal(parisDayOf(new Date("2026-07-14T21:30:00Z")), "2026-07-14");
    assert.equal(parisDayOf(dayToDate("2026-03-29")), "2026-03-29");
    assert.equal(autoFromLabels(["onboarding", "onboarding:auto:first-call"]), "first-call");
    assert.equal(autoFromLabels(["onboarding"]), null);
});
