/**
 * Pure parts of the v4 conversation API: cursors, cards, access filters,
 * regenerate / edit planning.
 *     npx tsx --test lib/assistant/conversations/conversations.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { decodeCursor, encodeCursor, keysetOrderBy, keysetWhere, pageOf, parseLimit } from "./cursor";
import { forkSeed, parseAttachments, parseFeedback, previewOf, toConversationCard, toThreadMessage, type ConversationCardRow } from "./cards";
import { REPLAY_MESSAGES, canSeeShared, messageCountDelta, planReplay, readableWhere, type ReplayMessage } from "./rules";
import { canMoveConversation, canReadConversation, canWriteConversation, type FolderRef, type Viewer } from "../folders/rules";

// -- Cursor ------------------------------------------------------------------------

test("a cursor round-trips and a tampered one decodes to null", () => {
    const at = "2026-10-29T08:00:00.000Z";
    assert.deepEqual(decodeCursor(encodeCursor({ t: at, id: "c1" })), { t: at, id: "c1" });
    assert.deepEqual(decodeCursor(encodeCursor({ t: null, id: "c2" })), { t: null, id: "c2" });
    assert.equal(decodeCursor("not-base64-json"), null);
    assert.equal(decodeCursor(Buffer.from(JSON.stringify({ t: "yesterday", id: "x" })).toString("base64url")), null);
    assert.equal(decodeCursor(Buffer.from(JSON.stringify({ t: null })).toString("base64url")), null);
    assert.equal(decodeCursor(""), null);
    assert.equal(decodeCursor(null), null);
});

test("limit defaults to 30 and is clamped to 1..100", () => {
    assert.equal(parseLimit(null), 30);
    assert.equal(parseLimit("abc"), 30);
    assert.equal(parseLimit("0"), 1);
    assert.equal(parseLimit("500"), 100);
    assert.equal(parseLimit("12.7"), 12);
    assert.equal(parseLimit(null, 60, 200), 60);
});

test("keyset: after a dated row, older rows then the null tail; after a null row, smaller ids only", () => {
    assert.equal(keysetWhere("lastMessageAt", null), null);
    const at = "2026-10-29T08:00:00.000Z";
    const dated = keysetWhere("lastMessageAt", { t: at, id: "c5" }) as { OR: Array<Record<string, unknown>> };
    assert.equal(dated.OR.length, 3);
    assert.deepEqual(dated.OR[0], { lastMessageAt: { lt: new Date(at) } });
    assert.deepEqual(dated.OR[1], { lastMessageAt: new Date(at), id: { lt: "c5" } });
    assert.deepEqual(dated.OR[2], { lastMessageAt: null });
    assert.deepEqual(keysetWhere("pinnedAt", { t: null, id: "c9" }), { pinnedAt: null, id: { lt: "c9" } });
    assert.deepEqual(keysetOrderBy("pinnedAt"), [{ pinnedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }]);
});

test("pageOf keeps `limit` rows and builds the cursor from the last kept row", () => {
    const rows = [1, 2, 3].map((n) => ({ id: `c${n}`, at: n === 3 ? null : new Date(Date.UTC(2026, 9, 10 - n)) }));
    const full = pageOf(rows, 3, (r) => r.at);
    assert.equal(full.nextCursor, null);
    assert.equal(full.items.length, 3);
    const cut = pageOf(rows, 2, (r) => r.at);
    assert.equal(cut.items.length, 2);
    assert.deepEqual(decodeCursor(cut.nextCursor), { t: rows[1].at!.toISOString(), id: "c2" });
    const nullTail = pageOf([...rows, { id: "c4", at: null }], 3, (r) => r.at);
    assert.deepEqual(decodeCursor(nullTail.nextCursor), { t: null, id: "c3" });
});

// -- Cards -------------------------------------------------------------------------

const row = (over: Partial<ConversationCardRow> = {}): ConversationCardRow => ({
    id: "c1",
    title: "Point hebdo",
    kind: "CHAT",
    visibility: "PRIVATE",
    pinnedAt: null,
    folderId: "f1",
    clientId: "A",
    missionId: "m1",
    messageCount: 4,
    lastMessageAt: new Date("2026-10-29T09:00:00.000Z"),
    createdAt: new Date("2026-10-28T09:00:00.000Z"),
    createdById: "u1",
    mission: { name: "Mission 1" },
    createdBy: { name: "  Odo Klein " },
    ...over,
});

test("preview: follow-ups, markers, citations and markdown removed, cut near 140 chars", () => {
    const answer = [
        "## Bilan",
        "**12 RDV** cette semaine [E1], dont 4 [confirmés](#source-E2).",
        "[[visuel 1]]",
        "- Taux de joignabilité : 31 %",
        "",
        ":::suivi",
        "- Et la semaine dernière ?",
        ":::",
    ].join("\n");
    assert.equal(previewOf(answer), "Bilan 12 RDV cette semaine, dont 4 confirmés. Taux de joignabilité : 31 %");
    const long = previewOf("mot ".repeat(80))!;
    assert.ok(long.length <= 140, `${long.length}`);
    assert.ok(long.endsWith("…"));
    assert.equal(previewOf("—"), null);
    assert.equal(previewOf(null), null);
});

test("a card says who owns it and maps dates to ISO", () => {
    const own = toConversationCard(row({ pinnedAt: new Date("2026-10-29T10:00:00.000Z") }), "u1", "Réponse courte.");
    assert.equal(own.isOwner, true);
    assert.equal(own.ownerName, "Odo Klein");
    assert.equal(own.missionName, "Mission 1");
    assert.equal(own.pinnedAt, "2026-10-29T10:00:00.000Z");
    assert.equal(own.preview, "Réponse courte.");
    const other = toConversationCard(row({ mission: null, createdBy: { name: " " }, lastMessageAt: null }), "u2", undefined);
    assert.equal(other.isOwner, false);
    assert.equal(other.ownerName, null);
    assert.equal(other.missionName, null);
    assert.equal(other.lastMessageAt, null);
    assert.equal(other.preview, null);
});

test("thread messages: attachments and feedback are parsed defensively", () => {
    assert.equal(parseAttachments(null), null);
    assert.equal(parseAttachments([{ nope: 1 }]), null);
    assert.deepEqual(parseAttachments([{ fileId: "f1" }, { fileId: "f2", name: "a.pdf", status: "READY" }]), [
        { fileId: "f1", name: "Fichier", status: "PENDING" },
        { fileId: "f2", name: "a.pdf", status: "READY" },
    ]);
    assert.equal(parseFeedback({ rating: "meh" }), null);
    assert.deepEqual(parseFeedback({ rating: "up", at: "2026-10-29T00:00:00.000Z", by: "u1" }), {
        rating: "up",
        comment: null,
        at: "2026-10-29T00:00:00.000Z",
        by: "u1",
    });
    const m = toThreadMessage({ id: "m1", role: "ASSISTANT", content: "ok", createdAt: new Date(0), trace: undefined, action: null });
    assert.equal(m.trace, null);
    assert.equal(m.attachments, null);
    assert.equal(m.feedback, null);
});

test("fork seed: the summary when there is one, else the latest exchanges in order", () => {
    assert.equal(forkSeed("  Résumé.  ", []), "Résumé.");
    assert.equal(forkSeed(null, []), null);
    const seed = forkSeed(null, [
        { role: "USER", content: "Combien de RDV ?" },
        { role: "ASSISTANT", content: "12 RDV.\n:::suivi\n- Et hier ?\n:::" },
    ])!;
    assert.match(seed, /Manager : Combien de RDV \?\nAssistant : 12 RDV\.$/);
    const bounded = forkSeed(null, Array.from({ length: 20 }, (_, i) => ({ role: "USER" as const, content: `q${i} ${"x".repeat(500)}` })), 1200)!;
    assert.ok(bounded.length < 1400);
    assert.match(bounded, /q19/, "the newest exchange is kept");
});

// -- Access ------------------------------------------------------------------------

const manager: Viewer = { id: "u2", role: "MANAGER", isActive: true };
const inactive: Viewer = { id: "u3", role: "MANAGER", isActive: false };
const owner: Viewer = { id: "u1", role: "MANAGER", isActive: true };

test("readable filter: own threads, plus SHARED ones for an active manager", () => {
    assert.deepEqual(readableWhere(manager), { OR: [{ createdById: "u2" }, { visibility: "SHARED" }] });
    assert.deepEqual(readableWhere(inactive), { createdById: "u3" });
    assert.deepEqual(readableWhere({ id: "s1", role: "SDR", isActive: true }), { createdById: "s1" });
    assert.equal(canSeeShared(manager), true);
});

test("access matrix: read = owner or SHARED for active managers; write = owner only", () => {
    const priv = { createdById: "u1", visibility: "PRIVATE" as const };
    const shared = { createdById: "u1", visibility: "SHARED" as const };
    const cases: Array<[Viewer, typeof priv | typeof shared, boolean, boolean]> = [
        [owner, priv, true, true],
        [owner, shared, true, true],
        [manager, priv, false, false],
        [manager, shared, true, false],
        [inactive, shared, false, false],
    ];
    for (const [viewer, conv, read, write] of cases) {
        assert.equal(canReadConversation(viewer, conv).ok, read, `read ${viewer.id} ${conv.visibility}`);
        assert.equal(canWriteConversation(viewer, conv).ok, write, `write ${viewer.id} ${conv.visibility}`);
    }
});

test("move matrix: general folders and agency view only; client folders hold their client", () => {
    const g1: FolderRef = { id: "g1", kind: "GENERAL", clientId: null };
    const a: FolderRef = { id: "fa", kind: "CLIENT", clientId: "A" };
    assert.equal(canMoveConversation({ clientId: null }, null, g1).ok, true);
    assert.equal(canMoveConversation({ clientId: null }, g1, null).ok, true);
    assert.equal(canMoveConversation({ clientId: "A" }, null, a).ok, true, "a legacy unfiled thread joins its client folder");
    assert.equal(canMoveConversation({ clientId: "A" }, a, g1).ok, false);
    assert.equal(canMoveConversation({ clientId: null }, g1, a).ok, false);
});

// -- Regenerate / edit -------------------------------------------------------------

const live: ReplayMessage[] = [
    { id: "a2", role: "ASSISTANT", content: "Réponse 2" },
    { id: "u2", role: "USER", content: "Question 2", attachments: [{ fileId: "f1", name: "a.pdf", status: "READY" }] },
    { id: "a1", role: "ASSISTANT", content: "Réponse 1" },
    { id: "u1", role: "USER", content: "Question 1" },
];

test("regenerate reruns the previous question on the last answer only", () => {
    const plan = planReplay(live, { regenerateMessageId: "a2" });
    assert.ok(plan.ok);
    if (!plan.ok) return;
    assert.equal(plan.mode, "regenerate");
    assert.equal(plan.question, "Question 2");
    assert.equal(plan.reuseUserMessage?.id, "u2");
    assert.deepEqual(plan.supersedeIds, ["a2"]);
    assert.deepEqual(planReplay(live, { regenerateMessageId: "a1" }), { ok: false, reason: REPLAY_MESSAGES.notLastAnswer });
    assert.deepEqual(planReplay(live.slice(1), { regenerateMessageId: "u2" }), { ok: false, reason: REPLAY_MESSAGES.notLastAnswer });
    assert.deepEqual(planReplay([live[0]], { regenerateMessageId: "a2" }), { ok: false, reason: REPLAY_MESSAGES.noQuestion });
});

test("edit replaces the last question and every answer after it", () => {
    const plan = planReplay(live, { editMessageId: "u2", message: "Question 2 bis" });
    assert.ok(plan.ok);
    if (!plan.ok) return;
    assert.equal(plan.question, "Question 2 bis");
    assert.equal(plan.reuseUserMessage, null);
    assert.deepEqual(plan.supersedeIds, ["a2", "u2"]);
    // A failed turn left the question without an answer: still editable.
    const unanswered = planReplay(live.slice(1), { editMessageId: "u2", message: "x" });
    assert.ok(unanswered.ok && unanswered.supersedeIds.length === 1);
    assert.deepEqual(planReplay(live, { editMessageId: "u1", message: "x" }), { ok: false, reason: REPLAY_MESSAGES.notLastQuestion });
    assert.deepEqual(planReplay(live, { editMessageId: "u2", message: "  " }), { ok: false, reason: REPLAY_MESSAGES.emptyEdit });
    assert.deepEqual(planReplay(live, { editMessageId: "u2", regenerateMessageId: "a2", message: "x" }), { ok: false, reason: REPLAY_MESSAGES.both });
});

test("messageCount delta: +2 for a turn, 0 for a regenerate, 0 for an edit of an answered question", () => {
    assert.equal(messageCountDelta(true, 0), 2);
    assert.equal(messageCountDelta(false, 1), 0);
    assert.equal(messageCountDelta(true, 2), 0);
    assert.equal(messageCountDelta(true, 1), 1);
});
