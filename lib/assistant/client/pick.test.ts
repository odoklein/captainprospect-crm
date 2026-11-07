import { test } from "node:test";
import assert from "node:assert/strict";
import { pickConversation, pickFolder } from "./pick";

const CARD = {
    id: "c1",
    title: "Acme",
    kind: "CHAT",
    visibility: "PRIVATE",
    pinnedAt: null,
    folderId: "f_acme",
    clientId: "cl_acme",
    missionId: null,
    missionName: null,
    messageCount: 0,
    lastMessageAt: null,
    createdAt: "2026-10-29T10:00:00.000Z",
    isOwner: true,
    ownerName: "Odo",
    preview: null,
};

test("the create response keeps the folder: the full card wins over the deprecated stub", () => {
    // What POST /conversations returns today: the card plus a three-field stub.
    const response = { ...CARD, conversation: { id: "c1", title: "Acme", createdAt: CARD.createdAt } };
    const picked = pickConversation(response);
    assert.equal(picked.folderId, "f_acme", "the stub has no folderId: the shell would open « Vue agence »");
    assert.equal(picked.clientId, "cl_acme");
    assert.equal(picked.kind, "CHAT");
});

test("a { conversation } wrapper holding a full card still unwraps", () => {
    assert.equal(pickConversation({ conversation: CARD }).folderId, "f_acme");
});

test("a bare card is returned as is", () => {
    assert.equal(pickConversation(CARD), CARD);
});

test("an agency thread keeps its null folder (it is the card that says so, not a missing field)", () => {
    const agency = { ...CARD, folderId: null, clientId: null };
    assert.equal(pickConversation({ ...agency, conversation: { id: "c1", title: "x", createdAt: "" } }).folderId, null);
});

test("pickFolder unwraps { folder } and passes a bare card", () => {
    const folder = { id: "f1", name: "Acme" };
    assert.equal(pickFolder({ folder }), folder);
    assert.equal(pickFolder(folder), folder);
});
