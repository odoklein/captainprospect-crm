/**
 * Shared server helpers of the /api/manager/agent routes: name resolution in
 * batches, run cards and details, folder filters, cursor pages, and the
 * "agent tables missing" test that turns lists into degraded empty pages.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AgentRunCard, AgentRunDetail } from "@/lib/assistant/api-contract";
import { optional } from "@/lib/assistant/store/missing";
import { AgentStoreUnavailable, isMissingTable, withStore } from "./store";
import { toBudget, toFindingItem, toPlan, toProposalItem, toRunCard, toStepItem, type RunRow } from "./serialize";

export const RUN_SELECT = {
    id: true,
    jobId: true,
    kind: true,
    playbook: true,
    trigger: true,
    status: true,
    goal: true,
    summary: true,
    folderId: true,
    clientId: true,
    conversationId: true,
    findingsCount: true,
    proposalsCount: true,
    usage: true,
    mode: true,
    error: true,
    actorId: true,
    cancelRequestedAt: true,
    createdAt: true,
    startedAt: true,
    finishedAt: true,
} as const satisfies Prisma.AgentRunSelect;

export function isAgentUnavailable(error: unknown): boolean {
    return error instanceof AgentStoreUnavailable || isMissingTable(error);
}

export const PAGE_SIZE = 30;

export function pageLimit(searchParams: URLSearchParams, fallback = PAGE_SIZE): number {
    const n = Number(searchParams.get("limit"));
    return Number.isFinite(n) && n >= 1 ? Math.min(100, Math.floor(n)) : fallback;
}

/** Id → name maps, one query each, empty input = no query. */
export async function clientNames(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (unique.length === 0) return new Map();
    const rows = await prisma.client.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [r.id, r.name]));
}

export async function userNames(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (unique.length === 0) return new Map();
    const rows = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [r.id, r.name]));
}

/** clientId → its CLIENT folder id (Track B folders; empty when the table is missing). */
export async function folderIdsByClient(clientIds: Array<string | null | undefined>): Promise<Map<string, string>> {
    const unique = [...new Set(clientIds.filter((id): id is string => !!id))];
    if (unique.length === 0) return new Map();
    return optional(
        "agent.folders",
        async () => {
            const rows = await prisma.assistantFolder.findMany({ where: { clientId: { in: unique } }, select: { id: true, clientId: true } });
            return new Map(rows.filter((r) => r.clientId).map((r) => [r.clientId as string, r.id]));
        },
        new Map<string, string>(),
    );
}

/**
 * Rows of a folder: those filed in it, and — for a client folder — those
 * scoped to its client (watch findings and scheduled runs carry the client,
 * not the folder).
 */
export async function folderWhere(folderId: string): Promise<{ OR: Array<{ folderId: string } | { clientId: string }> }> {
    const clientId = await optional(
        "agent.folder",
        async () => (await prisma.assistantFolder.findUnique({ where: { id: folderId }, select: { clientId: true } }))?.clientId ?? null,
        null,
    );
    return { OR: [{ folderId }, ...(clientId ? [{ clientId }] : [])] };
}

export async function pendingCounts(runIds: string[]): Promise<Map<string, number>> {
    if (runIds.length === 0) return new Map();
    const rows = await withStore(() =>
        prisma.agentProposal.groupBy({ by: ["runId"], where: { runId: { in: runIds }, state: "PENDING", expiresAt: { gt: new Date() } }, _count: { _all: true } }),
    );
    return new Map(rows.map((r) => [r.runId, r._count._all]));
}

