/**
 * Prospection export: original-layout reconstruction, per-line treatment,
 * filters, CSV and the XLSX container.
 *
 * Everything under test is pure, so this runs without a database:
 *     npm run test:prospection-export
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";

import { buildXlsx, columnLetter, crc32, escapeXml, makeSheetNames, toExcelSerial } from "@/lib/export/xlsx";
import { distributeOverSlots, readImportMappings, resolveSourceColumns } from "./columns";
import { parseExportFilters, buildExportQuery } from "./filters";
import type { ProspectionExportData } from "./load";
import { buildRows, formatDuration, indexActions, summarizeActions } from "./rows";
import type {
    ExportAction,
    ExportCompany,
    ExportContact,
    ExportList,
    ProspectionExportFilters,
    StatusVocabulary,
} from "./types";
import { EMPTY_FILTERS } from "./types";
import { buildExportCsv, buildExportPreview, buildExportSheets } from "./workbook";

// ============================================
// FIXTURES
// ============================================

const vocabulary: StatusVocabulary = {
    labelFor: (code) => ({ NO_RESPONSE: "Pas de réponse", CALLBACK_REQUESTED: "Rappel demandé", MEETING_BOOKED: "RDV pris", MEETING_CANCELLED: "RDV annulé", HORS_CIBLE: "Hors cible" }[code] ?? code),
    isCallback: (code) => code === "CALLBACK_REQUESTED",
    orderedCodes: ["MEETING_BOOKED", "CALLBACK_REQUESTED", "NO_RESPONSE"],
};

function contact(id: string, extra: Partial<ExportContact> = {}): ExportContact {
    return {
        id,
        firstName: null,
        lastName: null,
        title: null,
        email: null,
        phone: null,
        linkedin: null,
        additionalPhones: null,
        additionalEmails: null,
        customData: null,
        excludedAt: null,
        exclusionId: null,
        ...extra,
    };
}

function company(id: string, extra: Partial<ExportCompany> = {}): ExportCompany {
    return {
        id,
        listId: "L1",
        name: `Société ${id}`,
        industry: null,
        country: null,
        website: null,
        size: null,
        phone: null,
        customData: null,
        excludedAt: null,
        exclusionId: null,
        contacts: [],
        ...extra,
    };
}

let seq = 0;
function action(extra: Partial<ExportAction>): ExportAction {
    seq++;
    return {
        id: `a${seq}`,
        contactId: null,
        ownerCompanyId: null,
        channel: "CALL",
        result: "NO_RESPONSE",
        note: null,
        callSummary: null,
        callbackDate: null,
        duration: null,
        meetingType: null,
        createdAt: new Date(Date.UTC(2026, 8, 1, 8, seq)),
        sdrId: "sdr1",
        sdrName: "Julien",
        ...extra,
    };
}

function filters(extra: Partial<ProspectionExportFilters> = {}): ProspectionExportFilters {
    return { ...EMPTY_FILTERS, ...extra };
}

// ============================================
// ORIGINAL LAYOUT
// ============================================

test("readImportMappings keeps the file order and ignores malformed entries", () => {
    const mappings = readImportMappings({
        mappings: [
            { csvColumn: "Raison sociale", targetField: "company.name" },
            { csvColumn: "Code interne", targetField: "" },
            { nope: true },
            { csvColumn: "Email", targetField: "contact.email" },
        ],
    });
    assert.deepEqual(mappings?.map((m) => m.csvColumn), ["Raison sociale", "Code interne", "Email"]);
    assert.equal(readImportMappings(null), null);
    assert.equal(readImportMappings({ mappings: [{ csvColumn: "A", targetField: "" }] }), null, "nothing mapped = no layout");
});

test("resolveSourceColumns rebuilds the client's columns, in order, from current values", () => {
    const mappings = readImportMappings({
        mappings: [
            { csvColumn: "Nom", targetField: "contact.lastName" },
            { csvColumn: "Entreprise", targetField: "company.name" },
            { csvColumn: "ID CRM client", targetField: "" },
            { csvColumn: "Code NAF", targetField: "company.Code_NAF" },
            { csvColumn: "Tél", targetField: "contact.phone" },
            { csvColumn: "Tél 2", targetField: "contact.additionalPhones" },
            { csvColumn: "Service", targetField: "contact.service" },
        ],
    });
    const c = company("C1", {
        name: "ACME",
        customData: { Code_NAF: "6201Z", ajout_ulterieur: "x" },
        contacts: [
            contact("K1", {
                lastName: "Martin",
                phone: "0102030405",
                additionalPhones: ["0600000001", "0600000002"],
                customData: { service: "Achats" },
            }),
        ],
    });
    const resolved = resolveSourceColumns(mappings, [c]);
    assert.equal(resolved.fromOriginalFile, true);
    assert.deepEqual(resolved.ignoredColumns, ["ID CRM client"]);
    assert.deepEqual(
        resolved.columns.map((col) => col.header),
        ["Nom", "Entreprise", "Code NAF", "Tél", "Tél 2", "Service", "ajout ulterieur"],
        "file columns first (ignored one dropped), then data added later"
    );
    const row = { company: c, contact: c.contacts[0] };
    assert.deepEqual(
        resolved.columns.map((col) => col.get(row)),
        ["Martin", "ACME", "6201Z", "0102030405", "0600000001, 0600000002", "Achats", "x"],
        "single extra-phone column takes every additional number"
    );
});

test("resolveSourceColumns keeps company columns filled on company-only lines", () => {
    const mappings = readImportMappings({
        mappings: [
            { csvColumn: "Société", targetField: "company.name" },
            { csvColumn: "Standard", targetField: "company.phone" },
            { csvColumn: "Prénom", targetField: "contact.firstName" },
        ],
    });
    const c = company("C1", { name: "Solo", phone: "0400000000" });
    const resolved = resolveSourceColumns(mappings, [c]);
    assert.deepEqual(resolved.columns.map((col) => col.get({ company: c, contact: null })), ["Solo", "0400000000", ""]);
});

test("resolveSourceColumns falls back to standard CRM fields for lists not built from a file", () => {
    const c = company("C1", { contacts: [contact("K1", { additionalEmails: ["b@x.fr"] })] });
    const resolved = resolveSourceColumns(null, [c]);
    assert.equal(resolved.fromOriginalFile, false);
    const headers = resolved.columns.map((col) => col.header);
    assert.ok(headers.includes("Société") && headers.includes("Email") && headers.includes("Autres emails contact"));
});

test("distributeOverSlots puts overflow in the last slot", () => {
    assert.deepEqual(distributeOverSlots(["a", "b", "c"], 2), ["a", "b, c"]);
    assert.deepEqual(distributeOverSlots(["a"], 3), ["a", "", ""]);
    assert.deepEqual(distributeOverSlots(["a"], 0), []);
});

// ============================================
// TREATMENT
// ============================================

test("summarizeActions counts attempts and reads the current status from the latest action", () => {
    const t = summarizeActions([
        action({ result: "NO_RESPONSE", duration: 30 }),
        action({ result: "NO_RESPONSE", note: "messagerie" }),
        action({ channel: "EMAIL", result: "MAIL_ENVOYE" }),
        action({ result: "CALLBACK_REQUESTED", note: "  rappeler lundi ", duration: 95, callbackDate: new Date(Date.UTC(2026, 8, 7, 9)) }),
    ], vocabulary);
    assert.equal(t.treated, true);
    assert.equal(t.callCount, 3);
    assert.equal(t.emailCount, 1);
    assert.equal(t.actionCount, 4);
    assert.equal(t.totalCallSeconds, 125);
    assert.equal(t.lastResult, "CALLBACK_REQUESTED");
    assert.equal(t.lastResultLabel, "Rappel demandé");
    assert.equal(t.lastNote, "rappeler lundi");
    assert.ok(t.nextCallbackAt);
    assert.equal(t.historyLines.length, 4);
    assert.match(t.historyLines[0], /Rappel demandé · Julien \(rappel le .+\) — rappeler lundi$/, "newest first");
});

test("summarizeActions: an untreated line and a cancelled meeting", () => {
    const empty = summarizeActions([], vocabulary);
    assert.equal(empty.treated, false);
    assert.equal(empty.lastResultLabel, "Non traité");

    const cancelled = summarizeActions([
        action({ result: "MEETING_BOOKED", callbackDate: new Date(Date.UTC(2026, 8, 10)) }),
        action({ result: "MEETING_CANCELLED" }),
    ], vocabulary);
    assert.equal(cancelled.meetingBookedAt, null, "a cancellation voids the meeting");
    assert.equal(cancelled.nextCallbackAt, null);
});

test("buildRows: one line per contact, company-level calls count on each line", () => {
    const c1 = company("C1", { contacts: [contact("K1"), contact("K2")] });
    const c2 = company("C2");
    const index = indexActions([
        action({ contactId: "K1", ownerCompanyId: "C1", result: "MEETING_BOOKED" }),
        action({ ownerCompanyId: "C1", result: "NO_RESPONSE" }), // switchboard call
        action({ ownerCompanyId: "C2", result: "HORS_CIBLE", sdrId: "sdr2", sdrName: "Morgane" }),
    ]);

    const all = buildRows([c1, c2], index, filters(), vocabulary);
    assert.equal(all.length, 3);
    assert.deepEqual(all.map((r) => r.treatment.callCount), [2, 1, 1]);
    assert.equal(all[0].treatment.lastResult, "NO_RESPONSE", "the switchboard call came after the meeting");

    const meetings = buildRows([c1, c2], index, filters({ statuses: ["HORS_CIBLE"] }), vocabulary);
    assert.deepEqual(meetings.map((r) => r.company.id), ["C2"]);

    const julienOnly = buildRows([c1, c2], index, filters({ sdrIds: ["sdr1"], treatment: "untreated" }), vocabulary);
    assert.deepEqual(julienOnly.map((r) => r.company.id), ["C2"], "C2 was only touched by Morgane");
});

// ============================================
// FILTER QUERY STRING
// ============================================

test("filters round-trip through the query string, days in Paris time", () => {
    const q = buildExportQuery({
        listIds: ["L1", "L2"],
        statuses: ["MEETING_BOOKED"],
        treatment: "treated",
        sdrIds: [],
        channels: ["CALL"],
        from: "2026-09-01",
        to: "2026-09-30",
    });
    const f = parseExportFilters(q);
    assert.deepEqual(f.listIds, ["L1", "L2"]);
    assert.equal(f.treatment, "treated");
    assert.deepEqual(f.channels, ["CALL"]);
    assert.equal(f.from?.toISOString(), "2026-08-31T22:00:00.000Z");
    assert.equal(f.to?.toISOString(), "2026-09-30T21:59:59.999Z");

    const defaults = parseExportFilters(new URLSearchParams("channels=fax&treatment=bogus"));
    assert.equal(defaults.listIds, null);
    assert.equal(defaults.treatment, "all");
    assert.deepEqual(defaults.channels, []);
});

// ============================================
// WORKBOOK / CSV / PREVIEW
// ============================================

function fixtureData(): ProspectionExportData {
    const lists: ExportList[] = [
        {
            id: "L1",
            name: "Fichier client septembre",
            source: "CSV Import",
            isActive: true,
            isArchived: false,
            createdAt: new Date(Date.UTC(2026, 8, 1)),
            importedAt: new Date(Date.UTC(2026, 8, 1)),
            mappings: [
                { csvColumn: "Société", targetField: "company.name" },
                { csvColumn: "Réf", targetField: "" },
                { csvColumn: "Email", targetField: "contact.email" },
            ],
        },
    ];
    const c1 = company("C1", { name: 'ACME; "Paris"', contacts: [contact("K1", { email: "a@acme.fr" })] });
    const c2 = company("C2", { name: "Beta" });
    return {
        mission: { id: "M1", name: "Mission test", clientName: "Client", channels: ["CALL"] },
        lists,
        selectedListIds: ["L1"],
        companiesByList: new Map([["L1", [c1, c2]]]),
        companyCountByList: new Map([["L1", 2]]),
        actions: [
            action({ contactId: "K1", ownerCompanyId: "C1", result: "NO_RESPONSE" }),
            action({ contactId: "K1", ownerCompanyId: "C1", result: "MEETING_BOOKED", note: "RDV\nmardi" }),
        ],
        vocabulary,
        exclusionReasons: new Map(),
        sdrNames: new Map([["sdr1", "Julien"]]),
        filters: filters(),
    };
}

test("buildExportCsv: original columns then tracking, semicolon + BOM, safe quoting", () => {
    const csv = buildExportCsv(fixtureData());
    assert.ok(csv.startsWith("﻿"));
    const lines = csv.slice(1).trim().split("\r\n");
    const header = lines[0].split(";");
    assert.deepEqual(header.slice(0, 4), ["Société", "Email", "Traité", "Statut actuel"]);
    assert.ok(lines[1].startsWith('"ACME; ""Paris"""'), "delimiters and quotes escaped");
    assert.ok(lines[1].includes("RDV pris"));
    assert.ok(!lines[1].includes("RDV\nmardi"), "history kept on one CSV line");
    assert.ok(lines[2].startsWith("Beta;;Non;Non traité"));
});

test("buildExportPreview counts lines, treated lines and current statuses", () => {
    const preview = buildExportPreview(fixtureData());
    assert.equal(preview.totals.rows, 2);
    assert.equal(preview.totals.treatedRows, 1);
    assert.equal(preview.totals.calls, 2);
    assert.deepEqual(preview.statuses.map((s) => [s.code, s.count]), [["MEETING_BOOKED", 1]]);
    assert.equal(preview.untreatedRows, 1);
    assert.deepEqual(preview.lists[0].ignoredColumns, ["Réf"]);
});

test("buildExportSheets: Synthèse, the list in its own layout, Historique", () => {
    const sheets = buildExportSheets(fixtureData(), { includeSummary: true, includeHistory: true });
    assert.deepEqual(sheets.map((s) => s.name), ["Synthèse", "Fichier client septembre", "Historique"]);
    assert.equal(sheets[1].rows.length, 3, "header + 2 lines");
    assert.equal(sheets[2].rows.length, 3, "header + 2 actions");
});

// ============================================
// XLSX CONTAINER
// ============================================

/** Reads back a zip written by buildZip (central directory walk). */
function unzip(buf: Buffer): Map<string, string> {
    const files = new Map<string, string>();
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    for (let i = 0; i < count; i++) {
        assert.equal(buf.readUInt32LE(p), 0x02014b50);
        const crc = buf.readUInt32LE(p + 16);
        const compSize = buf.readUInt32LE(p + 20);
        const nameLen = buf.readUInt16LE(p + 28);
        const extraLen = buf.readUInt16LE(p + 30);
        const commentLen = buf.readUInt16LE(p + 32);
        const offset = buf.readUInt32LE(p + 42);
        const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
        const localNameLen = buf.readUInt16LE(offset + 26);
        const localExtraLen = buf.readUInt16LE(offset + 28);
        const start = offset + 30 + localNameLen + localExtraLen;
        const data = inflateRawSync(buf.subarray(start, start + compSize));
        assert.equal(crc32(data), crc, `crc of ${name}`);
        files.set(name, data.toString("utf8"));
        p += 46 + nameLen + extraLen + commentLen;
    }
    return files;
}

