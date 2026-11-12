/**
 * The MISSION playbook "mission.delegated": a goal a manager hands to the
 * agent ("prépare la relance des RDV absents d'Acme"), carried out in the
 * background inside a budget, every outward action left as a proposal.
 *
 *   plan        deep tier, no tools: a JSON plan {steps:[{title,intent,tools}],
 *               successCriteria}, stored on AgentRun.plan (the UI shows it).
 *   execute[i]  gather tier, the run's tools: one phase per step. Its history
 *               is a compact transcript (goal, plan with statuses, digests of
 *               the done steps), not the previous turns; the evidence ledger of
 *               the AGENT thread lets a step cite and reuse earlier reads.
 *   synthesise  deep tier: the answer for the manager, appended to the thread;
 *               it may `record_finding` and leave proposals.
 *
 * Durability: after every phase the plan (with step statuses and digests) and
 * a checkpoint are written; a resumed run (reaper after a crash) reloads the
 * plan and skips DONE steps. Budget: `checkBudget` before every phase, one
 * phase always kept for the synthesis. Cancellation: `cancelRequestedAt` is
 * polled while the run works and between phases. Dry run = `maxSafeWrites`
 * 0: every write the model attempts is refused by the guard and turned into a
 * proposal here (`interceptRefusedWrites`), so nothing is written. The same
 * conversion applies when a real run spends its automatic writes.
 */

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAssistantSystemPrompt } from "@/lib/assistant/projet/systemPrompt";
import { getBrand } from "@/lib/brand/server";
import type { ChatFn, ChatTurn } from "@/lib/ai/agent/runtime";
import type { ChatMessage, ToolCall } from "@/lib/ai/providers/types";
import { resolveFolderBinding } from "@/lib/ai/tools/context";
import { getToolsForContext } from "@/lib/ai/tools/registry";
import type { AssistantContext } from "@/lib/ai/tools/types";
import { addUsage, checkBudget } from "./budget";
import { runPhase as realRunPhase, type PhaseInput, type PhaseResult } from "./phase";
import { BACKGROUND_RULES } from "./prompt";
import { chatForTier as realChatForTier, type TierProvider } from "./providers";
import { cancelRequested as realCancelRequested } from "./queue";
import { updateRun } from "./store";
import { appendAgentExchange, ensureAgentThread } from "./thread";
import { proposeFromCall } from "./tools/propose_action";
import { isRegistered, prismaRunScope } from "./tools/resolve";
import { deriveRunContext, withRunTools, type RunToolScope } from "./tools/with-run-tools";
import type { ModelTier, PlaybookOutcome, PlaybookRunContext, RunUsage } from "./types";

// ── plan ─────────────────────────────────────────────────────────────────────

export type MissionStepStatus = "pending" | "done" | "failed" | "skipped";

export interface MissionStep {
    title: string;
    intent: string;
    tools: string[];
    status: MissionStepStatus;
    /** What the step established, ≤ 800 chars: the next phases read this, not the turn. */
    digest?: string;
}

export interface MissionPlan {
    steps: MissionStep[];
    successCriteria: string;
}

export interface MissionCheckpoint {
    phase: "plan" | "execute" | "synthesise" | "done";
    proposals: number;
    dryRun?: boolean;
    at?: string;
}

const DIGEST_CHARS = 800;
const MAX_STEPS = 6;
const CANCEL_POLL_MS = 5_000;

/** Credential and portal tools stay out of missions unless a later PR opts in. */
export const MISSION_EXCLUDED_TOOLS: ReadonlySet<string> = new Set(["reveal_password", "rotate_password", "delete_credential", "create_portal_account"]);

const PlanSchema = z.object({
    steps: z
        .array(
            z.object({
                title: z.string().trim().min(1).max(160),
                intent: z.string().trim().max(600).optional().default(""),
                tools: z.array(z.string().max(80)).max(12).optional().default([]),
            }),
        )
        .min(1),
    successCriteria: z.string().trim().max(800).optional().default(""),
});

