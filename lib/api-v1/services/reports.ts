import { z } from "zod";
import { Prisma } from "@prisma/client";
import { ApiError } from "../errors";
import { zBool, zDate } from "../pagination";
import { CATEGORY_LABELS, REACHED_CATEGORIES, resultCategory, resultLabel, type ResultCategory } from "../glossary";
import { TIMEZONE, periodRange, zPeriod, type Period } from "../dates";
import { ref, type Ctx } from "../serializers";
import { actionScope, clientFilterParam, clientSql, missionScope } from "../tenant";

export const salesReportParams = {
  period: zPeriod.optional(),
  date_from: zDate.optional().describe("Period start (ignored when `period` is set; default: 30 days ago)"),
  date_to: zDate.optional().describe("Period end, inclusive (ignored when `period` is set; default: now)"),
  mission_id: z.string().max(40).optional().describe("Restrict to one mission / team"),
  client_id: clientFilterParam,
  user_id: z.string().max(40).optional().describe("Restrict to one SDR"),
  compare_previous: zBool.describe("Also return the previous period of equal length and the change (%)"),
};
export type SalesReportInput = z.infer<z.ZodObject<typeof salesReportParams>>;

const DAY = 86_400_000;
const MAX_SPAN_DAYS = 366;

interface Filters { from: Date; to: Date; missionId?: string; userId?: string; clientId?: string }

function actionFilters(ctx: Ctx, f: Filters) {
  return {
    AND: [
      actionScope(ctx.p, f.clientId),
      { createdAt: { gte: f.from, lte: f.to } },
      f.missionId ? { campaign: { missionId: f.missionId } } : {},
      f.userId ? { sdrId: f.userId } : {},
    ],
  };
}

/** WHERE for raw SQL: the tenant (and optional mission) come from the principal, bound as parameters. */
function rawWhere(ctx: Ctx, f: Filters): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    clientSql(ctx.p, "m", f.clientId),
    Prisma.sql`a."createdAt" >= ${f.from}`,
    Prisma.sql`a."createdAt" <= ${f.to}`,
  ];
  if (ctx.p.missionId) parts.push(Prisma.sql`m.id = ${ctx.p.missionId}`);
  if (f.missionId) parts.push(Prisma.sql`cp."missionId" = ${f.missionId}`);
  if (f.userId) parts.push(Prisma.sql`a."sdrId" = ${f.userId}`);
  return Prisma.join(parts, " AND ");
}

const RAW_FROM = Prisma.sql`
  FROM "Action" a
  JOIN "Campaign" cp ON cp.id = a."campaignId"
  JOIN "Mission" m ON m.id = cp."missionId"
  LEFT JOIN "Contact" c ON c.id = a."contactId"`;

/** Distinct people / companies actually phoned — what "how many contacts did we call" really asks. */
async function uniqueCalled(ctx: Ctx, f: Filters) {
  const [row] = await ctx.db.$queryRaw<Array<{ contacts: number; companies: number }>>(Prisma.sql`
    SELECT
      COUNT(DISTINCT a."contactId")::int AS contacts,
      COUNT(DISTINCT COALESCE(a."companyId", c."companyId"))::int AS companies
    ${RAW_FROM}
    WHERE ${rawWhere(ctx, f)} AND a.channel = 'CALL'`);
  return { contacts: row?.contacts ?? 0, companies: row?.companies ?? 0 };
}

async function series(ctx: Ctx, f: Filters, unit: "day" | "month") {
  const rows = await ctx.db.$queryRaw<Array<{ bucket: string; calls: number; appointments: number; contacts: number }>>(Prisma.sql`
    SELECT
      to_char(date_trunc(${Prisma.raw(`'${unit}'`)}, (a."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris'), 'YYYY-MM-DD') AS bucket,
      (COUNT(*) FILTER (WHERE a.channel = 'CALL'))::int AS calls,
      (COUNT(*) FILTER (WHERE a.result = 'MEETING_BOOKED'))::int AS appointments,
      (COUNT(DISTINCT a."contactId") FILTER (WHERE a.channel = 'CALL'))::int AS contacts
    ${RAW_FROM}
    WHERE ${rawWhere(ctx, f)}
    GROUP BY 1 ORDER BY 1`);
  return rows;
}

