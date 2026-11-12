/**
 * Mission loop — plan → steps → synthesis, resume, budget, dry run, cancel.
 *
 * The real runtime, guard, executor and verifier run; the provider is a
 * scripted fake routed on the phase's instruction, every registry tool is a
 * fixture (lib/ai/agent/evals/fixtures.ts) and the run's storage is in
 * memory. Nothing touches a database or a network.
 */

import { test, after } from "node:test";
import assert from "node:assert/strict";

import { installFixtureTools, fixtureContext } from "@/lib/ai/agent/evals/fixtures";
import { runAgentTurn, type ChatFn, type ChatRequest } from "@/lib/ai/agent/runtime";
import { planTurn, type AssistantModelConfig } from "@/lib/ai/agent/models";
import type { ChatCallResponse, ToolCall } from "@/lib/ai/providers/types";
import { getTool } from "@/lib/ai/tools/registry";
import { MISSION_TOOL_ALLOWLIST, getPlaybook } from "./playbooks/registry";
import { runMissionPlaybook, parseMissionPlan, type MissionDeps, type MissionPlan, type MissionStore } from "./mission";
import type { PhaseInput, PhaseResult } from "./phase";
import type { RunToolScope } from "./tools/with-run-tools";
import type { ClaimedRun, PlaybookRunContext, RunBudget } from "./types";
import { EMPTY_USAGE } from "./types";

const fixtures = installFixtureTools(() => "normal");
after(() => fixtures.restore());

const CONFIG: AssistantModelConfig = {
    primary: "gpt-4o-mini",
    deepModel: "gpt-4.1",
    fallback: null,
    reasoningEffort: "none",
    deepReasoningEffort: "none",
    providerTimeoutMs: 5_000,
    idleTimeoutMs: 5_000,
    deepProviderTimeoutMs: 5_000,
    deepIdleTimeoutMs: 5_000,
    turnDeadlineMs: 10_000,
    deepTurnDeadlineMs: 10_000,
    maxRetries: 0,
    temperature: 0,
};

const NOW = new Date("2026-10-29T09:00:00.000Z");

function reply(text: string | null, calls: ToolCall[] = []): ChatCallResponse {
    return {
        text,
        toolCalls: calls,
        usage: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 20, reasoningTokens: 0, totalTokens: 120 },
        model: "gpt-4o-mini",
        provider: "openai",
        finish: calls.length > 0 ? "tool_calls" : "stop",
    };
}

function call(name: string, args: Record<string, unknown>, id = `call_${name}`): ToolCall {
    return { id, name, arguments: JSON.stringify(args) };
}

type Phase = "plan" | "step1" | "step2" | "synth";

function phaseOf(req: ChatRequest): Phase {
    const users = req.messages.filter((m) => m.role === "user");
    const text = users.map((m) => m.content).join("\n");
    if (text.includes("Réponds UNIQUEMENT par un objet JSON")) return "plan";
    if (text.includes("Rédige la synthèse finale")) return "synth";
    if (text.includes("Étape en cours (2/")) return "step2";
    return "step1";
}

/** Routes each provider call to a per-phase script; `round` = tool messages already in the turn. */
function router(script: Partial<Record<Phase, (round: number, req: ChatRequest) => ChatCallResponse>>) {
    const seen: Array<{ phase: Phase; req: ChatRequest }> = [];
    const chat: ChatFn = async (req) => {
        const phase = phaseOf(req);
        seen.push({ phase, req: { ...req, messages: req.messages.map((m) => ({ ...m })) } as ChatRequest });
        const round = req.messages.filter((m) => m.role === "tool").length;
        const step = script[phase];
        if (!step) throw new Error(`unexpected phase ${phase}`);
        return step(round, req);
    };
    return { chat, seen };
}

const PLAN_JSON = JSON.stringify({
    steps: [
        { title: "Mesurer les rendez-vous du mois", intent: "volume et taux", tools: ["get_mission_metrics"] },
        { title: "Lister les relances utiles", intent: "qui relancer", tools: [] },
    ],
    successCriteria: "une liste de relances priorisée",
});

interface World {
    proposals: Array<{ id: string; tool: string; args: Record<string, unknown>; risk: string; state: "PENDING" }>;
    findings: string[];
    plan: unknown;
    saves: Array<{ plan: MissionPlan; phase: string }>;
    steps: Array<{ index: number; phase: string; title: string }>;
    exchanges: string[];
    cancel: boolean;
}

function makeWorld(plan: unknown = null): World {
    return { proposals: [], findings: [], plan, saves: [], steps: [], exchanges: [], cancel: false };
}

