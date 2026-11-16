import { test } from "node:test";
import assert from "node:assert/strict";
import { audienceIncludes, changelogPayloadSchema, isLive, wantsBanner } from "./contract";

const release = {
    externalId: "release:9be5e12",
    kind: "release",
    title: "Tutoriels vidéo et Onoff",
    version: "9be5e12",
    items: [
        { type: "new", title: "Tutoriels vidéo sur 8 pages", module: "Accueil" },
        { type: "fixed", title: "Lecture des enregistrements", body: "Erreur claire quand le fournisseur ne répond pas." },
    ],
    publishedAt: "2026-11-16T10:00:00Z",
};

test("a release with notes is accepted, defaults filled", () => {
    const r = changelogPayloadSchema.safeParse(release);
    assert.ok(r.success);
    assert.equal(r.data.severity, "info");
    assert.equal(r.data.audience, "managers");
    assert.ok(r.data.publishedAt instanceof Date);
});

test("a release without notes or summary is refused", () => {
    assert.equal(changelogPayloadSchema.safeParse({ ...release, items: [] }).success, false);
    assert.equal(changelogPayloadSchema.safeParse({ ...release, items: [], summary: "Correctifs." }).success, true);
});

test("announcements: window order, CTA safety, id format", () => {
    const base = { externalId: "ann_1", kind: "announcement", title: "Maintenance", category: "maintenance", publishedAt: "2026-11-16T10:00:00Z" };
    assert.ok(changelogPayloadSchema.safeParse({ ...base, startsAt: "2026-11-18T20:00:00Z", endsAt: "2026-11-18T21:00:00Z" }).success);
    assert.equal(changelogPayloadSchema.safeParse({ ...base, startsAt: "2026-11-18T21:00:00Z", endsAt: "2026-11-18T20:00:00Z" }).success, false);
    assert.ok(changelogPayloadSchema.safeParse({ ...base, cta: { label: "Voir", url: "/manager/settings" } }).success);
    assert.ok(changelogPayloadSchema.safeParse({ ...base, cta: { label: "Voir", url: "https://status.example.fr" } }).success);
    for (const url of ["javascript:alert(1)", "http://insecure.example", "//evil.example/x"]) {
        assert.equal(changelogPayloadSchema.safeParse({ ...base, cta: { label: "Voir", url } }).success, false, url);
    }
    assert.equal(changelogPayloadSchema.safeParse({ ...base, externalId: "../../x" }).success, false);
    assert.equal(changelogPayloadSchema.safeParse({ ...base, category: "promo" }).success, false);
});

test("audience: managers only by default, never clients", () => {
    assert.equal(audienceIncludes("managers", "MANAGER"), true);
    assert.equal(audienceIncludes("managers", "SDR"), false);
    assert.equal(audienceIncludes("everyone", "SDR"), true);
    assert.equal(audienceIncludes("everyone", "CLIENT"), false);
    assert.equal(audienceIncludes("everyone", "COMMERCIAL"), false);
    assert.equal(audienceIncludes("everyone", null), false);
});

test("live: windows show ahead, scheduled news waits, ended items disappear", () => {
    const now = new Date("2026-11-16T12:00:00Z");
    const at = (iso: string) => new Date(iso);
    const pub = at("2026-11-16T10:00:00Z");
    assert.equal(isLive({ publishedAt: pub, startsAt: null, endsAt: null }, now), true);
    assert.equal(isLive({ publishedAt: at("2026-11-17T00:00:00Z"), startsAt: null, endsAt: null }, now), false, "future publication");
    assert.equal(isLive({ publishedAt: pub, startsAt: at("2026-11-18T20:00:00Z"), endsAt: at("2026-11-18T21:00:00Z") }, now), true, "upcoming maintenance is announced");
    assert.equal(isLive({ publishedAt: pub, startsAt: at("2026-11-18T20:00:00Z"), endsAt: null }, now), false, "scheduled news waits");
    assert.equal(isLive({ publishedAt: pub, startsAt: null, endsAt: at("2026-11-16T11:00:00Z") }, now), false, "ended");
});

test("banner: warnings only, within 48 h of their window", () => {
    const now = new Date("2026-11-16T12:00:00Z");
    assert.equal(wantsBanner({ severity: "info", startsAt: null, endsAt: null }, now), false);
    assert.equal(wantsBanner({ severity: "warning", startsAt: null, endsAt: null }, now), true);
    assert.equal(wantsBanner({ severity: "warning", startsAt: new Date("2026-11-17T20:00:00Z"), endsAt: new Date("2026-11-17T21:00:00Z") }, now), true);
    assert.equal(wantsBanner({ severity: "warning", startsAt: new Date("2026-11-25T20:00:00Z"), endsAt: new Date("2026-11-25T21:00:00Z") }, now), false);
    assert.equal(wantsBanner({ severity: "warning", startsAt: null, endsAt: new Date("2026-11-16T11:00:00Z") }, now), false);
});
