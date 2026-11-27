import { test } from "node:test";
import assert from "node:assert/strict";
import {
    confirmedOn,
    cutoffLabel,
    dispositionOf,
    formatEuros,
    formatMultiple,
    funnelSteps,
    invoicedCost,
    isConfirmedNow,
    isHeld,
    isHeldPending,
    letterHeadline,
    letterWeek,
    monthPace,
    monthTarget,
    monthsLabel,
    pipelineOf,
    prospectSnapshot,
    roi,
    snapshotCutoff,
    wasConfirmedAt,
    weekRangeLabel,
    weeklyConfirmed,
    type InvoiceFacts,
    type LetterMeeting,
    type ProspectTouch,
    type StatusDictionary,
} from "./letter";

const d = (iso: string) => new Date(iso);
// Friday 27 November 2026, 15:00 Paris (UTC+1).
const NOW = d("2026-11-27T14:00:00Z");
// Monday 23 November 2026, 06:00 Paris.
const CUTOFF = d("2026-11-23T05:00:00Z");

function meeting(over: Partial<LetterMeeting> = {}): LetterMeeting {
    return {
        id: "m1",
        prospect: "p1",
        result: "MEETING_BOOKED",
        confirmationStatus: "CONFIRMED",
        confirmedAt: d("2026-11-18T09:00:00Z"),
        confirmationUpdatedAt: d("2026-11-18T09:00:00Z"),
        createdAt: d("2026-11-17T10:00:00Z"),
        callbackDate: d("2026-11-20T10:00:00Z"),
        feedback: null,
        ...over,
    };
}

const plainDictionary: StatusDictionary = () => ({ label: null, category: null });

// ── Clock ──

test("snapshot: stops at the last Monday 06:00 Paris", () => {
    assert.equal(snapshotCutoff(NOW).toISOString(), CUTOFF.toISOString());
});

test("snapshot: on Monday before 06:00 it is still the previous Monday", () => {
    assert.equal(snapshotCutoff(d("2026-11-23T04:30:00Z")).toISOString(), "2026-11-16T05:00:00.000Z");
    assert.equal(snapshotCutoff(d("2026-11-23T05:00:00Z")).toISOString(), CUTOFF.toISOString());
});

test("snapshot: summer time keeps 06:00 local", () => {
    // Monday 29 June 2026, Paris is UTC+2.
    assert.equal(snapshotCutoff(d("2026-07-01T10:00:00Z")).toISOString(), "2026-06-29T04:00:00.000Z");
});

test("letter week: the full week before the snapshot, with its ISO number and French range", () => {
    const w = letterWeek(CUTOFF);
    assert.equal(w.number, 47);
    assert.equal(w.start.toISOString(), "2026-11-15T23:00:00.000Z");
    assert.equal(w.end.toISOString(), "2026-11-22T23:00:00.000Z");
    assert.equal(weekRangeLabel(w), "du 16 au 22 novembre");
    assert.equal(weekRangeLabel(letterWeek(d("2026-12-07T05:00:00Z"))), "du 30 novembre au 6 décembre");
    assert.equal(cutoffLabel(CUTOFF), "lundi 23 novembre, 06:00");
});

// ── RDV ──

test("RDV: only booked and confirmed counts live; pending and cancelled do not", () => {
    assert.equal(isConfirmedNow(meeting()), true);
    assert.equal(isConfirmedNow(meeting({ confirmationStatus: "PENDING", confirmedAt: null })), false);
    assert.equal(isConfirmedNow(meeting({ result: "MEETING_CANCELLED", confirmationStatus: "CANCELLED" })), false);
    assert.equal(isConfirmedNow(meeting({ result: "MEETING_BOOKED", confirmationStatus: "CANCELLED" })), false);
});

test("RDV: the snapshot keeps a RDV cancelled after Monday, drops one cancelled before", () => {
    const cancelledAfter = meeting({ result: "MEETING_CANCELLED", confirmationStatus: "CANCELLED", confirmationUpdatedAt: d("2026-11-25T10:00:00Z") });
    const cancelledBefore = meeting({ result: "MEETING_CANCELLED", confirmationStatus: "CANCELLED", confirmationUpdatedAt: d("2026-11-20T10:00:00Z") });
    assert.equal(wasConfirmedAt(cancelledAfter, CUTOFF), true);
    assert.equal(wasConfirmedAt(cancelledBefore, CUTOFF), false);
});

