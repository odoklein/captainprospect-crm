/**
 * Paused-row summary of the 24 h queue pause:
 *     npx tsx --test lib/sdr-queue/cooldown.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cooldownCutoff, summarizePaused, QUEUE_COOLDOWN_HOURS } from "./cooldown";

const H = 60 * 60 * 1000;

test("cutoff is 24 h before now", () => {
    const now = Date.UTC(2026, 9, 13, 9, 0);
    assert.equal(cooldownCutoff(now).getTime(), now - QUEUE_COOLDOWN_HOURS * H);
});

test("counts contacts and companies apart, earliest release per type", () => {
    const s = summarizePaused([
        { contact_id: "c1", last_action_created: new Date("2026-10-12T15:59:00Z") },
        { contact_id: "c2", last_action_created: new Date("2026-10-12T12:55:00Z") },
        { contact_id: null, last_action_created: "2026-10-12T09:10:00Z" },
        { contact_id: null, last_action_created: "2026-10-12T14:00:00Z" },
        { contact_id: null, last_action_created: "2026-10-12T11:30:00Z" },
    ]);
    assert.equal(s.total, 5);
    assert.equal(s.contacts, 2);
    assert.equal(s.companies, 3);
    assert.equal(s.nextContactAt, "2026-10-13T12:55:00.000Z");
    assert.equal(s.nextCompanyAt, "2026-10-13T09:10:00.000Z");
});

test("nothing paused → zeros and no release time", () => {
    const s = summarizePaused([]);
    assert.deepEqual(s, { total: 0, contacts: 0, companies: 0, nextContactAt: null, nextCompanyAt: null });
});

test("rows without a last action are ignored", () => {
    const s = summarizePaused([{ contact_id: "c1", last_action_created: null }]);
    assert.equal(s.total, 0);
    assert.equal(s.nextContactAt, null);
});
