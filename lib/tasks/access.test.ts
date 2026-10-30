import { test } from "node:test";
import assert from "node:assert/strict";
import { canDeleteTask, canEditTask, canViewTask, type TaskAccessTarget } from "./access";

const sdr = { id: "u-sdr", role: "SDR" };
const dev = { id: "u-dev", role: "DEVELOPER" };
const manager = { id: "u-mgr", role: "MANAGER" };
const client = { id: "u-client", role: "CLIENT" };

const personal = (createdById: string, assigneeId: string | null = null): TaskAccessTarget => ({
    createdById,
    assigneeId,
    project: null,
});

const inProject = (members: { userId: string; role: string }[], ownerId = "u-owner"): TaskAccessTarget => ({
    createdById: "u-other",
    assigneeId: null,
    project: { ownerId, members },
});

test("a personal task belongs to its creator and assignee only", () => {
    const task = personal("u-sdr", "u-dev");
    assert.ok(canEditTask(sdr, task));
    assert.ok(canDeleteTask(sdr, task));
    assert.ok(canEditTask(dev, task));
    assert.ok(!canViewTask({ id: "u-x", role: "SDR" }, task));
});

test("managers reach every task, clients none", () => {
    const task = personal("u-sdr");
    assert.ok(canEditTask(manager, task));
    assert.ok(canDeleteTask(manager, task));
    assert.ok(!canViewTask(client, personal("u-client")));
    assert.ok(!canDeleteTask(client, personal("u-client")));
});

test("project members edit, only owner and admins delete", () => {
    const task = inProject([
        { userId: "u-sdr", role: "member" },
        { userId: "u-dev", role: "admin" },
    ]);
    assert.ok(canEditTask(sdr, task));
    assert.ok(!canDeleteTask(sdr, task));
    assert.ok(canDeleteTask(dev, task));
    assert.ok(canDeleteTask({ id: "u-owner", role: "SDR" }, task));
});

test("a session to-do addressed to a role is editable by that role, not deletable", () => {
    const forSdrs: TaskAccessTarget = { ...personal("u-mgr"), audienceRole: "SDR" };
    assert.ok(canEditTask(sdr, forSdrs));
    assert.ok(canEditTask({ id: "u-booker", role: "BOOKER" }, forSdrs));
    assert.ok(!canEditTask(dev, forSdrs));
    assert.ok(!canDeleteTask(sdr, forSdrs));

    const forEveryone: TaskAccessTarget = { ...personal("u-mgr"), audienceRole: "ALWAYS" };
    assert.ok(canEditTask(dev, forEveryone));
    assert.ok(!canEditTask(client, forEveryone));
});
