import { z } from "zod";
import { Prisma } from "@prisma/client";
import { decodeCursor, encodeCursor, pageParams, zBool, zDate, type Page } from "../pagination";
import { notFound } from "../errors";
import { escapeLike, fullName, iso, trunc, type Ctx } from "../serializers";
import { opportunityScope } from "../tenant";
import { withPeriod, zPeriod } from "../dates";

/**
 * A "lead" is a prospect that has actually been worked: a contact with at least
 * one action. It carries the pipeline stage the questions agents get asked are
 * built on ("called several times, no RDV", "to follow up today", "recent
 * activity but no meeting"). Never-contacted contacts live under /contacts.
 *
 * Stage (derived, not stored):
 *   meeting_booked  — at least one MEETING_BOOKED action
 *   to_follow_up    — no meeting, and the latest action is a follow-up result (RAPPEL, RELANCE, PROJET_A_SUIVRE…)
 *   contacted       — worked, no meeting, nothing pending
 */
export const searchLeadsParams = {
  query: z.string().trim().min(1).max(100).optional().describe("Matches contact or company name"),
  status: z.enum(["meeting_booked", "to_follow_up", "contacted"]).optional().describe("Pipeline stage"),
  assigned_to: z.string().max(40).optional().describe("User id of the last SDR who worked the lead"),
  company_id: z.string().max(40).optional(),
  mission_id: z.string().max(40).optional(),
  min_calls: z.coerce.number().int().min(1).max(500).optional().describe("At least N calls"),
  no_appointment: zBool.describe("Only leads that never got an appointment"),
  period: zPeriod.optional().describe("Preset for the last-action window"),
  date_from: zDate.optional().describe("Last action on/after (recent activity)"),
  date_to: zDate.optional().describe("Last action on/before (stale leads)"),
  callback_due_before: zDate.optional().describe("Follow-up callback scheduled on/before this date — use today's date for 'to follow up today'"),
  ...pageParams,
};
export type SearchLeadsInput = z.infer<z.ZodObject<typeof searchLeadsParams>>;

interface LeadRow {
  contact_id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  excluded_at: Date | null;
  company_id: string;
  company_name: string;
  mission_id: string;
  mission_name: string;
  action_count: number;
  call_count: number;
  meeting_count: number;
  last_action_at: Date;
  last_call_at: Date | null;
  last_result: string;
  next_callback_at: Date | null;
  last_sdr_id: string | null;
  last_sdr_name: string | null;
  stage: "meeting_booked" | "to_follow_up" | "contacted";
}

const FOLLOW_UP_SQL = Prisma.sql`('RAPPEL','RELANCE','PROJET_A_SUIVRE','CALLBACK_REQUESTED','INTERESTED')`;

/**
 * Raw SQL on purpose: "latest action per contact" + counts + keyset pagination
 * is one pass in SQL and N+1 or a full table pull in Prisma. The tenant filter
 * is applied twice — on the actions (Campaign→Mission) and on the contact's own
 * list (List→Mission) — and `clientId` is always the principal's, bound as a
 * parameter.
 */
