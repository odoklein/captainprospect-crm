import { test } from "node:test";
import assert from "node:assert/strict";
import { closerSignals, noTargetSignal, refusalSignals, sasSignal, silenceSignals, sortSignals, stockSignals, stockWorkingDays } from "./signals";
import { sortTeam, statusLabel, teamMember, type TeamInput } from "./team";
import { buildClosers } from "./patterns";
import { addCalls, emptyTally, isRefusal } from "./dictionary";

const none = new Set<string>();

// ── Dictionary ────────────────────────────────────────────────────────────

test("dictionary: a refusal is the REFUS category, or a refusal code without one", () => {
    assert.equal(isRefusal("NOT_INTERESTED", null), true);
    assert.equal(isRefusal("REFUS_ARGU", "REFUS"), true);
    assert.equal(isRefusal("NOT_INTERESTED", "DISQUALIFIE"), false);
    assert.equal(isRefusal("DISQUALIFIED", null), false);
    assert.equal(isRefusal("NO_RESPONSE", null), false);
    // A category status-family does not know (« DISQUALIFIED », « OTHER ») does not decide: the code does.
    assert.equal(isRefusal("REFUS_ARGU", "DISQUALIFIED"), true);
    assert.equal(isRefusal("HORS_CIBLE", "DISQUALIFIED"), false);
});

test("dictionary: gatekeepers and dead numbers are not joints; a project to follow is positive", () => {
    const t = emptyTally();
    addCalls(t, "BARRAGE_STANDARD", null, 4);
    addCalls(t, "NUMERO_KO", null, 1);
    addCalls(t, "PROJET_A_SUIVRE", null, 2);
    addCalls(t, "MEETING_BOOKED", "RDV_PRIS", 1);
    addCalls(t, "RAPPEL", null, 3);
    assert.deepEqual(t, { calls: 11, reached: 6, positive: 3, meetings: 1, refusals: 0 });
});

// ── T7 SAS ────────────────────────────────────────────────────────────────

test("SAS: warning inside 4 office hours, critical past them", () => {
    const now = new Date("2026-11-27T13:00:00Z"); // 14:00 Paris
    const fresh = sasSignal([{ id: "1", createdAt: "2026-11-27T11:00:00Z", label: "Atelier Brézé", sdr: "Inès" }], now, none)!;
    assert.equal(fresh.severity, "warning");
    assert.match(fresh.detail, /2 h ouvrées \(Atelier Brézé, Inès\)/);
    const old = sasSignal([{ id: "2", createdAt: "2026-11-26T15:00:00Z", label: "Kalio", sdr: null }], now, none)!;
    // Thursday 16:00 → 18:00 (2 h) + Friday 9:00 → 14:00 (5 h) = 7 h ouvrées.
    assert.equal(old.severity, "critical");
    assert.match(old.detail, /7 h ouvrées/);
    assert.equal(sasSignal([], now, none), null);
});

// ── Team and T2 silence ──────────────────────────────────────────────────

const member = (over: Partial<TeamInput>): TeamInput => ({
    id: "y",
    name: "Yanis",
    nowMinute: 11 * 60 + 40,
    blocks: [{ start: 9 * 60, end: 17 * 60, missionId: "m", mission: "Axonis" }],
    absent: false,
    lastActionMinute: 11 * 60 + 13,
    callMinutes: [],
    meetings: 0,
    quota: 70,
    targetHours: 6,
    ...over,
});

test("team: an action under 15 min is online; 27 min of silence in a block is a signal", () => {
    assert.equal(teamMember(member({ lastActionMinute: 11 * 60 + 30 })).status, "online");
    const silent = teamMember(member({}));
    assert.equal(silent.status, "silent");
    assert.equal(silent.silentMinutes, 27);
    assert.equal(statusLabel(silent), "Silencieux · 27 min");
    const [signal] = silenceSignals([silent]);
    assert.equal(signal.title, "Yanis silencieux depuis 27 min");
    assert.match(signal.detail, /Bloc Axonis planifié jusqu’à 12:30/);
});

test("team: 20 min of silence shows on the row but raises no signal yet", () => {
    const m = teamMember(member({ lastActionMinute: 11 * 60 + 20 }));
    assert.equal(m.status, "silent");
    assert.deepEqual(silenceSignals([m]), []);
});

test("team: lunch is a break, silence restarts with the afternoon block", () => {
    const lunch = teamMember(member({ nowMinute: 13 * 60, lastActionMinute: 12 * 60 + 20 }));
    assert.equal(lunch.status, "break");
    assert.equal(statusLabel(lunch), "Pause · reprise 13:30");
    const after = teamMember(member({ nowMinute: 13 * 60 + 40, lastActionMinute: 12 * 60 + 20 }));
    assert.equal(after.status, "starting");
    assert.equal(teamMember(member({ nowMinute: 14 * 60, lastActionMinute: 12 * 60 + 20 })).silentMinutes, 30);
});

test("team: absent, off-plan and finished", () => {
    assert.equal(teamMember(member({ absent: true })).status, "absent");
    assert.equal(teamMember(member({ absent: true })).expected, null);
    assert.equal(teamMember(member({ blocks: [], lastActionMinute: 9 * 60 })).status, "unplanned");
    assert.equal(teamMember(member({ nowMinute: 17 * 60 + 30, lastActionMinute: 16 * 60 })).status, "done");
    assert.equal(teamMember(member({ nowMinute: 8 * 60, lastActionMinute: null })).status, "before");
});

