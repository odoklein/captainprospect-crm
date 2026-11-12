// ============================================
// QUALIFICATION — server glue for the SDR queue routes.
//
// Loads what the pure engine needs (attempt history, last analysed call,
// mission targeting, company size) in a handful of batched queries, then
// qualifies every row. It NEVER throws into a queue route: on any failure the
// queue answers exactly as it did before (no qualification, legacy order).
//
// Rollout switch, read per request:  SMART_QUEUE = off | shadow | on
//   off     nothing computed
//   shadow  (default) the explanation is attached to each row, order untouched
//   on      rows are ordered by the explained score (legacy order breaks ties)
// ============================================

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runtimeEnv } from "@/lib/runtime-config/env";
import { displayPhone } from "@/lib/sdr-queue/display";
import { COMPANY_SIZE_SQL } from "@/lib/sdr-queue/company-sql";
import { normalizeSummary } from "@/lib/telephony/summary";
import type { EffectiveStatusConfig } from "@/lib/services/StatusConfigService";
import { qualify } from "./engine";
import { signalsFromSummary } from "./signals";
import { parseTargeting, targetingKey } from "./targeting";
import type { AiSignals, ProspectInput, QualificationView, QueuePriority, Targeting } from "./types";

export type SmartQueueMode = "off" | "shadow" | "on";

export function smartQueueMode(): SmartQueueMode {
    const v = runtimeEnv("SMART_QUEUE")?.toLowerCase();
    return v === "off" || v === "on" ? v : "shadow";
}

/** The columns both queue routes already select, as far as qualification is concerned. */
export interface QueueRowLike {
    contact_id: string | null;
    company_id: string;
    campaign_id: string;
    company_industry: string | null;
    company_country: string | null;
    /** The card route does not select it: it is then looked up with the table's own SQL. */
    company_size?: string | null;
    company_phone: string | null;
    contact_title: string | null;
    contact_phone: string | null;
    contact_status: string;
    last_action_result: string | null;
    last_action_created: Date | null;
    last_action_callback_date: Date | null;
    _priorityLabel: string;
}

/** Results that mean « nobody picked up / a gatekeeper stopped us »: they build the no-answer streak. */
const NO_ANSWER_RESULTS = new Set(["NO_RESPONSE", "BARRAGE_STANDARD", "BARRAGE_SECRETAIRE"]);

export function attemptStats(resultsNewestFirst: string[]): { total: number; consecutiveNoAnswer: number } {
    let streak = 0;
    for (const r of resultsNewestFirst) {
        if (!NO_ANSWER_RESULTS.has(r)) break;
        streak++;
    }
    return { total: resultsNewestFirst.length, consecutiveNoAnswer: streak };
}

/** What the loaders need from Prisma, so the SQL can be run on any Postgres (tests use PGlite). */
export interface SqlDb {
    $queryRaw<T>(sql: Prisma.Sql): Promise<T>;
}

const rowKey = (r: { contact_id: string | null; company_id: string }) => r.contact_id ?? r.company_id;

export async function loadAttempts(contactIds: string[], companyIds: string[], db: SqlDb = prisma): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (!contactIds.length && !companyIds.length) return out;
    const rows = await db.$queryRaw<Array<{ key: string; results: string[] }>>(Prisma.sql`
        SELECT COALESCE(a."contactId", a."companyId") AS key,
               array_agg(a.result::text ORDER BY a."createdAt" DESC) AS results
        FROM "Action" a
        WHERE a.channel = 'CALL'
          AND (a."contactId" = ANY(${contactIds}::text[])
               OR (a."contactId" IS NULL AND a."companyId" = ANY(${companyIds}::text[])))
        GROUP BY 1`);
    for (const r of rows) out.set(r.key, r.results);
    return out;
}

export async function loadSignals(contactIds: string[], companyIds: string[], db: SqlDb = prisma): Promise<Map<string, AiSignals>> {
    const out = new Map<string, AiSignals>();
    if (!contactIds.length && !companyIds.length) return out;
    const rows = await db.$queryRaw<Array<{ key: string; id: string; startedAt: Date; aiSummary: unknown }>>(Prisma.sql`
        SELECT DISTINCT ON (COALESCE(t."contactId", t."companyId"))
               COALESCE(t."contactId", t."companyId") AS key, t.id, t."startedAt", t."aiSummary"
        FROM "TelephonyCall" t
        WHERE t."aiSummaryStatus" = 'done'
          AND (t."contactId" = ANY(${contactIds}::text[])
               OR (t."contactId" IS NULL AND t."companyId" = ANY(${companyIds}::text[])))
        ORDER BY COALESCE(t."contactId", t."companyId"), t."startedAt" DESC`);
    for (const r of rows) {
        const summary = normalizeSummary(r.aiSummary);
        if (summary) out.set(r.key, signalsFromSummary(r.id, r.startedAt, summary));
    }
    return out;
}

