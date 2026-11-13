import { test } from "node:test";
import assert from "node:assert/strict";
import { daysLate, familyCounts, followUpBucket, frWhen, recommendNextActions, type OutreachRow } from "./signals";
import { demoIntent } from "./demo";
import { parseParisDateTime } from "@/lib/ai/tools/definitions/sdr";

// 2026-11-13 15:00 Paris (14:00 UTC)
const NOW = new Date("2026-11-13T14:00:00.000Z");

test("follow-ups are bucketed against the Paris day", () => {
    assert.equal(followUpBucket(null, NOW), "undated");
    assert.equal(followUpBucket(new Date("2026-11-13T09:00:00Z"), NOW), "overdue");
    assert.equal(followUpBucket(new Date("2026-11-13T16:00:00Z"), NOW), "today");
    // 23:30 Paris is still today even though it is 22:30 UTC.
    assert.equal(followUpBucket(new Date("2026-11-13T22:30:00Z"), NOW), "today");
    // 00:30 Paris tomorrow is 23:30 UTC today: upcoming, not today.
    assert.equal(followUpBucket(new Date("2026-11-13T23:30:00Z"), NOW), "upcoming");
});

test("dates read the way an SDR says them", () => {
    assert.equal(frWhen(new Date("2026-11-13T15:30:00Z"), NOW), "aujourd'hui à 16h30");
    assert.equal(frWhen(new Date("2026-11-14T09:00:00Z"), NOW), "demain à 10h00");
    assert.equal(frWhen(new Date("2026-11-12T09:00:00Z"), NOW), "hier à 10h00");
    assert.equal(frWhen(null, NOW), null);
    assert.equal(daysLate(new Date("2026-11-10T09:00:00Z"), NOW), 3);
});

const row = (result: string, who: string, link: string | null = `/sdr/contacts/${who}`): OutreachRow => ({
    result,
    channel: "CALL",
    who,
    link,
    note: null,
});

test("recommendations come from the rows and name their prospects", () => {
    const recs = recommendNextActions(
        [row("INTERESTED", "a"), row("INTERESTED", "a"), row("ENVOIE_MAIL", "b"), row("NO_RESPONSE", "c"), row("FAUX_NUMERO", "d")],
        { overdueFollowUps: 2, dueTodayFollowUps: 0 },
    );
    assert.equal(recs[0].action, "Proposer un créneau de RDV aux prospects intéressés");
    assert.deepEqual(recs[0].prospects, [{ name: "a", link: "/sdr/contacts/a" }], "deduplicated");
    assert.ok(recs.some((r) => r.action.startsWith("Envoyer les mails")));
    assert.ok(recs.some((r) => r.reason === "2 rappel(s) dépassé(s)"));
    assert.ok(recs.some((r) => r.prospects.some((p) => p.name === "d")), "data issue named");
    assert.ok(!recs.some((r) => r.action.startsWith("Réessayer")), "one no-answer is not a pattern");
});

test("an empty day recommends starting the queue, nothing else", () => {
    assert.deepEqual(
        recommendNextActions([], { overdueFollowUps: 0, dueTodayFollowUps: 0 }).map((r) => r.action),
        ["Démarrer la file d'actions"],
    );
});

test("family counts keep the display order", () => {
    assert.deepEqual(familyCounts([{ result: "NO_RESPONSE" }, { result: "MEETING_BOOKED" }, { result: "NO_RESPONSE" }]), [
        { family: "meeting", count: 1 },
        { family: "noReach", count: 2 },
    ]);
});

test("reschedule dates are Paris wall-clock times and never in the past", () => {
    const d = parseParisDateTime("2026-11-16T10:30", NOW);
    assert.equal(d?.toISOString(), "2026-11-16T09:30:00.000Z");
    assert.equal(parseParisDateTime("2026-11-16T10:30:00Z", NOW)?.toISOString(), "2026-11-16T10:30:00.000Z");
    assert.equal(parseParisDateTime("2026-11-01T10:30", NOW), null);
    assert.equal(parseParisDateTime("demain", NOW), null);
});

test("demo model picks the tool an SDR question needs", () => {
    assert.equal(demoIntent("Quels prospects attendent une relance ?").tool, "sdr_list_follow_ups");
    assert.equal(demoIntent("Prépare mon prochain appel").tool, "sdr_prepare_next_call");
    assert.deepEqual(demoIntent("Prépare mon appel avec Marie Durand"), { tool: "sdr_prepare_next_call", args: { search: "Marie Durand" } });
    assert.equal(demoIntent("Fais le bilan de ma journée").tool, "sdr_today_outreach");
    assert.equal(demoIntent("Reporte le premier rappel à demain 10h").tool, "reschedule");
    assert.equal(demoIntent("Bonjour").tool, null);
});
