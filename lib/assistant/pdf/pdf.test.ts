/**
 * Assistant PDF: markdown layout model, WinAnsi normalisation, every visual
 * kind rendered, long tables across pages, create_pdf arguments and execution,
 * and the export access matrix (with fakes — no database).
 *     npx tsx --test lib/assistant/pdf/pdf.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import PDFKit from "pdfkit";
import { PDFDocument as PdfLib } from "pdf-lib";

import { brand } from "@/lib/brand";
import { formatValue, type StoredVisual } from "@/lib/assistant/visuals/spec";
import { answerToBlocks, markdownToBlocks, runsText, type Block } from "./markdown";
import { renderAssistantPdfDetailed, type AssistantPdfSection } from "./render";
import { attachmentHeader, frLongDate, kebab, pdfFileName, pdfSafe } from "./text";
import { isNumericText } from "./table";
import { niceScale } from "./visuals";
import { EXPORT_MESSAGES, PdfExportError, conversationExport, runReportPdfContent, storedVisualsOf, type ExportConversation, type ExportMessage } from "./exports";
import { CreatePdfArgs, executeCreatePdf, selectVisuals, type CreatePdfDeps } from "@/lib/ai/tools/definitions/pdf";
import { getTool } from "@/lib/ai/tools/registry";
import { toolGroupOf, toolProfileFor } from "@/lib/ai/tools/profiles";
import type { AssistantContext } from "@/lib/ai/tools/types";
import { fileNameFromDisposition } from "@/lib/assistant/client/export";

const AT = new Date("2026-10-29T10:00:00Z");

// -- Text --------------------------------------------------------------------------

test("pdfSafe keeps French and WinAnsi, maps thin spaces and symbols, drops the rest", () => {
    assert.equal(pdfSafe("Évolution « 1 240 € » — œuvre…"), "Évolution « 1 240 € » — œuvre…");
    assert.equal(pdfSafe("12,5 %"), "12,5 %");
    assert.equal(pdfSafe("a → b ≥ 3 − 1"), "a -> b >= 3 - 1");
    assert.equal(pdfSafe("Łódź ș 🚀 ok"), "Lódz s  ok");
    assert.equal(pdfSafe("‘quote’ “dq” • ™"), "‘quote’ “dq” • ™");
    assert.equal(pdfSafe("a​b­c"), "abc");
    // fr-FR formatting emits U+202F; once normalised the figure is one unbreakable word.
    const formatted = formatValue(1240, "number");
    assert.match(formatted, /1 240/);
    assert.equal(pdfSafe(formatted), "1 240");
});

test("dates and file names are French and kebab-case", () => {
    assert.equal(frLongDate(AT), "29 octobre 2026");
    assert.equal(kebab("Bilan ACME — Œuvres d'été"), "bilan-acme-oeuvres-d-ete");
    assert.equal(pdfFileName("Bilan Acme", AT), "bilan-acme-2026-10-29.pdf");
    assert.equal(pdfFileName("bilan-acme-2026-10-01.pdf", AT), "bilan-acme-2026-10-01.pdf");
    assert.equal(pdfFileName("   ", AT), "document-2026-10-29.pdf");
    assert.match(attachmentHeader("bilan-acme-2026-10-29.pdf"), /^attachment; filename="bilan-acme-2026-10-29\.pdf"; filename\*=UTF-8''bilan-acme-2026-10-29\.pdf$/);
});

test("numeric cells and nice axis scales", () => {
    for (const t of ["1 240", "1 240", "-3,5 %", "12 k€", "+4 pts", "2 h 05", "0"]) assert.ok(isNumericText(t), t);
    for (const t of ["Alice", "S1", "2026-10-01", ""]) assert.ok(!isNumericText(t), t);
    const s = niceScale(0, 37);
    assert.equal(s.lo, 0);
    assert.ok(s.hi >= 37);
    assert.ok(s.ticks.includes(0));
    const neg = niceScale(-12, 30);
    assert.ok(neg.lo <= -12 && neg.ticks.includes(0));
});

// -- Markdown → layout model -------------------------------------------------------------

test("markdown becomes headings, paragraphs with styled runs and citations", () => {
    const blocks = markdownToBlocks("## Bilan\n\n**14 RDV** ce mois [E1], soit *+12 %* [E2][E3] et `code` [lien](https://x.fr).");
    assert.equal(blocks[0].type, "heading");
    assert.equal((blocks[0] as Extract<Block, { type: "heading" }>).level, 2);
    const para = blocks[1] as Extract<Block, { type: "paragraph" }>;
    assert.equal(para.type, "paragraph");
    assert.ok(para.runs.some((r) => r.bold && r.text === "14 RDV"));
    assert.ok(para.runs.some((r) => r.italic && r.text === "+12 %"));
    assert.ok(para.runs.some((r) => r.code && r.text === "code"));
    assert.ok(para.runs.some((r) => r.href === "https://x.fr" && r.text === "lien"));
    const cites = para.runs.filter((r) => r.cite).map((r) => r.text);
    // Adjacent markers merge into one label; the space before a marker goes.
    assert.deepEqual(cites, ["E1", "E2,E3"]);
    assert.ok(!para.runs.some((r) => !r.cite && /\[E\d/.test(r.text)));
    assert.match(runsText(para.runs), /ce mois\[E1\], soit/);
});

test("lists keep order, nesting and task state; tables keep alignment and cells", () => {
    const blocks = markdownToBlocks("3. trois\n4. quatre\n   - imbriqué\n\n- [x] fait\n- [ ] à faire\n\n| SDR | RDV |\n|:---|---:|\n| Alice [E1] | 1 240 |\n| Bruno | 7 |");
    const ordered = blocks[0] as Extract<Block, { type: "list" }>;
    assert.equal(ordered.ordered, true);
    assert.equal(ordered.start, 3);
    assert.equal(ordered.items.length, 2);
    assert.equal(ordered.items[1].blocks[1].type, "list");
    const tasks = blocks[1] as Extract<Block, { type: "list" }>;
    assert.deepEqual(tasks.items.map((i) => i.checked), [true, false]);
    const table = blocks[2] as Extract<Block, { type: "table" }>;
    assert.equal(table.type, "table");
    assert.deepEqual(table.align, ["left", "right"]);
    assert.deepEqual(table.header.map(runsText), ["SDR", "RDV"]);
    assert.equal(table.rows.length, 2);
    assert.ok(table.rows[0][0].some((r) => r.cite && r.text === "E1"));
    assert.equal(runsText(table.rows[0][1]), "1 240");
});

test("an answer loses its :::suivi block and places its visuals like the chat", () => {
    const content = "Intro [E1].\n\n[[visuel 2]]\n\n> cité\n\n```\nSELECT 1\n```\n\n---\n\nFin.\n\n:::suivi\n- Compare avec le mois dernier\n:::";
    const blocks = answerToBlocks(content, 2);
    const types = blocks.map((b) => b.type);
    assert.deepEqual(types, ["paragraph", "visual", "quote", "code", "rule", "paragraph", "visual"]);
    assert.equal((blocks[1] as Extract<Block, { type: "visual" }>).index, 2);
    // The unplaced visual 1 goes at the end.
    assert.equal((blocks[6] as Extract<Block, { type: "visual" }>).index, 1);
    assert.ok(!JSON.stringify(blocks).includes("Compare avec"));
    assert.ok(!JSON.stringify(blocks).includes("suivi"));
});

// -- Rendering ----------------------------------------------------------------------------

const visual = (spec: Record<string, unknown>, i = 1): StoredVisual => ({ id: `v${i}`, spec: spec as unknown as StoredVisual["spec"] });

const ALL_KINDS: StoredVisual[] = [
    visual({ kind: "kpi_row", title: "Chiffres clés", tiles: [{ label: "RDV", value: 14, delta_pct: 12.5, hint: "vs septembre" }, { label: "Appels", value: 12450, delta_pct: -3.2 }, { label: "Taux", value: 3.3, format: "percent", delta_pct: 0 }, { label: "Durée", value: 3725, format: "duration" }, { label: "CA", value: "12 400 €" }] }),
    visual({ kind: "bar", title: "RDV par SDR", series: [{ key: "rdv", label: "RDV" }], rows: [{ sdr: "Alice", rdv: 12 }, { sdr: "Bruno", rdv: -3 }] }),
    visual({ kind: "bar", title: "Empilé", stacked: true, series: [{ key: "a", label: "A" }, { key: "b", label: "B" }], rows: Array.from({ length: 31 }, (_, i) => ({ j: `2026-10-${String(i + 1).padStart(2, "0")}`, a: i, b: 31 - i })) }),
    visual({ kind: "bar", title: "Horizontal", horizontal: true, series: [{ key: "a", label: "A" }, { key: "b", label: "B" }], rows: Array.from({ length: 50 }, (_, i) => ({ c: `Client ${i}`, a: i * 2, b: 100 - i })) }),
    visual({ kind: "line", title: "Courbe", series: [{ key: "a", label: "Appels" }, { key: "r", label: "RDV" }], rows: Array.from({ length: 40 }, (_, i) => ({ d: `2026-09-${String((i % 30) + 1).padStart(2, "0")}`, a: i % 3 === 0 ? null : 100 + i, r: i % 5 })) }),
    visual({ kind: "area", title: "Aire empilée", stacked: true, series: [{ key: "a", label: "A" }, { key: "b", label: "B" }], rows: [{ s: "S1", a: 1, b: 2 }, { s: "S2", a: 3, b: 1 }, { s: "S3", a: 2, b: 4 }] }),
    visual({ kind: "donut", title: "Répartition", items: [{ label: "RAPPEL", value: 120 }, { label: "RELANCE", value: 80 }] }),
    visual({ kind: "donut", title: "Une seule part", items: [{ label: "Tout", value: 10 }, { label: "Rien", value: 0 }] }),
    visual({ kind: "funnel", title: "Tunnel", items: [{ label: "Appels", value: 1200 }, { label: "Joints", value: 400 }, { label: "RDV", value: 14 }] }),
    visual({ kind: "leaderboard", title: "Classement", format: "percent", items: Array.from({ length: 25 }, (_, i) => ({ label: `SDR ${i}`, value: 25 - i, ...(i % 2 ? { detail: "Mission" } : {}) })) }),
    visual({ kind: "heatmap", title: "Créneaux", cells: ["Lun", "Mar", "Mer"].flatMap((row, r) => Array.from({ length: 20 }, (_, c) => ({ row, col: `${c}h`, value: (r + 1) * c }))) }),
    visual({ kind: "table", title: "Table", columns: [{ key: "n", label: "Nom" }, { key: "v", label: "Valeur" }, { key: "p", label: "Part", format: "percent" }], rows: [{ n: "Alice", v: 1240, p: 12.5 }, { n: "Bruno", v: null, p: 3 }] }),
];

async function render(sections: AssistantPdfSection[], extra: Partial<Parameters<typeof renderAssistantPdfDetailed>[0]> = {}) {
    const result = await renderAssistantPdfDetailed({ title: "Bilan Acme — octobre", subtitle: "Mission Acme", author: "Camille", generatedAt: AT, brand, sections, ...extra });
    assert.equal(result.buffer.subarray(0, 4).toString("latin1"), "%PDF");
    const parsed = await PdfLib.load(result.buffer);
    assert.equal(parsed.getPageCount(), result.pages);
    return result;
}

/** Records every string pdfkit is asked to draw. */
async function withDrawnText<T>(fn: () => Promise<T>): Promise<{ result: T; drawn: string[] }> {
    const proto = PDFKit.prototype as unknown as { text: (...args: unknown[]) => unknown };
    const original = proto.text;
    const drawn: string[] = [];
    proto.text = function (this: unknown, ...args: unknown[]) {
        if (typeof args[0] === "string") drawn.push(args[0]);
        return original.apply(this, args);
    };
    try {
        return { result: await fn(), drawn };
    } finally {
        proto.text = original;
    }
}

