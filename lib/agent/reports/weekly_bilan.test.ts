/**
 * Report pieces (pure) and the run-scoped tools' gates: dataset payload,
 * template instruction, plain-text publication, propose_action validation,
 * run-scope isolation. No database.
 */

import { test, after } from "node:test";
import assert from "node:assert/strict";

import { installFixtureTools, fixtureContext } from "@/lib/ai/agent/evals/fixtures";
import { checkToolAccess } from "@/lib/ai/tools/guard";
import { getTool } from "@/lib/ai/tools/registry";
import { bilanEmailText, bilanPlainText, publishWeeklyBilan } from "@/lib/ai/tools/definitions/reporting";
import type { WeeklyBilanData } from "@/lib/reporting/weekly-bilan-render";
import { MISSION_TOOL_ALLOWLIST } from "../playbooks/registry";
import { proposeAction, proposeFromCall } from "../tools/propose_action";
import { recordFinding, findingKeySlug } from "../tools/record_finding";
import { AGENT_RUN_PERMISSION, getRunScope, withRunTools, type RunToolScope } from "../tools/with-run-tools";
import { buildReportDataset, getReportDataset } from "./dataset-tool";
import { missingSections, weeklyBilanInstruction } from "./templates";
import { reportWeek } from "./weekly_bilan";

const fixtures = installFixtureTools(() => "normal");
after(() => fixtures.restore());

const DATA: WeeklyBilanData = {
    clientId: "cl_1",
    clientName: "Acme",
    week: { start: "2026-10-26", end: "2026-10-30", label: "Semaine du 26 au 30 octobre 2026" },
    stats: { calls: 240, previousCalls: 200, conversations: 60, meetings: 6, meetingsConfirmed: 4, meetingsPending: 2, prospects: 180, lowVolume: false },
    meetings: [{ company: "Durand SA", contactTitle: "DAF", at: "2026-11-03T09:00:00.000Z", missionName: "Q4" }],
    highlights: ["Taux de conversation en hausse — 25 %"],
    notes: ["[CALLBACK] rappeler mardi"],
};

test("dataset: French keys, derived rates, 6-week trend", () => {
    const trend = [1, 2, 3, 4, 5, 6].map((i) => ({ weekStart: `2026-09-${String(14 + i).padStart(2, "0")}`, label: `S${i}`, calls: i * 10, conversations: i, meetings: i % 2 }));
    const d = buildReportDataset(DATA, trend);
    assert.equal(d.chiffres.appels, 240);
    assert.equal(d.chiffres.evolution_appels_pct, 20);
    assert.equal(d.chiffres.taux_conversation_pct, 25);
    assert.equal(d.chiffres.taux_transformation_pct, 10);
    assert.equal(d.tendance_6_semaines.length, 6);
    assert.equal(d.rendez_vous[0].societe, "Durand SA");
    const low = buildReportDataset({ ...DATA, stats: { ...DATA.stats, lowVolume: true } }, []);
    assert.equal(low.chiffres.taux_conversation_pct, null);
});

test("week: config weekStart (any day) or the current bilan week", () => {
    assert.deepEqual(reportWeek(new Date("2026-10-30T13:00:00Z"), undefined).start, "2026-10-26");
    assert.deepEqual(reportWeek(new Date("2026-10-30T13:00:00Z"), "2026-10-14").start, "2026-10-12");
});

test("instruction lists the six sections and their visuals; missing sections detected", () => {
    const text = weeklyBilanInstruction({ clientName: "Acme", weekLabel: DATA.week.label, seeded: true, toolAvailable: false });
    for (const h of ["Synthèse", "Chiffres de la semaine", "Tendance sur 6 semaines", "Rendez-vous", "Points de vigilance", "Prochaines étapes"]) assert.ok(text.includes(`## ${h}`), h);
    assert.match(text, /kind « kpi_row »/);
    assert.match(text, /kind « line »/);
    assert.match(text, /kind « table »/);
    assert.match(text, /\(E1\)/);
    assert.deepEqual(missingSections("# T\n## Synthèse\n## Chiffres de la semaine\n## Tendance sur 6 semaines\n## Rendez-vous\n## Points de vigilance"), ["Prochaines étapes"]);
});