function makeRun(budget: RunBudget, overrides: Partial<ClaimedRun> = {}): ClaimedRun {
    return {
        id: "run_m1",
        jobId: null,
        kind: "MISSION",
        playbook: "mission.delegated",
        trigger: "MANUAL",
        status: "RUNNING",
        folderId: null,
        clientId: "cl_fixture_acme",
        missionId: null,
        actorId: "usr_fixture_manager",
        conversationId: "conv_mission",
        goal: "Prépare les relances des rendez-vous du mois",
        budget,
        usage: { ...EMPTY_USAGE },
        mode: "worker",
        attempts: 1,
        maxAttempts: 2,
        checkpoint: null,
        startedAt: NOW,
        createdAt: NOW,
        ...overrides,
    };
}

function budgetOf(overrides: Partial<RunBudget> = {}): RunBudget {
    return { maxToolCalls: 60, maxCostEur: 3, deadlineMs: 15 * 60_000, maxSafeWrites: 5, maxPhases: 8, ...overrides };
}

function setup(world: World, chat: ChatFn, budget: RunBudget, opts: { phaseCost?: number; runOverrides?: Partial<ClaimedRun> } = {}) {
    const run = makeRun(budget, opts.runOverrides);
    const ctx = fixtureContext({ conversationId: run.conversationId, toolAllowlist: MISSION_TOOL_ALLOWLIST, mode: "background", autoWriteBudget: budget.maxSafeWrites });
    const pctx: PlaybookRunContext = {
        run,
        config: {},
        budget,
        ctx,
        now: () => NOW,
        signal: new AbortController().signal,
        mode: "worker",
        workerId: "w_test",
        log: () => undefined,
    };

    const fakeRunPhase = async (input: PhaseInput): Promise<PhaseResult> => {
        world.steps.push({ index: input.index, phase: input.phase, title: input.title });
        const provider = input.deps!.chat!;
        const result = await runAgentTurn(
            { systemPrompt: input.systemPrompt, history: input.history, ctx: input.ctx, config: provider.config, plan: provider.plan, signal: input.signal, knownNames: input.knownNames },
            { chat: provider.chat, store: null, sleep: async () => undefined },
        );
        let proposalId: string | null = null;
        if (result.status === "action_proposed" && result.proposedAction) {
            proposalId = `prop_${world.proposals.length + 1}`;
            world.proposals.push({ id: proposalId, tool: result.proposedAction.tool, args: result.proposedAction.args, risk: "confirm", state: "PENDING" });
        }
        return {
            stepId: `step_${input.index}`,
            result,
            proposalId,
            usage: { promptTokens: 100, completionTokens: 20, costEur: opts.phaseCost ?? 0.01, toolCalls: result.toolCalls, phases: 1 },
            digest: result.answer.slice(0, 200),
        };
    };

    const store: MissionStore = {
        loadPlan: async () => world.plan,
        nextStepIndex: async () => world.steps.length,
        saveProgress: async (_runId, data) => {
            world.plan = JSON.parse(JSON.stringify(data.plan));
            world.saves.push({ plan: JSON.parse(JSON.stringify(data.plan)), phase: data.checkpoint.phase });
        },
        ensureThread: async () => run.conversationId,
        appendExchange: async (p) => {
            world.exchanges.push(p.assistantText);
            return "msg_1";
        },
    };

    const scope: RunToolScope = {
        runId: run.id,
        clientId: run.clientId,
        missionId: null,
        resolveTool: getTool,
        createProposal: async (input) => {
            const id = `prop_${world.proposals.length + 1}`;
            world.proposals.push({ id, tool: input.tool, args: input.args, risk: input.risk, state: "PENDING" });
            return { id, number: world.proposals.length };
        },
        recordFinding: async (input) => {
            world.findings.push(input.key);
            return { id: `f_${world.findings.length}`, created: true };
        },
    };

    const deps: MissionDeps = {
        runPhase: fakeRunPhase,
        chatForTier: (tier) => ({ chat, config: CONFIG, plan: planTurn(CONFIG, tier === "deep" ? "deep" : "standard") }),
        store,
        scope: () => scope,
        systemPrompt: async () => "Tu es l'agent de test.",
        cancelRequested: async () => world.cancel,
        toolAvailable: () => false,
        cancelPollMs: 60_000,
    };
    return { pctx, deps, run };
}