for (const v of ALL_KINDS) {
    const spec = v.spec as unknown as { kind: string; title: string };
    test(`visual ${spec.kind} « ${spec.title} » renders to a valid PDF`, async () => {
        const result = await render([{ markdown: "Avant.\n\n[[visuel 1]]\n\nAprès.", visuals: [v] }]);
        assert.ok(result.buffer.length > 1000);
        assert.ok(result.pages >= 1);
    });
}

test("all visuals in one document, an invalid stored visual degrades to a note", async () => {
    const broken = { id: "x", spec: { kind: "bar", title: "cassé" } } as unknown as StoredVisual;
    const markers = [...ALL_KINDS, broken].map((_, i) => `[[visuel ${i + 1}]]`).join("\n\n");
    const { result, drawn } = await withDrawnText(() => render([{ markdown: `Synthèse [E1].\n\n${markers}`, visuals: [...ALL_KINDS, broken] }]));
    assert.ok(result.pages >= 3);
    assert.ok(drawn.includes("Visuel non reproductible dans le PDF."));
    assert.ok(drawn.includes("E1"));
});

test("fr-FR numbers and € survive: no glyph outside WinAnsi reaches pdfkit", async () => {
    const md = "Chiffre d'affaires : **1 240 €** [E1] → +12,5 % 🚀\n\n| Poste | Montant |\n|---|---|\n| Total | 1 240,50 € |";
    const table = visual({ kind: "table", title: "Montants", columns: [{ key: "n", label: "Nom" }, { key: "v", label: "Valeur" }], rows: [{ n: "A", v: 1240 }] });
    const kpi = visual({ kind: "kpi_row", title: "KPI", tiles: [{ label: "Taux", value: 12.5, format: "percent" }, { label: "Appels", value: 12450 }] }, 2);
    const { drawn } = await withDrawnText(() => render([{ markdown: md, visuals: [table, kpi] }]));
    const all = drawn.join("|");
    assert.ok(drawn.includes("1 240 €"), "the amount stays one word with its €");
    assert.ok(drawn.includes("1 240,50 €"));
    assert.ok(drawn.includes("1 240"), "formatValue output normalised");
    assert.ok(drawn.includes("12,5 %"));
    assert.ok(drawn.includes("12,5 k"));
    assert.ok(drawn.includes("29 octobre 2026"));
    assert.ok(drawn.includes("->"));
    assert.ok(!/[ →]/u.test(all));
    assert.ok(!/\p{Extended_Pictographic}/u.test(all));
});

