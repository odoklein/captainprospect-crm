import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildStageResolver, buildWeeklyActivity, companyRollup, toPortalTreatment, UNTREATED_TREATMENT } from "./portal";
import type { RowTreatment } from "./types";
import type { PortalTreatment } from "./portal-types";

const stageFor = buildStageResolver([
    { code: "NO_RESPONSE", priorityLabel: "RETRY", triggersCallback: false, triggersOpportunity: false, triggersExclusion: false },
    { code: "RAPPEL", priorityLabel: "CALLBACK", triggersCallback: true, triggersOpportunity: false, triggersExclusion: false },
    { code: "INTERESTED", priorityLabel: "FOLLOW_UP", triggersCallback: false, triggersOpportunity: true, triggersExclusion: false },
    { code: "REFUS", priorityLabel: "SKIP", triggersCallback: false, triggersOpportunity: false, triggersExclusion: false },
    { code: "MEETING_BOOKED", priorityLabel: "SKIP", triggersCallback: false, triggersOpportunity: true, triggersExclusion: false },
]);

function row(overrides: Partial<RowTreatment> = {}): RowTreatment {
    return {
        treated: true,
        actionCount: 1,
        callCount: 1,
        emailCount: 0,
        linkedinCount: 0,
        totalCallSeconds: 0,
        firstActionAt: new Date("2026-09-01T09:00:00Z"),
        lastActionAt: new Date("2026-09-01T09:00:00Z"),
        lastResult: "NO_RESPONSE",
        lastResultLabel: "NRP",
        lastChannel: "CALL",
        lastSdrName: "Julien",
        lastNote: "note interne",
        lastCallSummary: "résumé IA",
        nextCallbackAt: null,
        meetingBookedAt: null,
        meetingAt: null,
        meetingType: null,
        historyLines: [],
        ...overrides,
    };
}

function line(stage: PortalTreatment["stage"], lastActionAt: string, extra: Partial<PortalTreatment> = {}): PortalTreatment {
    return { ...UNTREATED_TREATMENT, treated: true, stage, lastResultLabel: stage, lastActionAt, ...extra };
}

describe("stage resolution", () => {
    it("follows the mission's status config", () => {
        assert.equal(stageFor("NO_RESPONSE"), "in_progress");
        assert.equal(stageFor("RAPPEL"), "callback");
        assert.equal(stageFor("INTERESTED"), "opportunity");
        assert.equal(stageFor("REFUS"), "closed");
        assert.equal(stageFor("MEETING_BOOKED"), "meeting");
    });

    it("falls back to known codes when the config does not list them", () => {
        const bare = buildStageResolver([]);
        assert.equal(bare("RELANCE"), "callback");
        assert.equal(bare("HORS_CIBLE"), "closed");
        assert.equal(bare("PROJET_A_SUIVRE"), "opportunity");
        assert.equal(bare("SOMETHING_NEW"), "in_progress");
    });
});

describe("contact line treatment", () => {
    it("keeps the meeting as the status even when something was logged after it", () => {
        const t = toPortalTreatment(
            row({ lastResult: "RAPPEL", lastResultLabel: "Rappel", meetingBookedAt: new Date("2026-09-02T10:00:00Z") }),
            stageFor,
            "RDV pris"
        );
        assert.equal(t.stage, "meeting");
        assert.equal(t.lastResultLabel, "RDV pris");
        assert.equal(t.meetingBooked, true);
    });

    it("never carries internal notes, call summaries or SDR names", () => {
        const t = toPortalTreatment(row(), stageFor, "RDV pris") as unknown as Record<string, unknown>;
        for (const key of ["lastNote", "lastCallSummary", "lastSdrName", "historyLines"]) {
            assert.equal(key in t, false, `${key} must not reach the client`);
        }
    });

    it("maps an untouched line to À traiter", () => {
        assert.equal(toPortalTreatment(row({ treated: false }), stageFor, "RDV").stage, "untreated");
    });
});

describe("company rollup", () => {
    it("takes the best stage across contacts, not the latest", () => {
        const c = companyRollup(
            [
                line("meeting", "2026-09-02T10:00:00.000Z", { lastResultLabel: "RDV pris", meetingAt: "2026-09-20T09:00:00.000Z" }),
                line("closed", "2026-09-10T10:00:00.000Z", { lastResultLabel: "Refus" }),
            ],
            { actionCount: 5, callCount: 4 }
        );
        assert.equal(c.stage, "meeting");
        assert.equal(c.lastResultLabel, "RDV pris");
        assert.equal(c.lastActionAt, "2026-09-10T10:00:00.000Z", "last contact is the latest overall");
        assert.equal(c.meetingAt, "2026-09-20T09:00:00.000Z");
        assert.equal(c.actionCount, 5);
        assert.equal(c.callCount, 4);
    });

    it("breaks ties on the most recent line and keeps the soonest callback", () => {
        const c = companyRollup(
            [
                line("callback", "2026-09-03T10:00:00.000Z", { lastResultLabel: "Rappel", nextCallbackAt: "2026-10-05T08:00:00.000Z" }),
                line("callback", "2026-09-08T10:00:00.000Z", { lastResultLabel: "Relance", nextCallbackAt: "2026-10-02T08:00:00.000Z" }),
            ],
            undefined
        );
        assert.equal(c.lastResultLabel, "Relance");
        assert.equal(c.nextCallbackAt, "2026-10-02T08:00:00.000Z");
    });

    it("is À traiter when no line was worked", () => {
        assert.equal(companyRollup([UNTREATED_TREATMENT, UNTREATED_TREATMENT], undefined).stage, "untreated");
    });
});

describe("weekly activity", () => {
    it("buckets actions into Paris weeks, oldest first, zero-filled", () => {
        const now = new Date("2026-09-30T12:00:00Z"); // Wednesday
        const weeks = buildWeeklyActivity(
            [
                { createdAt: new Date("2026-09-28T06:00:00Z"), result: "NO_RESPONSE" }, // this week (Mon 28)
                { createdAt: new Date("2026-09-29T09:00:00Z"), result: "MEETING_BOOKED" },
                // Sunday 27 at 23:30 Paris = 21:30 UTC → previous week
                { createdAt: new Date("2026-09-27T21:30:00Z"), result: "RAPPEL" },
                { createdAt: new Date("2025-01-01T09:00:00Z"), result: "REFUS" }, // out of range
            ],
            now,
            4
        );
        assert.deepEqual(weeks.map((w) => w.week), ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);
        assert.deepEqual(weeks.map((w) => w.actions), [0, 0, 1, 2]);
        assert.deepEqual(weeks.map((w) => w.meetings), [0, 0, 0, 1]);
    });
});
