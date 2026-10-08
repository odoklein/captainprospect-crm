import { z } from "zod";
import { CompletenessStatus, type Prisma } from "@prisma/client";
import { dateRange, pageArgs, pageParams, toPage, zDate, zBool } from "../pagination";
import { notFound } from "../errors";
import {
  ACTION_SELECT,
  EMPTY_STATS,
  FOLLOW_UP_RESULTS,
  actionSummary,
  contactStats,
  fullName,
  iso,
  ref,
  trunc,
  type ActionRow,
  type Ctx,
} from "../serializers";
import { actionScope, clientFilterParam, contactScope, opportunityScope } from "../tenant";
import type { Scope } from "../scopes";

// ============================================
// SEARCH / GET
// ============================================

export const searchContactsParams = {
  query: z.string().trim().min(1).max(100).optional().describe("Matches name, email, phone, title or company name"),
  status: z.nativeEnum(CompletenessStatus).optional().describe("Data completeness: INCOMPLETE | PARTIAL | ACTIONABLE"),
  assigned_to: z.string().max(40).optional().describe("User id — contacts this user has worked"),
  company_id: z.string().max(40).optional(),
  mission_id: z.string().max(40).optional(),
  client_id: clientFilterParam,
  date_from: zDate.optional().describe("Contact created on/after"),
  date_to: zDate.optional().describe("Contact created on/before"),
  ...pageParams,
};
export type SearchContactsInput = z.infer<z.ZodObject<typeof searchContactsParams>>;

const CONTACT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  title: true,
  email: true,
  phone: true,
  status: true,
  excludedAt: true,
  createdAt: true,
  company: { select: { id: true, name: true } },
} satisfies Prisma.ContactSelect;

type ContactRow = Prisma.ContactGetPayload<{ select: typeof CONTACT_SELECT }>;

const contactSummary = (c: ContactRow, s = EMPTY_STATS) => ({
  id: c.id,
  name: fullName(c),
  title: c.title,
  email: c.email,
  phone: c.phone,
  company: ref(c.company),
  status: c.status,
  do_not_contact: c.excludedAt !== null,
  last_contact: s.last_contact,
  last_call: s.last_call,
  call_count: s.call_count,
  action_count: s.action_count,
  appointment_count: s.appointment_count,
});

