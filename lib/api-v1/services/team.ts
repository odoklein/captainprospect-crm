import { z } from "zod";
import { MissionStatus, UserRole, type Prisma } from "@prisma/client";
import { pageArgs, pageParams, toPage } from "../pagination";
import { notFound } from "../errors";
import { iso, ref, type Ctx } from "../serializers";
import { actionScope, missionScope, userScope } from "../tenant";

/**
 * Captain Prospect has no "Team" table. A team is the staffing of a mission: a team-lead SDR
 * plus the SDRs assigned to it. Users are the people visible to the tenant: its
 * own client users and the SDRs staffed on its missions. Emails, passwords and
 * HR data are never exposed.
 */

const DAYS_30 = 30 * 86_400_000;

// ============================================
// USERS
// ============================================

export const searchUsersParams = {
  query: z.string().trim().min(1).max(100).optional().describe("Matches user name"),
  role: z.nativeEnum(UserRole).optional(),
  mission_id: z.string().max(40).optional().describe("Only users staffed on this mission"),
  ...pageParams,
};
export type SearchUsersInput = z.infer<z.ZodObject<typeof searchUsersParams>>;

function userSelect(ctx: Ctx) {
  return {
    id: true,
    name: true,
    role: true,
    isActive: true,
    assignedMissions: { where: { mission: missionScope(ctx.p) }, select: { mission: { select: { id: true, name: true } } } },
  } satisfies Prisma.UserSelect;
}

const userSummary = (u: { id: string; name: string; role: UserRole; isActive: boolean; assignedMissions: { mission: { id: string; name: string } }[] }) => ({
  id: u.id,
  name: u.name,
  role: u.role,
  is_active: u.isActive,
  missions: u.assignedMissions.map((a) => ref(a.mission)),
});

export async function searchUsers(ctx: Ctx, i: SearchUsersInput) {
  const rows = await ctx.db.user.findMany({
    where: {
      AND: [
        userScope(ctx.p),
        i.role ? { role: i.role } : {},
        i.query ? { name: { contains: i.query, mode: "insensitive" } } : {},
        i.mission_id ? { assignedMissions: { some: { missionId: i.mission_id } } } : {},
      ],
    },
    select: userSelect(ctx),
    orderBy: [{ name: "asc" }, { id: "asc" }],
    ...pageArgs(i.limit, i.cursor),
  });
  return toPage(rows, i.limit, userSummary);
}

export async function getUser(ctx: Ctx, id: string) {
  const u = await ctx.db.user.findFirst({ where: { AND: [{ id }, userScope(ctx.p)] }, select: userSelect(ctx) });
  if (!u) throw notFound("User");

  const since = new Date(Date.now() - DAYS_30);
  const grouped = await ctx.db.action.groupBy({
    by: ["channel", "result"],
    where: { AND: [actionScope(ctx.p), { sdrId: id }, { createdAt: { gte: since } }] },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  let actions = 0;
  let calls = 0;
  let meetings = 0;
  let last: Date | null = null;
  for (const g of grouped) {
    actions += g._count._all;
    if (g.channel === "CALL") calls += g._count._all;
    if (g.result === "MEETING_BOOKED") meetings += g._count._all;
    if (g._max.createdAt && (!last || g._max.createdAt > last)) last = g._max.createdAt;
  }
  return { ...userSummary(u), last_30_days: { actions, calls, appointments_booked: meetings, last_action_at: iso(last) } };
}

// ============================================
// TEAMS (= missions' staffing)
// ============================================

export const searchTeamsParams = {
  query: z.string().trim().min(1).max(100).optional().describe("Matches mission / team name"),
  status: z.nativeEnum(MissionStatus).optional(),
  ...pageParams,
};
export type SearchTeamsInput = z.infer<z.ZodObject<typeof searchTeamsParams>>;

const TEAM_SELECT = {
  id: true,
  name: true,
  status: true,
  startDate: true,
  endDate: true,
  teamLeadSdr: { select: { id: true, name: true } },
  sdrAssignments: { select: { sdr: { select: { id: true, name: true } } }, take: 50 },
  campaigns: { select: { id: true } },
} satisfies Prisma.MissionSelect;

type TeamRow = Prisma.MissionGetPayload<{ select: typeof TEAM_SELECT }>;

async function teamPerformance(ctx: Ctx, teams: TeamRow[]) {
  const missionByCampaign = new Map<string, string>();
  for (const t of teams) for (const c of t.campaigns) missionByCampaign.set(c.id, t.id);
  const out = new Map<string, { actions: number; calls: number; appointments_booked: number }>();
  if (missionByCampaign.size === 0) return out;

  const grouped = await ctx.db.action.groupBy({
    by: ["campaignId", "channel", "result"],
    where: { campaignId: { in: [...missionByCampaign.keys()] }, createdAt: { gte: new Date(Date.now() - DAYS_30) } },
    _count: { _all: true },
  });
  for (const g of grouped) {
    const missionId = missionByCampaign.get(g.campaignId);
    if (!missionId) continue;
    const s = out.get(missionId) ?? { actions: 0, calls: 0, appointments_booked: 0 };
    s.actions += g._count._all;
    if (g.channel === "CALL") s.calls += g._count._all;
    if (g.result === "MEETING_BOOKED") s.appointments_booked += g._count._all;
    out.set(missionId, s);
  }
  return out;
}

const teamSummary = (t: TeamRow, perf?: { actions: number; calls: number; appointments_booked: number }) => ({
  id: t.id,
  name: t.name,
  status: t.status,
  start_date: iso(t.startDate),
  end_date: iso(t.endDate),
  team_lead: ref(t.teamLeadSdr),
  members: t.sdrAssignments.map((a) => ref(a.sdr)),
  last_30_days: perf ?? { actions: 0, calls: 0, appointments_booked: 0 },
});

export async function searchTeams(ctx: Ctx, i: SearchTeamsInput) {
  const rows = await ctx.db.mission.findMany({
    where: {
      AND: [missionScope(ctx.p), i.status ? { status: i.status } : {}, i.query ? { name: { contains: i.query, mode: "insensitive" } } : {}],
    },
    select: TEAM_SELECT,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    ...pageArgs(i.limit, i.cursor),
  });
  const page = rows.length > i.limit ? rows.slice(0, i.limit) : rows;
  const perf = await teamPerformance(ctx, page);
  return toPage(rows, i.limit, (t) => teamSummary(t, perf.get(t.id)));
}

export async function getTeam(ctx: Ctx, id: string) {
  const t = await ctx.db.mission.findFirst({ where: { AND: [{ id }, missionScope(ctx.p)] }, select: TEAM_SELECT });
  if (!t) throw notFound("Team");
  const perf = await teamPerformance(ctx, [t]);
  return teamSummary(t, perf.get(t.id));
}
