import { test } from "node:test";
import assert from "node:assert/strict";
import { bucketOf, endOfWeek, groupByDue, groupByEntity } from "./grouping";
import type { WorkItem } from "./feed-types";

const item = (over: Partial<WorkItem>): WorkItem => ({
    id: over.id ?? "task:x",
    kind: "task",
    source: "MANUAL",
    title: "Tâche",
    dueDay: null,
    priority: "MEDIUM",
    done: false,
    owner: null,
    ownerLabel: null,
    client: null,
    project: null,
    context: null,
    href: null,
    taskId: null,
    ...over,
});

// 2026-10-28 is a Wednesday.
const today = "2026-10-28";

test("the week ends on Sunday, and on Sunday it is that same day", () => {
    assert.equal(endOfWeek("2026-10-28"), "2026-11-01");
    assert.equal(endOfWeek("2026-11-01"), "2026-11-01");
    assert.equal(endOfWeek("2026-11-02"), "2026-11-08");
});

test("due days fall in late / today / week / later / none", () => {
    assert.equal(bucketOf("2026-10-27", today), "late");
    assert.equal(bucketOf("2026-10-28", today), "today");
    assert.equal(bucketOf("2026-11-01", today), "week");
    assert.equal(bucketOf("2026-11-02", today), "later");
    assert.equal(bucketOf(null, today), "none");
});

test("groups come in reading order, oldest first then by priority", () => {
    const groups = groupByDue(
        [
            item({ id: "a", dueDay: null }),
            item({ id: "b", dueDay: "2026-10-28", priority: "LOW" }),
            item({ id: "c", dueDay: "2026-10-20" }),
            item({ id: "d", dueDay: "2026-10-28", priority: "URGENT" }),
            item({ id: "e", dueDay: "2026-10-25" }),
        ],
        today,
    );
    assert.deepEqual(groups.map((g) => g.bucket), ["late", "today", "none"]);
    assert.deepEqual(groups[0].items.map((i) => i.id), ["c", "e"]);
    assert.deepEqual(groups[1].items.map((i) => i.id), ["d", "b"]);
});

test("client groups put the busiest first and rows without a client last", () => {
    const acme = { id: "c1", name: "Acme" };
    const zeta = { id: "c2", name: "Zeta" };
    const groups = groupByEntity(
        [
            item({ id: "a", client: acme, dueDay: "2026-11-10" }),
            item({ id: "b", client: zeta, dueDay: "2026-10-20" }),
            item({ id: "c", client: null, dueDay: "2026-10-20" }),
        ],
        "client",
        today,
        "Sans client",
    );
    assert.deepEqual(groups.map((g) => g.label), ["Zeta", "Acme", "Sans client"]);
    assert.equal(groups[0].urgent, 1);
});
