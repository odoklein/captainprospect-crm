/**
 * « Tâches du jour » rules:
 *     npm run test:manager-home
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { addDay, capTasks, overdueDays, parisDay, parisMidnight, sortTodayTasks } from "./today-rules";

test("parisDay: 23:30 UTC on 31 Dec is already the next Paris day; summer time too", () => {
    assert.equal(parisDay(new Date("2026-12-31T23:30:00Z")), "2027-01-01");
    assert.equal(parisDay(new Date("2026-12-31T22:30:00Z")), "2026-12-31");
    assert.equal(parisDay(new Date("2026-07-14T22:30:00Z")), "2026-07-15");
});

test("parisMidnight follows the offset in winter, summer and across the DST switch", () => {
    assert.equal(parisMidnight("2026-01-15").toISOString(), "2026-01-14T23:00:00.000Z");
    assert.equal(parisMidnight("2026-07-15").toISOString(), "2026-07-14T22:00:00.000Z");
    assert.equal(parisMidnight("2026-03-29").toISOString(), "2026-03-28T23:00:00.000Z");
    assert.equal(parisMidnight("2026-03-30").toISOString(), "2026-03-29T22:00:00.000Z");
    assert.equal(parisMidnight("2026-10-25").toISOString(), "2026-10-24T22:00:00.000Z");
    assert.equal(parisMidnight("2026-10-26").toISOString(), "2026-10-25T23:00:00.000Z");
});

test("overdue tasks come first (oldest first), then today's by priority, capped", () => {
    const today = "2026-10-24";
    const sorted = sortTodayTasks(
        [
            { id: "t-low", dueDay: today, priority: "LOW" },
            { id: "late-2", dueDay: "2026-10-22", priority: "LOW" },
            { id: "t-urgent", dueDay: today, priority: "URGENT" },
            { id: "late-5", dueDay: "2026-10-19", priority: "MEDIUM" },
        ],
        today,
    );
    assert.deepEqual(
        sorted.map((t) => t.id),
        ["late-5", "late-2", "t-urgent", "t-low"],
    );
    assert.equal(overdueDays("2026-10-19", today), 5);
    assert.equal(overdueDays(today, today), 0);

    const { shown, more } = capTasks(Array.from({ length: 11 }, (_, i) => i), 8);
    assert.equal(shown.length, 8);
    assert.equal(more, 3);
    assert.equal(addDay("2026-12-31", 1), "2027-01-01");
});
