/**
 * The REPORT playbook "report.weekly_bilan": the Friday client bilan, written
 * by the agent, published only by a manager.
 *
 *   1. collect   — collectWeeklyBilanData + a 6-week trend (SQL, no model).
 *                  The payload is seeded as evidence E1 on the AGENT thread
 *                  and served by the run-scoped `get_report_dataset`.
 *   2. write     — one deep-tier turn, tools: get_report_dataset, show_visual,
 *                  remember. Sections synthèse / chiffres (kpi_row) / tendance
 *                  (line) / rendez-vous (table) / vigilance / prochaines étapes,
 *                  visuals referenced by [[visuel N]] markers.
 *   3. report    — the body becomes an AssistantArtifact (REPORT); the turn is
 *                  appended to the AGENT thread with `trace.visuals` exactly as
 *                  the chat stores them; `publish_weekly_bilan` is proposed
 *                  (AgentProposal, risk confirm) with the artifact id.
 *
 * The publish proposal is created by code, not by the model: the artifact id
 * does not exist while the model writes, and a confirm call mid-turn would
 * end the turn before the report is written. Run status: WAITING_APPROVAL
 * while the proposal is pending (lib/agent/run.ts).
 */

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAssistantSystemPrompt } from "@/lib/assistant/projet/systemPrompt";
import { getBrand } from "@/lib/brand/server";
import { EvidenceStoreUnavailable, prismaEvidenceStore } from "@/lib/ai/agent/evidence/store";
import { extractFacts } from "@/lib/ai/agent/evidence/facts";
import { buildEvidenceSummary } from "@/lib/ai/agent/evidence/summary";
import { digest as digestOf, evidenceArgsHash } from "@/lib/ai/agent/evidence/policy";
import { resolveFolderBinding } from "@/lib/ai/tools/context";
import { optional } from "@/lib/assistant/store/missing";
import { parsePeriodRange } from "@/lib/manager-home/rules";
import { addDay } from "@/lib/manager-home/today-rules";
import { getStatsOverview } from "@/lib/stats/overview";
import { collectWeeklyBilanData } from "@/lib/reporting/weekly-bilan";
import { bilanWeek } from "@/lib/reporting/weekly-bilan-week";
import type { WeeklyBilanData } from "@/lib/reporting/weekly-bilan-render";
import { addUsage, checkBudget } from "../budget";
import { cancelRequested } from "../queue";
import { runPhase } from "../phase";
import { BACKGROUND_RULES } from "../prompt";
import { createStep, updateRun, updateRunUsage, updateStep } from "../store";
import { appendAgentExchange, ensureAgentThread } from "../thread";
import { proposeFromCall } from "../tools/propose_action";
import { isRegistered, prismaRunScope } from "../tools/resolve";
import { deriveRunContext, withRunTools } from "../tools/with-run-tools";
import type { PlaybookOutcome, PlaybookRunContext } from "../types";
import { buildReportDataset, type TrendPoint, type WeeklyReportDataset } from "./dataset-tool";
import { missingSections, weeklyBilanInstruction, weeklyBilanTitle } from "./templates";

export const REPORT_DATASET_TOOL = "get_report_dataset";
export const WEEKLY_BILAN_TOOL_ALLOWLIST: ReadonlySet<string> = new Set([REPORT_DATASET_TOOL, "show_visual", "remember", "publish_weekly_bilan"]);
/** What the writing turn may call: the publish is proposed by step 3, never by the model. */
const WRITE_ALLOWLIST: ReadonlySet<string> = new Set([REPORT_DATASET_TOOL, "show_visual", "remember"]);
const DATASET_TTL_MS = 6 * 60 * 60_000;
const TREND_WEEKS = 6;

type Week = { start: string; end: string; label: string };

/** The week a run covers: `config.weekStart` (any day of it) or the current bilan week. */
export function reportWeek(now: Date, weekStart?: unknown): Week {
    if (typeof weekStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
        return bilanWeek(new Date(`${addDay(weekStart, 2)}T12:00:00Z`));
    }
    return bilanWeek(now);
}

function shortLabel(day: string): string {
    const [, m, d] = day.split("-");
    return `${d}/${m}`;
}

