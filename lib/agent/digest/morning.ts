/**
 * The DIGEST playbook "digest.morning" (30 7 * * 1-5, Paris): what waits for
 * the managers this morning, in one AGENT message each.
 *
 *   OPEN findings (new since the last digest first, then by severity),
 *   pending proposals, runs finished overnight, reports awaiting approval.
 *
 * The body is compiled by code (`compileDigest`, pure): every figure in it
 * comes from the rows, the findings' own metrics included. The model writes
 * one opening line only (standard tier, no tools, no figures); a line with a
 * figure that is not in the digest is dropped for a deterministic one. When
 * there is nothing, there is no model call, no message and no notification.
 *
 * Recipients: every active MANAGER not muted in SystemConfig
 * `agent.prefs:<userId>` ({ "mute": true }). Each gets the message in their
 * agency AGENT thread and one in-app notification.
 */

import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { findUnverifiedNumbers } from "@/lib/reporting/weekly-bilan-render";
import { addUsage, checkBudget } from "../budget";
import { runPhase } from "../phase";
import { BACKGROUND_RULES } from "../prompt";
import { withStore } from "../store";
import { appendAgentExchange, ensureAgentThread } from "../thread";
import type { AgentSeverity, PlaybookOutcome, PlaybookRunContext } from "../types";

const ZONE = "Europe/Paris";
export const DIGEST_PLAYBOOK_ID = "digest.morning";
export const AGENT_HOME_PATH = "/manager/assistant/agent";
const MAX_FINDINGS = 12;
const MAX_LIST = 8;

export interface DigestFinding {
    id: string;
    severity: AgentSeverity;
    title: string;
    body: string;
    metrics: Record<string, unknown> | null;
    clientName: string | null;
    firstSeenAt: Date;
    lastSeenAt: Date;
}

export interface DigestProposal {
    id: string;
    title: string;
    expiresAt: Date;
}

export interface DigestRun {
    id: string;
    label: string;
    status: string;
    summary: string | null;
    finishedAt: Date;
}

export interface DigestReport {
    runId: string;
    title: string;
}

export interface DigestInput {
    now: Date;
    /** Findings first seen after this are "nouveaux". */
    since: Date;
    findings: DigestFinding[];
    proposals: DigestProposal[];
    runs: DigestRun[];
    reports: DigestReport[];
}

export interface CompiledDigest {
    empty: boolean;
    counts: { findings: number; newFindings: number; critical: number; proposals: number; runs: number; failedRuns: number; reports: number };
    /** Markdown body (French), every figure taken from the rows. */
    markdown: string;
    /** Deterministic opening line (fallback of the model's). */
    opening: string;
    /** Every figure the digest may state, for checking the model's line. */
    allowedNumbers: string[];
    dateLabel: string;
}

const SEVERITY_RANK: Record<AgentSeverity, number> = { CRITICAL: 2, WARN: 1, INFO: 0 };
const SEVERITY_FR: Record<AgentSeverity, string> = { CRITICAL: "critique", WARN: "à surveiller", INFO: "info" };
const STATUS_FR: Record<string, string> = { DONE: "terminé", FAILED: "en échec", WAITING_APPROVAL: "en attente de validation", CANCELLED: "annulé", DEFERRED: "reporté" };

function plural(n: number, one: string, many: string): string {
    return `${n} ${n > 1 ? many : one}`;
}

function frTime(d: Date): string {
    return DateTime.fromJSDate(d, { zone: ZONE }).setLocale("fr").toFormat("dd/LL 'à' HH:mm");
}

function metricsLine(metrics: Record<string, unknown> | null): string {
    if (!metrics) return "";
    const parts = Object.entries(metrics)
        .filter(([, v]) => typeof v === "number" || (typeof v === "string" && v.length <= 40))
        .slice(0, 4)
        .map(([k, v]) => `${k.replace(/_/g, " ")} : ${typeof v === "number" ? v.toLocaleString("fr-FR") : v}`);
    return parts.length ? ` (${parts.join(" · ")})` : "";
}