test("RDV: confirmed after Monday is live now but not in Monday's snapshot", () => {
    const m = meeting({ confirmedAt: d("2026-11-24T09:00:00Z"), confirmationUpdatedAt: d("2026-11-24T09:00:00Z") });
    assert.equal(isConfirmedNow(m), true);
    assert.equal(wasConfirmedAt(m, CUTOFF), false);
});

test("RDV: a pending RDV dropped by the SAS was never confirmed", () => {
    const m = meeting({ confirmationStatus: "CANCELLED", confirmedAt: null, confirmationUpdatedAt: d("2026-11-25T10:00:00Z") });
    assert.equal(wasConfirmedAt(m, CUTOFF), false);
    assert.equal(confirmedOn(m), null);
});

test("RDV: an old row confirmed without timestamp dates from its booking", () => {
    const m = meeting({ confirmedAt: null, confirmationUpdatedAt: null });
    assert.equal(confirmedOn(m)?.toISOString(), m.createdAt.toISOString());
});

test("RDV tenu: a feedback that says it happened, any outcome but a no-show", () => {
    const fb = (outcome: string, over = {}) => ({ outcome, createdAt: d("2026-11-21T10:00:00Z"), standByAt: null, outOfScopeAt: null, ...over });
    // RDV on Friday 20 Nov 11:00 Paris: its 48 h window was still open on Saturday.
    assert.equal(isHeld(meeting({ feedback: fb("POSITIVE") }), CUTOFF), true);
    assert.equal(isHeld(meeting({ feedback: fb("NEGATIVE") }), CUTOFF), true);
    assert.equal(isHeld(meeting({ feedback: fb("NO_SHOW") }), CUTOFF), false);
    // An absence set aside is still not a held RDV.
    assert.equal(isHeld(meeting({ feedback: fb("NO_SHOW", { standByAt: d("2026-11-22T10:00:00Z") }) }), CUTOFF), false);
    // Not confirmed at the cutoff: not held, whatever the feedback.
    assert.equal(isHeld(meeting({ confirmationStatus: "PENDING", confirmedAt: null, confirmationUpdatedAt: null, feedback: fb("POSITIVE") }), CUTOFF), false);
});

test("RDV tenu: without feedback, held once the 48 h no-show window closed, as billing counts it", () => {
    // RDV Friday 20 Nov 10:00 UTC → window closed Sunday 22 Nov 10:00 UTC, before Monday 06:00.
    assert.equal(isHeld(meeting({ feedback: null }), CUTOFF), true);
    assert.equal(isHeldPending(meeting({ feedback: null }), CUTOFF), false);
    // RDV Sunday 22 Nov 09:00 UTC: window still open at the cutoff → not yet, pending.
    const late = meeting({ callbackDate: d("2026-11-22T09:00:00Z"), feedback: null });
    assert.equal(isHeld(late, CUTOFF), false);
    assert.equal(isHeldPending(late, CUTOFF), true);
    // A future RDV is neither.
    const future = meeting({ callbackDate: d("2026-11-30T09:00:00Z"), feedback: null });
    assert.equal(isHeld(future, CUTOFF), false);
    assert.equal(isHeldPending(future, CUTOFF), false);
    // A no-show reported after the cutoff, late: Monday's snapshot had already counted the RDV.
    const lateReport = meeting({ feedback: { outcome: "NO_SHOW", createdAt: d("2026-11-25T10:00:00Z"), standByAt: null, outOfScopeAt: null } });
    assert.equal(isHeld(lateReport, CUTOFF), true);
    assert.equal(isHeld(lateReport, d("2026-11-30T05:00:00Z")), false);
});

// ── Prospects ──

