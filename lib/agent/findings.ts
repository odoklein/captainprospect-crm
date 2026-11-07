/**
 * Finding lifecycle. A detector returns the FULL current set for its scope;
 * this reconciles it with what is stored, keyed by `<rule>:<scope>:<key>`:
 *
 *   absent            → created OPEN              (notify)
 *   OPEN / ACKED seen → bump lastSeenAt, seenCount; severity up → escalated (notify), ACKED back to OPEN
 *   SNOOZED seen      → silent until snoozedUntil, then OPEN again (reopened, notify)
 *   RESOLVED seen     → reopened OPEN             (notify)
 *   stored, not seen  → RESOLVED
 *
 * Day- or week-keyed keys are how a rule stops repeating itself: the same
 * condition the next day is a new key, the old one resolves.
 *
 * `reconcileFindings` is pure; `upsertFindings` applies it with Prisma.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withStore } from "./store";
import type { AgentSeverity, DetectedFinding, FindingEvents, FindingRow } from "./types";

export const SEVERITY_RANK: Record<AgentSeverity, number> = { INFO: 0, WARN: 1, CRITICAL: 2 };

export function dedupeKeyFor(rule: string, scopeKey: string, key: string): string {
    return `${rule}:${scopeKey}:${key}`;
}

export interface FindingCreate {
    rule: string;
    dedupeKey: string;
    severity: AgentSeverity;
    kind: string;
    title: string;
    body: string;
    metrics: Record<string, unknown> | null;
    clientId: string | null;
    missionId: string | null;
    subjectUserId: string | null;
    suggested: unknown | null;
}

export interface FindingUpdate {
    id: string;
    data: {
        state?: FindingRow["state"];
        severity?: AgentSeverity;
        title?: string;
        body?: string;
        metrics?: Record<string, unknown> | null;
        suggested?: unknown | null;
        lastSeenAt?: Date;
        seenCount?: number;
        resolvedAt?: Date | null;
        snoozedUntil?: Date | null;
    };
}

export interface ReconcilePlan {
    creates: FindingCreate[];
    updates: FindingUpdate[];
    /** The resulting rows (merged), grouped by what happened. Created rows have no id yet (empty string). */
    events: FindingEvents<FindingRow>;
    /** Rows seen again with nothing to announce. */
    unchanged: number;
}

function mergeRow(row: FindingRow, d: DetectedFinding, now: Date, patch: Partial<FindingRow>): FindingRow {
    return {
        ...row,
        severity: d.severity,
        title: d.title,
        body: d.body,
        metrics: d.metrics ?? null,
        lastSeenAt: now,
        seenCount: row.seenCount + 1,
        ...patch,
    };
}

export function reconcileFindings(
    existing: FindingRow[],
    detected: DetectedFinding[],
    options: { rule: string; scopeKey: string; now: Date },
): ReconcilePlan {
    const { rule, scopeKey, now } = options;
    const prefix = `${rule}:${scopeKey}:`;
    const byKey = new Map(existing.map((r) => [r.dedupeKey, r]));
    const plan: ReconcilePlan = { creates: [], updates: [], events: { created: [], escalated: [], reopened: [], resolved: [] }, unchanged: 0 };
    const seen = new Set<string>();

    for (const d of detected) {
        const key = dedupeKeyFor(rule, scopeKey, d.key);
        if (seen.has(key)) continue; // a detector listing the same subject twice is a bug, not two findings
        seen.add(key);
        const row = byKey.get(key);

        if (!row) {
            const create: FindingCreate = {
                rule,
                dedupeKey: key,
                severity: d.severity,
                kind: d.kind,
                title: d.title,
                body: d.body,
                metrics: d.metrics ?? null,
                clientId: d.clientId ?? null,
                missionId: d.missionId ?? null,
                subjectUserId: d.subjectUserId ?? null,
                suggested: d.suggested ?? null,
            };
            plan.creates.push(create);
            plan.events.created.push({
                id: "",
                ...create,
                state: "OPEN",
                firstSeenAt: now,
                lastSeenAt: now,
                seenCount: 1,
                snoozedUntil: null,
                notifiedAt: null,
            });
            continue;
        }

        const common = { severity: d.severity, title: d.title, body: d.body, metrics: d.metrics ?? null, suggested: d.suggested ?? null, lastSeenAt: now, seenCount: row.seenCount + 1 };
        const escalated = SEVERITY_RANK[d.severity] > SEVERITY_RANK[row.severity];

        if (row.state === "RESOLVED") {
            plan.updates.push({ id: row.id, data: { ...common, state: "OPEN", resolvedAt: null } });
            plan.events.reopened.push(mergeRow(row, d, now, { state: "OPEN" }));
        } else if (row.state === "SNOOZED") {
            if (row.snoozedUntil && row.snoozedUntil > now) {
                plan.updates.push({ id: row.id, data: common });
                plan.unchanged += 1;
            } else {
                plan.updates.push({ id: row.id, data: { ...common, state: "OPEN", snoozedUntil: null } });
                plan.events.reopened.push(mergeRow(row, d, now, { state: "OPEN", snoozedUntil: null }));
            }
        } else if (escalated) {
            plan.updates.push({ id: row.id, data: { ...common, state: "OPEN" } });
            plan.events.escalated.push(mergeRow(row, d, now, { state: "OPEN" }));
        } else {
            plan.updates.push({ id: row.id, data: common });
            plan.unchanged += 1;
        }
    }

    for (const row of existing) {
        if (!row.dedupeKey.startsWith(prefix) || seen.has(row.dedupeKey) || row.state === "RESOLVED") continue;
        plan.updates.push({ id: row.id, data: { state: "RESOLVED", resolvedAt: now, snoozedUntil: null } });
        plan.events.resolved.push({ ...row, state: "RESOLVED" });
    }

    return plan;
}