function clip(text: string, max: number): string {
    const t = text.replace(/\s+/g, " ").trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Pure: the rows → the digest. */
export function compileDigest(input: DigestInput): CompiledDigest {
    const isNew = (f: DigestFinding) => f.firstSeenAt.getTime() > input.since.getTime();
    const findings = [...input.findings].sort(
        (a, b) => Number(isNew(b)) - Number(isNew(a)) || SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.lastSeenAt.getTime() - a.lastSeenAt.getTime(),
    );
    const counts = {
        findings: findings.length,
        newFindings: findings.filter(isNew).length,
        critical: findings.filter((f) => f.severity === "CRITICAL").length,
        proposals: input.proposals.length,
        runs: input.runs.length,
        failedRuns: input.runs.filter((r) => r.status === "FAILED").length,
        reports: input.reports.length,
    };
    const dateLabel = DateTime.fromJSDate(input.now, { zone: ZONE }).setLocale("fr").toFormat("cccc d LLLL");
    const empty = counts.findings === 0 && counts.proposals === 0 && counts.reports === 0 && counts.failedRuns === 0;

    const sections: string[] = [];
    if (findings.length > 0) {
        const lines = findings.slice(0, MAX_FINDINGS).map((f) => {
            const tag = isNew(f) ? "nouveau, " : "";
            return `- **${f.title}** (${tag}${SEVERITY_FR[f.severity]})${f.clientName ? ` — ${f.clientName}` : ""} : ${clip(f.body, 220)}${metricsLine(f.metrics)}`;
        });
        if (findings.length > MAX_FINDINGS) lines.push(`- … et ${findings.length - MAX_FINDINGS} autre(s) dans « À traiter ».`);
        sections.push(`## Signalements ouverts (${counts.findings}, dont ${counts.newFindings} nouveau(x))`, ...lines);
    }
    if (input.reports.length > 0) {
        sections.push(`## Rapports à valider (${counts.reports})`, ...input.reports.slice(0, MAX_LIST).map((r) => `- ${r.title}`));
    }
    if (input.proposals.length > 0) {
        const lines = input.proposals.slice(0, MAX_LIST).map((p) => `- ${p.title} — expire le ${frTime(p.expiresAt)}`);
        if (input.proposals.length > MAX_LIST) lines.push(`- … et ${input.proposals.length - MAX_LIST} autre(s).`);
        sections.push(`## Propositions en attente (${counts.proposals})`, ...lines);
    }
    if (input.runs.length > 0) {
        sections.push(
            `## Cette nuit (${counts.runs} exécution(s))`,
            ...input.runs.slice(0, MAX_LIST).map((r) => `- ${r.label} : ${STATUS_FR[r.status] ?? r.status.toLowerCase()}${r.summary ? ` — ${clip(r.summary, 140)}` : ""}`),
        );
    }

    const bits: string[] = [];
    if (counts.critical > 0) bits.push(plural(counts.critical, "signalement critique", "signalements critiques"));
    if (counts.newFindings > 0) bits.push(plural(counts.newFindings, "nouveau signalement", "nouveaux signalements"));
    if (counts.reports > 0) bits.push(plural(counts.reports, "rapport à valider", "rapports à valider"));
    if (counts.proposals > 0) bits.push(plural(counts.proposals, "proposition en attente", "propositions en attente"));
    if (counts.failedRuns > 0) bits.push(plural(counts.failedRuns, "exécution en échec", "exécutions en échec"));
    const opening = bits.length > 0 ? `Ce matin : ${bits.join(", ")}.` : `Ce matin : ${plural(counts.findings, "signalement ouvert", "signalements ouverts")}, rien de nouveau.`;

    const allowed: Array<string | number> = Object.values(counts);
    for (const f of findings) for (const v of Object.values(f.metrics ?? {})) if (typeof v === "number") allowed.push(v);
    for (const w of dateLabel.match(/\d+/g) ?? []) allowed.push(w);

    return { empty, counts, markdown: sections.join("\n"), opening, allowedNumbers: allowed.map(String), dateLabel };
}

/** Keeps the model's line only when it is one short sentence with no figure outside the digest. */
export function acceptNarrative(line: string, digest: CompiledDigest): string | null {
    const text = line.replace(/\s+/g, " ").trim();
    if (!text || text.length > 320 || /non vérifi/i.test(text) || /\[E\d/.test(text)) return null;
    if (findUnverifiedNumbers(text, digest.allowedNumbers).length > 0) return null;
    return text;
}

// ── data ─────────────────────────────────────────────────────────────────────

export interface ManagerPrefs {
    mute?: boolean;
    digestEmail?: boolean;
}

export function parsePrefs(raw: string | null | undefined): ManagerPrefs {
    if (!raw) return {};
    try {
        const v = JSON.parse(raw) as unknown;
        return v && typeof v === "object" ? (v as ManagerPrefs) : {};
    } catch {
        return {};
    }
}

async function loadDigestInput(runId: string, now: Date): Promise<DigestInput> {
    const last = await withStore(() =>
        prisma.agentRun.findFirst({
            where: { playbook: DIGEST_PLAYBOOK_ID, status: "DONE", id: { not: runId }, finishedAt: { not: null } },
            orderBy: { finishedAt: "desc" },
            select: { finishedAt: true },
        }),
    );
    const since = last?.finishedAt ?? new Date(now.getTime() - 24 * 3_600_000);

    const [findings, proposals, runs, reports] = await Promise.all([
        withStore(() => prisma.agentFinding.findMany({ where: { state: "OPEN" }, orderBy: [{ lastSeenAt: "desc" }], take: 60 })),
        withStore(() =>
            prisma.agentProposal.findMany({ where: { state: "PENDING", expiresAt: { gt: now } }, orderBy: { proposedAt: "asc" }, take: 40, select: { id: true, tool: true, card: true, expiresAt: true } }),
        ),
        withStore(() =>
            prisma.agentRun.findMany({
                where: { finishedAt: { gte: since, lte: now }, kind: { not: "DIGEST" } },
                orderBy: { finishedAt: "desc" },
                take: 30,
                select: { id: true, playbook: true, status: true, summary: true, finishedAt: true, goal: true, job: { select: { name: true } } },
            }),
        ),
        withStore(() =>
            prisma.agentRun.findMany({ where: { kind: "REPORT", status: "WAITING_APPROVAL" }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, summary: true, job: { select: { name: true } } } }),
        ),
    ]);

    const clientIds = [...new Set(findings.map((f) => f.clientId).filter((id): id is string => !!id))];
    const clients = clientIds.length > 0 ? await prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } }) : [];
    const clientName = new Map(clients.map((c) => [c.id, c.name]));

    return {
        now,
        since,
        findings: findings.map((f) => ({
            id: f.id,
            severity: f.severity,
            title: f.title,
            body: f.body,
            metrics: f.metrics && typeof f.metrics === "object" && !Array.isArray(f.metrics) ? (f.metrics as Record<string, unknown>) : null,
            clientName: f.clientId ? (clientName.get(f.clientId) ?? null) : null,
            firstSeenAt: f.firstSeenAt,
            lastSeenAt: f.lastSeenAt,
        })),
        proposals: proposals.map((p) => {
            const title = p.card && typeof p.card === "object" ? (p.card as { title?: unknown }).title : null;
            return { id: p.id, title: typeof title === "string" ? title : p.tool, expiresAt: p.expiresAt };
        }),
        runs: runs.map((r) => ({ id: r.id, label: r.job?.name ?? (r.goal ? `Mission « ${clip(r.goal, 60)} »` : r.playbook), status: r.status, summary: r.summary, finishedAt: r.finishedAt! })),
        reports: reports.map((r) => ({ runId: r.id, title: r.job?.name ? `${r.job.name}${r.summary ? ` — ${clip(r.summary, 100)}` : ""}` : clip(r.summary ?? "Rapport", 120) })),
    };
}