test("a long table spans pages and repeats its header row", async () => {
    const rows = Array.from({ length: 150 }, (_, i) => `| ${i + 1} | Ligne ${i + 1} | ${(i * 1234.5).toLocaleString("fr-FR")} € |`).join("\n");
    const { result, drawn } = await withDrawnText(() => render([{ markdown: `| Rang | Libellé | Montant |\n|---|---|---|\n${rows}`, visuals: [] }]));
    assert.ok(result.pages >= 3, `pages ${result.pages}`);
    assert.ok(result.tableBreaks >= 2);
    const headerCount = drawn.filter((t) => t === "Libellé").length;
    assert.equal(headerCount, result.tableBreaks + 1);
    // Footer « N / M » on every page.
    for (let p = 1; p <= result.pages; p++) assert.ok(drawn.includes(`${p} / ${result.pages}`));
});

test("sections: eyebrow, heading, empty body, long words and the visual table across pages", async () => {
    const big = visual({ kind: "table", title: "Grande table", columns: Array.from({ length: 12 }, (_, i) => ({ key: `c${i}`, label: `Colonne ${i}` })), rows: Array.from({ length: 200 }, (_, r) => Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`c${i}`, i === 0 ? `Ligne ${r} avec un libellé assez long pour passer à la ligne` : r * i]))) });
    const { result, drawn } = await withDrawnText(() =>
        render([
            { eyebrow: "Question 1", heading: "Quel est le bilan ?", markdown: `${"x".repeat(400)}\n\n[[visuel 1]]`, visuals: [big] },
            { eyebrow: "Question 2", heading: "Et ensuite ?", markdown: "", visuals: [] },
        ]),
    );
    assert.ok(result.pages >= 4);
    assert.ok(drawn.includes("QUESTION 1") && drawn.includes("QUESTION 2"));
    assert.ok(drawn.includes("—"), "an empty answer shows a dash");
});