test("disposition: families decide, the category splits refusal from off-target", () => {
    assert.equal(dispositionOf("NO_RESPONSE", null), "notReached");
    assert.equal(dispositionOf("BARRAGE_STANDARD", null), "notReached");
    assert.equal(dispositionOf("INTERESTED", null), "interested");
    assert.equal(dispositionOf("CALLBACK_REQUESTED", null), "callback");
    assert.equal(dispositionOf("REFUS_ARGU", null), "refusal");
    assert.equal(dispositionOf("GERE_PAR_SIEGE", null), "refusal");
    assert.equal(dispositionOf("BAD_CONTACT", null), "offTarget");
    assert.equal(dispositionOf("HORS_CIBLE", "DISQUALIFIE"), "offTarget");
    // A category status-family knows wins over the built-in code…
    assert.equal(dispositionOf("HORS_CIBLE", "REFUS"), "refusal");
    assert.equal(dispositionOf("RELANCE", "RAPPEL"), "callback");
    // …any other reporting category (ResultCategory codes such as OTHER, DISQUALIFIED) leaves it to the code.
    assert.equal(dispositionOf("BAD_CONTACT", "OTHER"), "offTarget");
    assert.equal(dispositionOf("REFUS_ARGU", "DISQUALIFIED"), "refusal");
    assert.equal(dispositionOf("HORS_CIBLE", "DISQUALIFIED"), "offTarget");
    assert.equal(dispositionOf("NO_RESPONSE", "NO_RESPONSE"), "notReached");
});

function touch(prospect: string, code: string, iso: string, missionId = "mi"): ProspectTouch {
    return { missionId, prospect, code, lastAt: d(iso) };
}

test("snapshot: every contacted prospect lands in exactly one status, the funnel never widens", () => {
    const touches = [
        touch("a", "NO_RESPONSE", "2026-11-10T10:00:00Z"),
        touch("b", "NO_RESPONSE", "2026-11-10T10:00:00Z"),
        touch("b", "REFUS_ARGU", "2026-11-12T10:00:00Z"),
        // Reached once, then unanswered: still a refusal, never « pas encore joint » again.
        touch("c", "REFUS_CATEGORIQUE", "2026-11-05T10:00:00Z"),
        touch("c", "NO_RESPONSE", "2026-11-19T10:00:00Z"),
        touch("d", "INTERESTED", "2026-11-12T10:00:00Z"),
        touch("e", "CALLBACK_REQUESTED", "2026-11-13T10:00:00Z"),
        touch("f", "BAD_CONTACT", "2026-11-13T10:00:00Z"),
        touch("g", "MEETING_BOOKED", "2026-11-17T10:00:00Z"),
        // After the cutoff: not in this week's snapshot.
        touch("h", "INTERESTED", "2026-11-24T10:00:00Z"),
    ];
    const meetings = [meeting({ prospect: "g", feedback: { outcome: "POSITIVE", createdAt: d("2026-11-21T10:00:00Z"), standByAt: null, outOfScopeAt: null } })];
    const s = prospectSnapshot({ base: 40, touches, meetings, cutoff: CUTOFF, dictionary: plainDictionary });
    assert.deepEqual(s.funnel, { base: 40, called: 7, reached: 6, interested: 2, confirmed: 1, held: 1 });
    assert.deepEqual(s.dispositions, { rdv: 1, interested: 1, callback: 1, refusal: 2, offTarget: 1, notReached: 1 });
    const total = Object.values(s.dispositions).reduce((a, b) => a + b, 0);
    assert.equal(total, s.funnel.called);
    const counts = funnelSteps(s.funnel).map((step) => step.count);
    for (let i = 1; i < counts.length; i++) if (i > 1) assert.ok(counts[i] <= counts[i - 1], `step ${i} widens`);
});

test("snapshot: a pending RDV is interest, not a RDV, for the client", () => {
    const touches = [touch("g", "MEETING_BOOKED", "2026-11-17T10:00:00Z")];
    const pending = meeting({ prospect: "g", confirmationStatus: "PENDING", confirmedAt: null, confirmationUpdatedAt: null });
    const s = prospectSnapshot({ base: 1, touches, meetings: [pending], cutoff: CUTOFF, dictionary: plainDictionary });
    assert.equal(s.dispositions.rdv, 0);
    assert.equal(s.dispositions.interested, 1);
    assert.equal(s.funnel.confirmed, 0);
});

