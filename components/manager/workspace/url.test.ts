import { test } from "node:test";
import assert from "node:assert/strict";
import {
    buildWorkspaceHref, buildWorkspaceSearch, normalizeClientView, normalizeMissionTab, normalizeStoredLocation, parseWorkspace,
    MISSION_TAB_ALIASES, CLIENT_VIEW_ALIASES,
} from "./url";

const params = (search: string) => new URLSearchParams(search);

test("parse: defaults to the directory, brief and client home", () => {
    assert.deepEqual(parseWorkspace(params("")), { client: null, mission: null, page: null, tab: "general", espace: "missions" });
});

test("parse: reads every key and trims empties", () => {
    const parsed = parseWorkspace(params("client=c1&mission=m1&tab=audience&espace=sessions&page=p1"));
    assert.deepEqual(parsed, { client: "c1", mission: "m1", page: "p1", tab: "audience", espace: "sessions" });
    assert.equal(parseWorkspace(params("client=%20")).client, null);
});

test("every mission tab in use today resolves to itself", () => {
    for (const tab of ["general", "lancement", "audience", "strategies", "strategy", "equipe", "feedback", "reglages"]) {
        assert.equal(normalizeMissionTab(tab), tab, tab);
    }
});

test("old mission tab names keep working", () => {
    assert.equal(normalizeMissionTab("assignments"), "equipe");
    assert.equal(normalizeMissionTab("lists"), "audience");
    assert.equal(normalizeMissionTab("campaigns"), "strategy");
    assert.equal(normalizeMissionTab("nope"), "general");
    assert.equal(normalizeMissionTab(null), "general");
});

test("the final contract: campaigns and strategy fold into strategies", () => {
    assert.equal(normalizeMissionTab("campaigns", MISSION_TAB_ALIASES), "strategies");
    assert.equal(normalizeMissionTab("strategy", MISSION_TAB_ALIASES), "strategies");
    assert.equal(normalizeClientView("apercu", CLIENT_VIEW_ALIASES), "parametres");
});

test("every client view in use today resolves to itself", () => {
    for (const view of ["missions", "apercu", "onboarding", "acces", "activite", "avis-sdr", "sessions"]) {
        assert.equal(normalizeClientView(view), view, view);
    }
    assert.equal(normalizeClientView("unknown"), "missions");
});

test("build: sets, clears and keeps unrelated params", () => {
    assert.equal(buildWorkspaceSearch({ client: "c1", mission: "m1", tab: "equipe" }, "bilan=2026-W45&tab=x&espace=acces"), "bilan=2026-W45&tab=equipe&client=c1&mission=m1");
    assert.equal(buildWorkspaceSearch({ client: "c1", mission: "m1", tab: "general" }), "client=c1&mission=m1");
    assert.equal(buildWorkspaceSearch(null, "client=c1&mission=m1"), "");
    assert.equal(buildWorkspaceHref(null), "/manager/clients");
    assert.equal(buildWorkspaceHref({ client: "c 1" }), "/manager/clients?client=c+1");
});

test("parse ∘ build round-trips", () => {
    const location = { client: "c1", mission: "m1", tab: "feedback", espace: "activite", page: null };
    const parsed = parseWorkspace(params(buildWorkspaceSearch(location)));
    assert.equal(parsed.client, "c1");
    assert.equal(parsed.mission, "m1");
    assert.equal(parsed.tab, "feedback");
    assert.equal(parsed.espace, "activite");
});

test("stored « Reprendre » locations are normalised on read", () => {
    assert.equal(normalizeStoredLocation(null), null);
    assert.equal(normalizeStoredLocation({ mission: "m1" }), null);
    assert.deepEqual(normalizeStoredLocation({ client: "c1", mission: "m1", tab: "lists", espace: "missions", page: null }), { client: "c1", mission: "m1", tab: "audience", espace: "missions", page: null });
    assert.deepEqual(normalizeStoredLocation({ client: "c1", tab: "equipe", espace: "bogus" }), { client: "c1", mission: null, tab: null, espace: "missions", page: null });
});
