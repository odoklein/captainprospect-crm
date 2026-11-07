/**
 * The assistant's Excel / PowerPoint builders and tools (ticket #116).
 * Run: npx tsx --test lib/assistant/office/build.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { brand } from "@/lib/brand";
import { buildPresentation, buildSpreadsheet, toNumberish, visualChart } from "./build";
import { executeCreatePptx, executeCreateXlsx, officeFileName, type OfficeDeps } from "@/lib/ai/tools/definitions/office";
import type { AssistantContext } from "@/lib/ai/tools/types";
import type { StoredVisual } from "@/lib/assistant/visuals/spec";

const bar: StoredVisual = {
    id: "v1",
    spec: { kind: "bar", title: "RDV par SDR", x_key: "sdr", series: [{ key: "rdv", label: "RDV" }], rows: [{ sdr: "Thibault", rdv: 7 }, { sdr: "Morgane", rdv: 5 }] },
} as StoredVisual;

test("French figures written as text become numbers, the rest stays text", () => {
    assert.equal(toNumberish("1 234,5"), 1234.5);
    assert.equal(toNumberish("12"), 12);
    assert.equal(toNumberish("06 12 34 56 78 bis"), "06 12 34 56 78 bis");
    assert.equal(toNumberish("Zei"), "Zei");
    assert.equal(toNumberish(null), null);
});

test("buildSpreadsheet writes a zip workbook", () => {
    const buf = buildSpreadsheet({ title: "RDV octobre", author: "Test", brand, sheets: [{ name: "RDV", columns: ["Société", "RDV"], rows: [["Zei", 1], ["G7", "2"]] }] });
    assert.equal(buf.subarray(0, 2).toString(), "PK");
});

test("bar visuals become native charts with their x labels", () => {
    const chart = visualChart(bar.spec);
    assert.ok(chart);
    assert.equal(chart.type, "bar");
    assert.deepEqual(chart.data[0].labels, ["Thibault", "Morgane"]);
    assert.deepEqual(chart.data[0].values, [7, 5]);
});

test("buildPresentation writes a deck with a cover", async () => {
    const out = await buildPresentation({
        title: "Bilan ERA",
        author: "Test",
        brand,
        generatedAt: new Date("2026-11-02T10:00:00Z"),
        slides: [
            { title: "Points clés", bullets: ["13 RDV", "1 annulé"] },
            { title: "Par SDR", visual: bar },
            { title: "Détail", table: { columns: ["Société", "Statut"], rows: [["Zei", "Annulé"]] } },
        ],
    });
    assert.equal(out.slides, 4);
    assert.equal(out.buffer.subarray(0, 2).toString(), "PK");
});

const ctx = { userId: "u1", userName: "Odo", folder: null, turnVisuals: () => [bar] } as unknown as AssistantContext;
function fakeDeps(stored: Array<{ fileName: string; mimeType: string }>): OfficeDeps {
    return {
        xlsx: async () => Buffer.from("x"),
        pptx: async (input) => ({ buffer: Buffer.from("p"), slides: input.slides.length + 1 }),
        tableOf: () => ({ columns: ["sdr", "RDV"], rows: [["Thibault", 7]] }),
        store: async (input) => { stored.push(input); return { fileId: "f1", downloadUrl: "/api/files/f1/download" }; },
        now: () => new Date("2026-11-02T10:00:00Z"),
    };
}

test("create_xlsx stores an .xlsx and hands back the link", async () => {
    const stored: Array<{ fileName: string; mimeType: string }> = [];
    const out = await executeCreateXlsx({ title: "RDV ERA octobre", include_visuals: [1] }, ctx, fakeDeps(stored));
    assert.equal(stored[0].fileName, "rdv-era-octobre-2026-11-02.xlsx");
    assert.match(stored[0].mimeType, /spreadsheetml/);
    assert.match(out.consigne, /\/api\/files\/f1\/download/);
});

test("create_xlsx refuses an empty workbook and unknown visuals", async () => {
    await assert.rejects(executeCreateXlsx({ title: "Vide" }, ctx, fakeDeps([])));
    await assert.rejects(executeCreateXlsx({ title: "Vide", include_visuals: [3] }, ctx, fakeDeps([])), /Visuel 3 introuvable/);
});

test("create_pptx stores a .pptx", async () => {
    const stored: Array<{ fileName: string; mimeType: string }> = [];
    const out = await executeCreatePptx({ title: "Bilan", slides: [{ title: "Par SDR", visual: 1 }] }, ctx, fakeDeps(stored));
    assert.match(stored[0].mimeType, /presentationml/);
    assert.match(out.message, /2 diapositives/);
});

test("file names follow the PDF rule", () => {
    assert.equal(officeFileName("Bilan ACME.pptx", new Date("2026-11-02T10:00:00Z"), "pptx"), "bilan-acme-2026-11-02.pptx");
});