// -- create_pdf ---------------------------------------------------------------------------

function ctx(overrides: Partial<AssistantContext> = {}): AssistantContext {
    return {
        userId: "u1",
        userName: "Camille Martin",
        role: "MANAGER",
        isActive: true,
        permissions: [],
        project: null,
        resolvedAt: AT,
        autoWriteBudget: 3,
        conversationId: "conv1",
        ...overrides,
    };
}

test("create_pdf is a registered safe write in the actions group, triggered by export wording", () => {
    const tool = getTool("create_pdf");
    assert.ok(tool);
    assert.equal(tool.risk, "safe_write");
    assert.equal(tool.requiresProject, false);
    assert.equal(tool.label, "Créer un PDF");
    assert.equal(toolGroupOf("create_pdf"), "actions");
    for (const question of ["Exporte ce bilan en PDF", "Fais-moi un rapport à télécharger", "Un document de synthèse"]) {
        const decision = toolProfileFor({ ctx: ctx(), depth: "standard", question, accessible: ["create_pdf", "whoami", "show_visual", "get_rdv_overview", "search_contacts", "list_clients"] });
        assert.ok(decision.names === null || decision.names.has("create_pdf"), question);
    }
});

test("create_pdf arguments are validated", () => {
    assert.ok(CreatePdfArgs.safeParse({ title: "Bilan", content_markdown: "# OK" }).success);
    assert.ok(CreatePdfArgs.safeParse({ title: "Bilan", content_markdown: "x", include_visuals: [1, 2], subtitle: "Acme", file_name: "bilan" }).success);
    assert.ok(!CreatePdfArgs.safeParse({ title: "Bi", content_markdown: "x" }).success, "title too short");
    assert.ok(!CreatePdfArgs.safeParse({ title: "x".repeat(121), content_markdown: "x" }).success, "title too long");
    assert.ok(!CreatePdfArgs.safeParse({ title: "Bilan", content_markdown: "   " }).success, "empty body");
    assert.ok(!CreatePdfArgs.safeParse({ title: "Bilan", content_markdown: "x".repeat(60_001) }).success, "body too long");
    assert.ok(!CreatePdfArgs.safeParse({ title: "Bilan", content_markdown: "x", include_visuals: [0] }).success);
    assert.ok(!CreatePdfArgs.safeParse({ title: "Bilan", content_markdown: "x", include_visuals: [1.5] }).success);
    assert.ok(!CreatePdfArgs.safeParse({ title: "Bilan" }).success);
});

