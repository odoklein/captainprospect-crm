/**
 * Text extraction on tiny fixtures built in memory (no file on disk):
 *     npx tsx --test lib/assistant/files/extract.test.ts
 *
 * The PDF is generated with pdf-lib and read back through unpdf, the XLSX is
 * written with exceljs, and a minimal valid .docx (four OOXML parts) is
 * zipped with jszip (a dependency of exceljs and mammoth); if jszip cannot be
 * resolved that one test is skipped with a note.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts } from "pdf-lib";

import {
    MAX_ROWS_PER_SHEET,
    decodeText,
    docxHtmlToSections,
    extractDocument,
    formatRow,
    markdownSections,
    resolveDocumentKind,
} from "./extract";
import { chunkSections } from "./chunk";

const enc = (s: string) => new TextEncoder().encode(s);

// ── Kind resolution ─────────────────────────────────────────────────────────

test("kind comes from the mime, then from the extension for generic or mislabelled mimes", () => {
    assert.equal(resolveDocumentKind("application/pdf", "x"), "pdf");
    assert.equal(resolveDocumentKind("text/csv; charset=utf-8", "x"), "csv");
    assert.equal(resolveDocumentKind("", "notes.md"), "md");
    assert.equal(resolveDocumentKind("application/octet-stream", "brief.MD"), "md");
    assert.equal(resolveDocumentKind("application/vnd.ms-excel", "export.csv"), "csv");
    assert.equal(resolveDocumentKind("image/png", "trick.pdf"), null);
    assert.equal(resolveDocumentKind("application/zip", "a.zip"), null);
});

// ── Text formats ────────────────────────────────────────────────────────────

test("TXT: UTF-8 BOM stripped, CRLF normalised", async () => {
    const r = await extractDocument(enc("﻿Bonjour\r\nle monde  \r\n"), "text/plain", "a.txt");
    assert.equal(r.status, "READY");
    assert.equal(r.extractor, "text");
    assert.equal(r.text, "Bonjour\nle monde");
});

test("TXT: invalid UTF-8 falls back to Windows-1252 (accents survive)", () => {
    const latin1 = new Uint8Array([0x63, 0x61, 0x66, 0xe9]); // "café" in cp1252
    assert.equal(decodeText(latin1), "café");
});

test("MD: sections split on headings, fenced code ignored", async () => {
    const md = "Intro libre\n\n# Offre\nPrix 5 €.\n\n```\n# pas un titre\n```\n\n## Cible\nDAF de PME.";
    const sections = markdownSections(md);
    assert.deepEqual(
        sections.map((s) => s.heading ?? null),
        [null, "Offre", "Cible"],
    );
    assert.match(sections[1].text, /# pas un titre/);
    const r = await extractDocument(enc(md), "text/markdown", "brief.md");
    assert.equal(r.status, "READY");
    assert.equal(r.sections.length, 3);
});

test("CSV: rows as a | b | c with the header in the section heading, 2000-row cap", async () => {
    const lines = ["nom;ville", ...Array.from({ length: MAX_ROWS_PER_SHEET + 5 }, (_, i) => `Société ${i};Lyon`)];
    const r = await extractDocument(enc(lines.join("\n")), "text/csv", "prospects.csv");
    assert.equal(r.status, "READY");
    assert.equal(r.extractor, "papaparse");
    assert.equal(r.sections.length, 1);
    assert.match(r.sections[0].heading ?? "", /^prospects — colonnes : nom \| ville$/);
    assert.match(r.sections[0].text, /^nom \| ville\nSociété 0 \| Lyon/);
    assert.match(r.sections[0].text, /6 ligne\(s\) au-delà de 2000/);
    assert.equal(r.truncated, true);
});

test("formatRow drops trailing empties and empty rows", () => {
    assert.equal(formatRow(["a", "", "c", "", null]), "a |  | c");
    assert.equal(formatRow(["", null, undefined]), null);
    assert.equal(formatRow([new Date("2026-10-29T00:00:00Z"), 3, true]), "2026-10-29 | 3 | VRAI");
});

// ── XLSX ────────────────────────────────────────────────────────────────────

test("XLSX: one section per sheet, rows as a | b | c, rich text and formulas", async () => {
    const wb = new ExcelJS.Workbook();
    const s1 = wb.addWorksheet("Contacts");
    s1.addRow(["Nom", "Poste", "CA"]);
    s1.addRow(["Durand", { richText: [{ text: "Directeur " }, { text: "commercial" }] }, 1200]);
    s1.addRow([]);
    s1.addRow(["Martin", "DAF", { formula: "1+1", result: 2 }]);
    const s2 = wb.addWorksheet("Vide");
    void s2;
    const s3 = wb.addWorksheet("Objectifs");
    s3.addRow(["Trimestre", "RDV"]);
    s3.addRow(["T4", 40]);
    const buffer = new Uint8Array(await wb.xlsx.writeBuffer());

    const r = await extractDocument(buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "suivi.xlsx");
    assert.equal(r.status, "READY");
    assert.equal(r.extractor, "exceljs");
    assert.deepEqual(
        r.sections.map((s) => s.heading),
        ["Feuille Contacts — colonnes : Nom | Poste | CA", "Feuille Objectifs — colonnes : Trimestre | RDV"],
    );
    assert.equal(r.sections[0].text, "Nom | Poste | CA\nDurand | Directeur commercial | 1200\nMartin | DAF | 2");
    assert.match(r.text, /T4 \| 40/);
});

// ── DOCX ────────────────────────────────────────────────────────────────────

test("DOCX HTML: headings split sections, tables become rows, lists become dashes", () => {
    const html =
        "<p>Préambule</p><h1>Offre &amp; prix</h1><p>Abonnement <strong>annuel</strong>.</p>" +
        "<table><tr><td><p>Pack</p></td><td><p>Prix</p></td></tr><tr><td><p>Pro</p></td><td><p>99 €</p></td></tr></table>" +
        "<h2>Cible</h2><ul><li>DAF</li><li>DG</li></ul>";
    const sections = docxHtmlToSections(html);
    assert.deepEqual(
        sections.map((s) => s.heading ?? null),
        [null, "Offre & prix", "Cible"],
    );
    assert.equal(sections[0].text, "Préambule");
    assert.match(sections[1].text, /Abonnement annuel\./);
    assert.match(sections[1].text, /Pack \| Prix\nPro \| 99 €/);
    assert.equal(sections[2].text, "- DAF\n\n- DG");
});

/** A minimal valid .docx: [Content_Types].xml, _rels/.rels, word/document.xml (+ styles for headings). */
async function buildDocx(): Promise<Uint8Array | null> {
    let JSZip: { new (): { file(n: string, d: string): void; generateAsync(o: { type: "uint8array" }): Promise<Uint8Array> } };
    try {
        // jszip ships with exceljs / mammoth.
        JSZip = (await import("jszip")).default as unknown as typeof JSZip;
    } catch {
        return null;
    }
    const zip = new JSZip();
    zip.file(
        "[Content_Types].xml",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
    );
    zip.file(
        "_rels/.rels",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    );
    zip.file(
        "word/_rels/document.xml.rels",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    );
    zip.file(
        "word/styles.xml",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`,
    );
    const p = (text: string, style?: string) =>
        `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
    zip.file(
        "word/document.xml",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p("Contrat de prestation")}${p("Objet", "Heading1")}${p("Prospection téléphonique de DAF.")}</w:body></w:document>`,
    );
    return zip.generateAsync({ type: "uint8array" });
}

test("DOCX: mammoth reads a real package, headings kept", async (t) => {
    const docx = await buildDocx();
    if (!docx) {
        t.skip("jszip not resolvable: DOCX package test skipped (HTML conversion still covered above)");
        return;
    }
    const r = await extractDocument(docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "contrat.docx");
    assert.equal(r.status, "READY");
    assert.equal(r.extractor, "mammoth");
    assert.deepEqual(
        r.sections.map((s) => [s.heading ?? null, s.text]),
        [
            [null, "Contrat de prestation"],
            ["Objet", "Prospection téléphonique de DAF."],
        ],
    );
});

// ── PDF ─────────────────────────────────────────────────────────────────────

async function buildPdf(pages: string[][]): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const lines of pages) {
        const page = doc.addPage([595, 842]);
        lines.forEach((line, i) => page.drawText(line, { x: 50, y: 780 - i * 18, size: 12, font }));
    }
    return doc.save();
}

test("PDF: one section per page through unpdf, page numbers kept", async () => {
    const pdf = await buildPdf([
        ["Proposition commerciale pour la prospection B2B.", "Notre equipe appelle les directeurs financiers."],
        ["Tarifs : 4500 euros par mois pour deux SDR a plein temps.", "Engagement minimum de trois mois."],
    ]);
    const r = await extractDocument(pdf, "application/pdf", "offre.pdf");
    assert.equal(r.status, "READY");
    assert.equal(r.extractor, "unpdf");
    assert.equal(r.pages, 2);
    assert.deepEqual(r.sections.map((s) => s.page), [1, 2]);
    assert.match(r.sections[0].text, /prospection B2B/);
    assert.match(r.sections[1].text, /4500 euros/);

    const { chunks } = chunkSections(r.sections);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].page, 1);
});

test("PDF: under 40 characters per page reads as a scan (NEEDS_OCR)", async () => {
    const pdf = await buildPdf([["p1"], [], ["Page 3"]]);
    const r = await extractDocument(pdf, "application/pdf", "scan.pdf");
    assert.equal(r.status, "NEEDS_OCR");
    assert.equal(r.pages, 3);
    assert.equal(r.text, "");
    assert.deepEqual(r.sections, []);
});

// ── Unsupported, cap ────────────────────────────────────────────────────────

test("unsupported mime is UNSUPPORTED, never thrown", async () => {
    const r = await extractDocument(new Uint8Array([1, 2, 3]), "image/png", "photo.png");
    assert.equal(r.status, "UNSUPPORTED");
    assert.equal(r.text, "");
});

test("text is capped at 1.5M characters", async () => {
    const big = "mot ".repeat(400_000); // 1.6M chars
    const r = await extractDocument(enc(big), "text/plain", "big.txt");
    assert.equal(r.truncated, true);
    assert.ok(r.text.length <= 1_500_000, `${r.text.length}`);
    assert.ok(r.text.length > 1_400_000);
});