/** The first {...} block of the model's text, parsed and clamped; a single-step plan when it is not usable. */
export function parseMissionPlan(text: string, goal: string, maxSteps: number): { plan: MissionPlan; fallback: boolean } {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
        try {
            const parsed = PlanSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
            if (parsed.success) {
                return {
                    plan: {
                        steps: parsed.data.steps.slice(0, Math.max(1, maxSteps)).map((s) => ({ title: s.title, intent: s.intent, tools: s.tools, status: "pending" as const })),
                        successCriteria: parsed.data.successCriteria,
                    },
                    fallback: false,
                };
            }
        } catch {
            // fall through
        }
    }
    return { plan: { steps: [{ title: "Traiter la demande", intent: goal.slice(0, 600), tools: [], status: "pending" }], successCriteria: "" }, fallback: true };
}

export function readStoredPlan(raw: unknown): MissionPlan | null {
    if (!raw || typeof raw !== "object" || !Array.isArray((raw as MissionPlan).steps)) return null;
    const plan = raw as MissionPlan;
    const steps = plan.steps
        .filter((s) => s && typeof s.title === "string")
        .map((s) => ({
            title: s.title,
            intent: typeof s.intent === "string" ? s.intent : "",
            tools: Array.isArray(s.tools) ? s.tools.filter((t): t is string => typeof t === "string") : [],
            status: (["pending", "done", "failed", "skipped"] as const).includes(s.status) ? s.status : "pending",
            ...(typeof s.digest === "string" ? { digest: s.digest } : {}),
        }));
    return steps.length > 0 ? { steps, successCriteria: typeof plan.successCriteria === "string" ? plan.successCriteria : "" } : null;
}

// ── prompts ──────────────────────────────────────────────────────────────────

export const MISSION_RULES = `## Mission déléguée
Tu exécutes une mission confiée par le manager, étape par étape, dans un budget limité.
Tu établis des faits avec les outils, tu cites tes sources [E…], tu n'inventes rien.
Toute action vers l'extérieur ou irréversible est proposée au manager, jamais exécutée.`;

function scopeLine(ctx: AssistantContext): string {
    if (!ctx.project) return "Périmètre : vue agence (tous les clients).";
    return `Périmètre : client ${ctx.project.clientName}${ctx.project.missionName ? `, mission ${ctx.project.missionName}` : ""}.`;
}

export function planInstruction(params: { goal: string; ctx: AssistantContext; maxSteps: number; dryRun: boolean; toolNames: string[] }): string {
    return [
        `Mission confiée par ${params.ctx.userName} : « ${params.goal} »`,
        scopeLine(params.ctx),
        `Découpe-la en ${params.maxSteps} étape(s) au plus, chacune réalisable avec quelques lectures.`,
        params.dryRun ? "Mode simulation : aucune écriture ne sera exécutée, chaque action deviendra une proposition au manager." : "",
        `Outils disponibles : ${params.toolNames.join(", ")}.`,
        "",
        "Réponds UNIQUEMENT par un objet JSON, sans texte autour ni bloc de code :",
        `{"steps":[{"title":"…","intent":"ce que l'étape doit établir","tools":["nom_outil"]}],"successCriteria":"à quoi on reconnaît que la mission est réussie"}`,
    ]
        .filter(Boolean)
        .join("\n");
}

function planLines(plan: MissionPlan, current: number | null): string {
    const label: Record<MissionStepStatus, string> = { pending: "à faire", done: "fait", failed: "échec", skipped: "non traité" };
    return plan.steps.map((s, i) => `${i + 1}. ${s.title} — ${i === current ? "en cours" : label[s.status]}`).join("\n");
}

function digestsBlock(plan: MissionPlan): string {
    const done = plan.steps.map((s, i) => ({ s, i })).filter(({ s }) => s.digest);
    if (done.length === 0) return "";
    return ["Résultats des étapes précédentes :", ...done.map(({ s, i }) => `### Étape ${i + 1} — ${s.title}\n${s.digest}`)].join("\n");
}

