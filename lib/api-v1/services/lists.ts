import { z } from "zod";
import { Prisma } from "@prisma/client";
import { pageArgs, pageParams, toPage, zBool } from "../pagination";
import { notFound } from "../errors";
import { iso, ref, type Ctx } from "../serializers";
import { clientFilterParam, clientSql, missionScope } from "../tenant";

// ============================================
// LISTS — the prospect databases, and how far each has been worked
// ============================================

export const searchListsParams = {
  query: z.string().trim().min(1).max(100).optional().describe("Matches list name"),
  mission_id: z.string().max(40).optional(),
  client_id: clientFilterParam,
  include_archived: zBool.describe("Include archived lists (default false)"),
  ...pageParams,
};
export type SearchListsInput = z.infer<z.ZodObject<typeof searchListsParams>>;

interface ListStatsRow {
  list_id: string;
  companies: number;
  contacts: number;
  contacts_worked: number;
  calls: number;
  meetings: number;
  last_action_at: Date | null;
}

/** One pass over a page of lists: size, how much was worked, results. The tenant is bound as a parameter. */
export async function listStats(ctx: Ctx, listIds: string[]): Promise<Map<string, ListStatsRow>> {
  const out = new Map<string, ListStatsRow>();
  if (listIds.length === 0) return out;
  const rows = await ctx.db.$queryRaw<ListStatsRow[]>(Prisma.sql`
    SELECT
      l.id AS list_id,
      COUNT(DISTINCT co.id)::int AS companies,
      COUNT(DISTINCT c.id)::int AS contacts,
      COUNT(DISTINCT a."contactId")::int AS contacts_worked,
      (COUNT(a.id) FILTER (WHERE a.channel = 'CALL'))::int AS calls,
      (COUNT(a.id) FILTER (WHERE a.result = 'MEETING_BOOKED'))::int AS meetings,
      MAX(a."createdAt") AS last_action_at
    FROM "List" l
    JOIN "Mission" m ON m.id = l."missionId"
    LEFT JOIN "Company" co ON co."listId" = l.id
    LEFT JOIN "Contact" c ON c."companyId" = co.id
    LEFT JOIN "Action" a ON a."contactId" = c.id
    WHERE ${clientSql(ctx.p, "m")}
      ${ctx.p.missionId ? Prisma.sql`AND m.id = ${ctx.p.missionId}` : Prisma.empty}
      AND l.id IN (${Prisma.join(listIds)})
    GROUP BY l.id`);
  for (const r of rows) out.set(r.list_id, r);
  return out;
}

const LIST_SELECT = {
  id: true,
  name: true,
  type: true,
  source: true,
  isActive: true,
  isArchived: true,
  createdAt: true,
  mission: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
  campaign: { select: { id: true, name: true } },
} satisfies Prisma.ListSelect;

type ListRow = Prisma.ListGetPayload<{ select: typeof LIST_SELECT }>;

const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

function summarize(l: ListRow, s?: ListStatsRow) {
  const contacts = s?.contacts ?? 0;
  const worked = s?.contacts_worked ?? 0;
  return {
    id: l.id,
    name: l.name,
    type: l.type,
    source: l.source,
    active: l.isActive,
    archived: l.isArchived,
    created_at: l.createdAt.toISOString(),
    mission: ref(l.mission),
    client: ref(l.mission.client),
    script_campaign: ref(l.campaign),
    companies: s?.companies ?? 0,
    contacts,
    contacts_worked: worked,
    coverage_pct: pctOf(worked, contacts),
    contacts_left_to_call: Math.max(0, contacts - worked),
    calls: s?.calls ?? 0,
    appointments_booked: s?.meetings ?? 0,
    last_action_at: iso(s?.last_action_at),
  };
}

export async function searchLists(ctx: Ctx, i: SearchListsInput) {
  const rows = await ctx.db.list.findMany({
    where: {
      AND: [
        { mission: missionScope(ctx.p, i.client_id) },
        i.include_archived ? {} : { isArchived: false },
        i.mission_id ? { missionId: i.mission_id } : {},
        i.query ? { name: { contains: i.query, mode: "insensitive" } } : {},
      ],
    },
    select: LIST_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...pageArgs(i.limit, i.cursor),
  });
  const page = rows.length > i.limit ? rows.slice(0, i.limit) : rows;
  const stats = await listStats(ctx, page.map((l) => l.id));
  return toPage(rows, i.limit, (l) => summarize(l, stats.get(l.id)));
}

export async function getList(ctx: Ctx, id: string) {
  const l = await ctx.db.list.findFirst({ where: { AND: [{ id }, { mission: missionScope(ctx.p) }] }, select: LIST_SELECT });
  if (!l) throw notFound("List");

  const [stats, completeness] = await Promise.all([
    listStats(ctx, [l.id]),
    ctx.db.company.groupBy({ by: ["status"], where: { listId: l.id }, _count: { _all: true } }),
  ]);
  return {
    ...summarize(l, stats.get(l.id)),
    data_completeness: Object.fromEntries(completeness.map((c) => [c.status, c._count._all])),
  };
}