test("selectVisuals keeps the asked visuals in order and renumbers the markers", () => {
    const turn = [visual({ kind: "donut", title: "A" }, 1), visual({ kind: "donut", title: "B" }, 2), visual({ kind: "donut", title: "C" }, 3)];
    const out = selectVisuals("Intro\n[[visuel 3]]\ntexte\n[[visuel 2]]\n[[visuel 1]]", turn, [3, 1]);
    assert.deepEqual(out.visuals.map((v) => v.id), ["v3", "v1"]);
    assert.equal(out.markdown, "Intro\n[[visuel 1]]\ntexte\n\n[[visuel 2]]");
    assert.throws(() => selectVisuals("x", turn, [4]), /Visuel 4 introuvable/);
    assert.throws(() => selectVisuals("x", [], [1]), /Aucun visuel/);
    assert.deepEqual(selectVisuals("[[visuel 1]]", turn, undefined).visuals, []);
});

test("create_pdf renders with the turn's visuals, stores in the folder and returns the link", async () => {
    const turn = [visual({ kind: "donut", title: "A" }, 1), visual({ kind: "bar", title: "B" }, 2)];
    const calls: { render?: Parameters<CreatePdfDeps["render"]>[0]; store?: Parameters<CreatePdfDeps["store"]>[0] } = {};
    const deps: CreatePdfDeps = {
        render: async (input) => {
            calls.render = input;
            return { buffer: Buffer.from("%PDF-fake"), pages: 3 };
        },
        store: async (input) => {
            calls.store = input;
            return { fileId: "f1", downloadUrl: "/api/files/f1/download" };
        },
        now: () => AT,
    };
    const folder = { id: "fold1", kind: "CLIENT" as const, name: "Acme", clientId: "c1" };
    const out = await executeCreatePdf(
        { title: "Bilan Acme", content_markdown: "Synthèse\n\n[[visuel 2]]", include_visuals: [2] },
        ctx({ folder, turnVisuals: () => turn }),
        deps,
    );
    assert.equal(out.message, "PDF prêt : Bilan Acme (3 pages)");
    assert.equal(out.download_url, "/api/files/f1/download");
    assert.equal(out.file_name, "bilan-acme-2026-10-29.pdf");
    assert.match(out.consigne, /\[bilan-acme-2026-10-29\.pdf\]\(\/api\/files\/f1\/download\)/);
    assert.equal(calls.store?.folderId, "fold1");
    assert.equal(calls.store?.userId, "u1");
    assert.equal(calls.render?.author, "Camille Martin");
    assert.deepEqual(calls.render?.sections[0].visuals.map((v) => v.id), ["v2"]);
    assert.equal(calls.render?.sections[0].markdown, "Synthèse\n\n[[visuel 1]]");

    // No folder: stored for the user; no runtime hook: no visuals.
    const plain = await executeCreatePdf({ title: "Note", content_markdown: "x", file_name: "Ma note" }, ctx(), deps);
    assert.equal(calls.store?.folderId, null);
    assert.equal(plain.file_name, "ma-note-2026-10-29.pdf");
    await assert.rejects(executeCreatePdf({ title: "Note", content_markdown: "x", include_visuals: [1] }, ctx(), deps), /Aucun visuel/);
});