async function loadTargeting(campaignIds: string[]): Promise<Map<string, Targeting | null>> {
    const byCampaign = new Map<string, Targeting | null>();
    if (!campaignIds.length) return byCampaign;
    const campaigns = await prisma.campaign.findMany({ where: { id: { in: campaignIds } }, select: { id: true, missionId: true } });
    const missionIds = [...new Set(campaigns.map((c) => c.missionId))];
    const configs = await prisma.systemConfig.findMany({ where: { key: { in: missionIds.map(targetingKey) } }, select: { key: true, value: true } });
    const byKey = new Map(configs.map((c) => [c.key, parseTargeting(c.value)]));
    for (const c of campaigns) byCampaign.set(c.id, byKey.get(targetingKey(c.missionId)) ?? null);
    return byCampaign;
}

async function loadSizes(companyIds: string[]): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    if (!companyIds.length) return out;
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; size: string | null }>>(
        `SELECT co.id, ${COMPANY_SIZE_SQL} AS size FROM "Company" co WHERE co.id = ANY($1::text[])`,
        companyIds,
    );
    for (const r of rows) out.set(r.id, r.size);
    return out;
}

/**
 * Qualifies every row. The map is keyed by the row object itself. Empty on failure
 * (and in `off` mode): callers must treat a missing entry as « no qualification ».
 */
export async function qualifyQueueRows<R extends QueueRowLike>(
    rows: R[],
    opts: { config: EffectiveStatusConfig; now?: Date; maxAttempts?: number | null },
): Promise<Map<R, QualificationView>> {
    const out = new Map<R, QualificationView>();
    if (smartQueueMode() === "off" || rows.length === 0) return out;
    try {
        const now = opts.now ?? new Date();
        const contactIds = [...new Set(rows.map((r) => r.contact_id).filter((x): x is string => !!x))];
        const companyOnlyIds = [...new Set(rows.filter((r) => !r.contact_id).map((r) => r.company_id))];
        const sizeIds = [...new Set(rows.filter((r) => r.company_size === undefined).map((r) => r.company_id))];

        const [attempts, signals, targeting, sizes] = await Promise.all([
            loadAttempts(contactIds, companyOnlyIds),
            loadSignals(contactIds, companyOnlyIds),
            loadTargeting([...new Set(rows.map((r) => r.campaign_id))]),
            loadSizes(sizeIds),
        ]);
        const statusByCode = new Map(opts.config.statuses.map((s) => [s.code, s]));

        for (const row of rows) {
            const key = rowKey(row);
            const status = row.last_action_result ? statusByCode.get(row.last_action_result) : undefined;
            const phone = (row.contact_phone ?? "").trim() || (row.company_phone ?? "").trim();
            const input: ProspectInput = {
                contact: row.contact_id ? { title: row.contact_title, completeness: row.contact_status } : null,
                company: {
                    industry: row.company_industry,
                    country: row.company_country,
                    size: row.company_size !== undefined ? row.company_size : sizes.get(row.company_id) ?? null,
                },
                hasPhone: phone.length > 0,
                mobile: displayPhone(phone)?.mobile ?? false,
                priority: row._priorityLabel as QueuePriority,
                lastAction: row.last_action_result && row.last_action_created
                    ? {
                          result: row.last_action_result,
                          createdAt: new Date(row.last_action_created).toISOString(),
                          callbackDate: row.last_action_callback_date ? new Date(row.last_action_callback_date).toISOString() : null,
                          label: status?.label ?? null,
                          triggersExclusion: status?.triggersExclusion ?? false,
                      }
                    : null,
                attempts: attemptStats(attempts.get(key) ?? []),
                ai: signals.get(key) ?? null,
            };
            out.set(row, qualify(input, { now, targeting: targeting.get(row.campaign_id) ?? null, maxAttempts: opts.maxAttempts ?? null }));
        }
    } catch (err) {
        console.error("[qualification] queue scoring failed, serving the legacy queue", err);
        out.clear();
    }
    return out;
}

/**
 * Orders rows by explained score, highest first. Stable: rows with the same score
 * keep the legacy order. Rows without a qualification keep their place after the scored ones.
 */
export function applySmartOrder<R>(rows: R[], views: Map<R, QualificationView>): R[] {
    if (views.size === 0) return rows;
    return rows
        .map((row, index) => ({ row, index, score: views.get(row)?.score ?? -1 }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((x) => x.row);
}
