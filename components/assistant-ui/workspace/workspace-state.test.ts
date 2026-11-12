import { test } from "node:test";
import assert from "node:assert/strict";
import { canKeepContextualThread, resolveWorkspaceView } from "./workspace-state";

test("existing conversation and folder bookmarks retain their intended destination", () => {
    assert.equal(resolveWorkspaceView(null, "thread", "client-a"), "captain");
    assert.equal(resolveWorkspaceView(null, "new", null), "captain");
    assert.equal(resolveWorkspaceView(null, null, "client-a"), "client");
    assert.equal(resolveWorkspaceView(null, null, null), "pilotage");
});
test("a docked conversation does not replace the chosen operating view", () => {
    assert.equal(resolveWorkspaceView("pilotage", "thread", null), "pilotage");
    assert.equal(resolveWorkspaceView("operations", "thread", "client-a"), "operations");
    assert.equal(resolveWorkspaceView("client", null, null), "pilotage");
});
test("switching between full and docked discussion keeps its scope; changing client does not", () => {
    assert.equal(canKeepContextualThread("a", "a"), true);
    assert.equal(canKeepContextualThread(null, null), true);
    assert.equal(canKeepContextualThread("a", "b"), false);
    assert.equal(canKeepContextualThread("a", null), false);
});