function writeRule(dryRun: boolean, maxSafeWrites: number, proposeAvailable: boolean): string {
    const propose = proposeAvailable ? "utilise propose_action" : "appelle l'outil d'action : il sera proposé au manager";
    if (dryRun) return `Mode simulation : n'exécute aucune écriture. Pour toute action, ${propose} ; une écriture tentée devient elle aussi une proposition.`;
    return `Écritures internes (tâche, brouillon) autorisées dans la limite de ${maxSafeWrites} pour toute la mission ; au-delà, ou pour une action sensible, ${propose}.`;
}

export function executeInstruction(params: { goal: string; plan: MissionPlan; index: number; dryRun: boolean; maxSafeWrites: number; proposeAvailable: boolean }): string {
    const step = params.plan.steps[params.index];
    return [
        `Mission : « ${params.goal} »`,
        "Plan :",
        planLines(params.plan, params.index),
        digestsBlock(params.plan),
        "",
        `Étape en cours (${params.index + 1}/${params.plan.steps.length}) : ${step.title}`,
        step.intent ? `Objectif de l'étape : ${step.intent}` : "",
        step.tools.length > 0 ? `Outils suggérés : ${step.tools.join(", ")}.` : "",
        "",
        "Consignes : établis les faits de cette étape seulement ; les sources des étapes précédentes restent citables, ne relis pas ce qui est déjà lu.",
        writeRule(params.dryRun, params.maxSafeWrites, params.proposeAvailable),
        "Termine par un compte rendu factuel de 10 lignes au plus, chaque chiffre suivi de sa source [E…].",
    ]
        .filter((l) => l !== "")
        .join("\n");
}

export function synthesisInstruction(params: { goal: string; plan: MissionPlan; stopReason: string | null; findingAvailable: boolean; proposeAvailable: boolean; dryRun: boolean }): string {
    return [
        `Mission : « ${params.goal} »`,
        params.plan.successCriteria ? `Critère de réussite : ${params.plan.successCriteria}` : "",
        "Plan :",
        planLines(params.plan, null),
        digestsBlock(params.plan),
        params.stopReason ? `\nLa mission s'est arrêtée avant la fin : ${params.stopReason}` : "",
        "",
        "Rédige la synthèse finale pour le manager, en français :",
        "- une phrase d'ouverture qui dit si l'objectif est atteint ;",
        "- ce qui a été établi, chiffres cités avec leur source [E…] ;",
        "- ce qui reste incertain ou non traité ;",
        "- les actions recommandées.",
        params.findingAvailable ? "Si un point mérite un suivi dans la durée, enregistre-le avec record_finding (une fois par sujet)." : "",
        writeRule(params.dryRun, 0, params.proposeAvailable).replace(/^Écritures internes.*?; au-delà, ou pour une action sensible, /, "Pour toute action, "),
    ]
        .filter((l) => l !== "")
        .join("\n");
}

// ── refused writes → proposals ───────────────────────────────────────────────

/**
 * Wraps a ChatFn: before each provider call, tool results that refused a
 * `safe_write` for budget (`write_budget_exhausted`: dry run, or automatic
 * writes spent) are turned into proposals, and the model reads
 * "[Proposition #n enregistrée pour validation]" instead of the refusal.
 */