type Grouped = Array<{ campaignId: string; sdrId: string; channel: string; result: string; _count: { _all: number } }>;

function fold(grouped: Grouped) {
  const totals = { actions: 0, calls: 0, emails: 0, linkedin_actions: 0, appointments_booked: 0, appointments_cancelled: 0 };
  for (const g of grouped) {
    const n = g._count._all;
    totals.actions += n;
    if (g.result === "MEETING_BOOKED") totals.appointments_booked += n;
    if (g.result === "MEETING_CANCELLED") totals.appointments_cancelled += n;
    if (g.channel === "CALL") totals.calls += n;
    else if (g.channel === "EMAIL") totals.emails += n;
    else totals.linkedin_actions += n;
  }
  return totals;
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
const change = (now: number, before: number) => ({ now, before, change_pct: before ? Math.round(((now - before) / before) * 1000) / 10 : null });

function resolveRange(i: SalesReportInput): { from: Date; to: Date; label: string | null } {
  if (i.period) return periodRange(i.period as Period);
  const to = i.date_to ? new Date(i.date_to) : new Date();
  if (i.date_to && /^\d{4}-\d{2}-\d{2}$/.test(i.date_to)) to.setUTCHours(23, 59, 59, 999);
  const from = i.date_from ? new Date(i.date_from) : new Date(to.getTime() - 30 * DAY);
  return { from, to, label: null };
}

export async function getSalesReport(ctx: Ctx, i: SalesReportInput) {
  const { from, to, label } = resolveRange(i);
  if (from > to) throw new ApiError(400, "invalid_params", "date_from must be before date_to");
  if (to.getTime() - from.getTime() > MAX_SPAN_DAYS * DAY) {
    throw new ApiError(400, "invalid_params", `Period too long (max ${MAX_SPAN_DAYS} days)`);
  }
  const f: Filters = { from, to, missionId: i.mission_id, userId: i.user_id, clientId: i.client_id };
  const spanDays = (to.getTime() - from.getTime()) / DAY;

  const prevFilters: Filters = { ...f, from: new Date(from.getTime() - (to.getTime() - from.getTime()) - 1), to: new Date(from.getTime() - 1) };

  const [grouped, confirmations, campaigns, unique, daily, prevGrouped, prevUnique] = await Promise.all([
    // One bounded groupBy feeds totals, by_result, by_category, by_user and by_mission.
    ctx.db.action.groupBy({ by: ["campaignId", "sdrId", "channel", "result"], where: actionFilters(ctx, f), _count: { _all: true } }) as unknown as Promise<Grouped>,
    ctx.db.action.groupBy({ by: ["confirmationStatus"], where: { AND: [actionFilters(ctx, f), { result: "MEETING_BOOKED" }] }, _count: { _all: true } }),
    ctx.db.campaign.findMany({
      where: { mission: missionScope(ctx.p, i.client_id) },
      select: { id: true, mission: { select: { id: true, name: true, client: { select: { id: true, name: true } } } } },
    }),
    uniqueCalled(ctx, f),
    series(ctx, f, spanDays > 62 ? "month" : "day"),
    i.compare_previous
      ? (ctx.db.action.groupBy({ by: ["campaignId", "sdrId", "channel", "result"], where: actionFilters(ctx, prevFilters), _count: { _all: true } }) as unknown as Promise<Grouped>)
      : Promise.resolve(null),
    i.compare_previous ? uniqueCalled(ctx, prevFilters) : Promise.resolve(null),
  ]);

  const missionByCampaign = new Map(campaigns.map((c) => [c.id, c.mission]));
  type Bucket = { actions: number; calls: number; appointments_booked: number };
  const blank = (): Bucket => ({ actions: 0, calls: 0, appointments_booked: 0 });
  const totals = fold(grouped);
  const byResult = new Map<string, number>();
  const byCategory = new Map<ResultCategory, number>();
  const byUser = new Map<string, Bucket>();
  const byMission = new Map<string, Bucket & { name: string; client: { id: string; name: string } }>();
  const byClient = new Map<string, Bucket & { name: string }>();

  for (const g of grouped) {
    const n = g._count._all;
    const booked = g.result === "MEETING_BOOKED" ? n : 0;
    byResult.set(g.result, (byResult.get(g.result) ?? 0) + n);
    if (g.channel === "CALL") byCategory.set(resultCategory(g.result), (byCategory.get(resultCategory(g.result)) ?? 0) + n);

    const u = byUser.get(g.sdrId) ?? blank();
    u.actions += n;
    u.appointments_booked += booked;
    if (g.channel === "CALL") u.calls += n;
    byUser.set(g.sdrId, u);

    const m = missionByCampaign.get(g.campaignId);
    if (m) {
      const b = byMission.get(m.id) ?? { ...blank(), name: m.name, client: m.client };
      b.actions += n;
      b.appointments_booked += booked;
      if (g.channel === "CALL") b.calls += n;
      byMission.set(m.id, b);
      const c = byClient.get(m.client.id) ?? { ...blank(), name: m.client.name };
      c.actions += n;
      c.appointments_booked += booked;
      if (g.channel === "CALL") c.calls += n;
      byClient.set(m.client.id, c);
    }
  }

  const topUsers = [...byUser.entries()].sort((a, b) => b[1].calls - a[1].calls).slice(0, 25);
  const users = topUsers.length
    ? await ctx.db.user.findMany({ where: { id: { in: topUsers.map(([id]) => id) } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  const confirmed = (s: string) => confirmations.find((c) => c.confirmationStatus === s)?._count._all ?? 0;

  const callsTotal = totals.calls;
  const reached = [...byCategory.entries()].filter(([c]) => REACHED_CATEGORIES.includes(c)).reduce((s, [, n]) => s + n, 0);

  const prev = prevGrouped ? fold(prevGrouped) : null;

  return {
    period: { label, from: from.toISOString(), to: to.toISOString(), timezone: TIMEZONE, days: Math.round(spanDays * 10) / 10 },
    totals: {
      ...totals,
      appointments_confirmed: confirmed("CONFIRMED"),
      appointments_pending_review: confirmed("PENDING"),
      appointments_rejected: confirmed("CANCELLED"),
      appointments_per_100_calls: totals.calls ? Math.round((totals.appointments_booked / totals.calls) * 1000) / 10 : null,
    },
    // Distinct people / companies phoned: "calls" counts attempts, this counts targets.
    unique_called: {
      contacts: unique.contacts,
      companies: unique.companies,
      calls_per_contact: unique.contacts ? Math.round((callsTotal / unique.contacts) * 10) / 10 : null,
    },
    reach: {
      reached_calls: reached,
      reach_rate_pct: pct(reached, callsTotal),
      definition: "Calls ending in a conversation: RDV pris, a suivre (rappel/relance/projet/mail) or refus. Excludes no answer, barrage and bad data.",
    },
    by_category: [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({ category, label: CATEGORY_LABELS[category], count, share_pct: pct(count, callsTotal) })),
    by_result: [...byResult.entries()].sort((a, b) => b[1] - a[1]).map(([result, count]) => ({ result, label: resultLabel(result), category: resultCategory(result), count })),
    series: { unit: spanDays > 62 ? "month" : "day", points: daily },
    by_user: topUsers.map(([id, b]) => ({ ...ref({ id, name: nameById.get(id) ?? "?" }), ...b })),
    // Only meaningful across several clients (all-clients key); one row for a client-bound key.
    by_client: [...byClient.entries()].sort((a, b) => b[1].calls - a[1].calls).map(([id, b]) => ({ id, ...b })),
    by_mission: [...byMission.entries()].sort((a, b) => b[1].calls - a[1].calls).map(([id, b]) => ({ id, ...b })),
    ...(prev && prevUnique
      ? {
          comparison: {
            previous_period: { from: prevFilters.from.toISOString(), to: prevFilters.to.toISOString() },
            calls: change(totals.calls, prev.calls),
            appointments_booked: change(totals.appointments_booked, prev.appointments_booked),
            unique_contacts_called: change(unique.contacts, prevUnique.contacts),
            unique_companies_called: change(unique.companies, prevUnique.companies),
          },
        }
      : {}),
  };
}
