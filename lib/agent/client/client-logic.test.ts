/**
 * Pure logic of the Captain Agent screens.
 *     npx tsx --test lib/agent/client/client-logic.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentFindingItem } from "@/lib/assistant/api-contract";
import {
    asList,
    budgetPercent,
    clampIndex,
    dayLabel,
    expiryLabel,
    groupByDay,
    extractRunId,
    filterFindings,
    formatClock,
    formatDuration,
    formatEur,
    futureLabel,
    groupFindings,
    groupOptions,
    conversationHref,
    countUpAt,
    relativeTime,
    runDurationMs,
    runHeadline,
    runTitle,
    snoozeToDay,
    sortFindings,
    timeOptions,
    workerStatusInfo,
} from "./format";
import { buildCron, describeCron, describePreset, parseCronToPreset, validateCron, DEFAULT_PRESET } from "./schedule";
import { buildConfigFields, initialDraft, readDraft, schemaEnum, schemaHas, sliderSpec } from "./config-form";

// ── format ───────────────────────────────────────────────────────────────

test("formatDuration covers seconds, minutes and hours", () => {
    assert.equal(formatDuration(null), "—");
    assert.equal(formatDuration(950), "0 s");
    assert.equal(formatDuration(42_000), "42 s");
    assert.equal(formatDuration(180_000), "3 min");
    assert.equal(formatDuration(185_000), "3 min 05");
    assert.equal(formatDuration(3_720_000), "1 h 02");
});

test("formatClock is a stopwatch", () => {
    assert.equal(formatClock(7_000), "0:07");
    assert.equal(formatClock(272_000), "4:32");
    assert.equal(formatClock(3_729_000), "1:02:09");
    assert.equal(formatClock(-5), "0:00");
});

test("runDurationMs uses now while running", () => {
    const now = new Date("2026-10-29T10:00:30Z");
    assert.equal(runDurationMs({ startedAt: null, finishedAt: null }, now), null);
    assert.equal(runDurationMs({ startedAt: "2026-10-29T10:00:00Z", finishedAt: null }, now), 30_000);
    assert.equal(runDurationMs({ startedAt: "2026-10-29T10:00:00Z", finishedAt: "2026-10-29T10:00:10Z" }, now), 10_000);
});

test("formatEur", () => {
    assert.equal(formatEur(0), "0 €");
    assert.equal(formatEur(0.004), "< 0,01 €");
    assert.match(formatEur(0.123), /^0,12\s€$/);
    assert.match(formatEur(12.5), /^12,50\s€$/);
});

test("expiryLabel and futureLabel", () => {
    const now = new Date(2026, 9, 29, 10, 0, 0);
    assert.deepEqual(expiryLabel(new Date(2026, 9, 29, 9, 0).toISOString(), now), { label: "expirée", urgent: true, expired: true });
    assert.equal(expiryLabel(new Date(2026, 9, 29, 10, 12).toISOString(), now).label, "expire dans 12 min");
    assert.equal(expiryLabel(new Date(2026, 9, 29, 13, 0).toISOString(), now).label, "expire dans 3 h");
    assert.equal(expiryLabel(new Date(2026, 10, 2, 10, 0).toISOString(), now).label, "expire dans 4 j");
    assert.equal(futureLabel(new Date(2026, 9, 29, 10, 4).toISOString(), now), "dans 4 min");
    assert.equal(futureLabel(new Date(2026, 9, 29, 18, 0).toISOString(), now), "aujourd’hui à 18:00");
    assert.equal(futureLabel(new Date(2026, 9, 30, 8, 0).toISOString(), now), "demain à 08:00");
    assert.equal(futureLabel(new Date(2026, 10, 2, 8, 0).toISOString(), now), "lun. 08:00");
    assert.equal(futureLabel(null, now), "—");
});

test("dayLabel and groupByDay", () => {
    const now = new Date(2026, 9, 29, 10, 0);
    assert.equal(dayLabel(new Date(2026, 9, 29, 1, 0).toISOString(), now), "Aujourd’hui");
    assert.equal(dayLabel(new Date(2026, 9, 28, 23, 0).toISOString(), now), "Hier");
    assert.match(dayLabel(new Date(2026, 9, 26, 9, 0).toISOString(), now), /^Lundi 26 oct/);
    const items = [new Date(2026, 9, 29, 9).toISOString(), new Date(2026, 9, 29, 8).toISOString(), new Date(2026, 9, 28, 8).toISOString()];
    assert.deepEqual(
        groupByDay(items, (s) => s, now).map((g) => [g.label, g.items.length]),
        [["Aujourd’hui", 2], ["Hier", 1]],
    );
});

function finding(p: Partial<AgentFindingItem> & { id: string }): AgentFindingItem {
    return {
        rule: "r",
        severity: "INFO",
        kind: "k",
        title: p.id,
        body: "",
        metrics: null,
        folderId: null,
        clientId: null,
        clientName: null,
        subjectUserId: null,
        subjectName: null,
        state: "OPEN",
        firstSeenAt: "2026-10-01T00:00:00Z",
        lastSeenAt: "2026-10-01T00:00:00Z",
        seenCount: 1,
        snoozedUntil: null,
        runId: null,
        ...p,
    };
}

const FINDINGS = [
    finding({ id: "a1", clientId: "A", clientName: "Acme", folderId: "fA", severity: "INFO", lastSeenAt: "2026-10-03T00:00:00Z" }),
    finding({ id: "a2", clientId: "A", clientName: "Acme", severity: "WARN", lastSeenAt: "2026-10-01T00:00:00Z" }),
    finding({ id: "b1", clientId: "B", clientName: "Beta", severity: "CRITICAL" }),
    finding({ id: "g1", severity: "WARN", lastSeenAt: "2026-10-05T00:00:00Z" }),
    finding({ id: "g2", severity: "WARN", lastSeenAt: "2026-10-06T00:00:00Z" }),
];

test("sortFindings: severity first, then most recent", () => {
    assert.deepEqual(sortFindings(FINDINGS).map((f) => f.id), ["b1", "g2", "g1", "a2", "a1"]);
});

test("groupFindings orders groups by worst finding, then size", () => {
    const groups = groupFindings(FINDINGS);
    assert.deepEqual(groups.map((g) => g.key), ["client:B", "agency", "client:A"]);
    assert.deepEqual(groups[1].items.map((f) => f.id), ["g2", "g1"]);
    assert.equal(groups[1].label, "Vue agence");
    assert.equal(groups[2].label, "Acme");
    assert.equal(groups[2].folderId, "fA");
    assert.equal(groups[2].topSeverity, "WARN");
    assert.deepEqual(groups[2].counts, { CRITICAL: 0, WARN: 1, INFO: 1 });
});

test("filterFindings and groupOptions", () => {
    assert.deepEqual(filterFindings(FINDINGS, { severity: "WARN", group: "ALL" }).map((f) => f.id), ["a2", "g1", "g2"]);
    assert.deepEqual(filterFindings(FINDINGS, { severity: "ALL", group: "client:A" }).map((f) => f.id), ["a1", "a2"]);
    assert.deepEqual(groupOptions(FINDINGS), [
        { key: "agency", label: "Vue agence" },
        { key: "client:A", label: "Acme" },
        { key: "client:B", label: "Beta" },
    ]);
});

test("clampIndex, budgetPercent, extractRunId, asList", () => {
    assert.equal(clampIndex(5, 3), 2);
    assert.equal(clampIndex(-1, 3), 0);
    assert.equal(clampIndex(0, 0), -1);
    assert.equal(budgetPercent(1.5, 3), 50);
    assert.equal(budgetPercent(9, 3), 100);
    assert.equal(budgetPercent(1, 0), null);
    assert.equal(extractRunId({ runId: "r1" }), "r1");
    assert.equal(extractRunId({ run: { id: "r2" } }), "r2");
    assert.equal(extractRunId({ id: "r3" }), "r3");
    assert.equal(extractRunId(null), null);
    assert.deepEqual(asList([1]), [1]);
    assert.deepEqual(asList({ items: [2] }), [2]);
    assert.deepEqual(asList({ jobs: [3] }, "jobs"), [3]);
    assert.deepEqual(asList("x"), []);
});

test("snoozeToDay picks 08:00 of a future day only", () => {
    const now = new Date(2026, 9, 29, 15, 0);
    assert.equal(snoozeToDay(new Date(2026, 9, 29), now), null);
    assert.equal(snoozeToDay(new Date(2026, 9, 28), now), null);
    const at = new Date(snoozeToDay(new Date(2026, 9, 30, 22, 10), now) as string);
    assert.deepEqual([at.getDate(), at.getHours(), at.getMinutes()], [30, 8, 0]);
});

test("relativeTime", () => {
    const now = new Date(2026, 9, 29, 12, 0);
    assert.equal(relativeTime(new Date(2026, 9, 29, 11, 59, 40).toISOString(), now), "à l’instant");
    assert.equal(relativeTime(new Date(2026, 9, 29, 11, 56).toISOString(), now), "il y a 4 min");
    assert.equal(relativeTime(new Date(2026, 9, 29, 9, 0).toISOString(), now), "il y a 3 h");
    assert.equal(relativeTime(new Date(2026, 9, 28, 9, 0).toISOString(), now), "hier");
    assert.equal(relativeTime(new Date(2026, 9, 26, 9, 0).toISOString(), now), "il y a 3 j");
});

test("timeOptions and countUpAt", () => {
    const opts = timeOptions(30);
    assert.equal(opts.length, 48);
    assert.equal(opts[0], "00:00");
    assert.equal(opts[17], "08:30");
    const withOdd = timeOptions(30, "08:05");
    assert.equal(withOdd.length, 49);
    assert.equal(withOdd[17], "08:05");
    assert.equal(withOdd[18], "08:30");
    assert.equal(timeOptions(30, "08:30").length, 48);
    assert.equal(countUpAt(0, 10, 0), 0);
    assert.equal(countUpAt(0, 10, 1), 10);
    assert.equal(countUpAt(0, 10, 0.5), 9);
    assert.equal(countUpAt(0, 1.5, 2, 2), 1.5);
    assert.equal(countUpAt(10, 4, 1), 4);
});

test("runTitle, runHeadline, conversationHref, workerStatusInfo", () => {
    assert.equal(runTitle({ jobName: "Veille", goal: "x", kind: "WATCH" }), "Veille");
    assert.equal(runTitle({ jobName: null, goal: null, kind: "MISSION" }), "Mission");
    assert.equal(runTitle({ jobName: null, goal: "a".repeat(100), kind: "MISSION" }).length, 89);
    assert.equal(runHeadline("RUNNING", "Lecture des appels"), "Lecture des appels");
    assert.equal(runHeadline("RUNNING", null), "L’agent travaille…");
    assert.equal(runHeadline("WAITING_APPROVAL"), "En attente de ta validation");
    assert.equal(conversationHref("a b"), "/manager/assistant?c=a%20b");
    const now = new Date(2026, 9, 29, 12, 0);
    assert.equal(workerStatusInfo({ mode: "worker", seenAt: null, enabled: true }, now).label, "Actif");
    assert.equal(workerStatusInfo({ mode: "lite", seenAt: null, enabled: true }, now).tone, "warning");
    const off = workerStatusInfo({ mode: "worker", seenAt: new Date(2026, 9, 29, 11, 50).toISOString(), enabled: false }, now);
    assert.equal(off.label, "Arrêté");
    assert.equal(off.live, false);
    assert.match(off.description, /il y a 10 min/);
});

// ── schedule ─────────────────────────────────────────────────────────────

test("presets build the expected cron", () => {
    assert.equal(buildCron({ ...DEFAULT_PRESET, kind: "daily", time: "08:30" }), "30 8 * * *");
    assert.equal(buildCron({ ...DEFAULT_PRESET, kind: "weekdays", time: "07:05" }), "5 7 * * 1-5");
    assert.equal(buildCron({ ...DEFAULT_PRESET, kind: "weekly", time: "09:00", weekdays: [4, 1, 1] }), "0 9 * * 1,4");
    assert.equal(buildCron({ ...DEFAULT_PRESET, kind: "weekly", time: "09:00", weekdays: [] }), null);
    assert.equal(buildCron({ ...DEFAULT_PRESET, kind: "monthly", time: "06:00", dayOfMonth: 15 }), "0 6 15 * *");
    assert.equal(buildCron({ ...DEFAULT_PRESET, kind: "monthly", time: "06:00", dayOfMonth: 31 }), null);
    assert.equal(buildCron({ ...DEFAULT_PRESET, kind: "hourly", everyHours: 2, minute: 15 }), "15 */2 * * *");
    assert.equal(buildCron({ ...DEFAULT_PRESET, kind: "hourly", everyHours: 1, minute: 0 }), "0 * * * *");
    assert.equal(buildCron({ ...DEFAULT_PRESET, kind: "daily", time: "25:00" }), null);
    assert.equal(buildCron({ ...DEFAULT_PRESET, kind: "custom", cron: "  0  8 * * 1 " }), "0 8 * * 1");
    assert.equal(buildCron({ ...DEFAULT_PRESET, kind: "custom", cron: "nope" }), null);
});