// -- Export access matrix -------------------------------------------------------------------

const OWNER = { id: "owner", role: "MANAGER", isActive: true };
const COLLEAGUE = { id: "colleague", role: "MANAGER", isActive: true };
const INACTIVE = { id: "gone", role: "MANAGER", isActive: false };
const SDR = { id: "sdr", role: "SDR", isActive: true };

const THREAD: ExportMessage[] = [
    { id: "q1", role: "USER", content: "Combien de RDV ?", trace: null },
    { id: "a1", role: "ASSISTANT", content: "**14 RDV** [E1]\n\n[[visuel 1]]\n\n:::suivi\n- Et le mois dernier ?\n:::", trace: { visuals: [ALL_KINDS[0], { id: "junk" }] } },
    { id: "q2", role: "USER", content: "Et par SDR ?", trace: null },
    { id: "a2", role: "ASSISTANT", content: "Alice 12, Bruno 2.", trace: { visuals: [] } },
];

function deps(conv: ExportConversation | null, messages = THREAD) {
    return { findConversation: async () => conv, listMessages: async () => messages };
}

const conv = (visibility: "PRIVATE" | "SHARED"): ExportConversation => ({ id: "c1", title: "Bilan Acme", createdById: OWNER.id, visibility, clientName: "Acme", missionName: null });

