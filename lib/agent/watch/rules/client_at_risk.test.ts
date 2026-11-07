/**
 * The client_at_risk rule and the signal it shares with the chat tool, on
 * injected reads (no database).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { collectClientAttention, type ClientAttentionDb } from "../signals/client-attention";
import { createClientAtRiskRule, daysFromConfig } from "./client_at_risk";

const now = new Date("2026-10-29T10:00:00.000Z");
const signal = new AbortController().signal;

const fakeDb: ClientAttentionDb = {
    listActiveClients: async (clientId) => {
        const all = [
            // healthy: a mission with meetings, days set, every commercial has access
            { id: "ok", name: "Decathlon", contractedDaysPerWeek: 2, missions: [{ id: "m-ok", name: "Q4" }], interlocuteurs: [{ id: "i1", portalUser: { id: "u" } }] },
            // no RDV in 14 days + no portal access → CRITICAL
            { id: "bad", name: "Otee", contractedDaysPerWeek: 1, missions: [{ id: "m-bad", name: "Lancement" }], interlocuteurs: [{ id: "i2", portalUser: null }, { id: "i3", portalUser: null }] },
            // no RDV only → WARN
            { id: "quiet", name: "Talis", contractedDaysPerWeek: 3, missions: [{ id: "m-quiet", name: "Nat" }], interlocuteurs: [] },
            // no active mission, days missing → INFO
            { id: "idle", name: "Mada", contractedDaysPerWeek: null, missions: [], interlocuteurs: [] },
        ];
        return clientId ? all.filter((c) => c.id === clientId) : all;
    },
    countMeetingsByCampaign: async (since) => {
        assert.equal(since.toISOString(), "2026-10-15T10:00:00.000Z");
        return [
            { campaignId: "cp-ok", count: 3 },
            { campaignId: "cp-unknown", count: 1 },
        ];
    },
    missionsOfCampaigns: async (ids) => {
        assert.deepEqual(ids, ["cp-ok", "cp-unknown"]);
        return [{ id: "cp-ok", missionId: "m-ok" }];
    },
};

test("collectClientAttention keeps the tool's alert wording and ordering", async () => {
    const r = await collectClientAttention({ days: 14, now }, fakeDb);
    assert.equal(r.periodeJours, 14);
    assert.equal(r.totalClientsActifs, 4);
    assert.deepEqual(r.clients.map((c) => c.clientId), ["bad", "idle", "quiet"]);
    assert.deepEqual(r.clients[0].alertes, ["aucun RDV depuis 14 jours", "2 commercial(aux) sans accès portail"]);
    assert.deepEqual(r.clients[1].alertes, ["jours/semaine non renseignés", "aucune mission active"]);
    assert.deepEqual(r.clients[2].alertes, ["aucun RDV depuis 14 jours"]);
    assert.equal(r.clients[0].commerciauxSansAcces, 2);
    assert.equal(r.clients[1].joursContractuelsManquants, true);
});

test("scoped to one client", async () => {
    const r = await collectClientAttention({ days: 14, clientId: "quiet", now }, fakeDb);
    assert.deepEqual(r.clients.map((c) => c.clientId), ["quiet"]);
    assert.equal(r.totalClientsActifs, 1);
});

test("the rule maps alerts to severities and stable keys", async () => {
    const rule = createClientAtRiskRule({ collect: (o) => collectClientAttention(o, fakeDb) });
    const ctx = { now, scope: { clientId: null, missionId: null }, config: {}, signal };
    assert.equal(rule.scopeKey(ctx), "agency");
    const found = await rule.detect(ctx);
    assert.deepEqual(
        found.map((f) => [f.key, f.severity]),
        [
            ["bad", "CRITICAL"],
            ["idle", "INFO"],
            ["quiet", "WARN"],
        ],
    );
    assert.equal(found[0].title, "Otee : aucun RDV depuis 14 jours");
    assert.equal(found[0].clientId, "bad");
    assert.deepEqual(found[0].metrics, { periodeJours: 14, missionsActives: 1, rdvSurLaPeriode: 0, commerciauxSansAcces: 2, alertes: 2 });
    assert.match(found[2].body, /Talis — aucun RDV depuis 14 jours\. 1 mission\(s\) active\(s\), 0 RDV sur 14 jours\./);
});

test("config.days drives the window; the client scope drives the key", async () => {
    let seen: number | null = null;
    const rule = createClientAtRiskRule({
        collect: async (o) => {
            seen = o.days;
            return collectClientAttention({ ...o, days: 14 }, fakeDb);
        },
    });
    const ctx = { now, scope: { clientId: "quiet", missionId: null }, config: { days: 30 }, signal };
    assert.equal(rule.scopeKey(ctx), "quiet");
    await rule.detect(ctx);
    assert.equal(seen, 30);
    assert.equal(daysFromConfig({}), 14);
    assert.equal(daysFromConfig({ days: "21" }), 21);
    assert.equal(daysFromConfig({ days: 0 }), 14);
    assert.equal(daysFromConfig({ days: 999 }), 14);
});
