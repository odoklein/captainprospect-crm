/**
 * Pure rules of « Nouveautés »:
 *     npm run test:changelog
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    isBanner,
    isForRole,
    isLive,
    isRunning,
    isSafeCtaUrl,
    offerResetsDecision,
    offerState,
    resolveDecision,
    validateChangelogInput,
} from "./resolve";

const now = new Date("2026-11-14T12:00:00Z");

test("a release from the Console validates, lowercase kind accepted", () => {
    const r = validateChangelogInput({
        externalId: "release:5f1c",
        kind: "release",
        title: "  Assistant IA dans l'espace SDR ",
        notes: [
            { type: "new", title: "Assistant IA", module: "SDR" },
            { type: "fixed", title: "Numéro coupé dans la prise de RDV", body: "Le panneau s'élargit." },
        ],
        version: "d80a9de",
        offer: { tag: "d80a9de", migration: false, deadline: "2026-12-14T00:00:00Z", window: "22:00–06:00" },
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.value.kind, "RELEASE");
    assert.equal(r.value.title, "Assistant IA dans l'espace SDR");
    assert.equal(r.value.notes.length, 2);
    assert.equal(r.value.offer?.tag, "d80a9de");
    assert.equal(r.value.offer?.deadline?.toISOString(), "2026-12-14T00:00:00.000Z");
    assert.deepEqual(r.value.audience, []);
});

test("bad input is refused field by field", () => {
    const r = validateChangelogInput({
        externalId: "../etc",
        kind: "news",
        title: "",
        audience: ["ADMIN"],
        ctaLabel: "Voir",
        ctaUrl: "javascript:alert(1)",
        notes: [{ type: "breaking", title: "x" }],
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    for (const k of ["externalId", "kind", "title", "audience", "ctaUrl", "notes.0"]) assert.ok(r.errors[k], k);
});

test("an offer only rides on a release; null withdraws it; absent leaves it", () => {
    const ann = validateChangelogInput({ externalId: "a1", kind: "announcement", title: "x", offer: { tag: "abc1234" } });
    assert.equal(ann.ok, false);
    const withdraw = validateChangelogInput({ externalId: "r1", kind: "release", title: "x", offer: null });
    assert.equal(withdraw.ok && withdraw.value.offer, null);
    const absent = validateChangelogInput({ externalId: "r1", kind: "release", title: "x" });
    assert.equal(absent.ok && "offer" in absent.value, false);
});

test("CTA links: CRM paths or https only", () => {
    assert.equal(isSafeCtaUrl("/manager/assistant"), true);
    assert.equal(isSafeCtaUrl("https://suzalink.com/tuto"), true);
    assert.equal(isSafeCtaUrl("//evil.com"), false);
    assert.equal(isSafeCtaUrl("http://suzalink.com"), false);
});

test("audience: empty means staff, never the client portal", () => {
    assert.equal(isForRole({ audience: [] }, "SDR"), true);
    assert.equal(isForRole({ audience: [] }, "CLIENT"), false);
    assert.equal(isForRole({ audience: ["MANAGER"] }, "SDR"), false);
    assert.equal(isForRole({ audience: ["CLIENT"] }, "CLIENT"), true);
});

test("live window and banners", () => {
    const base = { kind: "ANNOUNCEMENT", audience: [], publishedAt: new Date("2026-11-13T00:00:00Z"), category: "maintenance", severity: "info" };
    assert.equal(isLive({ ...base, startsAt: null, endsAt: null }, now), true);
    assert.equal(isLive({ ...base, startsAt: new Date("2026-11-15T00:00:00Z"), endsAt: null }, now), false);
    assert.equal(isLive({ ...base, startsAt: null, endsAt: new Date("2026-11-14T11:00:00Z") }, now), false);
    assert.equal(isBanner({ ...base, startsAt: null, endsAt: null }, now), true);
    assert.equal(isBanner({ ...base, category: "feature", startsAt: null, endsAt: null }, now), false);
    assert.equal(isBanner({ ...base, kind: "RELEASE", startsAt: null, endsAt: null }, now), false);
});

test("running version matches short and long shas", () => {
    assert.equal(isRunning("d80a9de", "d80a9de1234567"), true);
    assert.equal(isRunning("d80a9de1234567", "d80a9de"), true);
    assert.equal(isRunning("d80a9de", "74e3922"), false);
    assert.equal(isRunning("d80a9de", "dev"), false);
    assert.equal(isRunning("d80a9de", null), false);
});

test("offer state", () => {
    const row = { offerTag: "d80a9de", offerSecurity: false, offerDeadline: null, decision: null, postponedUntil: null };
    assert.equal(offerState(row, "74e3922", now), "pending");
    assert.equal(offerState(row, "d80a9de", now), "none");
    assert.equal(offerState({ ...row, decision: "WINDOW" }, "74e3922", now), "scheduled");
    assert.equal(offerState({ ...row, decision: "POSTPONE", postponedUntil: new Date("2026-11-20T00:00:00Z") }, "x", now), "postponed");
    assert.equal(offerState({ ...row, decision: "POSTPONE", postponedUntil: new Date("2026-11-10T00:00:00Z") }, "x", now), "pending");
    assert.equal(offerState({ ...row, offerTag: null }, "x", now), "none");
});

test("decisions: postpone is 7 days, capped by the deadline, refused for security", () => {
    const row = { offerTag: "d80a9de", offerSecurity: false, offerDeadline: null, decision: null, postponedUntil: null };
    const p = resolveDecision(row, "postpone", now);
    assert.equal(p.ok && p.postponedUntil?.toISOString(), "2026-11-21T12:00:00.000Z");
    const capped = resolveDecision({ ...row, offerDeadline: new Date("2026-11-16T00:00:00Z") }, "POSTPONE", now);
    assert.equal(capped.ok && capped.postponedUntil?.toISOString(), "2026-11-16T00:00:00.000Z");
    assert.equal(resolveDecision({ ...row, offerSecurity: true }, "POSTPONE", now).ok, false);
    assert.equal(resolveDecision({ ...row, offerDeadline: new Date("2026-11-13T00:00:00Z") }, "POSTPONE", now).ok, false);
    const n = resolveDecision(row, "now", now);
    assert.equal(n.ok && n.decision, "NOW");
    assert.equal(resolveDecision(row, "maybe", now).ok, false);
    assert.equal(resolveDecision({ ...row, offerTag: null }, "NOW", now).ok, false);
});

test("a new tag resets the answer, the same tag keeps it", () => {
    const o = { tag: "d80a9de", migration: false, security: false, deadline: null, window: null };
    assert.equal(offerResetsDecision("d80a9de", o), false);
    assert.equal(offerResetsDecision("74e3922", o), true);
    assert.equal(offerResetsDecision("d80a9de", null), true);
    assert.equal(offerResetsDecision("d80a9de", undefined), false);
});
