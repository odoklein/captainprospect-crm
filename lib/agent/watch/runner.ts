/**
 * The WATCH playbook: run every rule (SQL only), reconcile the findings,
 * notify, then — only if something is new, worse or back — ONE standard-tier
 * model phase that writes the French digest and appends it to the job's
 * AGENT thread. Nothing changed = no model call, no cost.
 *
 * The findings reach the model as an evidence row (E1) seeded on the thread
 * before the turn, so the digest's figures are verified against them like any
 * other source and can be cited.
 */

import { randomUUID } from "node:crypto";
import { getAssistantSystemPrompt } from "@/lib/assistant/projet/systemPrompt";
import { getBrand } from "@/lib/brand/server";
import { EvidenceStoreUnavailable, prismaEvidenceStore } from "@/lib/ai/agent/evidence/store";
import { extractFacts } from "@/lib/ai/agent/evidence/facts";
import { buildEvidenceSummary } from "@/lib/ai/agent/evidence/summary";
import { digest as digestOf, evidenceArgsHash } from "@/lib/ai/agent/evidence/policy";
import { addUsage, checkBudget } from "../budget";
import { upsertFindings } from "../findings";
import { notifyFindingEvents } from "../notify";
import { runPhase } from "../phase";
import { BACKGROUND_RULES, digestInstruction, findingsPayload } from "../prompt";
import { createStep, updateRun, updateRunUsage, updateStep } from "../store";
import { appendAgentExchange, ensureAgentThread } from "../thread";
import type { FindingEvents, FindingRow, PlaybookOutcome, PlaybookRunContext } from "../types";
import type { WatchRule } from "./rules/types";

export const WATCH_TOOL_ALLOWLIST: ReadonlySet<string> = new Set(["show_visual"]);
export const FINDINGS_EVIDENCE_TOOL = "agent_findings";
const FINDINGS_EVIDENCE_TTL_MS = 60 * 60_000;

function emptyEvents(): FindingEvents<FindingRow> {
    return { created: [], escalated: [], reopened: [], resolved: [] };
}

function mergeEvents(into: FindingEvents<FindingRow>, from: FindingEvents<FindingRow>): void {
    into.created.push(...from.created);
    into.escalated.push(...from.escalated);
    into.reopened.push(...from.reopened);
    into.resolved.push(...from.resolved);
}

/** Seeds the findings as evidence E1 on the thread, so the digest can cite them. Best effort. */
async function seedFindingsEvidence(params: {
    conversationId: string;
    userId: string;
    clientId: string | null;
    missionId: string | null;
    payload: unknown;
    now: Date;
}): Promise<boolean> {
    const runId = randomUUID();
    try {
        const started = await prismaEvidenceStore.startRun({
            id: runId,
            conversationId: params.conversationId,
            userId: params.userId,
            clientId: params.clientId,
            missionId: params.missionId,
            model: "detector",
            staleBefore: new Date(params.now.getTime() - 10 * 60_000),
        });
        if (started === "busy") return false;
        const facts = extractFacts(params.payload, params.now);
        await prismaEvidenceStore.insertEvidence({
            id: randomUUID(),
            runId,
            conversationId: params.conversationId,
            userId: params.userId,
            clientId: params.clientId,
            missionId: params.missionId,
            tool: FINDINGS_EVIDENCE_TOOL,
            argsHash: evidenceArgsHash(FINDINGS_EVIDENCE_TOOL, { at: params.now.toISOString() }, { clientId: params.clientId, missionId: params.missionId }),
            args: { at: params.now.toISOString() },
            status: "OK",
            errorCode: null,
            summary: buildEvidenceSummary({ toolLabel: "Signalements de la veille", status: "OK", facts, period: null }),
            facts,
            period: null,
            resultDigest: digestOf(params.payload),
            payload: params.payload,
            retrievedAt: params.now,
            expiresAt: new Date(params.now.getTime() + FINDINGS_EVIDENCE_TTL_MS),
        });
        await prismaEvidenceStore.finishRun(runId, {
            status: "COMPLETED",
            model: "detector",
            fallbackUsed: false,
            promptTokens: 0,
            completionTokens: 0,
            costEur: 0,
            latencyMs: 0,
            firstTokenMs: null,
            iterations: 0,
            toolCalls: 1,
            retries: 0,
            errorCode: null,
            verification: null,
            messageId: null,
        });
        return true;
    } catch (error) {
        if (!(error instanceof EvidenceStoreUnavailable)) console.warn("[agent.watch] findings evidence not seeded", error instanceof Error ? error.message : error);
        return false;
    }
}