test("team: calls are compared with the prorated quota", () => {
    // 9:00–11:40 is 160 of the 420 calling minutes: 70 × 160/420 ≈ 26.7 → 27 expected.
    const m = teamMember(member({ callMinutes: Array.from({ length: 24 }, (_, i) => 9 * 60 + i * 6), lastActionMinute: 11 * 60 + 38 }));
    assert.equal(m.expected, 27);
    assert.equal(m.calls, 24);
    assert.equal(m.dayQuota, 70);
});

test("team: the silent come first", () => {
    const a = teamMember(member({ id: "a", name: "Inès", lastActionMinute: 11 * 60 + 35 }));
    const b = teamMember(member({ id: "b", name: "Yanis" }));
    assert.deepEqual(sortTeam([a, b]).map((m) => m.name), ["Yanis", "Inès"]);
});

// ── T4 refusal spike ──────────────────────────────────────────────────────

test("refusal spike: +15 pts over the agency with at least 20 joints", () => {
    const rows = [
        { missionId: "v", name: "Verdane", reached: 64, refusals: 36 }, // 56.25 %
        { missionId: "k", name: "Kalio", reached: 12, refusals: 10 }, // too few joints
        { missionId: "n", name: "Nordlys", reached: 50, refusals: 24 }, // +8 pts
    ];
    const signals = refusalSignals(rows, 0.4);
    assert.equal(signals.length, 1);
    assert.equal(signals[0].title, "Verdane : refus à 56 % des joints");
    assert.match(signals[0].detail, /\+16 pts au-dessus de l’agence \(40 %\)/);
    assert.deepEqual(refusalSignals(rows, null), []);
});

// ── T8 stock ──────────────────────────────────────────────────────────────

test("stock: working days at the last week's pace, alert under 2", () => {
    assert.equal(stockWorkingDays({ reachable: 118, actions7d: 370 }), 118 / 74);
    assert.equal(stockWorkingDays({ reachable: 50, actions7d: 0 }), null);
    const [s] = stockSignals([
        { missionId: "k", name: "Kalio", reachable: 118, actions7d: 370 },
        { missionId: "v", name: "Verdane", reachable: 900, actions7d: 370 },
        { missionId: "z", name: "Zéro", reachable: 0, actions7d: 0 },
    ]);
    assert.equal(s.title, "Kalio : file vide dans 1,6 jour ouvré");
    assert.equal(s.severity, "warning");
    const [empty] = stockSignals([{ missionId: "e", name: "Epsilon", reachable: 0, actions7d: 120 }]);
    assert.equal(empty.severity, "critical");
});

// ── T11 closer, sorting ──────────────────────────────────────────────────

test("closer: a strong rate at low volume with enough joints is flagged and ranked", () => {
    const closers = buildClosers(
        [
            { id: "c", name: "Clara", calls: 780, activeDays: 20, reached: 226, meetings: 17 }, // 39/j, 7.5 %
            { id: "i", name: "Inès", calls: 1360, activeDays: 20, reached: 394, meetings: 16 }, // 68/j, 4.1 %
            { id: "y", name: "Yanis", calls: 1440, activeDays: 20, reached: 389, meetings: 14 }, // 72/j, 3.6 %
            { id: "l", name: "Lou", calls: 1540, activeDays: 20, reached: 400, meetings: 11 }, // 77/j, 2.75 %
        ],
        70,
    );
    assert.ok(Math.abs(closers.median! - (16 / 394 + 14 / 389) / 2) < 1e-9);
    const clara = closers.points[0];
    assert.equal(clara.name, "Clara");
    assert.equal(clara.underUsed, true);
    assert.ok(Math.abs(clara.onTable - 31 * (226 / 780) * (17 / 226) * 5) < 1e-9);
    assert.equal(closers.points.filter((p) => p.underUsed).length, 1);
    const [signal] = closerSignals(closers.points, 70, closers.median);
    assert.match(signal.title, /^Clara : 7,5 % de RDV à 39 appels\/j$/);
});

test("closer: under 40 joints there is no flag", () => {
    const closers = buildClosers(
        [
            { id: "c", name: "Clara", calls: 100, activeDays: 5, reached: 30, meetings: 5 },
            { id: "i", name: "Inès", calls: 1360, activeDays: 20, reached: 394, meetings: 16 },
        ],
        70,
    );
    assert.equal(closers.points.some((p) => p.underUsed), false);
});

test("signals: critical first, then by weight", () => {
    const now = new Date("2026-11-27T13:00:00Z");
    const sas = sasSignal([{ id: "1", createdAt: "2026-11-26T08:00:00Z", label: "A", sdr: null }], now, none)!;
    const stock = stockSignals([{ missionId: "k", name: "Kalio", reachable: 118, actions7d: 370 }]);
    const untargeted = noTargetSignal([{ id: "m", name: "Atlas", meetings: 2 }])!;
    const sorted = sortSignals([untargeted, ...stock, sas]);
    assert.deepEqual(sorted.map((s) => s.kind), ["sas", "stock", "no_target"]);
    assert.equal(untargeted.title, "1 mission active sans objectif");
    assert.equal(untargeted.action.href, "/manager/missions/m");
});
