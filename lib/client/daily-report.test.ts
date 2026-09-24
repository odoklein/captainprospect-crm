import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHighlights, buildRuleInsight, parseDailyReportQuery } from "./daily-report";
import type { DailyReport } from "./daily-report-types";

const q = (s: string) => parseDailyReportQuery(new URLSearchParams(s));

test("query: accepts a past local day with a browser offset", () => {
    assert.deepEqual(q("day=2026-09-24&today=2026-09-25&tz=-120"), { day: "2026-09-24", today: "2026-09-25", tz: -120 });
    // Monday reporting Friday
    assert.ok(q("day=2026-09-18&today=2026-09-21&tz=-120"));
});

test("query: rejects today/future days, huge lookbacks and bad offsets", () => {
    assert.equal(q("day=2026-09-25&today=2026-09-25&tz=0"), null);
    assert.equal(q("day=2026-09-26&today=2026-09-25&tz=0"), null);
    assert.equal(q("day=2026-01-01&today=2026-09-25&tz=0"), null);
    assert.equal(q("day=2026-09-24&today=2026-09-25&tz=9999"), null);
    assert.equal(q("day=24/09/2026&today=2026-09-25&tz=0"), null);
});

function report(overrides: Partial<DailyReport> = {}): DailyReport {
    const zero = { calls: 0, conversations: 0, qualified: 0, meetings: 0, prospects: 0 };
    return {
        day: "2026-09-24",
        previousDay: "2026-09-23",
        totals: { calls: 120, conversations: 40, qualified: 6, meetings: 3, prospects: 90 },
        previous: { calls: 80, conversations: 25, qualified: 4, meetings: 1, prospects: 60 },
        reachRate: 33,
        sdrCount: 3,
        activeMissions: 2,
        trend: [
            { day: "2026-09-16", ...zero, calls: 90, meetings: 1 },
            { day: "2026-09-17", ...zero, calls: 95, meetings: 2 },
            { day: "2026-09-18", ...zero, calls: 70, meetings: 0 },
            { day: "2026-09-21", ...zero, calls: 100, meetings: 1 },
            { day: "2026-09-22", ...zero, calls: 110, meetings: 2 },
            { day: "2026-09-23", ...zero, calls: 80, meetings: 1 },
            { day: "2026-09-24", ...zero, calls: 120, meetings: 3 },
        ],
        outcomes: [],
        month: { meetings: 8, objective: 12, label: "septembre 2026" },
        meetingsBooked: [],
        todayMeetings: [],
        byCommercial: [],
        byMission: [],
        highlights: [],
        ...overrides,
    };
}

test("highlights: best day, activity delta, reach rate and objective come from the numbers", () => {
    const texts = buildHighlights(report()).map((h) => h.text);
    assert.ok(texts.some((t) => t.startsWith("Meilleure journée de la semaine : 3 RDV")));
    assert.ok(texts.some((t) => t.includes("hausse de 50 %")));
    assert.ok(texts.some((t) => t.includes("33 %")));
    assert.ok(texts.some((t) => t.includes("8/12 RDV (67 %)")));
});

test("highlights: no invented objective and an honest empty day", () => {
    const empty = report({
        totals: { calls: 0, conversations: 0, qualified: 0, meetings: 0, prospects: 0 },
        previous: null,
        reachRate: null,
        month: { meetings: 0, objective: null, label: "septembre 2026" },
    });
    const texts = buildHighlights(empty).map((h) => h.text);
    assert.deepEqual(texts, ["Pas d'activité d'appel enregistrée ce jour-là."]);
});

test("rule insight: headline and recommendation follow the data", () => {
    const withAgenda = buildRuleInsight(
        report({ todayMeetings: [{ id: "m1", bookedAt: "", date: null, meetingType: null, company: "X", contact: null, title: null, mission: null, commercial: null }] })
    );
    assert.equal(withAgenda.source, "rules");
    assert.equal(withAgenda.headline, "3 nouveaux RDV confirmés");
    assert.match(withAgenda.recommendation, /Préparez vos 1 RDV du jour/);

    const followUps = buildRuleInsight(report());
    assert.match(followUps.recommendation, /^3 prospects intéressés à suivre/);
});
