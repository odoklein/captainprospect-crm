import { z } from "zod";
import { MissionStatus, Prisma, type Channel } from "@prisma/client";
import { pageArgs, pageParams, toPage } from "../pagination";
import { notFound } from "../errors";
import { iso, ref, trunc, type Ctx } from "../serializers";
import { actionScope, missionScope } from "../tenant";

// ============================================
// MISSIONS — what a team is selling, to whom, with which script
// ============================================

export const searchMissionsParams = {
  query: z.string().trim().min(1).max(100).optional().describe("Matches mission name or objective"),
  status: z.nativeEnum(MissionStatus).optional().describe("ACTIVE | COMPLETED | ARCHIVED"),
  ...pageParams,
};
export type SearchMissionsInput = z.infer<z.ZodObject<typeof searchMissionsParams>>;

const MISSION_LIST_SELECT = {
  id: true,
  name: true,
  objective: true,
  status: true,
  channels: true,
  startDate: true,
  endDate: true,
  totalContractDays: true,
  teamLeadSdr: { select: { id: true, name: true } },
  _count: { select: { lists: true, campaigns: true, sdrAssignments: true } },
} satisfies Prisma.MissionSelect;

export async function searchMissions(ctx: Ctx, i: SearchMissionsInput) {
  const rows = await ctx.db.mission.findMany({
    where: {
      AND: [
        missionScope(ctx.p),
        i.status ? { status: i.status } : {},
        i.query ? { OR: [{ name: { contains: i.query, mode: "insensitive" } }, { objective: { contains: i.query, mode: "insensitive" } }] } : {},
      ],
    },
    select: MISSION_LIST_SELECT,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    ...pageArgs(i.limit, i.cursor),
  });
  return toPage(rows, i.limit, (m) => ({
    id: m.id,
    name: m.name,
    objective: trunc(m.objective, 300),
    status: m.status,
    channels: m.channels as Channel[],
    start_date: iso(m.startDate),
    end_date: iso(m.endDate),
    contract_days: m.totalContractDays,
    team_lead: ref(m.teamLeadSdr),
    lists: m._count.lists,
    campaigns: m._count.campaigns,
    sdrs: m._count.sdrAssignments,
  }));
}

export async function getMission(ctx: Ctx, id: string) {
  const m = await ctx.db.mission.findFirst({
    where: { AND: [{ id }, missionScope(ctx.p)] },
    select: {
      ...MISSION_LIST_SELECT,
      playbook: true,
      campaigns: { select: { id: true, name: true, icp: true, pitch: true, script: true, isActive: true }, take: 20, orderBy: { createdAt: "asc" } },
      lists: { select: { id: true, name: true, type: true, isActive: true, isArchived: true, _count: { select: { companies: true } } }, take: 50, orderBy: { createdAt: "desc" } },
      sdrAssignments: { select: { sdr: { select: { id: true, name: true } } }, take: 50 },
    },
  });
  if (!m) throw notFound("Mission");

  // Activity of the last 30 days, from one bounded groupBy.
  const since = new Date(Date.now() - 30 * 86_400_000);
  const grouped = await ctx.db.action.groupBy({
    by: ["channel", "result"],
    where: { AND: [actionScope(ctx.p), { campaign: { missionId: id } }, { createdAt: { gte: since } }] },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  let actions = 0, calls = 0, meetings = 0;
  let last: Date | null = null;
  for (const g of grouped) {
    actions += g._count._all;
    if (g.channel === "CALL") calls += g._count._all;
    if (g.result === "MEETING_BOOKED") meetings += g._count._all;
    if (g._max.createdAt && (!last || g._max.createdAt > last)) last = g._max.createdAt;
  }

  const playbook = m.playbook ? trunc(JSON.stringify(m.playbook), 4000) : null;
  return {
    id: m.id,
    name: m.name,
    objective: m.objective,
    status: m.status,
    channels: m.channels,
    start_date: iso(m.startDate),
    end_date: iso(m.endDate),
    contract_days: m.totalContractDays,
    team_lead: ref(m.teamLeadSdr),
    team: m.sdrAssignments.map((a) => ref(a.sdr)),
    campaigns: m.campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      active: c.isActive,
      target_profile_icp: trunc(c.icp, 1500),
      pitch: trunc(c.pitch, 2000),
      script: trunc(c.script, 4000),
    })),
    lists: m.lists.map((l) => ({ id: l.id, name: l.name, type: l.type, active: l.isActive, archived: l.isArchived, companies: l._count.companies })),
    lists_truncated: m._count.lists > m.lists.length,
    playbook,
    last_30_days: { actions, calls, appointments_booked: meetings, last_action_at: iso(last) },
  };
}
