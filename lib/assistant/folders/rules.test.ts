/**
 * Folder and access invariants of the assistant workspace.
 *     npm run test:assistant-folders
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    RULE_MESSAGES,
    canMoveConversation,
    canReadConversation,
    canWriteConversation,
    conversationScopeForFolder,
    type FolderRef,
    type Viewer,
} from "./rules";

const general1: FolderRef = { id: "g1", kind: "GENERAL", clientId: null };
const general2: FolderRef = { id: "g2", kind: "GENERAL", clientId: null };
const clientA: FolderRef = { id: "fa", kind: "CLIENT", clientId: "A" };
const clientB: FolderRef = { id: "fb", kind: "CLIENT", clientId: "B" };

const agencyConv = { clientId: null };
const convOfA = { clientId: "A" };

test("moves among general folders and the agency view are free", () => {
    assert.deepEqual(canMoveConversation(agencyConv, null, general1), { ok: true });
    assert.deepEqual(canMoveConversation(agencyConv, general1, general2), { ok: true });
    assert.deepEqual(canMoveConversation(agencyConv, general2, null), { ok: true });
});

test("a no-op move is always allowed", () => {
    assert.deepEqual(canMoveConversation(convOfA, clientA, clientA), { ok: true });
    assert.deepEqual(canMoveConversation(convOfA, null, null), { ok: true });
});

test("a client folder is entered only by its own client's conversation", () => {
    assert.deepEqual(canMoveConversation(convOfA, null, clientA), { ok: true });
    assert.deepEqual(canMoveConversation(agencyConv, null, clientA), { ok: false, reason: RULE_MESSAGES.clientFolderNeedsClient });
    assert.deepEqual(canMoveConversation(convOfA, null, clientB), { ok: false, reason: RULE_MESSAGES.clientFolderNeedsClient });
    assert.deepEqual(canMoveConversation(agencyConv, general1, clientA), { ok: false, reason: RULE_MESSAGES.clientFolderNeedsClient });
});

test("a client folder is never left", () => {
    assert.deepEqual(canMoveConversation(convOfA, clientA, null), { ok: false, reason: RULE_MESSAGES.clientFolderIsFinal });
    assert.deepEqual(canMoveConversation(convOfA, clientA, general1), { ok: false, reason: RULE_MESSAGES.clientFolderIsFinal });
    assert.deepEqual(canMoveConversation(convOfA, clientA, clientB), { ok: false, reason: RULE_MESSAGES.clientFolderNeedsClient });
});

test("a client-bound conversation cannot enter a general folder", () => {
    assert.deepEqual(canMoveConversation(convOfA, null, general1), { ok: false, reason: RULE_MESSAGES.clientBoundNotGeneral });
});

test("conversationScopeForFolder derives clientId from the folder kind", () => {
    assert.deepEqual(conversationScopeForFolder(null), { folderId: null, clientId: null });
    assert.deepEqual(conversationScopeForFolder(general1), { folderId: "g1", clientId: null });
    assert.deepEqual(conversationScopeForFolder(clientA), { folderId: "fa", clientId: "A" });
});

const owner: Viewer = { id: "u1", role: "MANAGER", isActive: true };
const otherManager: Viewer = { id: "u2", role: "MANAGER", isActive: true };
const inactiveManager: Viewer = { id: "u3", role: "MANAGER", isActive: false };
const developer: Viewer = { id: "u4", role: "DEVELOPER", isActive: true };

test("read: the owner always, others only when SHARED and an active manager", () => {
    const priv = { createdById: "u1", visibility: "PRIVATE" as const };
    const shared = { createdById: "u1", visibility: "SHARED" as const };
    assert.deepEqual(canReadConversation(owner, priv), { ok: true });
    assert.deepEqual(canReadConversation(otherManager, priv), { ok: false, reason: RULE_MESSAGES.privateConversation });
    assert.deepEqual(canReadConversation(otherManager, shared), { ok: true });
    assert.deepEqual(canReadConversation(inactiveManager, shared), { ok: false, reason: RULE_MESSAGES.sharedManagersOnly });
    assert.deepEqual(canReadConversation(developer, shared), { ok: false, reason: RULE_MESSAGES.sharedManagersOnly });
});

test("write: the owner only, even on a shared thread", () => {
    const shared = { createdById: "u1", visibility: "SHARED" as const };
    assert.deepEqual(canWriteConversation(owner, shared), { ok: true });
    assert.deepEqual(canWriteConversation(otherManager, shared), { ok: false, reason: RULE_MESSAGES.ownerWritesOnly });
});