export function interceptRefusedWrites(chat: ChatFn, params: { ctx: AssistantContext; scope: RunToolScope; onProposal: () => void; rationale: string }): ChatFn {
    const handled = new Set<string>();
    return async (request) => {
        const calls = new Map<string, { call: ToolCall; lead: string }>();
        for (const m of request.messages) {
            if (m.role === "assistant" && m.toolCalls) for (const c of m.toolCalls) calls.set(c.id, { call: c, lead: (m.content ?? "").trim() });
        }
        for (const m of request.messages as ChatMessage[]) {
            if (m.role !== "tool" || handled.has(m.toolCallId)) continue;
            handled.add(m.toolCallId);
            if (!m.content.includes('"write_budget_exhausted"')) continue;
            const entry = calls.get(m.toolCallId);
            const tool = entry ? params.scope.resolveTool(entry.call.name) : undefined;
            if (!entry || !tool || tool.risk !== "safe_write") continue;
            let args: unknown = {};
            try {
                args = JSON.parse(entry.call.arguments || "{}");
            } catch {
                continue;
            }
            try {
                const proposal = await proposeFromCall(params.scope, params.ctx, { tool: tool.name, args, rationale: entry.lead || params.rationale });
                params.onProposal();
                (m as { content: string }).content = JSON.stringify({
                    tool: tool.name,
                    proposition: proposal.number,
                    statut: "enregistrée pour validation",
                    _note: `[Proposition #${proposal.number} enregistrée pour validation]. Continue sans l'exécuter.`,
                });
            } catch (error) {
                console.warn("[agent.mission] refused write not proposed", error instanceof Error ? error.message : error);
            }
        }
        return chat(request);
    };
}

// ── the loop ─────────────────────────────────────────────────────────────────

export interface MissionStore {
    loadPlan(runId: string): Promise<unknown>;
    nextStepIndex(runId: string): Promise<number>;
    saveProgress(runId: string, data: { plan: MissionPlan; checkpoint: MissionCheckpoint; usage: RunUsage; stepsCount: number; proposalsCount: number }): Promise<void>;
    ensureThread(pctx: PlaybookRunContext): Promise<string | null>;
    appendExchange(params: { conversationId: string; userText: string; assistantText: string; trace: unknown; now: Date }): Promise<string | null>;
}

export interface MissionDeps {
    runPhase: (input: PhaseInput) => Promise<PhaseResult>;
    chatForTier: (tier: ModelTier) => TierProvider;
    store: MissionStore;
    scope: (pctx: PlaybookRunContext) => RunToolScope;
    systemPrompt: (ctx: AssistantContext) => Promise<string>;
    cancelRequested: (runId: string) => Promise<boolean>;
    toolAvailable: (name: string) => boolean;
    cancelPollMs?: number;
}

const prismaMissionStore: MissionStore = {
    async loadPlan(runId) {
        const row = await prisma.agentRun.findUnique({ where: { id: runId }, select: { plan: true } });
        return row?.plan ?? null;
    },
    async nextStepIndex(runId) {
        const agg = await prisma.agentStep.aggregate({ where: { runId }, _max: { index: true } });
        return (agg._max.index ?? -1) + 1;
    },
    async saveProgress(runId, data) {
        await updateRun(runId, {
            plan: data.plan as unknown as Prisma.InputJsonValue,
            checkpoint: data.checkpoint as unknown as Prisma.InputJsonValue,
            usage: data.usage as unknown as Prisma.InputJsonValue,
            stepsCount: data.stepsCount,
            proposalsCount: data.proposalsCount,
        });
    },
    async ensureThread(pctx) {
        const { run } = pctx;
        if (run.conversationId) return run.conversationId;
        const id = await ensureAgentThread({ run, jobName: (pctx.config.jobName as string | undefined) ?? "Mission", clientId: pctx.ctx.project?.clientId ?? null, missionId: pctx.ctx.project?.missionId ?? null, now: pctx.now() });
        if (id) await updateRun(run.id, { conversationId: id });
        return id;
    },
    appendExchange: appendAgentExchange,
};

export function defaultMissionDeps(): MissionDeps {
    return {
        runPhase: realRunPhase,
        chatForTier: realChatForTier,
        store: prismaMissionStore,
        scope: (pctx) => prismaRunScope(pctx.run, { now: pctx.now }),
        systemPrompt: async (ctx) => [getAssistantSystemPrompt(ctx, await getBrand()), BACKGROUND_RULES, MISSION_RULES].join("\n\n"),
        cancelRequested: (runId) => realCancelRequested(runId),
        toolAvailable: isRegistered,
    };
}

