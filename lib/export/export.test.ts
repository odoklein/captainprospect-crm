/**
 * Data export: plan (what leaves), CSV cells, streaming zip:
 *     npm run test:export
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createWriteStream, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { csvCell, csvLine, planExport, quoteIdent, type ExportModel } from "./plan";
import { ZipWriter } from "./zip";

const models: ExportModel[] = [
    {
        name: "User",
        fields: [
            { name: "id", kind: "scalar", type: "String", isId: true },
            { name: "email", kind: "scalar", type: "String" },
            { name: "password", kind: "scalar", type: "String" },
            { name: "role", kind: "enum", type: "UserRole" },
            { name: "actions", kind: "object", type: "Action" },
        ],
    },
    { name: "UserSession", fields: [{ name: "id", kind: "scalar", type: "String", isId: true }] },
    {
        name: "Mailbox",
        fields: [
            { name: "id", kind: "scalar", type: "String", isId: true },
            { name: "email", kind: "scalar", type: "String" },
            { name: "accessToken", kind: "scalar", type: "String" },
            { name: "refreshToken", kind: "scalar", type: "String" },
            { name: "blob", kind: "scalar", type: "Bytes" },
        ],
    },
    {
        name: "AssistantConversation",
        dbName: "AssistantProjetConversation",
        fields: [
            { name: "id", kind: "scalar", type: "String", isId: true },
            { name: "tags", kind: "scalar", type: "String", isList: true },
        ],
    },
];

test("plan drops credentials, sessions, relations and binary columns", () => {
    const plan = planExport(models);
    assert.deepEqual(plan.tables.map((t) => t.model), ["AssistantConversation", "Mailbox", "User"]);
    assert.deepEqual(plan.excludedModels, [{ model: "UserSession", reason: "sessions" }]);

    const user = plan.tables.find((t) => t.model === "User")!;
    assert.deepEqual(user.columns.map((c) => c.name), ["id", "email", "role"]);
    assert.deepEqual(user.droppedColumns, ["password"]);
    assert.deepEqual(user.orderBy, ['"id"']);

    const mailbox = plan.tables.find((t) => t.model === "Mailbox")!;
    assert.deepEqual(mailbox.columns.map((c) => c.name), ["id", "email"]);
    assert.deepEqual(mailbox.droppedColumns, ["accessToken", "refreshToken"]);
});

test("plan uses the database table name when it differs", () => {
    const t = planExport(models).tables.find((x) => x.model === "AssistantConversation")!;
    assert.equal(t.table, '"AssistantProjetConversation"');
});

test("identifiers are validated", () => {
    assert.equal(quoteIdent("Action"), '"Action"');
    assert.throws(() => quoteIdent('x"; DROP TABLE "User'), /unsafe_identifier/);
});

test("csv cells: quoting, dates, json, null, formula guard", () => {
    assert.equal(csvCell(null), "");
    assert.equal(csvCell(undefined), "");
    assert.equal(csvCell("plain"), "plain");
    assert.equal(csvCell('a "b", c'), '"a ""b"", c"');
    assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
    assert.equal(csvCell(new Date("2026-10-26T08:00:00Z")), "2026-10-26T08:00:00.000Z");
    assert.equal(csvCell(BigInt(10)), "10");
    assert.equal(csvCell(["a", "b"]), '"[""a"",""b""]"');
    assert.equal(csvCell({ a: 1 }), '"{""a"":1}"');
    assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
    assert.equal(csvCell("@sum"), "'@sum");
    assert.equal(csvCell("-1.5"), "-1.5");
    assert.equal(csvCell("+33 6 12 34 56 78"), "+33 6 12 34 56 78");
    assert.equal(csvCell("+cmd"), "'+cmd");
    assert.equal(csvLine(["a", 1, null]), "a,1,\r\n");
});

test("zip: entries round-trip through a real unzip", (t) => {
    const dir = mkdtempSync(path.join(tmpdir(), "zip-test-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, "out.zip");

    async function* big() {
        for (let i = 0; i < 2000; i++) yield `row ${i},${"x".repeat(200)}\r\n`;
    }

    return (async () => {
        const zip = new ZipWriter(createWriteStream(file));
        await zip.addEntry("Prospects é.csv", big());
        await zip.addEntry("empty.csv", []);
        await zip.addEntry("manifest.json", [JSON.stringify({ ok: true })]);
        await zip.finish();

        // Python's zipfile checks CRCs and sizes against the central directory.
        const python = ["python3", "python"].find((p) => spawnSync(p, ["-c", "pass"]).status === 0);
        if (!python) return t.skip("python introuvable: pas de décompression de référence");
        const out = execFileSync(
            python,
            [
                "-c",
                "import sys,zipfile,json;z=zipfile.ZipFile(sys.argv[1]);bad=z.testzip();"
                + "print(json.dumps({'bad':bad,'names':z.namelist(),'first':z.read(z.namelist()[0]).decode().splitlines()[1999][:12],'manifest':z.read('manifest.json').decode(),'empty':len(z.read('empty.csv'))}))",
                file,
            ],
            { encoding: "utf8" },
        );
        const r = JSON.parse(out);
        assert.equal(r.bad, null);
        assert.deepEqual(r.names, ["Prospects é.csv", "empty.csv", "manifest.json"]);
        assert.equal(r.first, "row 1999,xxx");
        assert.equal(r.manifest, '{"ok":true}');
        assert.equal(r.empty, 0);
        assert.ok(readFileSync(file).length < 2000 * 200, "entries are compressed");
    })();
});