async function queryLeads(ctx: Ctx, input: Partial<SearchLeadsInput> & { contactId?: string; limit: number }): Promise<LeadRow[]> {
  const { clientId, missionId } = ctx.p;
  const missionFilter = (alias: string) => (missionId ? Prisma.sql`AND ${Prisma.raw(alias)}.id = ${missionId}` : Prisma.empty);

  const conds: Prisma.Sql[] = [];
  if (input.contactId) conds.push(Prisma.sql`t.contact_id = ${input.contactId}`);
  if (input.status) conds.push(Prisma.sql`t.stage = ${input.status}`);
  if (input.assigned_to) conds.push(Prisma.sql`t.last_sdr_id = ${input.assigned_to}`);
  if (input.company_id) conds.push(Prisma.sql`t.company_id = ${input.company_id}`);
  if (input.mission_id) conds.push(Prisma.sql`t.mission_id = ${input.mission_id}`);
  if (input.min_calls) conds.push(Prisma.sql`t.call_count >= ${input.min_calls}`);
  if (input.no_appointment) conds.push(Prisma.sql`t.meeting_count = 0`);
  if (input.date_from) conds.push(Prisma.sql`t.last_action_at >= ${new Date(input.date_from)}`);
  if (input.date_to) {
    const d = new Date(input.date_to);
    if (/^\d{4}-\d{2}-\d{2}$/.test(input.date_to)) d.setUTCHours(23, 59, 59, 999);
    conds.push(Prisma.sql`t.last_action_at <= ${d}`);
  }
  if (input.callback_due_before) {
    const d = new Date(input.callback_due_before);
    if (/^\d{4}-\d{2}-\d{2}$/.test(input.callback_due_before)) d.setUTCHours(23, 59, 59, 999);
    conds.push(Prisma.sql`t.stage = 'to_follow_up' AND t.next_callback_at IS NOT NULL AND t.next_callback_at <= ${d}`);
  }
  if (input.query) {
    const like = `%${escapeLike(input.query)}%`;
    conds.push(
      Prisma.sql`(t.company_name ILIKE ${like} OR concat_ws(' ', t.first_name, t.last_name) ILIKE ${like})`,
    );
  }
  const cur = decodeCursor<{ at?: string; id?: string }>(input.cursor);
  if (cur?.at && cur.id && !Number.isNaN(Date.parse(cur.at))) {
    conds.push(Prisma.sql`(t.last_action_at, t.contact_id) < (${new Date(cur.at)}, ${cur.id})`);
  }
  const where = conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}` : Prisma.empty;

  return ctx.db.$queryRaw<LeadRow[]>(Prisma.sql`
    SELECT * FROM (
      SELECT
        c.id AS contact_id, c."firstName" AS first_name, c."lastName" AS last_name, c.title AS title,
        c."excludedAt" AS excluded_at,
        co.id AS company_id, co.name AS company_name,
        lm.id AS mission_id, lm.name AS mission_name,
        agg.action_count, agg.call_count, agg.meeting_count, agg.last_action_at, agg.last_call_at,
        lst.last_result, lst.last_callback AS next_callback_at,
        lst.last_sdr_id, u.name AS last_sdr_name,
        CASE
          WHEN agg.meeting_count > 0 THEN 'meeting_booked'
          WHEN lst.last_result::text IN ${FOLLOW_UP_SQL} THEN 'to_follow_up'
          ELSE 'contacted'
        END AS stage
      FROM (
        SELECT
          a."contactId" AS contact_id,
          COUNT(*)::int AS action_count,
          (COUNT(*) FILTER (WHERE a.channel = 'CALL'))::int AS call_count,
          (COUNT(*) FILTER (WHERE a.result = 'MEETING_BOOKED'))::int AS meeting_count,
          MAX(a."createdAt") AS last_action_at,
          MAX(a."createdAt") FILTER (WHERE a.channel = 'CALL') AS last_call_at
        FROM "Action" a
        JOIN "Campaign" cp ON cp.id = a."campaignId"
        JOIN "Mission" m ON m.id = cp."missionId"
        WHERE m."clientId" = ${clientId} ${missionFilter("m")}
          AND a."contactId" IS NOT NULL
          ${input.contactId ? Prisma.sql`AND a."contactId" = ${input.contactId}` : Prisma.empty}
        GROUP BY a."contactId"
      ) agg
      JOIN (
        SELECT DISTINCT ON (a."contactId")
          a."contactId" AS contact_id, a.result AS last_result, a."callbackDate" AS last_callback, a."sdrId" AS last_sdr_id
        FROM "Action" a
        JOIN "Campaign" cp ON cp.id = a."campaignId"
        JOIN "Mission" m ON m.id = cp."missionId"
        WHERE m."clientId" = ${clientId} ${missionFilter("m")}
          AND a."contactId" IS NOT NULL
          ${input.contactId ? Prisma.sql`AND a."contactId" = ${input.contactId}` : Prisma.empty}
        ORDER BY a."contactId", a."createdAt" DESC, a.id DESC
      ) lst ON lst.contact_id = agg.contact_id
      JOIN "Contact" c ON c.id = agg.contact_id
      JOIN "Company" co ON co.id = c."companyId"
      JOIN "List" l ON l.id = co."listId"
      JOIN "Mission" lm ON lm.id = l."missionId" AND lm."clientId" = ${clientId} ${missionFilter("lm")}
      LEFT JOIN "User" u ON u.id = lst.last_sdr_id
    ) t
    ${where}
    ORDER BY t.last_action_at DESC, t.contact_id DESC
    LIMIT ${input.limit + 1}
  `);
}

const leadSummary = (r: LeadRow) => ({
  id: r.contact_id,
  name: fullName({ firstName: r.first_name, lastName: r.last_name }),
  title: r.title,
  company: { id: r.company_id, name: r.company_name },
  mission: { id: r.mission_id, name: r.mission_name },
  stage: r.stage,
  call_count: r.call_count,
  action_count: r.action_count,
  appointment_count: r.meeting_count,
  last_contact: iso(r.last_action_at),
  last_call: iso(r.last_call_at),
  last_result: r.last_result,
  next_callback_at: r.stage === "to_follow_up" ? iso(r.next_callback_at) : null,
  last_worked_by: r.last_sdr_id ? { id: r.last_sdr_id, name: r.last_sdr_name } : null,
  do_not_contact: r.excluded_at !== null,
});

export async function searchLeads(ctx: Ctx, rawInput: SearchLeadsInput): Promise<Page<ReturnType<typeof leadSummary>>> {
  const input = withPeriod(rawInput);
  const rows = await queryLeads(ctx, input);
  const hasMore = rows.length > input.limit;
  const slice = hasMore ? rows.slice(0, input.limit) : rows;
  const last = slice[slice.length - 1];
  return {
    items: slice.map(leadSummary),
    next_cursor: hasMore && last ? encodeCursor({ at: last.last_action_at.toISOString(), id: last.contact_id }) : null,
  };
}

export async function getLead(ctx: Ctx, contactId: string) {
  const [row] = await queryLeads(ctx, { contactId, limit: 1 });
  if (!row) throw notFound("Lead");
  const opportunities = await ctx.db.opportunity.findMany({
    where: { AND: [opportunityScope(ctx.p), { contactId }] },
    select: { id: true, needSummary: true, urgency: true, estimatedMin: true, estimatedMax: true, handedOff: true, notes: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return {
    ...leadSummary(row),
    opportunities: opportunities.map((o) => ({
      id: o.id,
      need: trunc(o.needSummary, 800),
      urgency: o.urgency,
      estimated_min: o.estimatedMin,
      estimated_max: o.estimatedMax,
      handed_off: o.handedOff,
      notes: trunc(o.notes, 800),
      created_at: o.createdAt.toISOString(),
    })),
    full_context: `Use get_contact_context with id ${contactId} for calls, notes and appointments.`,
  };
}
