import { z } from "zod";
import { ApiError } from "../errors";
import { zDate } from "../pagination";
import { ref, type Ctx } from "../serializers";
import { actionScope } from "../tenant";

export const salesReportParams = {
  date_from: zDate.optional().describe("Period start (default: 30 days ago)"),
  date_to: zDate.optional().describe("Period end, inclusive (default: today)"),
  mission_id: z.string().max(40).optional().describe("Restrict to one mission / team"),
  user_id: z.string().max(40).optional().describe("Restrict to one SDR"),
};
export type SalesReportInput = z.infer<z.ZodObject<typeof salesReportParams>>;

const DAY = 86_400_000;
const MAX_SPAN_DAYS = 366;

export async function getSalesReport(ctx: Ctx, i: SalesReportInput) {
  const to = i.date_to ? new Date(i.date_to) : new Date();
  if (i.date_to && /^\d{4}-\d{2}-\d{2}$/.test(i.date_to)) to.setUTCHours(23, 59, 59, 999);
  const from = i.date_from ? new Date(i.date_from) : new Date(to.getTime() - 30 * DAY);
  if (from > to) throw new ApiError(400, "invalid_params", "date_from must be before date_to");
  if (to.getTime() - from.getTime() > MAX_SPAN_DAYS * DAY) {
    throw new ApiError(400, "invalid_params", `Period too long (max ${MAX_SPAN_DAYS} days)`);
  }

  const where = {
    AND: [
      actionScope(ctx.p),
      { createdAt: { gte: from, lte: to } },
      i.mission_id ? { campaign: { missionId: i.mission_id } } : {},
      i.user_id ? { sdrId: i.user_id } : {},
    ],
  };

  const [grouped, confirmations, campaigns] = await Promise.all([
    // One bounded groupBy feeds totals, by_result, by_user and by_mission.
    ctx.db.action.groupBy({ by: ["campaignId", "sdrId", "channel", "result"], where, _count: { _all: true } }),
    ctx.db.action.groupBy({ by: ["confirmationStatus"], where: { AND: [where, { result: "MEETING_BOOKED" }] }, _count: { _all: true } }),
    ctx.db.campaign.findMany({
      where: { mission: { clientId: ctx.p.clientId, ...(ctx.p.missionId ? { id: ctx.p.missionId } : {}) } },
      select: { id: true, mission: { select: { id: true, name: true } } },
    }),
  ]);

  const missionByCampaign = new Map(campaigns.map((c) => [c.id, c.mission]));
  type Bucket = { actions: number; calls: number; appointments_booked: number };
  const blank = (): Bucket => ({ actions: 0, calls: 0, appointments_booked: 0 });
  const totals = { actions: 0, calls: 0, emails: 0, linkedin_actions: 0, appointments_booked: 0, appointments_cancelled: 0 };
  const byResult = new Map<string, number>();
  const byUser = new Map<string, Bucket>();
  const byMission = new Map<string, Bucket & { name: string }>();

  for (const g of grouped) {
    const n = g._count._all;
    const booked = g.result === "MEETING_BOOKED" ? n : 0;
    totals.actions += n;
    totals.appointments_booked += booked;
    if (g.result === "MEETING_CANCELLED") totals.appointments_cancelled += n;
    if (g.channel === "CALL") totals.calls += n;
    else if (g.channel === "EMAIL") totals.emails += n;
    else totals.linkedin_actions += n;
    byResult.set(g.result, (byResult.get(g.result) ?? 0) + n);

    const u = byUser.get(g.sdrId) ?? blank();
    u.actions += n;
    u.appointments_booked += booked;
    if (g.channel === "CALL") u.calls += n;
    byUser.set(g.sdrId, u);

    const m = missionByCampaign.get(g.campaignId);
    if (m) {
      const b = byMission.get(m.id) ?? { ...blank(), name: m.name };
      b.actions += n;
      b.appointments_booked += booked;
      if (g.channel === "CALL") b.calls += n;
      byMission.set(m.id, b);
    }
  }

  const topUsers = [...byUser.entries()].sort((a, b) => b[1].calls - a[1].calls).slice(0, 25);
  const users = topUsers.length
    ? await ctx.db.user.findMany({ where: { id: { in: topUsers.map(([id]) => id) } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  const confirmed = (s: string) => confirmations.find((c) => c.confirmationStatus === s)?._count._all ?? 0;

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    totals: {
      ...totals,
      appointments_confirmed: confirmed("CONFIRMED"),
      appointments_pending_review: confirmed("PENDING"),
      appointments_rejected: confirmed("CANCELLED"),
      appointments_per_100_calls: totals.calls ? Math.round((totals.appointments_booked / totals.calls) * 1000) / 10 : null,
    },
    by_result: [...byResult.entries()].sort((a, b) => b[1] - a[1]).map(([result, count]) => ({ result, count })),
    by_user: topUsers.map(([id, b]) => ({ ...ref({ id, name: nameById.get(id) ?? "?" }), ...b })),
    by_mission: [...byMission.entries()].sort((a, b) => b[1].calls - a[1].calls).map(([id, b]) => ({ id, ...b })),
  };
}
