import { z } from "zod";
import { ClientStatus, Prisma } from "@prisma/client";
import { pageArgs, pageParams, toPage, zBool } from "../pagination";
import { notFound } from "../errors";
import { iso, ref, trunc, type Ctx } from "../serializers";
import { clientFilterParam, clientScope, missionScope } from "../tenant";

// ============================================
// CLIENTS — who we work for (all of them with an all-clients key)
// ============================================

export const searchClientsParams = {
  query: z.string().trim().min(1).max(100).optional().describe("Matches client name or industry"),
  status: z.nativeEnum(ClientStatus).optional().describe("ACTIVE | PAUSED | STOPPED"),
  ...pageParams,
};
export type SearchClientsInput = z.infer<z.ZodObject<typeof searchClientsParams>>;

export async function searchClients(ctx: Ctx, i: SearchClientsInput) {
  const rows = await ctx.db.client.findMany({
    where: {
      AND: [
        clientScope(ctx.p),
        { archivedAt: null },
        i.status ? { status: i.status } : {},
        i.query ? { OR: [{ name: { contains: i.query, mode: "insensitive" } }, { industry: { contains: i.query, mode: "insensitive" } }] } : {},
      ],
    },
    select: {
      id: true, name: true, status: true, industry: true, createdAt: true, contractedDaysPerWeek: true,
      missions: { select: { id: true, status: true, isActive: true } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    ...pageArgs(i.limit, i.cursor),
  });
  return toPage(rows, i.limit, (c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    industry: c.industry,
    contracted_days_per_week: c.contractedDaysPerWeek,
    client_since: c.createdAt.toISOString(),
    missions_total: c.missions.length,
    missions_active: c.missions.filter((m) => m.status === "ACTIVE" && m.isActive).length,
  }));
}

// ============================================
// CAMPAIGNS — the pitch and the script each team calls with
// ============================================

export const searchCampaignsParams = {
  query: z.string().trim().min(1).max(100).optional().describe("Matches campaign name, target profile, pitch or script text"),
  mission_id: z.string().max(40).optional(),
  client_id: clientFilterParam,
  active_only: zBool.describe("Only active campaigns (default: all)"),
  ...pageParams,
};
export type SearchCampaignsInput = z.infer<z.ZodObject<typeof searchCampaignsParams>>;

const CAMPAIGN_LIST_SELECT = {
  id: true,
  name: true,
  isActive: true,
  icp: true,
  pitch: true,
  script: true,
  createdAt: true,
  mission: { select: { id: true, name: true, status: true, client: { select: { id: true, name: true } } } },
} satisfies Prisma.CampaignSelect;

export async function searchCampaigns(ctx: Ctx, i: SearchCampaignsInput) {
  const q = i.query;
  const rows = await ctx.db.campaign.findMany({
    where: {
      AND: [
        { mission: missionScope(ctx.p, i.client_id) },
        i.mission_id ? { missionId: i.mission_id } : {},
        i.active_only ? { isActive: true } : {},
        q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { icp: { contains: q, mode: "insensitive" } },
                { pitch: { contains: q, mode: "insensitive" } },
                { script: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    },
    select: CAMPAIGN_LIST_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...pageArgs(i.limit, i.cursor),
  });
  return toPage(rows, i.limit, (c) => ({
    id: c.id,
    name: c.name,
    active: c.isActive,
    client: ref(c.mission.client),
    mission: { id: c.mission.id, name: c.mission.name, status: c.mission.status },
    target_profile_icp: trunc(c.icp, 500),
    pitch: trunc(c.pitch, 700),
    script_preview: trunc(c.script, 500),
    has_script: Boolean(c.script),
    script_length: c.script?.length ?? 0,
    note: c.script && c.script.length > 500 ? "Use get_campaign for the full script." : undefined,
  }));
}

const FULL_MAX = 30_000;

export async function getCampaign(ctx: Ctx, id: string) {
  const c = await ctx.db.campaign.findFirst({
    where: { AND: [{ id }, { mission: missionScope(ctx.p) }] },
    select: {
      ...CAMPAIGN_LIST_SELECT,
      rules: true,
      assignedLists: { select: { id: true, name: true, isArchived: true }, take: 50 },
    },
  });
  if (!c) throw notFound("Campaign");
  const rules = c.rules ? trunc(JSON.stringify(c.rules), 4000) : null;
  return {
    id: c.id,
    name: c.name,
    active: c.isActive,
    created_at: iso(c.createdAt),
    client: ref(c.mission.client),
    mission: { id: c.mission.id, name: c.mission.name, status: c.mission.status },
    target_profile_icp: trunc(c.icp, FULL_MAX),
    pitch: trunc(c.pitch, FULL_MAX),
    script: trunc(c.script, FULL_MAX),
    rules,
    lists_using_this_script: c.assignedLists.map((l) => ({ id: l.id, name: l.name, archived: l.isArchived })),
  };
}