test("registry ships the three new playbooks; missions never get credential tools", () => {
    assert.equal(getPlaybook("report.weekly_bilan")?.kind, "REPORT");
    assert.equal(getPlaybook("report.weekly_bilan")?.defaultSchedule, "0 14 * * 5");
    assert.equal(getPlaybook("mission.delegated")?.kind, "MISSION");
    assert.equal(getPlaybook("mission.delegated")?.defaultSchedule, null);
    assert.equal(getPlaybook("digest.morning")?.defaultSchedule, "30 7 * * 1-5");
    for (const name of ["reveal_password", "rotate_password", "create_portal_account"]) assert.equal(MISSION_TOOL_ALLOWLIST.has(name), false, name);
    assert.ok(MISSION_TOOL_ALLOWLIST.has("propose_action"));
    assert.ok(MISSION_TOOL_ALLOWLIST.has("get_mission_metrics"));
});

test("plan → 2 steps → synthesis; a confirm action leaves the run waiting for approval", async () => {
    fixtures.reset();
    const world = makeWorld();
    const { chat, seen } = router({
        plan: () => reply(PLAN_JSON),
        step1: (round) => (round === 0 ? reply(null, [call("get_mission_metrics", { days: 30 })]) : reply("Sur 30 jours, 14 RDV ont été pris [E1].")),
        step2: () => reply("Trois prospects à relancer en priorité."),
        synth: () => reply("Je propose d'envoyer le brouillon de relance.", [call("send_draft", { artifactId: "art_relance", to: ["contact@acme.example"] })]),
    });
    const { pctx, deps } = setup(world, chat, budgetOf());

    const outcome = await runMissionPlaybook(pctx, deps);

    assert.equal(outcome.error, null);
    assert.deepEqual(
        world.steps.map((s) => s.phase),
        ["plan", "execute", "execute", "synthesise"],
    );
    const plan = world.plan as MissionPlan;
    assert.equal(plan.steps.length, 2);
    assert.deepEqual(plan.steps.map((s) => s.status), ["done", "done"]);
    assert.match(plan.steps[0].digest ?? "", /14 RDV/);
    // Step 2 reads step 1's digest, not its turn.
    const step2Req = seen.find((s) => s.phase === "step2")!.req;
    assert.ok(step2Req.messages.some((m) => m.role === "user" && m.content.includes("Sur 30 jours, 14 RDV")));
    // The planner had no tools at all.
    assert.equal((seen.find((s) => s.phase === "plan")!.req.tools ?? []).length, 0);
    // The confirm call became a pending proposal, never an execution.
    assert.equal(world.proposals.length, 1);
    assert.equal(world.proposals[0].tool, "send_draft");
    assert.equal(world.proposals[0].state, "PENDING");
    assert.deepEqual(fixtures.confirmExecutions, []);
    assert.equal(outcome.proposalsCount, 1);
    // run.ts: pending > 0 → WAITING_APPROVAL
    const status = world.proposals.some((p) => p.state === "PENDING") ? "WAITING_APPROVAL" : "DONE";
    assert.equal(status, "WAITING_APPROVAL");
    assert.equal(world.saves[world.saves.length - 1].phase, "done");
});

test("resume after a crash: DONE steps are skipped, the plan is not redone", async () => {
    fixtures.reset();
    const stored: MissionPlan = {
        steps: [
            { title: "Mesurer les rendez-vous du mois", intent: "volume", tools: [], status: "done", digest: "Sur 30 jours, 14 RDV [E1]." },
            { title: "Lister les relances utiles", intent: "qui relancer", tools: [], status: "pending" },
        ],
        successCriteria: "liste priorisée",
    };
    const world = makeWorld(stored);
    const { chat, seen } = router({
        step2: () => reply("Trois prospects à relancer."),
        synth: () => reply("Mission terminée : trois relances recommandées."),
    });
    const { pctx, deps } = setup(world, chat, budgetOf(), { runOverrides: { checkpoint: { phase: "execute", proposals: 0 }, attempts: 2 } });

    const outcome = await runMissionPlaybook(pctx, deps);

    assert.equal(outcome.error, null);
    assert.deepEqual(seen.map((s) => s.phase), ["step2", "synth"]);
    assert.deepEqual(world.steps.map((s) => s.phase), ["execute", "synthesise"]);
    assert.deepEqual((world.plan as MissionPlan).steps.map((s) => s.status), ["done", "done"]);
    assert.equal(world.exchanges.length, 1);
});

test("budget exhaustion stops cleanly before the next phase, progress saved", async () => {
    fixtures.reset();
    const world = makeWorld();
    const { chat, seen } = router({
        plan: () => reply(PLAN_JSON),
        step1: () => reply("Rien de notable."),
        step2: () => reply("ne doit pas être appelé"),
        synth: () => reply("ne doit pas être appelé"),
    });
    // 0.6 € per phase, 1 € budget: plan (0.6) passes, step 1 (1.2) spends it.
    const { pctx, deps } = setup(world, chat, budgetOf({ maxCostEur: 1 }), { phaseCost: 0.6 });

    const outcome = await runMissionPlaybook(pctx, deps);

    assert.equal(outcome.error, null, "a spent budget is a clean stop, not a failure");
    assert.deepEqual(seen.map((s) => s.phase), ["plan", "step1"]);
    assert.match(outcome.summary, /Budget de 1\.00 € atteint/);
    assert.deepEqual((world.plan as MissionPlan).steps.map((s) => s.status), ["done", "skipped"]);
    assert.equal(world.saves[world.saves.length - 1].phase, "done");
});

