/**
 * Folder home pure logic.
 *     npx tsx --test components/assistant-ui/workspace/folder/logic.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { ConversationCard, FolderFile, MemoriesResponse, MemoryItem, PinItem } from "@/lib/assistant/api-contract";
import {
    estimateTokens,
    filesNeedPolling,
    flattenConversationPages,
    formatBytes,
    groupMemories,
    liveTokens,
    mapMemory,
    memoryKindCounts,
    mergeFiles,
    movePin,
    normalizePins,
    pinVisual,
    resolveTab,
    savedAgoLabel,
    starterQuestions,
    tokenMeter,
    upsertMemory,
    visibleTabs,
} from "./logic";

const mem = (over: Partial<MemoryItem>): MemoryItem => ({
    id: "m",
    scope: "AGENCY",
    kind: "FACT",
    content: "x",
    pinned: false,
    folderId: null,
    missionId: null,
    source: null,
    useCount: 0,
    lastUsedAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    deletedAt: null,
    ...over,
});

test("agency view hides files, board and agent tabs", () => {
    assert.deepEqual(visibleTabs(true), ["conversations", "memoire"]);
    assert.equal(visibleTabs(false).length, 5);
    assert.equal(resolveTab("fichiers", true), "conversations");
    assert.equal(resolveTab("tableau", false), "tableau");
    assert.equal(resolveTab("nope", false), "conversations");
});

test("token meter turns amber at 80 % and red over the limit", () => {
    assert.deepEqual(tokenMeter(0, 1000), { pct: 0, level: "ok" });
    assert.equal(tokenMeter(799, 1000).level, "ok");
    assert.equal(tokenMeter(800, 1000).level, "warn");
    assert.equal(tokenMeter(1000, 1000).level, "warn");
    assert.deepEqual(tokenMeter(1200, 1000), { pct: 100, level: "over" });
    assert.equal(tokenMeter(5, 0).level, "over");
});

test("live tokens use the server count for the saved text and calibrate edits", () => {
    assert.equal(estimateTokens(""), 0);
    assert.equal(estimateTokens("abcd"), 2);
    const saved = { text: "a".repeat(360), tokens: 200 };
    assert.equal(liveTokens(saved.text, saved), 200);
    // Raw estimate 100 for 360 chars; the server said 200 → ratio 2.
    assert.equal(liveTokens("a".repeat(720), saved), 400);
    assert.equal(liveTokens("a".repeat(36), null), 10);
});

test("saved label ticks in seconds, then minutes", () => {
    assert.equal(savedAgoLabel(0, 1000), "Enregistré · à l'instant");
    assert.equal(savedAgoLabel(0, 2000), "Enregistré · il y a 2 s");
    assert.equal(savedAgoLabel(0, 180_000), "Enregistré · il y a 3 min");
    assert.equal(savedAgoLabel(0, 7_300_000), "Enregistré · il y a 2 h");
});

test("starter questions: folder ones first, defaults fill, deduplicated", () => {
    const qs = starterQuestions("CLIENT", ["Où en est la mission cette semaine ?", "Ma question"]);
    assert.equal(qs.length, 4);
    assert.equal(qs[0], "Où en est la mission cette semaine ?");
    assert.equal(qs[1], "Ma question");
    assert.equal(new Set(qs).size, 4);
    assert.equal(starterQuestions("AGENCY", null, 2).length, 2);
});

test("conversation pages flatten without duplicates", () => {
    const c = (id: string) => ({ id }) as ConversationCard;
    const flat = flattenConversationPages([
        { items: [c("1"), c("2")], nextCursor: "x" },
        undefined,
        { items: [c("2"), c("3")], nextCursor: null },
    ]);
    assert.deepEqual(flat.map((x) => x.id), ["1", "2", "3"]);
});

test("memory groups: layers, pinned first, kind filter, deleted toggle", () => {
    const data: MemoriesResponse = {
        agency: [
            mem({ id: "a1", updatedAt: "2026-10-02T00:00:00.000Z" }),
            mem({ id: "a2", pinned: true }),
            mem({ id: "a3", deletedAt: "2026-10-03T00:00:00.000Z" }),
        ],
        folder: [mem({ id: "f1", scope: "FOLDER", kind: "DECISION" })],
        user: [mem({ id: "u1", scope: "USER", kind: "PREFERENCE" })],
    };
    const groups = groupMemories(data, { folderName: "Acme", kind: null, includeDeleted: false });
    assert.deepEqual(groups.map((g) => g.label), ["Agence", "Dossier « Acme »", "Mes préférences"]);
    assert.deepEqual(groups[0].items.map((m) => m.id), ["a2", "a1"]);
    const agency = groupMemories(data, { folderName: null, kind: null, includeDeleted: true });
    assert.equal(agency.length, 2);
    assert.equal(agency[0].items.length, 3);
    const decisions = groupMemories(data, { folderName: "Acme", kind: "DECISION", includeDeleted: false });
    assert.deepEqual(decisions.map((g) => g.items.length), [0, 1, 0]);
    assert.equal(decisions[0].total, 2);
    const counts = memoryKindCounts(data, false, true);
    assert.equal(counts.ALL, 4);
    assert.equal(counts.FACT, 2);
    assert.equal(memoryKindCounts(data, false, false).ALL, 3);
});

test("memory map and upsert keep layers consistent", () => {
    const data: MemoriesResponse = { agency: [mem({ id: "a1" })], folder: [], user: [] };
    const removed = mapMemory(data, "a1", () => null);
    assert.equal(removed.agency.length, 0);
    const edited = mapMemory(data, "a1", (m) => ({ ...m, content: "y" }));
    assert.equal(edited.agency[0].content, "y");
    const added = upsertMemory(data, mem({ id: "real", scope: "USER" }), "tmp");
    assert.equal(added.user[0].id, "real");
    const replaced = upsertMemory({ ...data, user: [mem({ id: "tmp", scope: "USER" })] }, mem({ id: "real", scope: "USER" }), "tmp");
    assert.deepEqual(replaced.user.map((m) => m.id), ["real"]);
});

test("files poll only while something is pending or processing", () => {
    const f = (status: FolderFile["status"]) => ({ fileId: status, status }) as FolderFile;
    assert.equal(filesNeedPolling([f("READY"), f("FAILED")]), false);
    assert.equal(filesNeedPolling([f("READY"), f("PROCESSING")]), true);
    assert.equal(filesNeedPolling([f("PENDING")]), true);
    assert.equal(filesNeedPolling(undefined), false);
    assert.deepEqual(mergeFiles([f("READY"), f("PENDING")], [f("PENDING")]).map((x) => x.fileId), ["PENDING", "READY"]);
});

test("formatBytes speaks French units", () => {
    assert.equal(formatBytes(512), "512 o");
    assert.equal(formatBytes(1536), "1,5 Ko");
    assert.equal(formatBytes(25 * 1024 * 1024), "25 Mo");
});

test("pins: tolerant envelope, reorder swaps positions, visual guard", () => {
    const p = (id: string, position: number) => ({ id, position, createdAt: `2026-10-0${position + 1}` }) as PinItem;
    const pins = [p("a", 0), p("b", 1), p("c", 2)];
    assert.equal(normalizePins(pins).length, 3);
    assert.equal(normalizePins({ items: pins }).length, 3);
    assert.equal(normalizePins({ pins }).length, 3);
    assert.deepEqual(normalizePins(null), []);
    const moved = movePin(pins, "c", -1)!;
    assert.deepEqual(moved.pins.map((x) => x.id), ["a", "c", "b"]);
    assert.deepEqual(moved.patches, [{ id: "c", position: 1 }, { id: "b", position: 2 }]);
    assert.equal(movePin(pins, "a", -1), null);
    assert.equal(movePin(pins, "c", 1), null);
    const flat = movePin([p("a", 0), { ...p("b", 0), createdAt: "2026-10-09" }], "b", -1)!;
    assert.deepEqual(flat.pins.map((x) => x.id), ["b", "a"]);
    assert.equal(pinVisual({ visual: { spec: { kind: "bar" } } } as PinItem) !== null, true);
    assert.equal(pinVisual({ visual: { spec: {} } } as PinItem), null);
});
