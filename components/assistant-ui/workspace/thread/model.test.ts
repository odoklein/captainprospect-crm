import { test } from "node:test";
import assert from "node:assert/strict";
import type { ConversationCard, FolderListResponse, ThreadMessage, ThreadResponse, VirtualClientFolder } from "@/lib/assistant/api-contract";
import type { TurnPayload } from "@/lib/ai/agent/protocol";
import {
    EMPTY_LIVE,
    appendMessage,
    applyOptimisticSend,
    formatCostLine,
    formatEuros,
    isConversationPages,
    isLocalId,
    lastOfRole,
    listAccepts,
    liveReducer,
    localUserMessage,
    mergeThreadRefresh,
    normalizeSearch,
    parseAction,
    parseTrace,
    payloadToMessage,
    prependOlder,
    previewOf,
    reasoningTail,
    removeFromPage,
    removeFromPages,
    sortClients,
    syncPinned,
    upsertInPage,
    upsertInPages,
} from "./model";

const NBSP = " ";
const iso = (min: number) => new Date(Date.UTC(2026, 9, 29, 10, min)).toISOString();

const msg = (id: string, role: ThreadMessage["role"] = "USER", min = 0): ThreadMessage => ({
    id,
    role,
    content: id,
    createdAt: iso(min),
    trace: null,
    action: null,
    attachments: null,
    feedback: null,
});

const card = (id: string, patch: Partial<ConversationCard> = {}): ConversationCard => ({
    id,
    title: id,
    kind: "CHAT",
    visibility: "PRIVATE",
    pinnedAt: null,
    folderId: null,
    clientId: null,
    missionId: null,
    missionName: null,
    messageCount: 0,
    lastMessageAt: null,
    createdAt: iso(0),
    isOwner: true,
    ownerName: null,
    preview: null,
    ...patch,
});

const thread = (messages: ThreadMessage[], olderCursor: string | null = null): ThreadResponse => ({
    conversation: { ...card("c1"), summary: null, folder: null },
    messages,
    olderCursor,
    canWrite: true,
});

test("local ids are recognised, server cuids are not", () => {
    assert.equal(isLocalId("local-1"), true);
    assert.equal(isLocalId("stopped-2"), true);
    assert.equal(isLocalId("a-3"), true);
    assert.equal(isLocalId("tmp-4"), true);
    assert.equal(isLocalId("clx9abc"), false);
});

test("parseTrace tolerates arrays, objects and garbage", () => {
    assert.deepEqual(parseTrace(null), { entries: [], usage: null, citations: [], visuals: [], status: null });
    const legacy = parseTrace([{ tool: "t", label: "l", ok: true, durationMs: 3 }]);
    assert.equal(legacy.entries.length, 1);
    const full = parseTrace({
        entries: [{ tool: "t", label: "l", ok: true, durationMs: 3 }],
        usage: { costEur: 0.04, promptTokens: 100, completionTokens: 10, totalTokens: 110, model: "gpt-5.5" },
        citations: [{ label: "E1" }],
        visuals: [{ id: "v1" }],
        status: "complete",
    });
    assert.equal(full.usage?.model, "gpt-5.5");
    assert.equal(full.citations.length, 1);
    assert.equal(full.visuals.length, 1);
    assert.equal(full.status, "complete");
    assert.equal(parseTrace({ usage: { costEur: "x" } }).usage, null);
});

test("parseAction only accepts a card with a state", () => {
    assert.equal(parseAction(null), null);
    assert.equal(parseAction({ card: {} }), null);
    assert.ok(parseAction({ tool: "x", args: {}, card: { title: "t" }, state: "pending" }));
});

