/**
 * Pure rules of the platform support API (/api/instance/support/*):
 *     npm run test:instance-support
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    PLATFORM_SUPPORT_NAME,
    SUPPORT_COMMENT_MAX,
    decodeSupportCursor,
    encodeSupportCursor,
    parseSupportAction,
    parseSupportListQuery,
    serializeSupportTicket,
    signedSupportComment,
    supportListWhere,
} from "./support";

const q = (s: string) => parseSupportListQuery(new URLSearchParams(s));

test("empty query: defaults, no filter", () => {
    const r = q("");
    assert.ok(r.ok);
    assert.equal(r.value.limit, 50);
    assert.deepEqual(supportListWhere(r.value), {});
});

test("enum lists are upper-cased, deduplicated and allowlisted", () => {
    const r = q("status=new,todo,NEW&priority=urgent");
    assert.ok(r.ok);
    assert.deepEqual(r.value.status, ["NEW", "TODO"]);
    assert.deepEqual(r.value.priority, ["URGENT"]);

    const bad = q("status=NEW,DROP_TABLE&category=nope");
    assert.equal(bad.ok, false);
    if (!bad.ok) {
        assert.match(bad.errors.status, /DROP_TABLE/);
        assert.ok(bad.errors.category);
    }
});

test("limit, date and cursor are validated", () => {
    for (const s of ["limit=0", "limit=201", "limit=2.5", "updatedSince=yesterday", "cursor=%%%"]) {
        assert.equal(q(s).ok, false, s);
    }
    const r = q("limit=200&updatedSince=2026-11-01T00:00:00Z");
    assert.ok(r.ok);
    assert.equal(r.value.limit, 200);
    assert.equal(r.value.updatedSince?.toISOString(), "2026-11-01T00:00:00.000Z");
});

test("open=true excludes COMPLETED unless an explicit status wins", () => {
    const open = q("open=true");
    assert.ok(open.ok);
    assert.deepEqual(supportListWhere(open.value), { AND: [{ status: { not: "COMPLETED" } }] });

    const explicit = q("open=true&status=COMPLETED");
    assert.ok(explicit.ok);
    assert.deepEqual(supportListWhere(explicit.value), { AND: [{ status: { in: ["COMPLETED"] } }] });
});

test("search matches a ticket reference as a number", () => {
    const r = q("q=TC-0012");
    assert.ok(r.ok);
    const where = supportListWhere(r.value) as { AND: { OR: unknown[] }[] };
    assert.deepEqual(where.AND[0].OR[2], { number: 12 });
    const text = q("q=export csv");
    assert.ok(text.ok);
    assert.equal((supportListWhere(text.value) as { AND: { OR: unknown[] }[] }).AND[0].OR.length, 2);
});

test("cursor round-trips and drives keyset pagination", () => {
    const c = { updatedAt: new Date("2026-11-05T10:00:00Z"), id: "clx123abc" };
    const raw = encodeSupportCursor(c);
    assert.deepEqual(decodeSupportCursor(raw), c);
    assert.equal(decodeSupportCursor(Buffer.from("not-a-date|x").toString("base64url")), null);
    assert.equal(decodeSupportCursor(Buffer.from("2026-11-05T10:00:00Z|bad id;").toString("base64url")), null);

    const r = q(`cursor=${raw}`);
    assert.ok(r.ok);
    assert.deepEqual(supportListWhere(r.value), {
        AND: [{ OR: [{ updatedAt: { lt: c.updatedAt } }, { updatedAt: c.updatedAt, id: { lt: c.id } }] }],
    });
});

test("actions: comment, status, priority; everything else refused", () => {
    const c = parseSupportAction({ action: "comment", content: "  Corrigé en v2026.11.2  ", operator: " Inès " });
    assert.ok(c.ok);
    assert.deepEqual(c.value, { action: "comment", content: "Corrigé en v2026.11.2", operator: "Inès" });

    assert.equal(parseSupportAction({ action: "comment", content: "   " }).ok, false);
    assert.equal(parseSupportAction({ action: "comment", content: "x".repeat(SUPPORT_COMMENT_MAX + 1) }).ok, false);
    assert.equal(parseSupportAction({ action: "status", status: "DONE" }).ok, false);
    assert.equal(parseSupportAction({ action: "priority", priority: "CRITICAL" }).ok, false);
    assert.equal(parseSupportAction({ action: "delete" }).ok, false);
    assert.equal(parseSupportAction(null).ok, false);
    assert.equal(parseSupportAction([]).ok, false);

    const s = parseSupportAction({ action: "status", status: "IN_PROGRESS", comment: "On regarde" });
    assert.ok(s.ok);
    assert.deepEqual(s.value, { action: "status", status: "IN_PROGRESS", comment: "On regarde", operator: null });
});

test("a reply is signed with the operator's name only when there is one", () => {
    assert.equal(signedSupportComment("Bonjour", null), "Bonjour");
    assert.equal(signedSupportComment("Bonjour", "Inès"), `Bonjour\n\n— Inès, ${PLATFORM_SUPPORT_NAME}`);
});

test("serialised row: reference, preview, overdue, no ids or emails of people", () => {
    const base = {
        id: "t1",
        number: 7,
        title: "Export bloqué",
        description: "a".repeat(400),
        category: "BUG" as const,
        scope: "INTERNAL" as const,
        priority: "HIGH" as const,
        status: "TODO" as const,
        validation: "NOT_REQUIRED" as const,
        dueDate: new Date(Date.now() - 86_400_000),
        completedAt: null,
        createdAt: new Date("2026-11-01T00:00:00Z"),
        updatedAt: new Date("2026-11-02T00:00:00Z"),
        requester: { id: "u1", name: "Sami", role: "SDR" },
        assignee: null,
        client: { id: "c1", name: "Acme" },
        _count: { comments: 3, attachments: 1 },
    };
    const row = serializeSupportTicket(base);
    assert.equal(row.ref, "#TC-0007");
    assert.equal(row.preview?.length, 280);
    assert.ok(row.preview?.endsWith("…"));
    assert.equal(row.overdue, true);
    assert.deepEqual(row.requester, { name: "Sami", role: "SDR" });
    assert.deepEqual(row.client, { name: "Acme" });
    assert.equal(row.comments, 3);

    assert.equal(serializeSupportTicket({ ...base, status: "COMPLETED" }).overdue, false);
    assert.equal(serializeSupportTicket({ ...base, description: null }).preview, null);
    assert.equal(row.lastPlatformReplyAt, null);
    assert.equal(serializeSupportTicket(base, 280, new Date("2026-11-03T08:00:00Z")).lastPlatformReplyAt, "2026-11-03T08:00:00.000Z");
});