test("snapshot: refusal reasons group by the configured label, most cited first, the tail folded", () => {
    const dictionary: StatusDictionary = (missionId, code) => ({
        label: { REFUS_ARGU: "Refus argumenté", REFUS_CATEGORIQUE: "Refus catégorique", GERE_PAR_SIEGE: "Géré par le siège", NOT_INTERESTED: "Pas intéressé", REFUS: "Refus", DISQUALIFIED: "Disqualifié" }[code] ?? null,
        category: missionId === "other" && code === "DISQUALIFIED" ? "REFUS" : null,
    });
    const touches = [
        ...["1", "2", "3"].map((p) => touch(p, "REFUS_ARGU", "2026-11-10T10:00:00Z")),
        ...["4", "5"].map((p) => touch(p, "GERE_PAR_SIEGE", "2026-11-10T10:00:00Z")),
        touch("6", "REFUS_CATEGORIQUE", "2026-11-10T10:00:00Z"),
        touch("7", "NOT_INTERESTED", "2026-11-10T10:00:00Z"),
        touch("8", "REFUS", "2026-11-10T10:00:00Z"),
        touch("9", "DISQUALIFIED", "2026-11-10T10:00:00Z", "other"),
    ];
    const s = prospectSnapshot({ base: 9, touches, meetings: [], cutoff: CUTOFF, dictionary });
    assert.equal(s.refusals.total, 9);
    assert.deepEqual(s.refusals.reasons.map((r) => [r.label, r.count]), [
        ["Refus argumenté", 3],
        ["Géré par le siège", 2],
        ["Disqualifié", 1],
        ["Pas intéressé", 1],
        ["Autres motifs", 2],
    ]);
    assert.ok(Math.abs(s.refusals.reasons.reduce((a, r) => a + r.share, 0) - 1) < 1e-9);
});

test("funnel steps: each rate is the share of the step before", () => {
    const steps = funnelSteps({ base: 1240, called: 868, reached: 302, interested: 47, confirmed: 26, held: 19 });
    assert.equal(steps[0].rate, null);
    assert.equal(Math.round(steps[1].rate! * 100), 70);
    assert.equal(Math.round(steps[5].rate! * 100), 73);
    assert.equal(funnelSteps({ base: 0, called: 0, reached: 0, interested: 0, confirmed: 0, held: 0 })[1].rate, null);
});

// ── Weeks ──

test("weekly bars: Paris weeks from the mission start, the current one flagged", () => {
    const dates = [d("2026-11-02T09:00:00Z"), d("2026-11-03T09:00:00Z"), d("2026-11-17T09:00:00Z"), d("2026-11-26T09:00:00Z")];
    const bars = weeklyConfirmed(dates, d("2026-10-28T08:00:00Z"), NOW);
    assert.deepEqual(bars.map((b) => b.count), [0, 2, 0, 1, 1]);
    assert.deepEqual(bars.map((b) => b.current), [false, false, false, false, true]);
    assert.equal(bars[0].start.slice(0, 10), "2026-10-26");
});

test("weekly bars: a Sunday-night confirmation belongs to that week, not the next", () => {
    // Sunday 22 November, 23:30 Paris.
    const bars = weeklyConfirmed([d("2026-11-22T22:30:00Z")], d("2026-11-16T08:00:00Z"), NOW);
    assert.deepEqual(bars.map((b) => b.count), [1, 0]);
});

test("weekly bars: capped to the most recent weeks", () => {
    const bars = weeklyConfirmed([], d("2026-01-05T08:00:00Z"), NOW, 16);
    assert.equal(bars.length, 16);
    assert.equal(bars[15].current, true);
});

// ── Monthly pace ──