test("payloadToMessage keeps the server id and the trace pieces", () => {
    const payload = {
        messageId: "srv1",
        runId: "r",
        answer: "Bonjour",
        status: "complete",
        pendingAction: null,
        trace: [],
        citations: [],
        unverifiedClaims: [],
        verification: { checked: 0, verified: 0, failed: 0, repaired: false, skipped: true },
        visuals: [],
        model: "m",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, costEur: 0.01, model: "m" },
    } satisfies TurnPayload;
    const m = payloadToMessage(payload, "a-1", iso(1));
    assert.equal(m.id, "srv1");
    assert.equal(m.role, "ASSISTANT");
    assert.equal(parseTrace(m.trace).usage?.costEur, 0.01);
    assert.equal(payloadToMessage({ ...payload, messageId: null }, "a-1", iso(1)).id, "a-1");
});

test("optimistic send: append, edit cut, regenerate cut", () => {
    const base = thread([msg("u1"), msg("a1", "ASSISTANT"), msg("u2"), msg("a2", "ASSISTANT")]);
    const q = localUserMessage("local-1", "Salut", null, iso(5));
    assert.deepEqual(applyOptimisticSend(base, q, {}).messages.map((m) => m.id), ["u1", "a1", "u2", "a2", "local-1"]);
    assert.deepEqual(applyOptimisticSend(base, q, { editMessageId: "u2" }).messages.map((m) => m.id), ["u1", "a1", "local-1"]);
    assert.deepEqual(applyOptimisticSend(base, null, { regenerateMessageId: "a2" }).messages.map((m) => m.id), ["u1", "a1", "u2"]);
    // Unknown id: nothing is cut.
    assert.equal(applyOptimisticSend(base, null, { regenerateMessageId: "zz" }).messages.length, 4);
});

test("appendMessage replaces a row with the same id", () => {
    const t = appendMessage(thread([msg("a1", "ASSISTANT")]), { ...msg("a1", "ASSISTANT"), content: "new" });
    assert.equal(t.messages.length, 1);
    assert.equal(t.messages[0].content, "new");
});

test("mergeThreadRefresh keeps loaded older pages and drops local rows", () => {
    const current = thread([msg("o1"), msg("o2"), msg("n1"), msg("local-9")], "cursor-old");
    const fresh = thread([msg("n1"), msg("n2"), msg("n3")], "cursor-n1");
    const merged = mergeThreadRefresh(current, fresh);
    assert.deepEqual(merged.messages.map((m) => m.id), ["o1", "o2", "n1", "n2", "n3"]);
    assert.equal(merged.olderCursor, "cursor-old");
    // Fresh page is the whole thread: it wins.
    assert.equal(mergeThreadRefresh(current, thread([msg("n1")], null)).messages.length, 1);
    // No overlap: fresh wins, never a gap.
    assert.deepEqual(mergeThreadRefresh(current, thread([msg("x1")], "c")).messages.map((m) => m.id), ["x1"]);
    assert.equal(mergeThreadRefresh(undefined, fresh), fresh);
});

test("prependOlder skips duplicates and moves the cursor", () => {
    const merged = prependOlder(thread([msg("m3"), msg("m4")], "c3"), thread([msg("m1"), msg("m2"), msg("m3")], null));
    assert.deepEqual(merged.messages.map((m) => m.id), ["m1", "m2", "m3", "m4"]);
    assert.equal(merged.olderCursor, null);
});

test("lastOfRole", () => {
    const list = [msg("u1"), msg("a1", "ASSISTANT"), msg("u2")];
    assert.equal(lastOfRole(list, "USER")?.id, "u2");
    assert.equal(lastOfRole(list, "ASSISTANT")?.id, "a1");
    assert.equal(lastOfRole([], "USER"), null);
});

