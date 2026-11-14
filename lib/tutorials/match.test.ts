import { test } from "node:test";
import assert from "node:assert/strict";
import { findTutorial } from "./match";
import { TUTORIALS } from "./registry.generated";
import type { TutorialEntry } from "./types";

const t = (id: string, match: string[]): TutorialEntry => ({ id, title: id, section: "", match, durationSec: 40, version: "x" });
const list = [
    t("billing", ["/manager/billing"]),
    t("invoices", ["/manager/billing/invoices", "/manager/billing/invoices/**"]),
    t("emails", ["/manager/emails/**"]),
    t("lists", ["/manager/lists", "/manager/lists/*", "/manager/lists/*/edit"]),
    t("clients", ["/manager/clients"]),
    t("mission", ["/manager/clients?mission"]),
];

test("a required query parameter selects the more specific tutorial", () => {
    assert.equal(findTutorial("/manager/clients", list, new URLSearchParams("client=a"))?.id, "clients");
    assert.equal(findTutorial("/manager/clients", list, new URLSearchParams("client=a&mission=b"))?.id, "mission");
    assert.equal(findTutorial("/manager/clients", list)?.id, "clients");
});

test("exact routes match", () => {
    assert.equal(findTutorial("/manager/billing", list)?.id, "billing");
    assert.equal(findTutorial("/manager/billing/invoices", list)?.id, "invoices");
});

test("** matches the base route and any suffix", () => {
    assert.equal(findTutorial("/manager/emails", list)?.id, "emails");
    assert.equal(findTutorial("/manager/emails/inbox", list)?.id, "emails");
    assert.equal(findTutorial("/manager/billing/invoices/abc/edit", list)?.id, "invoices");
});

test("* matches exactly one segment", () => {
    assert.equal(findTutorial("/manager/lists/abc", list)?.id, "lists");
    assert.equal(findTutorial("/manager/lists/abc/edit", list)?.id, "lists");
    assert.equal(findTutorial("/manager/lists/abc/other", list), null);
});

test("unknown routes have no tutorial", () => {
    assert.equal(findTutorial("/manager/unknown", list), null);
    assert.equal(findTutorial("/sdr/action", list), null);
});

test("generated registry: unique ids, every pattern under /manager", () => {
    const ids = new Set(TUTORIALS.map((x) => x.id));
    assert.equal(ids.size, TUTORIALS.length);
    for (const x of TUTORIALS) for (const m of x.match) assert.ok(m.startsWith("/manager/"), m);
    assert.ok(TUTORIALS.length > 0);
});

test("generated registry: every listed route resolves to its own tutorial", () => {
    for (const x of TUTORIALS) for (const m of x.match) {
        const [route, query] = m.split("?");
        const concrete = route.replace(/\/\*\*$/, "").replace(/\*/g, "demo-id");
        const params = new URLSearchParams(query ? query.split("&").map((k) => `${k}=x`).join("&") : "");
        assert.equal(findTutorial(concrete, TUTORIALS, params)?.id, x.id, `${m} → ${x.id}`);
    }
});