function isDryRun(pctx: PlaybookRunContext): boolean {
    return pctx.config.dryRun === true || pctx.budget.maxSafeWrites === 0 || pctx.run.checkpoint?.dryRun === true;
}

function trimDigest(text: string): string {
    const t = text.trim();
    return t.length > DIGEST_CHARS ? `${t.slice(0, DIGEST_CHARS - 1)}…` : t;
}

export async function runMissionPlaybook(pctx: PlaybookRunContext, deps: MissionDeps = defaultMissionDeps()): Promise<PlaybookOutcome> {
    const { run, log } = pctx;
    const goal = (run.goal ?? "").trim();
    let usage = run.usage;
    const startedAt = run.startedAt ?? pctx.now();
    const dryRun = isDryRun(pctx);
    const priorCheckpoint = (run.checkpoint ?? {}) as Partial<MissionCheckpoint>;
    let proposals = typeof priorCheckpoint.proposals === "number" ? priorCheckpoint.proposals : 0;
    let findings = 0;

    if (!goal) return { summary: "Mission sans objectif : rien à faire.", findingsCount: 0, proposalsCount: 0, usage, error: "Objectif de mission vide." };

    // Context: the run's scope, the thread, the folder (memory tools).
    const scope = deps.scope(pctx);
    const countingScope: RunToolScope = {
        ...scope,
        createProposal: async (input) => {
            const r = await scope.createProposal(input);
            proposals += 1;
            return r;
        },
        recordFinding: async (input) => {
            const r = await scope.recordFinding(input);
            if (r.created) findings += 1;
            return r;
        },
    };
    const ctx = withRunTools(pctx.ctx, countingScope);
    const conversationId = await deps.store.ensureThread(pctx);
    if (conversationId) {
        run.conversationId = conversationId;
        ctx.conversationId = conversationId;
    }
    if (run.folderId && !ctx.folder) ctx.folder = await resolveFolderBinding(run.folderId).catch(() => null);

    // Cancellation: polled while phases run, and checked between them.
    const local = new AbortController();
    const onOuter = () => local.abort(pctx.signal.reason);
    if (pctx.signal.aborted) local.abort(pctx.signal.reason);
    else pctx.signal.addEventListener("abort", onOuter, { once: true });
    let cancelled = false;
    const checkCancel = async () => {
        if (cancelled) return true;
        if (await deps.cancelRequested(run.id).catch(() => false)) {
            cancelled = true;
            local.abort(new Error("cancel requested"));
        }
        return cancelled;
    };
    const poll = setInterval(() => void checkCancel(), deps.cancelPollMs ?? CANCEL_POLL_MS);

    let stepIndex = await deps.store.nextStepIndex(run.id);
    const proposeAvailable = deps.toolAvailable("propose_action");
    const findingAvailable = deps.toolAvailable("record_finding");
    const systemPrompt = await deps.systemPrompt(ctx);
    let plan = readStoredPlan(await deps.store.loadPlan(run.id));
    let stopReason: string | null = null;

    const save = async (phase: MissionCheckpoint["phase"]) => {
        if (!plan) return;
        await deps.store.saveProgress(run.id, {
            plan,
            checkpoint: { phase, proposals, ...(dryRun ? { dryRun: true } : {}), at: pctx.now().toISOString() },
            usage,
            stepsCount: stepIndex,
            proposalsCount: proposals,
        });
    };

    /** One phase, with the refused-writes interceptor on its chat function. */
    const phase = async (args: { phase: string; title: string; tier: ModelTier; history: ChatTurn[]; ctx: AssistantContext }): Promise<PhaseResult> => {
        const provider = deps.chatForTier(args.tier);
        const chat = interceptRefusedWrites(provider.chat, {
            ctx: args.ctx,
            scope: countingScope,
            onProposal: () => undefined,
            rationale: dryRun ? "Écriture proposée par la mission (mode simulation)." : "Écriture proposée par la mission : écritures automatiques épuisées.",
        });
        const result = await deps.runPhase({
            run,
            index: stepIndex++,
            phase: args.phase,
            title: args.title,
            tier: args.tier,
            systemPrompt,
            history: args.history,
            ctx: args.ctx,
            budget: pctx.budget,
            usage,
            startedAt,
            signal: local.signal,
            workerId: pctx.workerId,
            knownNames: [ctx.userName, ctx.project?.clientName, ctx.project?.missionName].filter((n): n is string => !!n),
            now: pctx.now,
            deps: { chat: { ...provider, chat } },
        });
        usage = addUsage(usage, result.usage);
        if (result.proposalId) proposals += 1;
        log("agent.phase", { runId: run.id, phase: args.phase, title: args.title, status: result.result.status, costEur: result.usage.costEur, toolCalls: result.usage.toolCalls });
        return result;
    };

    const budgetStop = (reserve: number): string | null => {
        const check = checkBudget(pctx.budget, usage, startedAt, pctx.now());
        if (!check.ok) return check.reason;
        if (usage.phases + reserve >= pctx.budget.maxPhases) return `Nombre maximal de phases atteint (${pctx.budget.maxPhases}).`;
        return null;
    };

    try {
        // ── plan ───────────────────────────────────────────────────────────
        if (!plan) {
            const stop = budgetStop(1);
            if (stop) return { summary: `Mission non démarrée : ${stop}`, findingsCount: findings, proposalsCount: proposals, usage, error: null };
            if (await checkCancel()) return { summary: "Mission annulée avant la planification.", findingsCount: findings, proposalsCount: proposals, usage, error: null };
            const maxSteps = Math.max(1, Math.min(MAX_STEPS, pctx.budget.maxPhases - 2));
            const toolNames = getToolsForContext(ctx).map((t) => t.name);
            const planned = await phase({
                phase: "plan",
                title: "Planification",
                tier: "deep",
                history: [{ role: "user", content: planInstruction({ goal, ctx, maxSteps, dryRun, toolNames }) }],
                // The planner reads nothing and writes nothing: no tools at all.
                ctx: deriveRunContext(ctx, { toolAllowlist: new Set<string>() }),
            });
            if (planned.result.status === "failed" || planned.result.status === "timeout") {
                return { summary: "Planification impossible.", findingsCount: findings, proposalsCount: proposals, usage, error: planned.result.error?.message ?? `Planification : ${planned.result.status}` };
            }
            const parsed = parseMissionPlan(planned.result.answer, goal, maxSteps);
            plan = parsed.plan;
            if (parsed.fallback) log("agent.mission.plan_fallback", { runId: run.id });
            await save("execute");
        }

        // ── execute ────────────────────────────────────────────────────────
        for (let i = 0; i < plan.steps.length; i++) {
            const step = plan.steps[i];
            if (step.status !== "pending") continue; // resumed: DONE steps are skipped
            if (await checkCancel()) {
                stopReason = "annulée à la demande du manager.";
                break;
            }
            if (local.signal.aborted) break;
            const stop = budgetStop(1); // keep one phase for the synthesis
            if (stop) {
                stopReason = stop;
                break;
            }
            let history: ChatTurn[] = [{ role: "user", content: executeInstruction({ goal, plan, index: i, dryRun, maxSafeWrites: pctx.budget.maxSafeWrites, proposeAvailable }) }];
            let answer = "";
            let status: string = "failed";
            // A confirm call ends the turn (the proposal is recorded): one continuation if the budget allows.
            for (let attempt = 0; attempt < 2; attempt++) {
                const r = await phase({ phase: "execute", title: `Étape ${i + 1} — ${step.title}`, tier: "gather", history, ctx });
                status = r.result.status;
                answer = [answer, r.result.answer.trim()].filter(Boolean).join("\n");
                if (r.result.status !== "action_proposed" || attempt === 1 || budgetStop(1) || local.signal.aborted) break;
                history = [...history, { role: "assistant", content: r.result.answer || "(action proposée)" }, { role: "user", content: `[Proposition #${proposals} enregistrée pour validation]. Continue l'étape sans l'exécuter.` }];
            }
            const ok = status === "complete" || status === "partial" || status === "action_proposed";
            step.status = ok ? "done" : status === "cancelled" ? "pending" : "failed";
            step.digest = trimDigest(ok ? answer : `Étape non aboutie (${status}).${answer ? ` ${answer}` : ""}`);
            if (status === "cancelled") {
                delete step.digest;
                stopReason = cancelled ? "annulée à la demande du manager." : "interrompue.";
                await save("execute");
                break;
            }
            await save("execute");
        }

        if (local.signal.aborted && !cancelled) {
            // Drain: run.ts requeues the run, the plan on the row carries the progress.
            return { summary: "Mission interrompue (arrêt du worker) : elle reprendra à l'étape suivante.", findingsCount: findings, proposalsCount: proposals, usage, error: null };
        }
        if (cancelled) {
            for (const s of plan.steps) if (s.status === "pending") s.status = "skipped";
            await save("done");
            return { summary: `Mission annulée à la demande du manager après ${plan.steps.filter((s) => s.status === "done").length} étape(s).`, findingsCount: findings, proposalsCount: proposals, usage, error: null };
        }
        if (stopReason) for (const s of plan.steps) if (s.status === "pending") s.status = "skipped";
        if (plan.steps.every((s) => s.status === "failed")) {
            await save("done");
            return { summary: "Aucune étape de la mission n'a abouti.", findingsCount: findings, proposalsCount: proposals, usage, error: plan.steps[0]?.digest ?? "Échec des étapes." };
        }

        // ── synthesise ─────────────────────────────────────────────────────
        const synthStop = budgetStop(0);
        if (synthStop) {
            await save("done");
            const done = plan.steps.filter((s) => s.status === "done").length;
            return { summary: `Mission arrêtée après ${done}/${plan.steps.length} étape(s) : ${stopReason ?? synthStop}`, findingsCount: findings, proposalsCount: proposals, usage, error: null };
        }
        const synth = await phase({
            phase: "synthesise",
            title: "Synthèse",
            tier: "deep",
            history: [{ role: "user", content: synthesisInstruction({ goal, plan, stopReason, findingAvailable, proposeAvailable, dryRun }) }],
            ctx,
        });
        const answer = synth.result.answer.trim();
        if (conversationId && answer) {
            await deps.store.appendExchange({
                conversationId,
                userText: `Mission : ${goal}`,
                assistantText: answer,
                trace: {
                    entries: synth.result.trace,
                    usage: synth.result.usage,
                    depth: "deep",
                    runId: synth.result.runId,
                    agentRunId: run.id,
                    status: synth.result.status,
                    citations: synth.result.citations,
                    unverifiedClaims: synth.result.unverifiedClaims,
                    verification: synth.result.verification,
                    visuals: synth.result.visuals,
                },
                now: pctx.now(),
            });
        }
        await save("done");
        const ok = synth.result.status === "complete" || synth.result.status === "partial" || synth.result.status === "action_proposed";
        const prefix = stopReason ? `Mission arrêtée avant la fin (${stopReason}). ` : "";
        return {
            summary: ok && answer ? `${prefix}${answer}`.slice(0, 600) : `${prefix}Synthèse non rédigée (${synth.result.error?.message ?? synth.result.status}).`,
            findingsCount: findings,
            proposalsCount: proposals,
            usage,
            error: ok || synth.result.status === "cancelled" ? null : (synth.result.error?.message ?? `Synthèse : ${synth.result.status}`),
        };
    } finally {
        clearInterval(poll);
        pctx.signal.removeEventListener("abort", onOuter);
    }
}