test("liveReducer follows the stream and reset clears draft and reasoning", () => {
    let s = EMPTY_LIVE;
    s = liveReducer(s, { type: "phase", phase: "thinking" });
    s = liveReducer(s, { type: "reasoning", text: "Je regarde " });
    s = liveReducer(s, { type: "reasoning", text: "les RDV." });
    assert.equal(s.reasoning, "Je regarde les RDV.");
    s = liveReducer(s, { type: "tool_start", id: "t1", tool: "rdv", label: "RDV du mois" });
    assert.equal(s.phase, "tools");
    s = liveReducer(s, { type: "tool_end", id: "t1", tool: "rdv", label: "RDV du mois", ok: true, durationMs: 120, cached: true });
    assert.deepEqual(s.steps[0], { id: "t1", tool: "rdv", label: "RDV du mois", state: "ok", durationMs: 120, cached: true });
    s = liveReducer(s, { type: "delta", text: "Ce mois-ci" });
    assert.equal(s.phase, "writing");
    s = liveReducer(s, { type: "visual", visual: { id: "v1" } as never });
    s = liveReducer(s, { type: "visual", visual: { id: "v1", unverified: [1] } as never });
    assert.equal(s.visuals.length, 1);
    s = liveReducer(s, { type: "reset" });
    assert.equal(s.draft, "");
    assert.equal(s.reasoning, "");
    s = liveReducer(s, { type: "retry", attempt: 1, delayMs: 100 });
    assert.equal(s.phase, "retrying");
    assert.equal(liveReducer(s, { type: "start", runId: "r", model: "m" }), s);
});

test("listAccepts reads the list's query", () => {
    const inFolder = card("c", { folderId: "f1" });
    assert.equal(listAccepts("/api/manager/assistant/conversations?folderId=f1", inFolder), true);
    assert.equal(listAccepts("/api/manager/assistant/conversations?folderId=f2", inFolder), false);
    assert.equal(listAccepts("/api/manager/assistant/conversations?scope=agency", inFolder), false);
    assert.equal(listAccepts("/api/manager/assistant/conversations?scope=agency", card("c")), true);
    assert.equal(listAccepts("/api/manager/assistant/conversations?pinned=1", card("c", { pinnedAt: iso(1) })), true);
    assert.equal(listAccepts("/api/manager/assistant/conversations?folderId=f1&q=rdv", inFolder), null);
    assert.equal(listAccepts("/api/manager/assistant/conversations", inFolder), true);
});

test("upsertInPage inserts, merges, moves to front and evicts", () => {
    const key = "/api/manager/assistant/conversations?folderId=f1";
    const page = { items: [card("a", { folderId: "f1" }), card("b", { folderId: "f1" })], nextCursor: null };
    assert.deepEqual(upsertInPage(page, key, card("n", { folderId: "f1" }), true).items.map((c) => c.id), ["n", "a", "b"]);
    assert.deepEqual(upsertInPage(page, key, card("b", { folderId: "f1", title: "B2" }), true).items.map((c) => c.title), ["B2", "a"]);
    assert.deepEqual(upsertInPage(page, key, card("b", { folderId: "f1", title: "B2" }), false).items.map((c) => c.id), ["a", "b"]);
    assert.deepEqual(upsertInPage(page, key, card("b", { folderId: "f2" }), false).items.map((c) => c.id), ["a"]);
    assert.equal(upsertInPage(page, key, card("z", { folderId: "f9" }), true), page);
    assert.equal(upsertInPage(page, `${key}&q=x`, card("z", { folderId: "f1" }), true), page);
    assert.deepEqual(removeFromPage(page, "a").items.map((c) => c.id), ["b"]);
    assert.equal(removeFromPage(page, "zz"), page);
});

