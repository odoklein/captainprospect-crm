import { test } from "node:test";
import assert from "node:assert/strict";
import { notifyFindingEvents, runLink, selectToNotify } from "./notify";
import type { ClaimedRun, FindingEvents, FindingRow } from "./types";

const now = new Date("2026-10-29T10:00:00.000Z");

function finding(id: string, severity: FindingRow["severity"]): FindingRow {
    return { id, rule: "r", dedupeKey: `r:agency:${id}`, severity, kind: "k", title: `Titre ${id}`, body: `Corps ${id}`, metrics: null, clientId: null, missionId: null, subjectUserId: null, state: "OPEN", firstSeenAt: now, lastSeenAt: now, seenCount: 1, snoozedUntil: null, notifiedAt: null };
}

const run = { id: "run1" } as ClaimedRun;

function events(created: FindingRow[], escalated: FindingRow[] = [], reopened: FindingRow[] = []): FindingEvents<FindingRow> {
    return { created, escalated, reopened, resolved: [] };
}

test("CRITICAL only by default; everything with notify: immediate; nothing in a dry run", () => {
    const ev = events([finding("a", "WARN"), finding("b", "CRITICAL")], [finding("c", "CRITICAL")], [finding("d", "INFO")]);
    assert.deepEqual(selectToNotify(ev, {}).map((f) => f.id), ["b", "c"]);
    assert.deepEqual(selectToNotify(ev, { notify: "digest" }).map((f) => f.id), ["b", "c"]);
    assert.deepEqual(selectToNotify(ev, { notify: "immediate" }).map((f) => f.id), ["a", "b", "c", "d"]);
    assert.deepEqual(selectToNotify(ev, { notify: "immediate", dryRun: true }), []);
});

test("one notification per finding with the run link, findings marked notified", async () => {
    const sent: Array<{ title: string; type?: string; link?: string }> = [];
    const marked: string[][] = [];
    const res = await notifyFindingEvents(
        { run, jobName: "Veille", events: events([finding("a", "CRITICAL"), finding("b", "WARN")]), config: { notify: "immediate" }, now },
        { notifyAllManagers: async (p) => void sent.push(p), markNotified: async (ids) => void marked.push(ids) },
    );
    assert.equal(res.notified, 2);
    assert.equal(res.collapsed, false);
    assert.deepEqual(sent.map((s) => s.title), ["[Agent] Titre a", "[Agent] Titre b"]);
    assert.deepEqual(sent.map((s) => s.type), ["error", "warning"]);
    assert.equal(sent[0].link, runLink("run1"));
    assert.equal(sent[0].link, "/manager/assistant/agent/runs/run1");
    assert.deepEqual(marked, [["a", "b"]]);
});

test("many findings collapse into one notification", async () => {
    const sent: Array<{ title: string; message: string; type?: string }> = [];
    const list = ["a", "b", "c", "d", "e", "f"].map((id) => finding(id, id === "a" ? "CRITICAL" : "WARN"));
    const res = await notifyFindingEvents(
        { run, jobName: "Veille", events: events(list), config: { notify: "immediate" }, now },
        { notifyAllManagers: async (p) => void sent.push(p), markNotified: async () => undefined },
    );
    assert.equal(res.collapsed, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].title, "[Agent] Veille : 6 signalements");
    assert.match(sent[0].message, /^1 critique\(s\)\. Titre a · Titre b · Titre c · …$/);
    assert.equal(sent[0].type, "error");
});

test("nothing to notify sends nothing", async () => {
    let calls = 0;
    const res = await notifyFindingEvents(
        { run, jobName: "Veille", events: events([finding("a", "WARN")]), config: {}, now },
        { notifyAllManagers: async () => void (calls += 1), markNotified: async () => void (calls += 1) },
    );
    assert.deepEqual(res, { notified: 0, collapsed: false });
    assert.equal(calls, 0);
});