test("cron reads back into the friendliest preset (round trip)", () => {
    for (const cron of ["30 8 * * *", "5 7 * * 1-5", "0 9 * * 1,4", "0 6 15 * *", "15 */2 * * *", "0 * * * *"]) {
        assert.equal(buildCron(parseCronToPreset(cron)), cron, cron);
    }
    assert.equal(parseCronToPreset("0 8 * * 1,2,3,4,5").kind, "weekdays");
    assert.equal(parseCronToPreset("0 8 * * 0-6").kind, "daily");
    assert.equal(parseCronToPreset("0 8 * * 7").weekdays[0], 0);
    assert.equal(parseCronToPreset("0 8 1 1 *").kind, "custom");
    assert.equal(parseCronToPreset("*/5 * * * *").kind, "custom");
    assert.equal(parseCronToPreset("0 8 * * 1-5/2").kind, "custom");
    assert.equal(parseCronToPreset("0 */5 * * *").kind, "custom");
    assert.equal(parseCronToPreset(null).kind, "custom");
});

test("French descriptions", () => {
    assert.equal(describeCron("30 8 * * *"), "Tous les jours à 08:30");
    assert.equal(describeCron("0 8 * * 1-5"), "Jours ouvrés à 08:00");
    assert.equal(describeCron("0 8 * * 1"), "Chaque lundi à 08:00");
    assert.equal(describeCron("0 8 * * 1,3,5"), "Chaque lundi, mercredi et vendredi à 08:00");
    assert.equal(describeCron("0 8 * * 0,6"), "Chaque samedi et dimanche à 08:00");
    assert.equal(describeCron("0 8 1 * *"), "Le 1er de chaque mois à 08:00");
    assert.equal(describeCron("0 */2 * * *"), "Toutes les 2 heures");
    assert.equal(describeCron("*/5 * * * *"), "Cron personnalisé : */5 * * * *");
    assert.equal(describePreset({ ...DEFAULT_PRESET, kind: "hourly", everyHours: 1, minute: 30 }), "Toutes les heures, à la minute 30");
    assert.equal(describeCron(null), "Aucune planification");
});