test("month target: each mission target spread over its period", () => {
    const month = { start: d("2026-10-31T23:00:00Z"), end: d("2026-11-30T23:00:00Z") };
    // 90-day mission aiming at 72 RDV, fully inside November for 30 days → 24.
    const m = { startDate: d("2026-10-01T22:00:00Z"), endDate: d("2026-12-30T23:00:00Z"), targetMeetings: 72 };
    assert.equal(monthTarget([m], month), 24);
    // A mission entirely inside the month asks for its whole target.
    assert.equal(monthTarget([{ startDate: d("2026-11-02T08:00:00Z"), endDate: d("2026-11-27T17:00:00Z"), targetMeetings: 10 }], month), 10);
    assert.equal(monthTarget([{ ...m, targetMeetings: null }], month), null);
    assert.equal(monthTarget([{ ...m, startDate: d("2027-01-04T08:00:00Z"), endDate: d("2027-02-04T08:00:00Z") }], month), null);
});

test("month pace: the verdict of pace() against the month's share", () => {
    const m = { startDate: d("2026-10-01T22:00:00Z"), endDate: d("2026-12-30T23:00:00Z"), targetMeetings: 72 };
    const onTrack = monthPace([m], 21, NOW);
    assert.equal(onTrack.target, 24);
    assert.equal(onTrack.pace.verdict, "on_track");
    assert.equal(monthPace([m], 8, NOW).pace.verdict, "behind");
    assert.equal(monthPace([{ ...m, targetMeetings: null }], 8, NOW).pace.verdict, "no_target");
});

// ── ROI ──

const invoice = (over: Partial<InvoiceFacts> = {}): InvoiceFacts => ({
    documentType: "INVOICE",
    status: "VALIDATED",
    totalHt: 9600,
    issueDate: d("2026-10-01T00:00:00Z"),
    validatedAt: d("2026-11-02T10:00:00Z"),
    cancelledAt: null,
    periodStart: d("2026-09-30T22:00:00Z"),
    periodEnd: d("2026-10-31T22:59:59Z"),
    ...over,
});
const SINCE = d("2026-10-05T08:00:00Z");

test("invoiced cost: validated invoices minus credit notes, drafts and later ones ignored", () => {
    const cost = invoicedCost([
        invoice(),
        invoice({ status: "DRAFT", totalHt: 50_000 }),
        invoice({ documentType: "CREDIT_NOTE", totalHt: 600, status: "VALIDATED" }),
        // Validated after the snapshot: next week's letter.
        invoice({ totalHt: 9600, validatedAt: d("2026-11-24T10:00:00Z"), periodStart: d("2026-11-01T00:00:00Z"), periodEnd: d("2026-11-30T22:00:00Z") }),
        // Cancelled before the snapshot.
        invoice({ status: "CANCELLED", cancelledAt: d("2026-11-10T00:00:00Z"), totalHt: 1000 }),
    ], { since: SINCE, cutoff: CUTOFF });
    assert.ok(cost);
    assert.equal(cost.amountHt, 9000);
    assert.equal(cost.from.toISOString(), "2026-09-30T22:00:00.000Z");
    assert.equal(cost.to.toISOString(), "2026-10-31T23:00:00.000Z");
    assert.equal(monthsLabel(cost.from, cost.to), "octobre");
});

test("invoiced cost: month bounds computed on a UTC server stay in their own month", () => {
    const cost = invoicedCost([invoice({ periodStart: d("2026-11-01T00:00:00Z"), periodEnd: d("2026-11-30T23:59:59.999Z") })], { since: SINCE, cutoff: d("2026-12-07T05:00:00Z") });
    assert.ok(cost);
    assert.equal(monthsLabel(cost.from, cost.to), "novembre");
    const two = invoicedCost([
        invoice(),
        invoice({ periodStart: d("2026-11-01T00:00:00Z"), periodEnd: d("2026-11-30T23:59:59.999Z"), validatedAt: d("2026-12-01T10:00:00Z") }),
    ], { since: SINCE, cutoff: d("2026-12-07T05:00:00Z") });
    assert.equal(two && monthsLabel(two.from, two.to), "octobre à novembre");
    assert.equal(two?.amountHt, 19_200);
});

test("invoiced cost: nothing invoiced means the cost is unknown, not zero", () => {
    assert.equal(invoicedCost([], { since: SINCE, cutoff: CUTOFF }), null);
    assert.equal(invoicedCost([invoice({ status: "DRAFT" })], { since: SINCE, cutoff: CUTOFF }), null);
    // An invoice for a period that ended before the missions started is another story.
    assert.equal(invoicedCost([invoice({ periodStart: d("2026-05-01T00:00:00Z"), periodEnd: d("2026-05-31T00:00:00Z") })], { since: SINCE, cutoff: CUTOFF }), null);
});

