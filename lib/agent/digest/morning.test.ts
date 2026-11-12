import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptNarrative, compileDigest, parsePrefs, type DigestFinding, type DigestInput } from "./morning";

// Thursday 29 October 2026, 07:30 Paris (06:30 UTC): the clock is frozen.
const NOW = new Date("2026-10-29T06:30:00.000Z");
const SINCE = new Date("2026-10-28T06:31:00.000Z");

function finding(id: string, severity: DigestFinding["severity"], firstSeen: string, metrics: Record<string, unknown> | null = null): DigestFinding {
    return { id, severity, title: `Titre ${id}`, body: `Constat ${id}.`, metrics, clientName: id === "a" ? "Acme" : null, firstSeenAt: new Date(firstSeen), lastSeenAt: new Date(firstSeen) };
}

function input(overrides: Partial<DigestInput> = {}): DigestInput {
    return { now: NOW, since: SINCE, findings: [], proposals: [], runs: [], reports: [], ...overrides };
}

test("nothing waiting → empty digest (no model, no message)", () => {
    const d = compileDigest(input({ runs: [{ id: "r", label: "Veille", status: "DONE", summary: "Rien de nouveau", finishedAt: NOW }] }));
    assert.equal(d.empty, true);
    assert.equal(d.counts.runs, 1);
});

test("new findings first, then by severity; counts, sections and metrics from the rows", () => {
    const d = compileDigest(
        input({
            findings: [
                finding("old_crit", "CRITICAL", "2026-10-20T08:00:00Z"),
                finding("new_warn", "WARN", "2026-10-28T09:00:00Z", { appels_7j: 12, rythme_pct: 48 }),
                finding("a", "CRITICAL", "2026-10-28T10:00:00Z"),
            ],
            proposals: [{ id: "p", title: "Publier le bilan d'Acme", expiresAt: new Date("2026-10-31T13:00:00Z") }],
            reports: [{ runId: "r1", title: "Bilan hebdomadaire — Acme" }],
            runs: [{ id: "r2", label: "Mission « relances »", status: "FAILED", summary: "Budget atteint", finishedAt: NOW }],
        }),
    );
    assert.equal(d.empty, false);
    assert.deepEqual(d.counts, { findings: 3, newFindings: 2, critical: 2, proposals: 1, runs: 1, failedRuns: 1, reports: 1 });
    const lines = d.markdown.split("\n");
    const order = lines.filter((l) => l.startsWith("- **")).map((l) => /Titre (\w+)/.exec(l)?.[1]);
    assert.deepEqual(order, ["a", "new_warn", "old_crit"]);
    assert.match(d.markdown, /## Signalements ouverts \(3, dont 2 nouveau\(x\)\)/);
    assert.match(d.markdown, /\*\*Titre a\*\* \(nouveau, critique\) — Acme/);
    assert.match(d.markdown, /appels 7j : 12 · rythme pct : 48/);
    assert.match(d.markdown, /## Rapports à valider \(1\)/);
    assert.match(d.markdown, /Publier le bilan d'Acme — expire le 31\/10 à 14:00/);
    assert.match(d.markdown, /Mission « relances » : en échec — Budget atteint/);
    assert.equal(d.opening, "Ce matin : 2 signalements critiques, 2 nouveaux signalements, 1 rapport à valider, 1 proposition en attente, 1 exécution en échec.");
    assert.match(d.dateLabel, /^jeudi 29 octobre$/);
    assert.ok(d.allowedNumbers.includes("48"));
});

test("the model's line is kept only without foreign figures or markers", () => {
    const d = compileDigest(input({ findings: [finding("x", "WARN", "2026-10-28T09:00:00Z", { appels: 12 })] }));
    assert.equal(acceptNarrative("Priorité ce matin : relancer les clients silencieux.", d), "Priorité ce matin : relancer les clients silencieux.");
    assert.equal(acceptNarrative("Le client a fait 12 appels.", d), "Le client a fait 12 appels.", "12 is in the metrics");
    assert.equal(acceptNarrative("Le client a perdu 37 rendez-vous.", d), null);
    assert.equal(acceptNarrative("Chiffre [E1] cité.", d), null);
    assert.equal(acceptNarrative("", d), null);
});

test("prefs: mute parsed defensively", () => {
    assert.equal(parsePrefs('{"mute":true}').mute, true);
    assert.deepEqual(parsePrefs("pas du json"), {});
    assert.deepEqual(parsePrefs(null), {});
});
