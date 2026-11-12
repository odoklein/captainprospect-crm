import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveRunStatus, scheduleLabel, toFindingItem, toJobItem, toPlan, toProposalItem, toRunCard, type RunRow } from "./serialize";

test("cron → French schedule labels", () => {
    assert.equal(scheduleLabel("0 8 * * 1"), "Chaque lundi à 08:00");
    assert.equal(scheduleLabel("30 7 * * 1-5"), "Du lundi au vendredi à 07:30");
    assert.equal(scheduleLabel("0 14 * * 5"), "Chaque vendredi à 14:00");
    assert.equal(scheduleLabel("0 11,15 * * 1-5"), "Du lundi au vendredi à 11:00 et 15:00");
    assert.equal(scheduleLabel("0 9 * * *"), "Tous les jours à 09:00");
    assert.equal(scheduleLabel("0 9 * * 0-6"), "Tous les jours à 09:00");
    assert.equal(scheduleLabel("0 18 * * 1,3,5"), "Le lundi, mercredi et vendredi à 18:00");
    assert.equal(scheduleLabel("0 10 * * 6,0"), "Le samedi et dimanche à 10:00");
    assert.equal(scheduleLabel("0 14 1 * *"), "Le 1 de chaque mois à 14:00");
    assert.equal(scheduleLabel("*/15 * * * *"), "Toutes les 15 minutes");
    assert.equal(scheduleLabel("0 * * * *"), "Toutes les heures");
    assert.equal(scheduleLabel(null), null);
    assert.equal(scheduleLabel("pas un cron"), null);
    assert.equal(scheduleLabel("0 8 * 3 1"), null, "month-restricted: too specific to say simply");
});

const at = new Date("2026-10-29T08:00:00.000Z");

function runRow(overrides: Partial<RunRow> = {}): RunRow {
    return {
        id: "run_1",
        jobId: "job_1",
        kind: "MISSION",
        playbook: "mission.delegated",
        trigger: "MANUAL",
        status: "WAITING_APPROVAL",
        goal: "Relancer",
        summary: "Fait",
        folderId: null,
        clientId: "cl_1",
        conversationId: "conv_1",
        findingsCount: 1,
        proposalsCount: 2,
        usage: { promptTokens: 1000, completionTokens: 200, costEur: 0.123456, toolCalls: 4, phases: 3 },
        mode: "worker",
        error: null,
        actorId: "usr_1",
        cancelRequestedAt: null,
        createdAt: at,
        startedAt: at,
        finishedAt: null,
        ...overrides,
    };
}

test("run card: names, pending count, cost from usage, ISO dates", () => {
    const card = toRunCard(runRow(), { jobName: "Mission", clientName: "Acme", actorName: "Valentin", pendingProposals: 2 });
    assert.equal(card.costEur, 0.1235);
    assert.equal(card.pendingProposals, 2);
    assert.equal(card.clientName, "Acme");
    assert.equal(card.actorName, "Valentin");
    assert.equal(card.createdAt, "2026-10-29T08:00:00.000Z");
    assert.equal(card.finishedAt, null);
    assert.equal(toRunCard(runRow({ usage: null }), { jobName: null, clientName: null, actorName: null, pendingProposals: 0 }).costEur, 0);
});

test("a run asked to cancel that then finished reads CANCELLED", () => {
    assert.equal(effectiveRunStatus({ status: "DONE", cancelRequestedAt: at, finishedAt: at }), "CANCELLED");
    assert.equal(effectiveRunStatus({ status: "RUNNING", cancelRequestedAt: at, finishedAt: null }), "RUNNING");
    assert.equal(effectiveRunStatus({ status: "DONE", cancelRequestedAt: null, finishedAt: at }), "DONE");
});

test("job item: French schedule label, playbook label, config as object", () => {
    const item = toJobItem(
        { id: "j", kind: "DIGEST", playbook: "digest.morning", name: "Point du matin", enabled: false, folderId: null, clientId: null, schedule: "30 7 * * 1-5", timezone: "Europe/Paris", config: null, lastRunAt: null, nextRunAt: at, lastStatus: null, failures: 0 },
        { playbookLabel: "Point du matin", clientName: null },
    );
    assert.equal(item.scheduleLabel, "Du lundi au vendredi à 07:30");
    assert.deepEqual(item.config, {});
    assert.equal(item.nextRunAt, "2026-10-29T08:00:00.000Z");
});

test("proposal item: card normalised, decider name, PENDING past expiry reads EXPIRED", () => {
    const base = {
        id: "p",
        runId: "r",
        tool: "send_draft",
        args: { artifactId: "a" },
        card: { title: "Envoyer", details: [{ label: "À", value: "x@y.fr" }, { nope: 1 }], warning: null, confirmLabel: "Envoyer", danger: true },
        rationale: null,
        risk: "confirm",
        state: "PENDING" as const,
        proposedAt: at,
        expiresAt: new Date(at.getTime() + 60_000),
        decidedById: null,
        decidedAt: null,
        executedAt: null,
        outcome: null,
    };
    const item = toProposalItem(base, null, at);
    assert.equal(item.state, "PENDING");
    assert.deepEqual(item.card.details, [{ label: "À", value: "x@y.fr" }]);
    assert.equal(item.card.danger, true);
    assert.equal(toProposalItem(base, null, new Date(at.getTime() + 120_000)).state, "EXPIRED");
    const decided = toProposalItem({ ...base, state: "EXECUTED", decidedById: "u", decidedAt: at, card: null }, "Valentin", at);
    assert.equal(decided.decidedByName, "Valentin");
    assert.equal(decided.card.title, "send_draft");
    assert.equal(decided.card.confirmLabel, "Confirmer");
});

test("finding item: names, folder fallback from the client, empty metrics → null", () => {
    const item = toFindingItem(
        { id: "f", rule: "client_at_risk", severity: "WARN", kind: "k", title: "T", body: "B", metrics: {}, folderId: null, clientId: "cl_1", subjectUserId: "u_1", state: "OPEN", firstSeenAt: at, lastSeenAt: at, seenCount: 2, snoozedUntil: null, runId: null },
        { clientName: "Acme", subjectName: "Julie", folderId: "fold_1" },
    );
    assert.equal(item.clientName, "Acme");
    assert.equal(item.subjectName, "Julie");
    assert.equal(item.folderId, "fold_1");
    assert.equal(item.metrics, null);
});

test("plan: mission plan steps keep title, intent and status", () => {
    assert.deepEqual(toPlan({ steps: [{ title: "A", intent: "i", status: "done", digest: "secret de travail" }, { nope: true }] }), { steps: [{ title: "A", intent: "i", status: "done" }] });
    assert.equal(toPlan(null), null);
});