test("export access: owner always, colleagues only on SHARED, everyone else 404", async () => {
    const cases: Array<[string, typeof OWNER, "PRIVATE" | "SHARED", boolean]> = [
        ["owner / private", OWNER, "PRIVATE", true],
        ["owner / shared", OWNER, "SHARED", true],
        ["colleague / private", COLLEAGUE, "PRIVATE", false],
        ["colleague / shared", COLLEAGUE, "SHARED", true],
        ["inactive manager / shared", INACTIVE, "SHARED", false],
        ["sdr / shared", SDR, "SHARED", false],
    ];
    for (const [name, viewer, visibility, allowed] of cases) {
        const run = conversationExport(deps(conv(visibility)), viewer, "c1");
        if (allowed) assert.ok((await run).sections.length > 0, name);
        else await assert.rejects(run, (e: unknown) => e instanceof PdfExportError && e.status === 404 && e.message === EXPORT_MESSAGES.conversationNotFound, name);
    }
    await assert.rejects(conversationExport(deps(null), OWNER, "nope"), (e: unknown) => e instanceof PdfExportError && e.status === 404);
});

test("whole thread: one section per question, visuals kept, junk dropped", async () => {
    const content = await conversationExport(deps(conv("PRIVATE")), OWNER, "c1");
    assert.equal(content.title, "Bilan Acme");
    assert.equal(content.subtitle, "Acme · 2 réponses");
    assert.equal(content.sections.length, 2);
    assert.equal(content.sections[0].eyebrow, "Question 1");
    assert.equal(content.sections[0].heading, "Combien de RDV ?");
    assert.equal(content.sections[0].visuals.length, 1);
    assert.equal(content.sections[1].heading, "Et par SDR ?");
    // The rendered thread drops the follow-ups.
    const { drawn } = await withDrawnText(() => render(content.sections));
    assert.ok(!drawn.some((t) => t.includes("mois dernier")));
});

test("selected answers only, under their questions; foreign ids are 404; an empty thread is 404", async () => {
    const one = await conversationExport(deps(conv("SHARED")), COLLEAGUE, "c1", ["a2"]);
    assert.equal(one.sections.length, 1);
    assert.equal(one.sections[0].heading, "Et par SDR ?");
    assert.equal(one.subtitle, "Acme · 1 réponse");
    await assert.rejects(conversationExport(deps(conv("PRIVATE")), OWNER, "c1", ["q1"]), /Réponse introuvable/);
    await assert.rejects(conversationExport(deps(conv("PRIVATE")), OWNER, "c1", ["other"]), /Réponse introuvable/);
    await assert.rejects(conversationExport(deps(conv("PRIVATE"), [THREAD[0]]), OWNER, "c1"), /aucune réponse/);
});

test("agent run report: 404 without a run or a report, content with its valid visuals otherwise", () => {
    assert.throws(() => runReportPdfContent(null), (e: unknown) => e instanceof PdfExportError && e.status === 404 && e.message === EXPORT_MESSAGES.runNotFound);
    const base = { clientName: "Acme", jobName: "Bilan hebdo", playbook: "weekly_bilan", goal: null };
    assert.throws(() => runReportPdfContent({ ...base, report: null }), /pas produit de rapport/);
    const content = runReportPdfContent({ ...base, report: { artifactId: "a", title: "Bilan de la semaine", body: "Corps [[visuel 1]]", visuals: [ALL_KINDS[1], "x", null] } });
    assert.equal(content.title, "Bilan de la semaine");
    assert.equal(content.subtitle, "Acme · Bilan hebdo");
    assert.equal(content.sections[0].visuals.length, 1);
    assert.equal(content.fileBase, "Bilan de la semaine Acme");
    assert.equal(storedVisualsOf({ visuals: [ALL_KINDS[2]] }).length, 1);
    assert.equal(storedVisualsOf(null).length, 0);
});

// -- Client helper ------------------------------------------------------------------------------

test("the download name comes from Content-Disposition", () => {
    assert.equal(fileNameFromDisposition(attachmentHeader("bilan-acme-2026-10-29.pdf")), "bilan-acme-2026-10-29.pdf");
    assert.equal(fileNameFromDisposition('attachment; filename="x.pdf"'), "x.pdf");
    assert.equal(fileNameFromDisposition(null), "document.pdf");
});
