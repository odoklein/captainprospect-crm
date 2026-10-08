import { z } from "zod";
import { CompletenessStatus, type Prisma } from "@prisma/client";
import { dateRange, pageArgs, pageParams, toPage, zDate } from "../pagination";
import { notFound } from "../errors";
import { ACTION_SELECT, actionSummary, contactStats, fullName, ref, trunc, type Ctx } from "../serializers";
import { actionScope, clientFilterParam, companyScope, opportunityScope } from "../tenant";

export const searchCompaniesParams = {
  query: z.string().trim().min(1).max(100).optional().describe("Matches company name, industry or website"),
  status: z.nativeEnum(CompletenessStatus).optional().describe("Data completeness: INCOMPLETE | PARTIAL | ACTIONABLE"),
  mission_id: z.string().max(40).optional(),
  client_id: clientFilterParam,
  date_from: zDate.optional().describe("Company created on/after"),
  date_to: zDate.optional().describe("Company created on/before"),
  ...pageParams,
};
export type SearchCompaniesInput = z.infer<z.ZodObject<typeof searchCompaniesParams>>;

const COMPANY_SELECT = {
  id: true,
  name: true,
  industry: true,
  website: true,
  size: true,
  country: true,
  phone: true,
  status: true,
  excludedAt: true,
  createdAt: true,
  list: { select: { id: true, name: true, mission: { select: { id: true, name: true } } } },
  _count: { select: { contacts: true } },
} satisfies Prisma.CompanySelect;

type CompanyRow = Prisma.CompanyGetPayload<{ select: typeof COMPANY_SELECT }>;

const companySummary = (c: CompanyRow) => ({
  id: c.id,
  name: c.name,
  industry: c.industry,
  website: c.website,
  size: c.size,
  country: c.country,
  phone: c.phone,
  status: c.status,
  do_not_contact: c.excludedAt !== null,
  contact_count: c._count.contacts,
  list: ref(c.list),
  mission: ref(c.list.mission),
});

export async function searchCompanies(ctx: Ctx, input: SearchCompaniesInput) {
  const created = dateRange(input.date_from, input.date_to);
  const q = input.query;
  const rows = await ctx.db.company.findMany({
    where: {
      AND: [
        companyScope(ctx.p, input.client_id),
        input.status ? { status: input.status } : {},
        input.mission_id ? { list: { missionId: input.mission_id } } : {},
        created ? { createdAt: created } : {},
        q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { industry: { contains: q, mode: "insensitive" } },
                { website: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    },
    select: COMPANY_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...pageArgs(input.limit, input.cursor),
  });
  return toPage(rows, input.limit, companySummary);
}

export async function getCompany(ctx: Ctx, id: string) {
  const company = await ctx.db.company.findFirst({
    where: { AND: [{ id }, companyScope(ctx.p)] },
    select: COMPANY_SELECT,
  });
  if (!company) throw notFound("Company");

  // Actions are stamped with companyId only sometimes; contact actions reach the company through the contact.
  const mine = { AND: [actionScope(ctx.p), { OR: [{ companyId: id }, { contact: { companyId: id } }] }] } satisfies Prisma.ActionWhereInput;

  const [contacts, recent, opportunities, totals] = await Promise.all([
    ctx.db.contact.findMany({
      where: { companyId: id },
      select: { id: true, firstName: true, lastName: true, title: true, email: true, phone: true, excludedAt: true },
      orderBy: { createdAt: "asc" },
      take: 25,
    }),
    ctx.db.action.findMany({ where: mine, select: ACTION_SELECT, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 15 }),
    ctx.db.opportunity.findMany({
      where: { AND: [opportunityScope(ctx.p), { companyId: id }] },
      select: { id: true, needSummary: true, urgency: true, handedOff: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    ctx.db.action.groupBy({ by: ["channel", "result"], where: mine, _count: { _all: true }, _max: { createdAt: true } }),
  ]);
  const stats = await contactStats(ctx, contacts.map((c) => c.id));

  let actions = 0;
  let calls = 0;
  let meetings = 0;
  let last: Date | null = null;
  for (const g of totals) {
    actions += g._count._all;
    if (g.channel === "CALL") calls += g._count._all;
    if (g.result === "MEETING_BOOKED") meetings += g._count._all;
    if (g._max.createdAt && (!last || g._max.createdAt > last)) last = g._max.createdAt;
  }

  return {
    ...companySummary(company),
    contacts: contacts.map((c) => ({
      id: c.id,
      name: fullName(c),
      title: c.title,
      email: c.email,
      phone: c.phone,
      do_not_contact: c.excludedAt !== null,
      call_count: stats.get(c.id)?.call_count ?? 0,
      last_contact: stats.get(c.id)?.last_contact ?? null,
    })),
    contacts_truncated: company._count.contacts > contacts.length,
    recent_actions: recent.map((a) => actionSummary(a)),
    opportunities: opportunities.map((o) => ({
      id: o.id,
      need: trunc(o.needSummary, 600),
      urgency: o.urgency,
      handed_off: o.handedOff,
      created_at: o.createdAt.toISOString(),
    })),
    sales_summary: {
      total_actions: actions,
      call_count: calls,
      appointments_booked: meetings,
      last_contact: last ? last.toISOString() : null,
    },
  };
}