test("upsertInPages / removeFromPages over infinite lists", () => {
    const key = "/api/manager/assistant/conversations?folderId=f1&limit=30";
    const pages = [
        { items: [card("a", { folderId: "f1" })], nextCursor: "x" },
        { items: [card("b", { folderId: "f1" })], nextCursor: null },
    ];
    const ids = (p: typeof pages) => p.map((pg) => pg.items.map((c) => c.id));
    assert.deepEqual(ids(upsertInPages(pages, key, card("n", { folderId: "f1" }), true)), [["n", "a"], ["b"]]);
    assert.deepEqual(ids(upsertInPages(pages, key, card("b", { folderId: "f1" }), true)), [["b", "a"], []]);
    assert.deepEqual(upsertInPages(pages, key, card("b", { folderId: "f1", title: "B" }), false)[1].items[0].title, "B");
    assert.deepEqual(ids(upsertInPages(pages, key, card("b", { folderId: "f2" }), false)), [["a"], []]);
    assert.equal(upsertInPages(pages, key, card("z", { folderId: "f2" }), true), pages);
    assert.deepEqual(ids(removeFromPages(pages, "a")), [[], ["b"]]);
    assert.equal(removeFromPages(pages, "zz"), pages);
    assert.equal(isConversationPages(pages), true);
    assert.equal(isConversationPages({ items: [] }), false);
});

test("syncPinned follows pinnedAt", () => {
    const folders: FolderListResponse = { general: [], clients: [], pinnedConversations: [card("p1", { pinnedAt: iso(0) })] };
    assert.deepEqual(syncPinned(folders, card("p2", { pinnedAt: iso(1) })).pinnedConversations.map((c) => c.id), ["p2", "p1"]);
    assert.deepEqual(syncPinned(folders, card("p1", { pinnedAt: null })).pinnedConversations, []);
    assert.equal(syncPinned(folders, card("x")), folders);
    assert.deepEqual(syncPinned(folders, null, "p1").pinnedConversations, []);
    assert.equal(syncPinned(folders, card("p1", { pinnedAt: iso(0), title: "T" })).pinnedConversations[0].title, "T");
});

test("sortClients: alphabetical (accent-insensitive) and recent first", () => {
    const vc = (name: string, at: string | null): VirtualClientFolder => ({
        clientId: name,
        name,
        missions: [],
        folder: at
            ? { id: name, kind: "CLIENT", name, color: null, icon: null, clientId: name, counts: { conversations: 0, memories: 0, files: 0, pins: 0 }, lastActivityAt: at, hasAgentActivity: false }
            : null,
    });
    const list = [vc("Zeta", iso(1)), vc("Élan", null), vc("alpha", iso(5))];
    assert.deepEqual(sortClients(list, "alpha").map((c) => c.name), ["alpha", "Élan", "Zeta"]);
    assert.deepEqual(sortClients(list, "recent").map((c) => c.name), ["alpha", "Zeta", "Élan"]);
    assert.equal(normalizeSearch("Créer"), "creer");
});

test("formatEuros and formatCostLine", () => {
    assert.equal(formatEuros(0.04), `0,04${NBSP}€`);
    assert.equal(formatEuros(0.0042), `0,0042${NBSP}€`);
    assert.equal(formatEuros(1234.5), `1${NBSP}234,50${NBSP}€`);
    assert.equal(formatEuros(0), `0,00${NBSP}€`);
    assert.equal(
        formatCostLine({ costEur: 0.04, promptTokens: 1000, cachedInputTokens: 380, completionTokens: 1, totalTokens: 1001, model: "gpt-5.5" }),
        `0,04${NBSP}€ · 38${NBSP}% en cache · gpt-5.5`,
    );
    assert.equal(formatCostLine({ costEur: 0.04, promptTokens: 1000, completionTokens: 1, totalTokens: 1001, model: "gpt-5.5" }), `0,04${NBSP}€ · gpt-5.5`);
    assert.equal(formatCostLine(null), null);
});

test("reasoningTail and previewOf stay on one line", () => {
    assert.equal(reasoningTail("  a\n b  "), "a b");
    const long = "x".repeat(300);
    assert.equal(reasoningTail(long).length, 141);
    assert.equal(previewOf("## Titre\n**Gras** texte\n:::suivi\n- question\n:::"), "Titre Gras texte");
    assert.equal(previewOf("a".repeat(200)).length, 140);
});