export async function runMorningDigestPlaybook(pctx: PlaybookRunContext): Promise<PlaybookOutcome> {
    const { run, config, log } = pctx;
    const now = pctx.now();
    let usage = run.usage;
    const dryRun = config.dryRun === true;
    const jobName = (config.jobName as string | undefined) ?? "Point du matin";

    const digest = compileDigest(await loadDigestInput(run.id, now));
    if (digest.empty) {
        return { summary: `Rien à signaler ce matin (${plural(digest.counts.runs, "exécution", "exécutions")} cette nuit, aucune en échec).`, findingsCount: 0, proposalsCount: 0, usage, error: null };
    }

    // One standard-tier line, no tools, no figures; checked, else the deterministic opening.
    let opening = digest.opening;
    const check = checkBudget(pctx.budget, usage, run.startedAt ?? now, pctx.now());
    if (check.ok) {
        try {
            const phase = await runPhase({
                run: { ...run, conversationId: null },
                index: 0,
                phase: "synthesise",
                title: "Phrase d'ouverture",
                tier: "standard",
                systemPrompt: `Tu es l'assistant d'une agence de prospection B2B. ${BACKGROUND_RULES}`,
                history: [
                    {
                        role: "user",
                        content: `Voici le point du matin du ${digest.dateLabel} pour les managers :\n\n${digest.markdown}\n\nÉcris UNE seule phrase d'ouverture, en français, qui dit ce qui demande leur attention en priorité. Aucun chiffre, aucun nom de règle, pas de formule de politesse.`,
                    },
                ],
                ctx: pctx.ctx,
                budget: pctx.budget,
                usage,
                startedAt: run.startedAt ?? now,
                signal: pctx.signal,
                workerId: pctx.workerId,
                now: pctx.now,
            });
            usage = addUsage(usage, phase.usage);
            opening = acceptNarrative(phase.result.answer, digest) ?? digest.opening;
        } catch (error) {
            log("agent.digest.narrative_failed", { runId: run.id, error: error instanceof Error ? error.message : String(error) });
        }
    }

    const body = `${opening}\n\n${digest.markdown}`;
    if (dryRun) {
        return { summary: `Simulation : point du matin compilé (${digest.counts.findings} signalement(s), ${digest.counts.proposals} proposition(s)), rien d'envoyé.\n\n${body}`.slice(0, 1500), findingsCount: 0, proposalsCount: 0, usage, error: null };
    }

    const managers = await prisma.user.findMany({ where: { role: "MANAGER", isActive: true }, select: { id: true } });
    const prefs = await prisma.systemConfig.findMany({ where: { key: { in: managers.map((m) => `agent.prefs:${m.id}`) } }, select: { key: true, value: true } });
    const muted = new Set(prefs.filter((p) => parsePrefs(p.value).mute === true).map((p) => p.key.slice("agent.prefs:".length)));
    let delivered = 0;
    for (const m of managers) {
        if (muted.has(m.id)) continue;
        const conversationId = await ensureAgentThread({ run: { ...run, actorId: m.id, folderId: null }, jobName, clientId: null, missionId: null, now });
        if (conversationId) {
            await appendAgentExchange({ conversationId, userText: `Point du matin — ${digest.dateLabel}`, assistantText: body, trace: { agentRunId: run.id, depth: "standard", digest: digest.counts }, now: pctx.now() });
        }
        await createNotification({
            userId: m.id,
            title: `[Agent] Point du matin : ${digest.counts.findings + digest.counts.proposals + digest.counts.reports} élément(s) à traiter`.slice(0, 120),
            message: opening.slice(0, 300),
            type: digest.counts.critical > 0 ? "warning" : "info",
            link: AGENT_HOME_PATH,
        });
        delivered += 1;
    }
    log("agent.digest", { runId: run.id, delivered, muted: muted.size, ...digest.counts });
    return { summary: `${opening} (envoyé à ${plural(delivered, "manager", "managers")}).`, findingsCount: 0, proposalsCount: 0, usage, error: null };
}