export async function runWatchPlaybook(rules: WatchRule[], pctx: PlaybookRunContext, jobName: string): Promise<PlaybookOutcome> {
    const { run, config, ctx, signal, log } = pctx;
    const now = pctx.now();
    const dryRun = config.dryRun === true;
    const scope = { clientId: ctx.project?.clientId ?? run.clientId ?? null, missionId: ctx.project?.missionId ?? run.missionId ?? null };
    let usage = run.usage;
    let stepIndex = 0;
    const events = emptyEvents();
    const perRule: Array<{ rule: string; detected: number; created: number; escalated: number; reopened: number; resolved: number }> = [];

    // 1. Detect (SQL) and reconcile, one step per rule.
    for (const rule of rules) {
        if (signal.aborted) break;
        const stepStart = pctx.now();
        const stepId = await createStep({ runId: run.id, index: stepIndex++, phase: "detect", title: rule.label, tool: rule.id, args: { scope, config: { days: config.days } }, now: stepStart });
        try {
            const detected = await rule.detect({ now, scope, config, signal });
            const ruleEvents = await upsertFindings({ rule: rule.id, scopeKey: rule.scopeKey({ now, scope, config, signal }), detected, runId: run.id, now });
            mergeEvents(events, ruleEvents);
            const line = { rule: rule.id, detected: detected.length, created: ruleEvents.created.length, escalated: ruleEvents.escalated.length, reopened: ruleEvents.reopened.length, resolved: ruleEvents.resolved.length };
            perRule.push(line);
            log("agent.detect", line);
            await updateStep(stepId, {
                status: "DONE",
                resultDigest: `${detected.length} détecté(s) · ${line.created} nouveau(x) · ${line.escalated} aggravé(s) · ${line.reopened} réapparu(s) · ${line.resolved} résolu(s) · ${ruleEvents.unchanged} inchangé(s)`,
                finishedAt: pctx.now(),
                durationMs: pctx.now().getTime() - stepStart.getTime(),
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log("agent.detect.failed", { rule: rule.id, error: message });
            await updateStep(stepId, { status: "FAILED", error: message.slice(0, 1000), finishedAt: pctx.now(), durationMs: pctx.now().getTime() - stepStart.getTime() });
            perRule.push({ rule: rule.id, detected: -1, created: 0, escalated: 0, reopened: 0, resolved: 0 });
        }
    }

    const announced = [...events.created, ...events.escalated, ...events.reopened];
    const findingsCount = announced.length;
    await updateRun(run.id, { findingsCount });

    // 2. Notify (CRITICAL now, the rest when the job says so; never in a dry run).
    const notified = await notifyFindingEvents({ run, jobName, events, config, now });
    log("agent.notify", { notified: notified.notified, collapsed: notified.collapsed, dryRun });

    const failedRules = perRule.filter((r) => r.detected < 0).map((r) => r.rule);
    const counts = `${events.created.length} nouveau(x), ${events.escalated.length} aggravé(s), ${events.reopened.length} réapparu(s), ${events.resolved.length} résolu(s)`;

    // 3. Nothing to say, or a dry run: no model, no thread.
    if (announced.length === 0 || dryRun || signal.aborted) {
        const summary = dryRun
            ? `Simulation : ${counts}. Aucune notification envoyée, pas de point de veille rédigé.`
            : announced.length === 0
                ? `Rien de nouveau : ${counts}.`
                : `Interrompu avant la rédaction : ${counts}.`;
        return {
            summary: failedRules.length > 0 ? `${summary} Règle(s) en échec : ${failedRules.join(", ")}.` : summary,
            findingsCount,
            proposalsCount: 0,
            usage,
            error: null,
        };
    }

    // 4. Budget, thread and evidence for the digest phase.
    const startedAt = run.startedAt ?? now;
    const check = checkBudget(pctx.budget, usage, startedAt, pctx.now());
    if (!check.ok) {
        return { summary: `${counts}. Point de veille non rédigé : ${check.reason}`, findingsCount, proposalsCount: 0, usage, error: null };
    }

    let conversationId = run.conversationId;
    if (!conversationId) {
        conversationId = await ensureAgentThread({ run, jobName, clientId: scope.clientId, missionId: scope.missionId, now });
        if (conversationId) {
            run.conversationId = conversationId;
            ctx.conversationId = conversationId;
            await updateRun(run.id, { conversationId });
        }
    }

    const payload = findingsPayload({ jobName, created: events.created, escalated: events.escalated, reopened: events.reopened, resolved: events.resolved, now });
    const seeded = conversationId
        ? await seedFindingsEvidence({ conversationId, userId: ctx.userId, clientId: scope.clientId, missionId: scope.missionId, payload, now })
        : false;

    // 5. One standard phase, show_visual only, writes the digest.
    const brand = await getBrand();
    const systemPrompt = [getAssistantSystemPrompt(ctx, brand), BACKGROUND_RULES].join("\n\n");
    const instruction = digestInstruction({ jobName, announced: announced.length, resolved: events.resolved.length });
    const userText = seeded
        ? instruction
        : `${instruction}\n\nSource (JSON des signalements) :\n${JSON.stringify(payload, null, 1)}`;
    const knownNames = [ctx.userName, ctx.project?.clientName, ctx.project?.missionName, brand.name, ...announced.map((f) => f.title.split(" : ")[0])].filter((n): n is string => !!n);

    let summary: string;
    let error: string | null = null;
    try {
        const phase = await runPhase({
            run,
            index: stepIndex++,
            phase: "synthesise",
            title: "Point de veille",
            tier: "standard",
            systemPrompt,
            history: [{ role: "user", content: userText }],
            ctx,
            budget: pctx.budget,
            usage,
            startedAt,
            signal,
            workerId: pctx.workerId,
            knownNames,
            now: pctx.now,
        });
        usage = addUsage(usage, phase.usage);
        await updateRunUsage(run.id, usage, stepIndex);
        log("agent.phase", { phase: "synthesise", status: phase.result.status, costEur: phase.usage.costEur, toolCalls: phase.usage.toolCalls });

        const answer = phase.result.answer.trim();
        if (conversationId && answer) {
            await appendAgentExchange({
                conversationId,
                userText: `Veille « ${jobName} » : ${counts}.`,
                assistantText: answer,
                trace: {
                    entries: phase.result.trace,
                    usage: phase.result.usage,
                    depth: "standard",
                    runId: phase.result.runId,
                    agentRunId: run.id,
                    status: phase.result.status,
                    citations: phase.result.citations,
                    unverifiedClaims: phase.result.unverifiedClaims,
                    verification: phase.result.verification,
                    visuals: phase.result.visuals,
                },
                now: pctx.now(),
            });
        }
        const ok = phase.result.status === "complete" || phase.result.status === "partial";
        summary = ok && answer ? answer.slice(0, 600) : `${counts}. Point de veille non rédigé (${phase.result.error?.message ?? phase.result.status}).`;
        if (!ok && phase.result.status !== "cancelled") error = phase.result.error?.message ?? `Rédaction : ${phase.result.status}`;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        summary = `${counts}. Point de veille non rédigé : ${message}`;
        error = message;
    }

    return {
        summary: failedRules.length > 0 ? `${summary}\nRègle(s) en échec : ${failedRules.join(", ")}.` : summary,
        findingsCount,
        proposalsCount: 0,
        usage,
        error,
    };
}
