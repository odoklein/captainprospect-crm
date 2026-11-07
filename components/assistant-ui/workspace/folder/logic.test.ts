/**
 * Folder home pure logic.
 *     npx tsx --test components/assistant-ui/workspace/folder/logic.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { ConversationCard, FolderFile, MemoriesResponse, MemoryItem, PinItem } from "@/lib/assistant/api-contract";
import {
    ALL_MISSIONS,
    FILE_STATUS,
    canReindex,
    charCountLevel,
    cleanTitle,
    countLabel,
    estimateTokens,
    fileStatusHint,
    filesNeedPolling,
    filesSummary,
    flattenConversationPages,
    folderColor,
    folderIconKey,
    formatBytes,
    groupMemories,
    instructionsPreview,
    kindFromToggle,
    liveTokens,
    mapMemory,
    memoryKindCounts,
    mergeFiles,
    missionIdFromSelect,
    movePin,
    normalizePins,
    pinVisual,
    resolveTab,
    restorePin,
    savedAgoLabel,
    starterQuestions,
    tabCountLabel,
    tokenMeter,
    uploadProgressValue,
    uploadStatusLabel,
    upsertMemory,
    visibleTabs,
} from "./logic";
import * as libLogic from "../../../../lib/assistant/client/folder-logic";

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

test("components/…/folder/logic re-exports lib/assistant/client/folder-logic", () => {
    assert.equal(resolveTab, libLogic.resolveTab);
    assert.equal(FILE_STATUS, libLogic.FILE_STATUS);
});

test("tab counts hide zero and cap at 999+", () => {
    assert.equal(tabCountLabel(undefined), null);
    assert.equal(tabCountLabel(0), null);
    assert.equal(tabCountLabel(7), "7");
    assert.equal(tabCountLabel(1000), "999+");
});

test("French counts: 0 and 1 are singular, thousands are spaced", () => {
    assert.equal(countLabel(0, "fichier", "fichiers"), "0 fichier");
    assert.equal(countLabel(1, "fichier", "fichiers"), "1 fichier");
    assert.match(countLabel(1204, "souvenir", "souvenirs"), /^1\s204 souvenirs$/);
});

test("folder colour: tone names, hex, tokens, else derived and stable", () => {
    assert.deepEqual(folderColor("amber", "x"), { tone: "amber" });
    assert.deepEqual(folderColor("#12abef", "x"), { css: "#12abef" });
    assert.deepEqual(folderColor("--ds-accent", "x"), { css: "var(--ds-accent)" });
    assert.deepEqual(folderColor("ds-accent", "x"), { css: "var(--ds-accent)" });
    assert.deepEqual(folderColor(null, "Acme"), folderColor("", "Acme"));
    assert.ok("tone" in folderColor(null, "Acme"));
    assert.equal(folderIconKey("Bar-Chart-3"), "barchart3");
    assert.equal(folderIconKey(null), "");
});

test("instructions preview is the first non-empty line", () => {
    assert.equal(instructionsPreview("\n  \n  Première ligne  \nSeconde"), "Première ligne");
    assert.equal(instructionsPreview(null), "");
});

test("mission select and inline titles", () => {
    assert.equal(missionIdFromSelect(ALL_MISSIONS), null);
    assert.equal(missionIdFromSelect(""), null);
    assert.equal(missionIdFromSelect("m1"), "m1");
    assert.equal(cleanTitle("  Nouveau   titre ", "Ancien"), "Nouveau titre");
    assert.equal(cleanTitle("Ancien", "Ancien"), null);
    assert.equal(cleanTitle("   ", "Ancien"), null);
    assert.equal(cleanTitle("x".repeat(200), "", 120)?.length, 120);
});

test("memory counter and kind toggle", () => {
    assert.equal(charCountLevel(0, 600), "ok");
    assert.equal(charCountLevel(539, 600), "ok");
    assert.equal(charCountLevel(540, 600), "warn");
    assert.equal(charCountLevel(600, 600), "over");
    assert.equal(kindFromToggle("DECISION"), "DECISION");
    assert.equal(kindFromToggle("ALL"), null);
    assert.equal(kindFromToggle(""), null);
});

test("file statuses: badges, hints from the server error, reindex rules, summary", () => {
    assert.equal(FILE_STATUS.PROCESSING.spinner, true);
    assert.equal(FILE_STATUS.NEEDS_OCR.label, "PDF scanné (OCR)");
    assert.equal(FILE_STATUS.FAILED.badge, "danger");
    assert.equal(fileStatusHint({ status: "FAILED", error: "Fichier corrompu" }), "Fichier corrompu");
    assert.equal(fileStatusHint({ status: "NEEDS_OCR", error: "PDF scanné : OCR désactivé" }), "PDF scanné : OCR désactivé");
    assert.equal(fileStatusHint({ status: "READY", error: "ignored" }), FILE_STATUS.READY.hint);
    assert.equal(canReindex({ status: "PROCESSING" }), false);
    assert.equal(canReindex({ status: "UNSUPPORTED" }), false);
    assert.equal(canReindex({ status: "NEEDS_OCR" }), true);
    assert.equal(filesSummary([]), "Aucun fichier");
    assert.equal(filesSummary([{ status: "READY" }]), "1 fichier · 1 prêt");
    assert.equal(filesSummary([{ status: "READY" }, { status: "READY" }, { status: "PENDING" }]), "3 fichiers · 2 prêts · 1 en cours d'indexation");
});

test("upload rows: labels and a progress sliver as soon as it starts", () => {
    assert.equal(uploadStatusLabel("queued", 0), "En file");
    assert.equal(uploadStatusLabel("uploading", 0.426), "43 %");
    assert.equal(uploadStatusLabel("done", 1), "Envoyé");
    assert.equal(uploadStatusLabel("error", 0.5), "Échec");
    assert.equal(uploadProgressValue("queued", 0.5), 0);
    assert.equal(uploadProgressValue("uploading", 0), 3);
    assert.equal(uploadProgressValue("uploading", 0.5), 50);
    assert.equal(uploadProgressValue("done", 0.2), 100);
});

test("undoing a pin removal puts it back in place", () => {
    const p = (id: string, position: number) => ({ id, position, createdAt: `2026-10-0${position + 1}` }) as PinItem;
    const list = [p("a", 0), p("c", 2)];
    assert.deepEqual(restorePin(list, p("b", 1)).map((x) => x.id), ["a", "b", "c"]);
    assert.deepEqual(restorePin([p("a", 0), p("b", 1)], p("b", 1)).map((x) => x.id), ["a", "b"]);
});