test("pipeline: held × rate × deal, only once both assumptions are set", () => {
    assert.equal(pipelineOf(19, { avgDealValue: 32_000, meetingToOppRate: 0.45 }), 273_600);
    assert.equal(pipelineOf(19, { avgDealValue: null, meetingToOppRate: 0.45 }), null);
    assert.equal(pipelineOf(19, { avgDealValue: 32_000, meetingToOppRate: 0 }), null);
});

test("roi: the multiple compares the invoiced months only; later held RDV stay out of it", () => {
    const held = (id: string, callbackIso: string) => meeting({
        id,
        prospect: id,
        callbackDate: d(callbackIso),
        confirmedAt: d("2026-10-10T09:00:00Z"),
        confirmationUpdatedAt: d("2026-10-10T09:00:00Z"),
        createdAt: d("2026-10-09T09:00:00Z"),
        feedback: { outcome: "POSITIVE", createdAt: d("2026-11-20T10:00:00Z"), standByAt: null, outOfScopeAt: null },
    });
    const meetings = [held("a", "2026-10-15T09:00:00Z"), held("b", "2026-10-20T09:00:00Z"), held("c", "2026-11-12T09:00:00Z")];
    const invested = { amountHt: 9600, from: d("2026-09-30T22:00:00Z"), to: d("2026-10-31T23:00:00Z") };
    const r = roi({ meetings, cutoff: CUTOFF, assumptions: { avgDealValue: 32_000, meetingToOppRate: 0.5 }, invested });
    assert.equal(r.held, 3);
    assert.equal(r.pipeline, 48_000);
    assert.equal(r.heldInvoiced, 2);
    assert.equal(r.pipelineInvoiced, 32_000);
    assert.equal(formatMultiple(r.multiple!), "×3,3");
    assert.equal(r.confirmedInvoiced, 3);
    assert.equal(r.costPerRdv, 3200);
});

test("roi: without invoices there is a pipeline but no multiple and no cost per RDV", () => {
    const r = roi({ meetings: [meeting({ feedback: { outcome: "NEUTRAL", createdAt: d("2026-11-21T10:00:00Z"), standByAt: null, outOfScopeAt: null } })], cutoff: CUTOFF, assumptions: { avgDealValue: 10_000, meetingToOppRate: 0.3 }, invested: null });
    assert.equal(r.pipeline, 3000);
    assert.equal(r.multiple, null);
    assert.equal(r.costPerRdv, null);
});

// ── Words ──

test("headline: built from the week's count, comparisons only when the numbers allow", () => {
    assert.deepEqual(letterHeadline({ count: 8, previous: 6, earlier: [0, 1, 2, 4, 5, 6] }), { title: "8 rendez-vous confirmés cette semaine.", detail: "Votre meilleure semaine depuis le lancement." });
    assert.deepEqual(letterHeadline({ count: 1, previous: null, earlier: [] }), { title: "1 rendez-vous confirmé cette semaine.", detail: null });
    assert.equal(letterHeadline({ count: 5, previous: 3, earlier: [3] }).detail, "2 de plus que la semaine précédente (3).");
    assert.equal(letterHeadline({ count: 2, previous: 5, earlier: [1, 6, 5] }).detail, "3 de moins que la semaine précédente (5).");
    assert.equal(letterHeadline({ count: 0, previous: 0, earlier: [0, 0, 0] }).title, "Aucun rendez-vous confirmé cette semaine.");
    assert.equal(letterHeadline({ count: 0, previous: 0, earlier: [0, 0, 0] }).detail, null);
});

test("formats: euros and multiples in French", () => {
    assert.equal(formatEuros(273_600), "273 600 €");
    assert.equal(formatMultiple(14.25), "×14,3");
    assert.equal(formatMultiple(0.8), "×0,8");
    assert.equal(formatMultiple(3), "×3,0");
});
