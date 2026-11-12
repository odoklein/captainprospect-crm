import { test } from "node:test";
import assert from "node:assert/strict";
import { managerWorkItems, workMatchesFilter, type WorkFilter } from "./manager-work";
import type { AgentRunCard, AgentFindingItem } from "@/lib/assistant/api-contract";
const run = (id: string, status: AgentRunCard["status"], folderId = "a") => ({ id, status, folderId, goal: id, jobName: null, clientName: "Client" } as AgentRunCard);
const finding = (id: string, severity: AgentFindingItem["severity"], folderId = "a", runId: string | null = null) => ({ id, severity, folderId, runId, state: "OPEN", title: id, clientName: "Client" } as AgentFindingItem);
test("approvals and blockers precede ongoing work; completed and cancelled work are omitted", () => {
 const items = managerWorkItems([run("live", "RUNNING"), run("done", "DONE"), run("cancel", "CANCELLED"), run("approval", "WAITING_APPROVAL")], [finding("blocker", "CRITICAL")], null);
 assert.deepEqual(items.map(i => i.id), ["run:approval", "finding:blocker", "run:live"]);
});
test("a client never sees another client's cached work", () => {
 const items = managerWorkItems([run("other", "FAILED", "b"), run("mine", "QUEUED")], [finding("other-alert", "CRITICAL", "b")], "a");
 assert.deepEqual(items.map(i => i.id), ["run:mine"]);
});
test("overlapping pages and signals for an already displayed run do not duplicate priorities", () => {
 const items = managerWorkItems([run("same", "WAITING_APPROVAL"), run("same", "WAITING_APPROVAL")], [finding("same-alert", "WARN", "a", "same"), { ...finding("resolved", "CRITICAL"), state: "RESOLVED" }], null);
 assert.equal(items.length, 1);
});

test("an explicit approval survives an older recent-run snapshot", () => {
 const items = managerWorkItems([run("same", "WAITING_APPROVAL"), run("same", "DONE")], [], null);
 assert.equal(items[0].label, "À décider");
});
test("a critical finding stays visible even when its originating run is still running", () => {
 const items = managerWorkItems([run("live", "RUNNING")], [finding("blocker", "CRITICAL", "a", "live")], null);
 assert.equal(items[0].id, "finding:blocker");
});

test("every priority belongs to exactly one actionable filter", () => {
 const items = managerWorkItems([run("approval", "WAITING_APPROVAL"), run("failed", "FAILED"), run("later", "DEFERRED"), run("live", "RUNNING"), run("queue", "QUEUED")], [finding("review", "WARN"), finding("blocker", "CRITICAL")], null);
 const filters: WorkFilter[] = ["decisions", "blocked", "active"];
 for (const item of items) {
  assert.equal(workMatchesFilter(item, "all"), true);
  assert.equal(filters.filter(filter => workMatchesFilter(item, filter)).length, 1);
 }
 assert.deepEqual(items.filter(item => workMatchesFilter(item, "decisions")).map(item => item.id), ["run:approval", "finding:review"]);
 assert.deepEqual(items.filter(item => workMatchesFilter(item, "blocked")).map(item => item.id), ["run:failed", "finding:blocker", "run:later"]);
});