test("validateCron", () => {
    assert.equal(validateCron("*/5 * * * *"), null);
    assert.equal(validateCron("0 8 * * 1-5"), null);
    assert.equal(validateCron("0,30 8-18/2 1 1-12 0,7"), null);
    assert.match(validateCron("0 8 * *") ?? "", /5 champs/);
    assert.match(validateCron("60 8 * * *") ?? "", /minute/);
    assert.match(validateCron("0 8 * * 8") ?? "", /jour de la semaine/);
    assert.match(validateCron("0 8 0 * *") ?? "", /jour du mois/);
    assert.match(validateCron("0 8 * * mon") ?? "", /illisible/);
    assert.match(validateCron("0 8/0 * * *") ?? "", /Pas invalide/);
});

// ── config form ──────────────────────────────────────────────────────────

const SCHEMA = {
    type: "object",
    properties: {
        dryRun: { type: "boolean" },
        notify: { type: "string", enum: ["immediate", "digest"] },
        budget: { type: "object", properties: {} },
        days: { type: "integer", minimum: 1, maximum: 180 },
        ratio: { anyOf: [{ type: "number", exclusiveMinimum: 0, maximum: 1 }, { type: "null" }], description: "Part" },
        tone: { type: "string", enum: ["formel", "direct"], default: "direct" },
        label: { type: ["string", "null"], title: "Libellé" },
        loud: { type: "boolean", default: true },
        tags: { type: "array", items: { type: "string" } },
        big: { type: "integer", minimum: -9007199254740991, maximum: 9007199254740991 },
    },
    required: ["days"],
};