test("buildXlsx writes a well-formed package", () => {
    const buf = buildXlsx([
        {
            name: "Liste: A/B?",
            rows: [["Nom", "Date"], ["Léa <&> \u0007", new Date(Date.UTC(2026, 8, 29, 12, 0))]],
            freeze: { rows: 1 },
            autoFilter: { headerRow: 0, lastRow: 1, lastCol: 1 },
        },
        { name: "Liste: A/B?", rows: [[1]] },
    ]);
    const files = unzip(buf);
    assert.ok(files.has("[Content_Types].xml") && files.has("xl/workbook.xml") && files.has("xl/styles.xml"));
    const wb = files.get("xl/workbook.xml")!;
    assert.match(wb, /<sheet name="Liste A B" sheetId="1"/);
    assert.match(wb, /<sheet name="Liste A B \(2\)" sheetId="2"/, "duplicate names made unique");
    const sheet = files.get("xl/worksheets/sheet1.xml")!;
    assert.match(sheet, /Léa &lt;&amp;&gt; <\/t>/, "escaped, control char stripped");
    assert.match(sheet, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
    assert.match(sheet, /<autoFilter ref="A1:B2"\/>/);
});

test("xlsx helpers", () => {
    assert.equal(columnLetter(0), "A");
    assert.equal(columnLetter(25), "Z");
    assert.equal(columnLetter(26), "AA");
    assert.equal(columnLetter(701), "ZZ");
    assert.equal(escapeXml('a"b'), "a&quot;b");
    assert.deepEqual(makeSheetNames(["", "x".repeat(40)]), ["Feuille", "x".repeat(31)]);
    // 29/09/2026 12:00 UTC is 14:00 in Paris (CEST).
    const serial = toExcelSerial(new Date(Date.UTC(2026, 8, 29, 12, 0)), "Europe/Paris");
    assert.ok(Math.abs(serial - (46294 + 14 / 24)) < 1e-6, `serial ${serial}`);
    assert.equal(formatDuration(754), "12:34");
    assert.equal(formatDuration(3754), "1:02:34");
    assert.equal(formatDuration(0), "");
});