test("a confirm call mid-step is recorded and the step continues; the phase cap keeps one phase for the synthesis", async () => {
    fixtures.reset();
    const world = makeWorld();
    const { chat, seen } = router({
        plan: () => reply(PLAN_JSON),
        step1: (_round, req) => {
            const lastUser = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
            if (lastUser.includes("Proposition #1 enregistrée")) return reply("Brouillon proposé, étape terminée.");
            return reply("J'envoie la relance.", [call("send_draft", { artifactId: "art_relance", to: ["contact@acme.example"] })]);
        },
        step2: () => reply("ne doit pas être appelé"),
        synth: () => reply("Synthèse partielle."),
    });
    // 4 phases: plan, step 1, its continuation, synthesis — no room for step 2.
    const { pctx, deps } = setup(world, chat, budgetOf({ maxPhases: 4 }));

    const outcome = await runMissionPlaybook(pctx, deps);

    assert.deepEqual(seen.map((s) => s.phase), ["plan", "step1", "step1", "synth"]);
    assert.equal(world.proposals.length, 1);
    assert.deepEqual((world.plan as MissionPlan).steps.map((s) => s.status), ["done", "skipped"]);
    assert.match((world.plan as MissionPlan).steps[0].digest ?? "", /étape terminée/);
    assert.match(outcome.summary, /arrêtée avant la fin/);
});

test("dry run: a write is refused by the guard and becomes a proposal, nothing is written", async () => {
    fixtures.reset();
    const world = makeWorld();
    let toolMessageSeen = "";
    const { chat } = router({
        plan: () => reply(JSON.stringify({ steps: [{ title: "Créer la tâche de relance", intent: "tâche", tools: ["create_task"] }], successCriteria: "" })),
        step1: (round, req) => {
            if (round === 0) return reply(null, [call("create_task", { projectId: "proj_acme", title: "Relancer les absents" })]);
            toolMessageSeen = [...req.messages].reverse().find((m) => m.role === "tool")?.content ?? "";
            return reply("La tâche est proposée au manager.");
        },
        synth: () => reply("Une tâche de relance attend votre validation."),
    });
    const { pctx, deps } = setup(world, chat, budgetOf({ maxSafeWrites: 0 }));
    assert.equal(pctx.ctx.autoWriteBudget, 0);

    const outcome = await runMissionPlaybook(pctx, deps);

    assert.equal(outcome.error, null);
    assert.equal(world.proposals.length, 1);
    assert.equal(world.proposals[0].tool, "create_task");
    assert.equal(world.proposals[0].risk, "safe_write");
    assert.deepEqual(world.proposals[0].args, { projectId: "proj_acme", title: "Relancer les absents" });
    assert.equal(fixtures.calls.filter((c) => c.tool === "create_task").length, 0, "the write never ran");
    assert.match(toolMessageSeen, /Proposition #1 enregistrée pour validation/);
    assert.equal(outcome.proposalsCount, 1);
});

test("cancellation requested: the mission stops at the next boundary", async () => {
    fixtures.reset();
    const world = makeWorld();
    const { chat, seen } = router({
        plan: () => {
            world.cancel = true; // requested while the plan was being written
            return reply(PLAN_JSON);
        },
        step1: () => reply("ne doit pas être appelé"),
    });
    const { pctx, deps } = setup(world, chat, budgetOf());

    const outcome = await runMissionPlaybook(pctx, deps);

    assert.deepEqual(seen.map((s) => s.phase), ["plan"]);
    assert.match(outcome.summary, /annulée/);
    assert.deepEqual((world.plan as MissionPlan).steps.map((s) => s.status), ["skipped", "skipped"]);
});

test("parseMissionPlan: JSON inside prose, clamped; garbage falls back to one step", () => {
    const parsed = parseMissionPlan(`Voici le plan : ${PLAN_JSON} Bonne journée.`, "objectif", 1);
    assert.equal(parsed.fallback, false);
    assert.equal(parsed.plan.steps.length, 1);
    assert.equal(parsed.plan.steps[0].status, "pending");
    const bad = parseMissionPlan("je ne sais pas", "Relancer Acme", 4);
    assert.equal(bad.fallback, true);
    assert.equal(bad.plan.steps[0].intent, "Relancer Acme");
});