test("buildConfigFields maps the supported JSON Schema shapes", () => {
    const fields = buildConfigFields(SCHEMA);
    assert.deepEqual(fields.map((f) => f.key), ["days", "ratio", "tone", "label", "loud", "big"]);
    const days = fields[0];
    assert.equal(days.type, "integer");
    assert.equal(days.label, "Fenêtre d’inactivité (jours)");
    assert.equal(days.required, true);
    assert.deepEqual([days.min, days.max], [1, 180]);
    assert.equal(fields[1].type, "number");
    assert.equal(fields[1].description, "Part");
    assert.deepEqual([fields[1].min, fields[1].max], [0, 1]);
    assert.equal(fields[2].type, "enum");
    assert.deepEqual(fields[2].options.map((o) => o.value), ["formel", "direct"]);
    assert.equal(fields[3].label, "Libellé");
    assert.equal(fields[3].type, "string");
    assert.deepEqual([fields[5].min, fields[5].max], [null, null]);
    assert.deepEqual(buildConfigFields(null), []);
    assert.deepEqual(buildConfigFields({ type: "object" }), []);
});

test("initialDraft and readDraft coerce and validate", () => {
    const fields = buildConfigFields(SCHEMA);
    const draft = initialDraft(fields, { days: 14 });
    assert.equal(draft.days, "14");
    assert.equal(draft.tone, "direct");
    assert.equal(draft.loud, true);
    assert.equal(draft.label, "");

    const ok = readDraft(fields, { ...draft, ratio: "0,5" });
    assert.deepEqual(ok.errors, {});
    assert.deepEqual(ok.values, { days: 14, ratio: 0.5, tone: "direct", loud: true });

    const bad = readDraft(fields, { ...draft, days: "", ratio: "2", big: "1.5", tone: "autre" });
    assert.deepEqual(Object.keys(bad.errors).sort(), ["big", "days", "ratio", "tone"]);
    assert.equal(bad.errors.days, "Champ requis.");
    assert.equal(bad.errors.ratio, "Maximum 1.");
    assert.equal(bad.errors.big, "Nombre entier attendu.");
    assert.equal(readDraft(fields, { ...draft, days: "0" }).errors.days, "Minimum 1.");
    assert.equal(readDraft(fields, { ...draft, days: "abc" }).errors.days, "Nombre attendu.");
});

test("sliderSpec: bounded numbers only, sensible steps", () => {
    assert.deepEqual(sliderSpec({ type: "integer", min: 1, max: 180 }), { min: 1, max: 180, step: 1 });
    assert.equal(sliderSpec({ type: "integer", min: 1, max: 10_000 }), null);
    assert.equal(sliderSpec({ type: "integer", min: 1, max: null }), null);
    assert.equal(sliderSpec({ type: "string", min: 1, max: 5 }), null);
    assert.equal(sliderSpec({ type: "number", min: 2, max: 2 }), null);
    assert.deepEqual(sliderSpec({ type: "number", min: 0, max: 1 }), { min: 0, max: 1, step: 0.01 });
    assert.deepEqual(sliderSpec({ type: "number", min: 0, max: 50 }), { min: 0, max: 50, step: 0.1 });
});

test("schemaHas and schemaEnum", () => {
    assert.equal(schemaHas(SCHEMA, "dryRun"), true);
    assert.equal(schemaHas(SCHEMA, "nope"), false);
    assert.deepEqual(schemaEnum(SCHEMA, "notify"), ["immediate", "digest"]);
    assert.deepEqual(schemaEnum(SCHEMA, "days"), []);
});