export async function searchContacts(ctx: Ctx, input: SearchContactsInput) {
  const created = dateRange(input.date_from, input.date_to);
  const q = input.query;
  const where: Prisma.ContactWhereInput = {
    AND: [
      contactScope(ctx.p, input.client_id),
      input.status ? { status: input.status } : {},
      input.company_id ? { companyId: input.company_id } : {},
      input.mission_id ? { company: { list: { missionId: input.mission_id } } } : {},
      input.assigned_to ? { actions: { some: { sdrId: input.assigned_to } } } : {},
      created ? { createdAt: created } : {},
      q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
              { title: { contains: q, mode: "insensitive" } },
              { company: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };

  const rows = await ctx.db.contact.findMany({
    where,
    select: CONTACT_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...pageArgs(input.limit, input.cursor),
  });
  const page = rows.length > input.limit ? rows.slice(0, input.limit) : rows;
  const stats = await contactStats(ctx, page.map((c) => c.id));
  return toPage(rows, input.limit, (c) => contactSummary(c, stats.get(c.id)));
}

export async function getContact(ctx: Ctx, id: string) {
  const c = await ctx.db.contact.findFirst({
    where: { AND: [{ id }, contactScope(ctx.p)] },
    select: {
      ...CONTACT_SELECT,
      linkedin: true,
      additionalPhones: true,
      additionalEmails: true,
      unsubscribed: true,
      company: { select: { id: true, name: true, industry: true, website: true, phone: true } },
    },
  });
  if (!c) throw notFound("Contact");
  const s = (await contactStats(ctx, [c.id])).get(c.id);
  return {
    ...contactSummary(c, s),
    linkedin: c.linkedin,
    additional_phones: c.additionalPhones ?? [],
    additional_emails: c.additionalEmails ?? [],
    email_unsubscribed: c.unsubscribed,
    created_at: c.createdAt.toISOString(),
  };
}

// ============================================
// CONTEXT — everything an agent needs about one contact, in one call
// ============================================

export const contactContextParams = {
  calls_limit: z.coerce.number().int().min(0).max(100).default(10).describe("Recent calls to include (default 10, max 100)"),
  activities_limit: z.coerce.number().int().min(0).max(100).default(10).describe("Recent non-call touches (email, LinkedIn)"),
  notes_limit: z.coerce.number().int().min(0).max(50).default(10),
  include_notes: zBool.describe("Include the free-text notes SDRs wrote (default true)"),
  include_appointments: zBool.describe("Include appointments / RDV (default true)"),
};
export type ContactContextInput = z.infer<z.ZodObject<typeof contactContextParams>>;

const NOTE_MAX = 2000;

type OpportunityRow = {
  id: string;
  needSummary: string;
  urgency: string;
  estimatedMin: number | null;
  estimatedMax: number | null;
  handedOff: boolean;
  handedOffAt: Date | null;
  createdAt: Date;
};

export async function getContactContext(ctx: Ctx, id: string, input: ContactContextInput) {
  const { p, db } = ctx;
  // 1. Existence + tenant check first: a foreign or unknown id is a 404 and costs one query.
  const contact = await db.contact.findFirst({
    where: { AND: [{ id }, contactScope(p)] },
    select: {
      ...CONTACT_SELECT,
      linkedin: true,
      additionalPhones: true,
      additionalEmails: true,
      company: {
        select: {
          id: true,
          name: true,
          industry: true,
          website: true,
          size: true,
          country: true,
          phone: true,
          list: {
            select: {
              id: true,
              name: true,
              mission: { select: { id: true, name: true, status: true } },
              commercialInterlocuteur: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });
  if (!contact) throw notFound("Contact");

  const mine = { AND: [actionScope(p), { contactId: id }] } satisfies Prisma.ActionWhereInput;
  // The context spans several resources: each section is gated by the scope that
  // would guard it on its own endpoint, so contacts:read alone never leaks calls.
  const has = (s: Scope) => p.scopes.includes(s);
  const omitted: string[] = [];
  const gate = (scope: Scope, section: string): boolean => {
    if (has(scope)) return true;
    omitted.push(`${section} (needs ${scope})`);
    return false;
  };
  const canCalls = gate("calls:read", "recent_calls");
  const canActivities = gate("activities:read", "recent_activities");
  const canAppointments = input.include_appointments !== false && gate("appointments:read", "appointments");
  const canNotes = input.include_notes !== false && (has("calls:read") || has("activities:read"));
  const canUsers = gate("users:read", "assigned_users");
  const canLead = gate("leads:read", "lead.opportunities");
  const withNotes = canNotes;
  const withAppointments = canAppointments;
  const now = new Date();

  // 2. Everything else in parallel, each a single indexed query on (contactId).
  const [calls, touches, notes, appointments, grouped, byUser, nextCallbackAction, opportunities] = await Promise.all([
    input.calls_limit && canCalls
      ? db.action.findMany({
          where: { AND: [mine, { channel: "CALL" }] },
          select: ACTION_SELECT,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: input.calls_limit,
        })
      : Promise.resolve([] as ActionRow[]),
    input.activities_limit && canActivities
      ? db.action.findMany({
          where: { AND: [mine, { channel: { not: "CALL" } }] },
          select: ACTION_SELECT,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: input.activities_limit,
        })
      : Promise.resolve([] as ActionRow[]),
    withNotes && input.notes_limit
      ? db.action.findMany({
          where: { AND: [mine, { note: { not: null } }, { NOT: { note: "" } }] },
          select: { id: true, createdAt: true, result: true, channel: true, note: true, sdr: { select: { id: true, name: true } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: input.notes_limit,
        })
      : Promise.resolve([]),
    withAppointments
      ? db.action.findMany({
          where: { AND: [mine, { result: { in: ["MEETING_BOOKED", "MEETING_CANCELLED"] } }] },
          select: {
            id: true,
            createdAt: true,
            result: true,
            callbackDate: true,
            meetingType: true,
            meetingCategory: true,
            confirmationStatus: true,
            cancellationReason: true,
            sdr: { select: { id: true, name: true } },
            interlocuteur: { select: { id: true, firstName: true, lastName: true } },
            meetingFeedback: { select: { outcome: true, clientNote: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
    db.action.groupBy({
      by: ["channel", "result"],
      where: mine,
      _count: { _all: true },
      _max: { createdAt: true },
      _min: { createdAt: true },
    }),
    db.action.groupBy({
      by: ["sdrId"],
      where: mine,
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    db.action.findFirst({
      where: { AND: [mine, { callbackDate: { gte: now } }, { result: { in: [...FOLLOW_UP_RESULTS] } }] },
      select: { callbackDate: true, result: true },
      orderBy: { callbackDate: "asc" },
    }),
    canLead
      ? db.opportunity.findMany({
      where: { AND: [opportunityScope(p), { contactId: id }] },
      select: { id: true, needSummary: true, urgency: true, estimatedMin: true, estimatedMax: true, handedOff: true, handedOffAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    })
      : Promise.resolve([] as OpportunityRow[]),
  ]);

  // 3. Fold the aggregates into the sales summary.
  let total = 0;
  let callCount = 0;
  let meetings = 0;
  let cancelled = 0;
  let first: Date | null = null;
  let last: Date | null = null;
  let lastCall: Date | null = null;
  const callsByResult: Record<string, number> = {};
  for (const g of grouped) {
    const n = g._count._all;
    total += n;
    if (g._min.createdAt && (!first || g._min.createdAt < first)) first = g._min.createdAt;
    if (g._max.createdAt && (!last || g._max.createdAt > last)) last = g._max.createdAt;
    if (g.channel === "CALL") {
      callCount += n;
      callsByResult[g.result] = (callsByResult[g.result] ?? 0) + n;
      if (g._max.createdAt && (!lastCall || g._max.createdAt > lastCall)) lastCall = g._max.createdAt;
    }
    if (g.result === "MEETING_BOOKED") meetings += n;
    if (g.result === "MEETING_CANCELLED") cancelled += n;
  }

  const userIds = canUsers ? byUser.map((u) => u.sdrId) : [];
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, role: true } })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  const lastAction = last ? [...calls, ...touches].find((a) => a.createdAt.getTime() === last!.getTime()) : undefined;
  const stage = meetings > 0 ? "meeting_booked" : nextCallbackAction ? "to_follow_up" : total > 0 ? "contacted_no_meeting" : "never_contacted";
  const company = contact.company;
  const commercial = company.list.commercialInterlocuteur;

  return {
    contact: {
      id: contact.id,
      name: fullName(contact),
      title: contact.title,
      email: contact.email,
      phone: contact.phone,
      linkedin: contact.linkedin,
      additional_phones: contact.additionalPhones ?? [],
      additional_emails: contact.additionalEmails ?? [],
      created_at: contact.createdAt.toISOString(),
    },
    company: {
      id: company.id,
      name: company.name,
      industry: company.industry,
      website: company.website,
      size: company.size,
      country: company.country,
      phone: company.phone,
      list: { id: company.list.id, name: company.list.name },
      mission: ref(company.list.mission),
    },
    lead: {
      stage,
      opportunities: opportunities.map((o) => ({
        id: o.id,
        need: trunc(o.needSummary, 600),
        urgency: o.urgency,
        estimated_min: o.estimatedMin,
        estimated_max: o.estimatedMax,
        handed_off: o.handedOff,
        created_at: o.createdAt.toISOString(),
      })),
    },
    recent_calls: calls.map((a) => actionSummary(a)),
    recent_activities: touches.map((a) => actionSummary(a)),
    appointments: appointments.map((a) => ({
      id: a.id,
      status: a.result === "MEETING_BOOKED" ? "booked" : "cancelled",
      scheduled_at: iso(a.callbackDate),
      booked_at: a.createdAt.toISOString(),
      type: a.meetingType,
      category: a.meetingCategory,
      confirmation_status: a.confirmationStatus,
      cancellation_reason: a.cancellationReason,
      booked_by: ref(a.sdr),
      commercial: a.interlocuteur ? { id: a.interlocuteur.id, name: fullName(a.interlocuteur) } : null,
      outcome: a.meetingFeedback?.outcome ?? null,
      client_note: trunc(a.meetingFeedback?.clientNote, 500),
    })),
    notes: notes.map((n) => ({
      action_id: n.id,
      date: n.createdAt.toISOString(),
      channel: n.channel,
      result: n.result,
      author: ref(n.sdr),
      text: trunc(n.note, NOTE_MAX),
    })),
    assigned_users: (canUsers ? byUser : [])
      .map((u) => ({
        id: u.sdrId,
        name: userById.get(u.sdrId)?.name ?? null,
        role: userById.get(u.sdrId)?.role ?? null,
        action_count: u._count._all,
        last_action_at: iso(u._max.createdAt),
      }))
      .sort((a, b) => (b.last_action_at ?? "").localeCompare(a.last_action_at ?? "")),
    commercial_owner: commercial ? { id: commercial.id, name: fullName(commercial) } : null,
    status: {
      stage,
      data_completeness: contact.status,
      do_not_contact: contact.excludedAt !== null,
      next_callback_at: iso(nextCallbackAction?.callbackDate),
    },
    last_interaction: lastAction
      ? {
          date: lastAction.createdAt.toISOString(),
          channel: lastAction.channel,
          result: lastAction.result,
          by: ref(lastAction.sdr),
          note: trunc(lastAction.note, 300),
        }
      : last
        ? { date: last.toISOString(), channel: null, result: null, by: null, note: null }
        : null,
    sales_summary: {
      total_actions: total,
      call_count: callCount,
      calls_by_result: callsByResult,
      appointments_booked: meetings,
      appointments_cancelled: cancelled,
      first_contact: iso(first),
      last_contact: iso(last),
      last_call: iso(lastCall),
      days_since_last_contact: last ? Math.floor((now.getTime() - last.getTime()) / 86_400_000) : null,
      called_without_appointment: callCount > 0 && meetings === 0,
    },
    limits: {
      calls_returned: calls.length,
      activities_returned: touches.length,
      note: "Lists are capped; use search_calls / search_activities with contact_id and cursor for the full history.",
      omitted_sections: omitted,
    },
  };
}