function toRow(r: {
    id: string;
    rule: string;
    dedupeKey: string;
    severity: AgentSeverity;
    kind: string;
    title: string;
    body: string;
    metrics: Prisma.JsonValue;
    clientId: string | null;
    missionId: string | null;
    subjectUserId: string | null;
    state: FindingRow["state"];
    firstSeenAt: Date;
    lastSeenAt: Date;
    seenCount: number;
    snoozedUntil: Date | null;
    notifiedAt: Date | null;
}): FindingRow {
    return {
        id: r.id,
        rule: r.rule,
        dedupeKey: r.dedupeKey,
        severity: r.severity,
        kind: r.kind,
        title: r.title,
        body: r.body,
        metrics: r.metrics && typeof r.metrics === "object" && !Array.isArray(r.metrics) ? (r.metrics as Record<string, unknown>) : null,
        clientId: r.clientId,
        missionId: r.missionId,
        subjectUserId: r.subjectUserId,
        state: r.state,
        firstSeenAt: r.firstSeenAt,
        lastSeenAt: r.lastSeenAt,
        seenCount: r.seenCount,
        snoozedUntil: r.snoozedUntil,
        notifiedAt: r.notifiedAt,
    };
}

const json = (v: unknown) => (v === null || v === undefined ? Prisma.DbNull : (v as Prisma.InputJsonValue));

/**
 * Applies a detector's output for one rule and scope. Returns the rows to
 * announce (created, escalated, reopened) and the ones that closed.
 */
export async function upsertFindings(input: {
    rule: string;
    scopeKey: string;
    detected: DetectedFinding[];
    runId: string | null;
    now?: Date;
}): Promise<FindingEvents<FindingRow> & { unchanged: number; openAfter: number }> {
    const now = input.now ?? new Date();
    const prefix = `${input.rule}:${input.scopeKey}:`;
    const keys = input.detected.map((d) => dedupeKeyFor(input.rule, input.scopeKey, d.key));

    const existing = await withStore(() =>
        prisma.agentFinding.findMany({
            where: {
                OR: [
                    { rule: input.rule, dedupeKey: { startsWith: prefix }, state: { not: "RESOLVED" } },
                    ...(keys.length > 0 ? [{ dedupeKey: { in: keys } }] : []),
                ],
            },
        }),
    );

    const plan = reconcileFindings(existing.map(toRow), input.detected, { rule: input.rule, scopeKey: input.scopeKey, now });

    const created = await withStore(() =>
        prisma.$transaction(async (tx) => {
            const rows: FindingRow[] = [];
            for (const c of plan.creates) {
                const row = await tx.agentFinding.create({
                    data: {
                        ...c,
                        metrics: json(c.metrics),
                        suggested: json(c.suggested),
                        runId: input.runId,
                        firstSeenAt: now,
                        lastSeenAt: now,
                        seenCount: 1,
                    },
                });
                rows.push(toRow(row));
            }
            for (const u of plan.updates) {
                const { metrics, suggested, ...rest } = u.data;
                await tx.agentFinding.update({
                    where: { id: u.id },
                    data: {
                        ...rest,
                        ...(metrics !== undefined ? { metrics: json(metrics) } : {}),
                        ...(suggested !== undefined ? { suggested: json(suggested) } : {}),
                        ...(rest.state && rest.state !== "RESOLVED" ? { runId: input.runId } : {}),
                    },
                    select: { id: true },
                });
            }
            return rows;
        }),
    );

    const openAfter = existing.filter((r) => r.state !== "RESOLVED").length - plan.events.resolved.length + plan.events.created.length + plan.events.reopened.length;
    return {
        created,
        escalated: plan.events.escalated,
        reopened: plan.events.reopened,
        resolved: plan.events.resolved,
        unchanged: plan.unchanged,
        openAfter,
    };
}

export async function markNotified(findingIds: string[], now = new Date()): Promise<void> {
    if (findingIds.length === 0) return;
    await withStore(() => prisma.agentFinding.updateMany({ where: { id: { in: findingIds } }, data: { notifiedAt: now } }));
}
