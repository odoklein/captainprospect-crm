import { test } from "node:test";
import assert from "node:assert/strict";
import {
    allowedNumbers,
    findUnverifiedNumbers,
    renderBilanEmail,
    renderBilanMarkdown,
    type WeeklyBilanData,
} from "./weekly-bilan-render";
import { bilanSessionDate, bilanTodoWindow, bilanWeek } from "./weekly-bilan-week";

const data: WeeklyBilanData = {
    clientId: "c1",
    clientName: "ACME Patrimoine",
    week: { start: "2026-10-19", end: "2026-10-23", label: "Semaine du 19 au 23 octobre 2026" },
    stats: {
        calls: 412,
        previousCalls: 380,
        conversations: 96,
        meetings: 7,
        meetingsConfirmed: 5,
        meetingsPending: 2,
        prospects: 301,
        lowVolume: false,
    },
    meetings: [{ company: "Cabinet Martin", contactTitle: "Directeur", at: "2026-10-28T09:00:00.000Z", missionName: "CGP Lyon" }],
    highlights: [],
    notes: [],
};

test("markdown reads as plain text: headings, bullets, figures from the stats only", () => {
    const md = renderBilanMarkdown(data, {
        synthese: "Bonne semaine.",
        pointsForts: ["Accroche courte efficace"],
        vigilance: [],
        prochainesEtapes: ["Élargir au Rhône"],
    });
    assert.match(md, /^# Bilan hebdomadaire — ACME Patrimoine\nSemaine du 19 au 23 octobre 2026/);
    assert.match(md, /- Appels passés : 412 \(semaine précédente : 380\)/);
    assert.match(md, /- Conversations : 96, soit 23,3 % des appels/);
    assert.match(md, /- Rendez-vous pris : 7 \(5 confirmés, 2 en attente de confirmation\)/);
    assert.match(md, /- Taux de transformation : 7,3 % des conversations/);
    assert.match(md, /- Cabinet Martin, Directeur : RDV le mer\. 28\/10 à 10 h/);
    assert.match(md, /## Points de vigilance\n- À rédiger\./);
    assert.ok(!md.includes("|"), "no tables");
});

test("low volume hides the rates; a failed AI leaves sections to write", () => {
    const md = renderBilanMarkdown({ ...data, stats: { ...data.stats, calls: 12, conversations: 3, lowVolume: true } }, null, "Crédits OpenAI épuisés");
    assert.match(md, /Conversations : 3 \(volume trop faible pour un taux fiable\)/);
    assert.ok(!md.includes("Taux de transformation"));
    assert.match(md, /## En bref\nÀ rédiger\. \(synthèse IA indisponible : Crédits OpenAI épuisés\)/);
});

test("numbers the AI wrote that are not in the stats are flagged (French formats)", () => {
    const allowed = allowedNumbers(data);
    assert.deepEqual(findUnverifiedNumbers("412 appels, 7 rendez-vous dont 5 confirmés, 23,3 % de conversations.", allowed), []);
    assert.deepEqual(findUnverifiedNumbers("Taux de 18 % et 1 204 appels sur 2 jours.", allowed), ["18", "1 204"]);
});

test("e-mail version", () => {
    const mail = renderBilanEmail(data, null);
    assert.match(mail, /^Bonjour,/);
    assert.match(mail, /• Appels passés : 412/);
    assert.match(mail, /• Cabinet Martin — mer\. 28\/10 à 10 h/);
});

test("bilan week and to-do window: Friday→Sunday this week, Monday last week overdue", () => {
    assert.deepEqual(bilanWeek(new Date("2026-10-23T15:00:00Z")), { start: "2026-10-19", end: "2026-10-23", label: "Semaine du 19 au 23 octobre 2026" });
    assert.equal(bilanWeek(new Date("2026-10-26T08:00:00Z")).start, "2026-10-19"); // Monday → last week
    assert.equal(bilanWeek(new Date("2026-10-28T08:00:00Z"), -1).start, "2026-10-19");
    assert.equal(bilanWeek(new Date("2026-11-04T08:00:00Z")).label, "Semaine du 2 au 6 novembre 2026");
    assert.equal(bilanWeek(new Date("2026-10-28T08:00:00Z")).label, "Semaine du 26 au 30 octobre 2026");
    assert.equal(bilanWeek(new Date("2026-12-02T08:00:00Z")).label, "Semaine du 30 novembre au 4 décembre 2026");

    assert.equal(bilanTodoWindow(new Date("2026-10-23T08:00:00Z"))?.overdue, false); // Friday
    assert.equal(bilanTodoWindow(new Date("2026-10-25T08:00:00Z"))?.week.start, "2026-10-19"); // Sunday
    const monday = bilanTodoWindow(new Date("2026-10-26T08:00:00Z"));
    assert.equal(monday?.overdue, true);
    assert.equal(monday?.week.start, "2026-10-19");
    assert.equal(bilanTodoWindow(new Date("2026-10-28T08:00:00Z")), null); // Wednesday
    assert.equal(bilanSessionDate({ end: "2026-10-23" }).toISOString(), "2026-10-23T10:00:00.000Z");
});
