import { z } from "zod";
import { ActionResult, Channel, MeetingConfirmationStatus, type Prisma } from "@prisma/client";
import { dateRange, pageArgs, pageParams, toPage, zBool, zDate } from "../pagination";
import { notFound } from "../errors";
import { ACTION_SELECT, actionSummary, escapeLike, fullName, iso, ref, trunc, type Ctx } from "../serializers";
import { actionScope } from "../tenant";

/** Filters shared by calls and activities. */
const actionFilters = {
  query: z.string().trim().min(1).max(100).optional().describe("Full-text-ish match on notes, AI call summary, contact and company name"),
  status: z.nativeEnum(ActionResult).optional().describe("Result code, e.g. NO_RESPONSE, RAPPEL, RELANCE, MEETING_BOOKED"),
  contact_id: z.string().max(40).optional(),
  company_id: z.string().max(40).optional(),
  user_id: z.string().max(40).optional().describe("The SDR who made the action"),
  mission_id: z.string().max(40).optional(),
  date_from: zDate.optional(),
  date_to: zDate.optional(),
  ...pageParams,
};

export const searchCallsParams = actionFilters;
export const searchActivitiesParams = {
  ...actionFilters,
  channel: z.nativeEnum(Channel).optional().describe("CALL | EMAIL | LINKEDIN"),
};
export type SearchCallsInput = z.infer<z.ZodObject<typeof searchCallsParams>>;
export type SearchActivitiesInput = z.infer<z.ZodObject<typeof searchActivitiesParams>>;

function actionWhere(ctx: Ctx, i: SearchActivitiesInput, channel: Channel | undefined): Prisma.ActionWhereInput {
  const range = dateRange(i.date_from, i.date_to);
  const q = i.query;
  return {
    AND: [
      actionScope(ctx.p),
      channel ? { channel } : {},
      i.status ? { result: i.status } : {},
      i.user_id ? { sdrId: i.user_id } : {},
      i.contact_id ? { contactId: i.contact_id } : {},
      i.company_id ? { OR: [{ companyId: i.company_id }, { contact: { companyId: i.company_id } }] } : {},
      i.mission_id ? { campaign: { missionId: i.mission_id } } : {},
      range ? { createdAt: range } : {},
      q
        ? {
            OR: [
              { note: { contains: q, mode: "insensitive" } },
              { callSummary: { contains: q, mode: "insensitive" } },
              { contact: { firstName: { contains: q, mode: "insensitive" } } },
              { contact: { lastName: { contains: q, mode: "insensitive" } } },
              { contact: { company: { name: { contains: q, mode: "insensitive" } } } },
              { company: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };
}

async function listActions(ctx: Ctx, input: SearchActivitiesInput, channel: Channel | undefined) {
  const rows = await ctx.db.action.findMany({
    where: actionWhere(ctx, input, channel),
    select: ACTION_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...pageArgs(input.limit, input.cursor),
  });
  return toPage(rows, input.limit, (a) => actionSummary(a));
}

export const searchCalls = (ctx: Ctx, input: SearchCallsInput) => listActions(ctx, input, "CALL");
export const searchActivities = (ctx: Ctx, input: SearchActivitiesInput) => listActions(ctx, input, input.channel);

export async function getCall(ctx: Ctx, id: string) {
  const a = await ctx.db.action.findFirst({
    where: { AND: [{ id }, actionScope(ctx.p), { channel: "CALL" }] },
    select: { ...ACTION_SELECT, callTranscription: true, campaign: { select: { id: true, name: true, mission: { select: { id: true, name: true } } } } },
  });
  if (!a) throw notFound("Call");
  return {
    ...actionSummary(a, 5000),
    transcription: trunc(a.callTranscription, 8000),
    campaign: ref(a.campaign),
    mission: ref(a.campaign.mission),
  };
}

// ============================================
// APPOINTMENTS (RDV) = actions whose result is MEETING_BOOKED / MEETING_CANCELLED
// ============================================

export const searchAppointmentsParams = {
  status: z.enum(["booked", "cancelled", "all"]).default("booked"),
  confirmation: z.nativeEnum(MeetingConfirmationStatus).optional().describe("Manager SAS review: PENDING | CONFIRMED | CANCELLED"),
  upcoming: zBool.describe("Only meetings scheduled in the future, soonest first"),
  contact_id: z.string().max(40).optional(),
  company_id: z.string().max(40).optional(),
  user_id: z.string().max(40).optional().describe("The SDR who booked it"),
  mission_id: z.string().max(40).optional(),
  date_from: zDate.optional().describe("Meeting scheduled on/after (booking date when no schedule is set)"),
  date_to: zDate.optional().describe("Meeting scheduled on/before"),
  ...pageParams,
};
export type SearchAppointmentsInput = z.infer<z.ZodObject<typeof searchAppointmentsParams>>;

export async function searchAppointments(ctx: Ctx, i: SearchAppointmentsInput) {
  const range = dateRange(i.date_from, i.date_to);
  const results: ActionResult[] =
    i.status === "booked" ? ["MEETING_BOOKED"] : i.status === "cancelled" ? ["MEETING_CANCELLED"] : ["MEETING_BOOKED", "MEETING_CANCELLED"];

  const rows = await ctx.db.action.findMany({
    where: {
      AND: [
        actionScope(ctx.p),
        { result: { in: results } },
        i.confirmation ? { confirmationStatus: i.confirmation } : {},
        i.upcoming ? { callbackDate: { gte: new Date() } } : {},
        i.user_id ? { sdrId: i.user_id } : {},
        i.contact_id ? { contactId: i.contact_id } : {},
        i.company_id ? { OR: [{ companyId: i.company_id }, { contact: { companyId: i.company_id } }] } : {},
        i.mission_id ? { campaign: { missionId: i.mission_id } } : {},
        range ? { OR: [{ callbackDate: range }, { AND: [{ callbackDate: null }, { createdAt: range }] }] } : {},
      ],
    },
    select: {
      ...ACTION_SELECT,
      meetingType: true,
      meetingCategory: true,
      confirmationStatus: true,
      cancellationReason: true,
      interlocuteur: { select: { id: true, firstName: true, lastName: true } },
      meetingFeedback: { select: { outcome: true, clientNote: true } },
    },
    orderBy: i.upcoming ? [{ callbackDate: "asc" }, { id: "asc" }] : [{ createdAt: "desc" }, { id: "desc" }],
    ...pageArgs(i.limit, i.cursor),
  });

  return toPage(rows, i.limit, (a) => ({
    id: a.id,
    status: a.result === "MEETING_BOOKED" ? "booked" : "cancelled",
    scheduled_at: iso(a.callbackDate),
    booked_at: a.createdAt.toISOString(),
    type: a.meetingType,
    category: a.meetingCategory,
    confirmation_status: a.confirmationStatus,
    cancellation_reason: a.cancellationReason,
    contact: a.contact ? { id: a.contact.id, name: fullName(a.contact) } : null,
    company: ref(a.company ?? a.contact?.company),
    booked_by: ref(a.sdr),
    commercial: a.interlocuteur ? { id: a.interlocuteur.id, name: fullName(a.interlocuteur) } : null,
    outcome: a.meetingFeedback?.outcome ?? null,
    client_note: trunc(a.meetingFeedback?.clientNote, 500),
    note: trunc(a.note, 300),
  }));
}

export { escapeLike };