/** Calls, conversations and RDVs of the 6 weeks ending with `week` (the last one reuses `data`). */
async function collectTrend(clientId: string, week: Week, data: WeeklyBilanData): Promise<TrendPoint[]> {
    const anchor = new Date(`${addDay(week.start, 2)}T12:00:00Z`);
    const points: TrendPoint[] = [];
    for (let offset = -(TREND_WEEKS - 1); offset < 0; offset++) {
        const w = bilanWeek(anchor, offset);
        const range = parsePeriodRange(w.start, w.end);
        if (!range) continue;
        const o = await getStatsOverview(range, { clientIds: [clientId], sdrIds: [], missionIds: [], listIds: [] });
        points.push({ weekStart: w.start, label: shortLabel(w.start), calls: o.current.calls, conversations: o.current.joined, meetings: o.rdv.confirmed + o.rdv.pending });
    }
    points.push({ weekStart: week.start, label: shortLabel(week.start), calls: data.stats.calls, conversations: data.stats.conversations, meetings: data.stats.meetings });
    return points;
}

/** Seeds the dataset as evidence on the thread (the label the model cites: E1). Best effort. */
async function seedDatasetEvidence(params: { conversationId: string; userId: string; clientId: string; missionId: string | null; payload: WeeklyReportDataset; now: Date }): Promise<boolean> {
    const runId = randomUUID();
    try {
        const started = await prismaEvidenceStore.startRun({
            id: runId,
            conversationId: params.conversationId,
            userId: params.userId,
            clientId: params.clientId,
            missionId: params.missionId,
            model: "collector",
            staleBefore: new Date(params.now.getTime() - 10 * 60_000),
        });
        if (started === "busy") return false;
        const facts = extractFacts(params.payload, params.now);
        const args = { semaine: params.payload.semaine.debut };
        await prismaEvidenceStore.insertEvidence({
            id: randomUUID(),
            runId,
            conversationId: params.conversationId,
            userId: params.userId,
            clientId: params.clientId,
            missionId: params.missionId,
            tool: REPORT_DATASET_TOOL,
            argsHash: evidenceArgsHash(REPORT_DATASET_TOOL, args, { clientId: params.clientId, missionId: params.missionId }),
            args,
            status: "OK",
            errorCode: null,
            summary: buildEvidenceSummary({ toolLabel: "Données du rapport", status: "OK", facts, period: null }),
            facts,
            period: null,
            resultDigest: digestOf(params.payload),
            payload: params.payload,
            retrievedAt: params.now,
            expiresAt: new Date(params.now.getTime() + DATASET_TTL_MS),
        });
        await prismaEvidenceStore.finishRun(runId, {
            status: "COMPLETED",
            model: "collector",
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
        if (!(error instanceof EvidenceStoreUnavailable)) console.warn("[agent.report] dataset evidence not seeded", error instanceof Error ? error.message : error);
        return false;
    }
}

function recipientsOf(config: Record<string, unknown>): string[] {
    const raw = config.recipients;
    return Array.isArray(raw) ? raw.filter((r): r is string => typeof r === "string" && r.includes("@")).slice(0, 10) : [];
}

export async function runWeeklyBilanPlaybook(pctx: PlaybookRunContext): Promise<PlaybookOutcome> {
    const { run, config, log } = pctx;
    const now = pctx.now();
    let usage = run.usage;
    const clientId = run.clientId ?? pctx.ctx.project?.clientId ?? null;
    if (!clientId || !pctx.ctx.project) {
        return { summary: "Bilan non rédigé : ce rapport demande un client.", findingsCount: 0, proposalsCount: 0, usage, error: "Le bilan hebdomadaire demande un client (job sans client)." };
    }
    const jobName = (config.jobName as string | undefined) ?? "Bilan hebdomadaire";
    const week = reportWeek(now, config.weekStart);
    const recipients = recipientsOf(config);
    const checkpoint = run.checkpoint ?? {};
    let stepIndex = await nextStepIndex(run.id);

    // ── 1. collect ──────────────────────────────────────────────────────────
    const collectStart = pctx.now();
    const collectStep = await createStep({ runId: run.id, index: stepIndex++, phase: "report", title: "Collecte des chiffres", tool: "collectWeeklyBilanData", args: { clientId, week: week.start }, now: collectStart });
    let data: WeeklyBilanData;
    let dataset: WeeklyReportDataset;
    try {
        data = await collectWeeklyBilanData(clientId, week);
        dataset = buildReportDataset(data, await collectTrend(clientId, week, data));
        await updateStep(collectStep, {
            status: "DONE",
            resultDigest: `${data.stats.calls} appel(s), ${data.stats.conversations} conversation(s), ${data.stats.meetings} RDV, ${data.meetings.length} RDV listé(s)`,
            finishedAt: pctx.now(),
            durationMs: pctx.now().getTime() - collectStart.getTime(),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await updateStep(collectStep, { status: "FAILED", error: message.slice(0, 1000), finishedAt: pctx.now() });
        return { summary: `Collecte impossible : ${message}`, findingsCount: 0, proposalsCount: 0, usage, error: message };
    }

    if (data.stats.calls === 0 && data.meetings.length === 0) {
        return { summary: `Aucune activité pour ${data.clientName} sur la ${week.label.toLowerCase()} : pas de bilan rédigé.`, findingsCount: 0, proposalsCount: 0, usage, error: null };
    }

    // Thread in the client's folder, run scope, folder binding for `remember`.
    const folderId = run.folderId ?? (await optional("agent.report.folder", async () => (await prisma.assistantFolder.findUnique({ where: { clientId }, select: { id: true } }))?.id ?? null, null));
    let conversationId = run.conversationId;
    if (!conversationId) {
        conversationId = await ensureAgentThread({ run: { ...run, folderId }, jobName, clientId, missionId: run.missionId, now });
        if (conversationId) {
            run.conversationId = conversationId;
            await updateRun(run.id, { conversationId, ...(folderId && !run.folderId ? { folderId } : {}) });
        }
    }
    const ctx = withRunTools(pctx.ctx, prismaRunScope(run, { dataset, now: pctx.now }));
    ctx.conversationId = conversationId;
    if (folderId && !ctx.folder) ctx.folder = await resolveFolderBinding(folderId);

    let artifactId = typeof checkpoint.artifactId === "string" ? checkpoint.artifactId : null;
    let body = "";

    if (!artifactId) {
        // ── 2. write ────────────────────────────────────────────────────────
        const check = checkBudget(pctx.budget, usage, run.startedAt ?? now, pctx.now());
        if (!check.ok) return { summary: `Bilan non rédigé : ${check.reason}`, findingsCount: 0, proposalsCount: 0, usage, error: null };
        if (pctx.signal.aborted || (await cancelRequested(run.id).catch(() => false))) {
            return { summary: "Bilan interrompu avant la rédaction.", findingsCount: 0, proposalsCount: 0, usage, error: null };
        }

        const seeded = conversationId ? await seedDatasetEvidence({ conversationId, userId: ctx.userId, clientId, missionId: run.missionId, payload: dataset, now }) : false;
        const toolAvailable = isRegistered(REPORT_DATASET_TOOL);
        const brand = await getBrand();
        const instruction = weeklyBilanInstruction({ clientName: data.clientName, weekLabel: week.label, seeded, toolAvailable, datasetInline: dataset });
        const writeCtx = deriveRunContext(ctx, { toolAllowlist: WRITE_ALLOWLIST });
        const phase = await runPhase({
            run,
            index: stepIndex++,
            phase: "synthesise",
            title: "Rédaction du bilan",
            tier: "deep",
            systemPrompt: [getAssistantSystemPrompt(writeCtx, brand), BACKGROUND_RULES].join("\n\n"),
            history: [{ role: "user", content: instruction }],
            ctx: writeCtx,
            budget: pctx.budget,
            usage,
            startedAt: run.startedAt ?? now,
            signal: pctx.signal,
            workerId: pctx.workerId,
            knownNames: [ctx.userName, data.clientName, brand.name, ...data.meetings.map((m) => m.company)].filter(Boolean),
            now: pctx.now,
        });
        usage = addUsage(usage, phase.usage);
        await updateRunUsage(run.id, usage, stepIndex);
        log("agent.phase", { phase: "report.write", status: phase.result.status, costEur: phase.usage.costEur });

        body = phase.result.answer.trim();
        const ok = (phase.result.status === "complete" || phase.result.status === "partial") && body.length > 80;
        if (!ok) {
            const reason = phase.result.error?.message ?? phase.result.status;
            return { summary: `Bilan non rédigé (${reason}).`, findingsCount: 0, proposalsCount: phase.proposalId ? 1 : 0, usage, error: phase.result.status === "cancelled" ? null : `Rédaction : ${reason}` };
        }

        // ── 3. report ───────────────────────────────────────────────────────
        const reportStart = pctx.now();
        const title = weeklyBilanTitle(data.clientName, week.label);
        const artifact = await prisma.assistantArtifact.create({
            data: { kind: "REPORT", title, body, clientId, missionId: run.missionId, conversationId, createdById: run.actorId },
            select: { id: true },
        });
        artifactId = artifact.id;
        const messageId = conversationId
            ? await appendAgentExchange({
                  conversationId,
                  userText: `Bilan hebdomadaire de ${data.clientName} — ${week.label}.`,
                  assistantText: body,
                  trace: {
                      entries: phase.result.trace,
                      usage: phase.result.usage,
                      depth: "deep",
                      runId: phase.result.runId,
                      agentRunId: run.id,
                      artifactId,
                      status: phase.result.status,
                      citations: phase.result.citations,
                      unverifiedClaims: phase.result.unverifiedClaims,
                      verification: phase.result.verification,
                      visuals: phase.result.visuals,
                  },
                  now: pctx.now(),
              })
            : null;
        await createStep({ runId: run.id, index: stepIndex++, phase: "report", title: "Rapport enregistré", tool: "store_report", args: { artifactId, messageId, week: week.start }, now: reportStart }).then((id) =>
            updateStep(id, { status: "DONE", resultDigest: title, finishedAt: pctx.now(), durationMs: pctx.now().getTime() - reportStart.getTime() }),
        );
        await updateRun(run.id, { checkpoint: { phase: "report", artifactId, messageId, week: week.start } as Prisma.InputJsonValue });
    }

    // Proposal: publish the stored report (validated and described like a real call).
    let proposalsCount = 0;
    let proposalNote = "";
    try {
        if (typeof checkpoint.proposalId === "string") {
            proposalsCount = 1; // resumed after the proposal was recorded
        } else {
            const proposal = await proposeFromCall(prismaRunScope(run, { now: pctx.now }), ctx, {
                tool: "publish_weekly_bilan",
                args: { week_start: week.start, artifact_id: artifactId, ...(recipients.length > 0 ? { recipients } : {}) },
                rationale: `Bilan de ${data.clientName} rédigé par l'agent pour la ${week.label.toLowerCase()} : à relire puis publier${recipients.length > 0 ? " et envoyer" : ""}.`,
            });
            proposalsCount = 1;
            await updateRun(run.id, { checkpoint: { phase: "proposed", artifactId, proposalId: proposal.id, week: week.start } as Prisma.InputJsonValue });
        }
    } catch (error) {
        proposalNote = ` Publication non proposée : ${error instanceof Error ? error.message : String(error)}`;
        log("agent.report.proposal_skipped", { runId: run.id, error: proposalNote });
    }

    const missing = body ? missingSections(body) : [];
    return {
        summary: `Bilan de ${data.clientName} (${week.label}) rédigé${proposalsCount ? ", en attente de validation pour publication" : ""}.${missing.length ? ` Section(s) manquante(s) : ${missing.join(", ")}.` : ""}${proposalNote}`.trim(),
        findingsCount: 0,
        proposalsCount,
        usage,
        error: null,
    };
}

/** Next free AgentStep index of a run (a resumed run never reuses an index). */
export async function nextStepIndex(runId: string): Promise<number> {
    try {
        const agg = await prisma.agentStep.aggregate({ where: { runId }, _max: { index: true } });
        return (agg._max.index ?? -1) + 1;
    } catch {
        return 0;
    }
}