export async function toRunCards(rows: RunRow[]): Promise<AgentRunCard[]> {
    const jobIds = [...new Set(rows.map((r) => r.jobId).filter((id): id is string => !!id))];
    const [jobs, clients, actors, pending] = await Promise.all([
        jobIds.length > 0 ? withStore(() => prisma.agentJob.findMany({ where: { id: { in: jobIds } }, select: { id: true, name: true } })) : Promise.resolve([]),
        clientNames(rows.map((r) => r.clientId)),
        userNames(rows.map((r) => r.actorId)),
        pendingCounts(rows.map((r) => r.id)),
    ]);
    const jobName = new Map(jobs.map((j) => [j.id, j.name]));
    return rows.map((r) =>
        toRunCard(r, {
            jobName: r.jobId ? (jobName.get(r.jobId) ?? null) : null,
            clientName: r.clientId ? (clients.get(r.clientId) ?? null) : null,
            actorName: actors.get(r.actorId) ?? null,
            pendingProposals: pending.get(r.id) ?? 0,
        }),
    );
}

export async function getRunCard(runId: string): Promise<AgentRunCard | null> {
    const row = await withStore(() => prisma.agentRun.findUnique({ where: { id: runId }, select: RUN_SELECT }));
    if (!row) return null;
    return (await toRunCards([row as RunRow]))[0];
}

export async function getRunDetail(runId: string, now = new Date()): Promise<AgentRunDetail | null> {
    const row = await withStore(() =>
        prisma.agentRun.findUnique({
            where: { id: runId },
            select: {
                ...RUN_SELECT,
                plan: true,
                budget: true,
                heartbeatAt: true,
                steps: { orderBy: { index: "asc" } },
                proposals: { orderBy: { proposedAt: "asc" } },
                findings: { orderBy: [{ severity: "desc" }, { lastSeenAt: "desc" }], take: 50 },
            },
        }),
    );
    if (!row) return null;
    const [card] = await toRunCards([row as unknown as RunRow]);
    const [deciders, findingClients, subjects] = await Promise.all([
        userNames(row.proposals.map((p) => p.decidedById)),
        clientNames(row.findings.map((f) => f.clientId)),
        userNames(row.findings.map((f) => f.subjectUserId)),
    ]);

    // The REPORT artifact: the "store_report" step names it and the thread message holding its visuals.
    let report: AgentRunDetail["report"] = null;
    const reportStep = [...row.steps].reverse().find((s) => s.tool === "store_report" && s.args && typeof s.args === "object");
    const reportArgs = (reportStep?.args ?? {}) as { artifactId?: unknown; messageId?: unknown };
    if (typeof reportArgs.artifactId === "string") {
        const artifact = await prisma.assistantArtifact.findUnique({ where: { id: reportArgs.artifactId }, select: { id: true, title: true, body: true } });
        if (artifact) {
            let visuals: unknown[] = [];
            if (typeof reportArgs.messageId === "string") {
                const message = await prisma.assistantMessage.findUnique({ where: { id: reportArgs.messageId }, select: { trace: true } });
                const v = message?.trace && typeof message.trace === "object" ? (message.trace as { visuals?: unknown }).visuals : null;
                if (Array.isArray(v)) visuals = v;
            }
            report = { artifactId: artifact.id, title: artifact.title, body: artifact.body, visuals };
        }
    }

    return {
        ...card,
        plan: toPlan(row.plan),
        budget: toBudget(row.budget),
        steps: row.steps.map(toStepItem),
        proposals: row.proposals.map((p) => toProposalItem(p, p.decidedById ? (deciders.get(p.decidedById) ?? null) : null, now)),
        findings: row.findings.map((f) =>
            toFindingItem(f, { clientName: f.clientId ? (findingClients.get(f.clientId) ?? null) : null, subjectName: f.subjectUserId ? (subjects.get(f.subjectUserId) ?? null) : null }),
        ),
        report,
        heartbeatAt: row.heartbeatAt ? row.heartbeatAt.toISOString() : null,
    };
}

/** `{ items, nextCursor }` from rows fetched with `take: limit + 1`. */
export function toPage<T extends { id: string }, U>(rows: T[], limit: number, map: (rows: T[]) => U[] | Promise<U[]>): Promise<{ items: U[]; nextCursor: string | null }> {
    const more = rows.length > limit;
    const pageRows = more ? rows.slice(0, limit) : rows;
    return Promise.resolve(map(pageRows)).then((items) => ({ items, nextCursor: more ? pageRows[pageRows.length - 1].id : null }));
}