test("publication text: no visual markers, no source labels; e-mail without markdown", () => {
    const body = "# Bilan\n## Synthèse\n**240 appels** cette semaine [E1].\n\n[[visuel 1]]\n\n- point [E1] [E2]";
    assert.equal(bilanPlainText(body), "# Bilan\n## Synthèse\n**240 appels** cette semaine.\n\n- point");
    assert.equal(bilanEmailText(body), "Bilan\nSynthèse\n240 appels cette semaine.\n\n• point");
    assert.equal(publishWeeklyBilan.risk, "confirm");
});

function scope(proposals: Array<{ tool: string; risk: string }>): RunToolScope {
    return {
        runId: "run_1",
        clientId: "cl_fixture_acme",
        missionId: null,
        resolveTool: (name) => getTool(name) ?? (name === "publish_weekly_bilan" ? publishWeeklyBilan : undefined),
        createProposal: async (input) => {
            proposals.push({ tool: input.tool, risk: input.risk });
            return { id: `p${proposals.length}`, number: proposals.length };
        },
        recordFinding: async () => ({ id: "f1", created: true }),
        dataset: { chiffres: { appels: 240 } },
    };
}

test("run-scoped tools: invisible to the chat, bound to their run only", async () => {
    const chat = fixtureContext();
    for (const tool of [proposeAction, recordFinding, getReportDataset]) {
        assert.equal(checkToolAccess(tool, chat).allowed, false, tool.name);
        assert.equal(checkToolAccess(tool, chat).code, "permission_denied");
    }
    const runCtx = withRunTools(fixtureContext({ toolAllowlist: MISSION_TOOL_ALLOWLIST, mode: "background" }), scope([]));
    assert.ok(runCtx.permissions.includes(AGENT_RUN_PERMISSION));
    assert.equal(checkToolAccess(proposeAction, runCtx).allowed, true);
    assert.deepEqual(await getReportDataset.execute({}, runCtx), { chiffres: { appels: 240 } });
    // A context that merely copies the permission does not get a scope.
    assert.throws(() => getRunScope({ ...chat, permissions: [AGENT_RUN_PERMISSION] }), /tâche de l'agent/);
});

test("propose_action: validates like a real call, refuses reads and tools outside the allowlist", async () => {
    const proposals: Array<{ tool: string; risk: string }> = [];
    const s = scope(proposals);
    const ctx = withRunTools(fixtureContext({ toolAllowlist: MISSION_TOOL_ALLOWLIST, mode: "background", autoWriteBudget: 0 }), s);

    const ok = await proposeFromCall(s, ctx, { tool: "create_task", args: { projectId: "p", title: "Relancer" }, rationale: "Trois absents." });
    assert.equal(ok.number, 1);
    assert.equal(ok.card.title, getTool("create_task")!.label);
    assert.deepEqual(proposals, [{ tool: "create_task", risk: "safe_write" }]);

    const confirm = await proposeFromCall(s, ctx, { tool: "send_draft", args: { artifactId: "a1", to: ["x@acme.example"] }, rationale: "Relance." });
    assert.equal(confirm.number, 2);
    assert.equal(proposals[1].risk, "confirm");

    await assert.rejects(proposeFromCall(s, ctx, { tool: "get_mission_metrics", args: { days: 30 }, rationale: "x" }), /lecture/);
    await assert.rejects(proposeFromCall(s, ctx, { tool: "reveal_password", args: {}, rationale: "x" }), /pas disponible/);
    await assert.rejects(proposeFromCall(s, ctx, { tool: "create_task", args: { title: "" }, rationale: "x" }), /Arguments invalides/);
    await assert.rejects(proposeFromCall(s, ctx, { tool: "propose_action", args: {}, rationale: "x" }), /ne peut pas être proposé/);
    assert.equal(proposals.length, 2);
    assert.equal(fixtures.confirmExecutions.length, 0);
});

test("finding keys collide on purpose", () => {
    assert.equal(findingKeySlug("Relancer Acme Énergie !"), "relancer-acme-energie");
    assert.equal(findingKeySlug("relancer-acme-energie"), "relancer-acme-energie");
});
