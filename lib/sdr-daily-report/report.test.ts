/**
 * Rules of the SDR end-of-day report:
 *     npm run test:sdr-daily-report
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { dailyReportSchema } from "./schema";
import { isPastPromptTime, reportDayBounds, reportDayKey } from "./day";
import { countAnswered, emptyAnswers, toggleAnswer } from "./answers";
import { difficultReachabilityShare, topBlocker } from "./stats";
import {
    DAILY_REPORT_QUESTIONS,
    MAIN_BLOCKER_LABELS,
    MAIN_BLOCKER_VALUES,
    PITCH_FEELING_LABELS,
    PITCH_FEELING_VALUES,
    PROSPECT_RETURN_LABELS,
    PROSPECT_RETURN_VALUES,
    REACHABILITY_LABELS,
    REACHABILITY_VALUES,
    labelOf,
} from "./options";

const valid = {
    reachability: ["NRP", "SWITCHBOARD"],
    prospectReturns: ["NO_NEED"],
    pitchFeeling: ["HOOK_HARD"],
    mainBlocker: "REACHABILITY",
};

// ============================================
// Validation
// ============================================

test("accepts a complete report; comment and missions are optional", () => {
    const parsed = dailyReportSchema.parse(valid);
    assert.deepEqual(parsed.reachability, ["NRP", "SWITCHBOARD"]);
    assert.equal(parsed.fieldComment, null);
    assert.deepEqual(parsed.missionIds, []);
});

test("each of the first three questions needs at least one answer", () => {
    for (const key of ["reachability", "prospectReturns", "pitchFeeling"] as const) {
        const result = dailyReportSchema.safeParse({ ...valid, [key]: [] });
        assert.equal(result.success, false, `${key} must not be empty`);
    }
});

test("the main blocker is required and single-valued", () => {
    assert.equal(dailyReportSchema.safeParse({ ...valid, mainBlocker: undefined }).success, false);
    assert.equal(dailyReportSchema.safeParse({ ...valid, mainBlocker: ["NONE", "TARGETING"] }).success, false);
    assert.equal(dailyReportSchema.safeParse({ ...valid, mainBlocker: "NONE" }).success, true);
});

test("rejects codes outside the form", () => {
    assert.equal(dailyReportSchema.safeParse({ ...valid, reachability: ["NRP", "TELEPATHY"] }).success, false);
    assert.equal(dailyReportSchema.safeParse({ ...valid, mainBlocker: "WEATHER" }).success, false);
});

test("duplicate answers collapse", () => {
    const parsed = dailyReportSchema.parse({ ...valid, reachability: ["NRP", "NRP", "VOICEMAIL"] });
    assert.deepEqual(parsed.reachability, ["NRP", "VOICEMAIL"]);
});

test("'bonne joignabilité' cannot be combined with a difficulty, but can stand alone", () => {
    assert.equal(dailyReportSchema.safeParse({ ...valid, reachability: ["GOOD", "NRP"] }).success, false);
    assert.equal(dailyReportSchema.safeParse({ ...valid, reachability: ["GOOD"] }).success, true);
});

test("a blank comment is stored as null, a real one is trimmed", () => {
    assert.equal(dailyReportSchema.parse({ ...valid, fieldComment: "   " }).fieldComment, null);
    assert.equal(dailyReportSchema.parse({ ...valid, fieldComment: "" }).fieldComment, null);
    assert.equal(dailyReportSchema.parse({ ...valid, fieldComment: null }).fieldComment, null);
    assert.equal(
        dailyReportSchema.parse({ ...valid, fieldComment: "  Déjà sous contrat jusqu’à fin d’année  " }).fieldComment,
        "Déjà sous contrat jusqu’à fin d’année",
    );
});

test("the comment is capped at 500 characters", () => {
    assert.equal(dailyReportSchema.safeParse({ ...valid, fieldComment: "a".repeat(500) }).success, true);
    assert.equal(dailyReportSchema.safeParse({ ...valid, fieldComment: "a".repeat(501) }).success, false);
});

// ============================================
// Form definition
// ============================================

test("every stored code has a French label, and the form lists exactly the codes", () => {
    const groups = [
        [REACHABILITY_VALUES, REACHABILITY_LABELS],
        [PROSPECT_RETURN_VALUES, PROSPECT_RETURN_LABELS],
        [PITCH_FEELING_VALUES, PITCH_FEELING_LABELS],
        [MAIN_BLOCKER_VALUES, MAIN_BLOCKER_LABELS],
    ] as const;
    const formByKey = new Map(DAILY_REPORT_QUESTIONS.map((q) => [q.key, q]));
    const keys = ["reachability", "prospectReturns", "pitchFeeling", "mainBlocker"] as const;

    groups.forEach(([values, labels], index) => {
        const question = formByKey.get(keys[index]);
        assert.ok(question, `${keys[index]} is in the form`);
        assert.deepEqual(
            question.options.map((o) => o.value),
            [...values],
        );
        for (const value of values) {
            assert.ok((labels as Record<string, string>)[value]?.length, `${value} has a label`);
        }
    });
    assert.equal(DAILY_REPORT_QUESTIONS.find((q) => q.key === "mainBlocker")?.mode, "single");
});

test("a retired code still renders instead of disappearing", () => {
    assert.equal(labelOf(MAIN_BLOCKER_LABELS, "TARGETING"), "Ciblage");
    assert.equal(labelOf(MAIN_BLOCKER_LABELS, "OLD_CODE"), "OLD_CODE");
});

// ============================================
// Report day (Europe/Paris)
// ============================================

test("the report day follows Paris, not UTC", () => {
    // 23:30 UTC on 30 Sept is already 01:30 on 1 Oct in Paris (CEST, UTC+2).
    assert.equal(reportDayKey(new Date("2026-09-30T23:30:00Z")), "2026-10-01");
    assert.equal(reportDayKey(new Date("2026-10-01T10:00:00Z")), "2026-10-01");
    // Winter time (CET, UTC+1): 23:30 UTC on 15 Jan is 00:30 on 16 Jan.
    assert.equal(reportDayKey(new Date("2027-01-15T23:30:00Z")), "2027-01-16");
});

test("day bounds are a 24h window around the Paris day, DST-aware", () => {
    const { start, end } = reportDayBounds(new Date("2026-10-01T10:00:00Z"));
    assert.equal(start.toISOString(), "2026-09-30T22:00:00.000Z");
    assert.equal(end.toISOString(), "2026-10-01T22:00:00.000Z");

    // 25 October 2026 is the day clocks go back: that Paris day lasts 25 hours.
    const dst = reportDayBounds(new Date("2026-10-25T12:00:00Z"));
    assert.equal((dst.end.getTime() - dst.start.getTime()) / 3_600_000, 25);
});

// ============================================
// Aggregates for the manager views
// ============================================

test("top blocker ignores empty answers and \"no blocker\"", () => {
    assert.equal(topBlocker([]), null);
    assert.equal(topBlocker([{ mainBlocker: "NONE" }, { mainBlocker: null }, {}]), null);
    assert.deepEqual(
        topBlocker([
            { mainBlocker: "TARGETING" },
            { mainBlocker: "REACHABILITY" },
            { mainBlocker: "TARGETING" },
            { mainBlocker: "NONE" },
            { mainBlocker: "NONE" },
            { mainBlocker: "NONE" },
        ]),
        { code: "TARGETING", count: 2 },
    );
});

test("reachability difficulty share only counts reports that answered", () => {
    assert.equal(difficultReachabilityShare([]), null);
    // legacy rows have no reachability answer: they are neither difficult nor good
    assert.equal(difficultReachabilityShare([{ reachability: [] }, {}]), null);
    assert.equal(
        difficultReachabilityShare([
            { reachability: ["NRP"] },
            { reachability: ["GOOD"] },
            { reachability: ["SWITCHBOARD", "LANDLINES"] },
            { reachability: ["GOOD"] },
            {},
        ]),
        50,
    );
});

// ============================================
// Form behaviour
// ============================================

test("multi-choice questions toggle on and off", () => {
    let a = emptyAnswers();
    a = toggleAnswer(a, "prospectReturns", "NO_NEED");
    a = toggleAnswer(a, "prospectReturns", "NOT_INTERESTED");
    assert.deepEqual(a.prospectReturns, ["NO_NEED", "NOT_INTERESTED"]);
    a = toggleAnswer(a, "prospectReturns", "NO_NEED");
    assert.deepEqual(a.prospectReturns, ["NOT_INTERESTED"]);
});

test("the main blocker is a radio: choosing replaces, never accumulates", () => {
    let a = emptyAnswers();
    a = toggleAnswer(a, "mainBlocker", "TARGETING");
    a = toggleAnswer(a, "mainBlocker", "PITCH_OFFER");
    assert.equal(a.mainBlocker, "PITCH_OFFER");
    // clicking the selected one again keeps it selected (a radio can't be unticked)
    a = toggleAnswer(a, "mainBlocker", "PITCH_OFFER");
    assert.equal(a.mainBlocker, "PITCH_OFFER");
});

test("'bonne joignabilité' and the difficulties push each other out", () => {
    let a = emptyAnswers();
    a = toggleAnswer(a, "reachability", "NRP");
    a = toggleAnswer(a, "reachability", "SWITCHBOARD");
    assert.deepEqual(a.reachability, ["NRP", "SWITCHBOARD"]);

    a = toggleAnswer(a, "reachability", "GOOD");
    assert.deepEqual(a.reachability, ["GOOD"]);

    a = toggleAnswer(a, "reachability", "VOICEMAIL");
    assert.deepEqual(a.reachability, ["VOICEMAIL"]);
});

test("whatever the form can produce passes the server schema", () => {
    let a = emptyAnswers();
    for (const [key, value] of [
        ["reachability", "GOOD"],
        ["reachability", "NRP"],
        ["reachability", "LANDLINES"],
        ["prospectReturns", "GOOD_INTEREST"],
        ["pitchFeeling", "PITCH_WORKS"],
        ["pitchFeeling", "OBJECTIONS_HARD"],
        ["mainBlocker", "NONE"],
    ] as const) {
        a = toggleAnswer(a, key, value);
    }
    const result = dailyReportSchema.safeParse({ ...a, fieldComment: a.fieldComment || null });
    assert.equal(result.success, true);
});

test("the form is complete only when all four questions are answered", () => {
    let a = emptyAnswers();
    assert.deepEqual(countAnswered(a), { answered: 0, total: 4 });
    a = toggleAnswer(a, "reachability", "NRP");
    a = toggleAnswer(a, "prospectReturns", "NO_NEED");
    a = toggleAnswer(a, "pitchFeeling", "HOOK_HARD");
    assert.deepEqual(countAnswered(a), { answered: 3, total: 4 });
    a = toggleAnswer(a, "mainBlocker", "REACHABILITY");
    assert.deepEqual(countAnswered(a), { answered: 4, total: 4 });
    // unticking the only answer of a question makes the form incomplete again
    a = toggleAnswer(a, "pitchFeeling", "HOOK_HARD");
    assert.deepEqual(countAnswered(a), { answered: 3, total: 4 });
});

// ============================================
// Prompt time
// ============================================

test("the report is owed from the prompt time on, to the minute", () => {
    const at = (h: number, m: number) => new Date(2026, 9, 1, h, m, 0);
    assert.equal(isPastPromptTime(at(15, 44), "15:45"), false);
    assert.equal(isPastPromptTime(at(15, 45), "15:45"), true);
    assert.equal(isPastPromptTime(at(17, 0), "15:45"), true);
    assert.equal(isPastPromptTime(at(9, 0), "15:45"), false);
    assert.equal(isPastPromptTime(at(17, 29), "17:30"), false);
});

test("a malformed prompt time falls back to 15:45 instead of never firing", () => {
    const at = (h: number, m: number) => new Date(2026, 9, 1, h, m, 0);
    assert.equal(isPastPromptTime(at(16, 0), "n'importe quoi"), true);
    assert.equal(isPastPromptTime(at(10, 0), ""), false);
});
