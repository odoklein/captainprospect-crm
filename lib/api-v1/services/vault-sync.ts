import { z } from "zod";
import { ApiError } from "../errors";
import { decodeCursor, encodeCursor, zDate } from "../pagination";
import { iso, type Ctx } from "../serializers";

/**
 * Feed for the call vault (a separate service that stores every call/transcript): the SDR → Allo
 * number map and the CALL actions with the phone numbers they could have been dialed on, so the
 * vault can link each recording to the CRM action it documents. Replaces giving the vault a database
 * connection to the CRM — same data, but through the API, key-authenticated and audited.
 *
 * Internal keys only (`flag:all_clients`): this is a cross-client export by design. Read-only; the
 * only phone numbers / ids it exposes are the ones the vault matches on.
 */

function requireInternal(ctx: Ctx) {
  if (!ctx.p.allClients) throw new ApiError(403, "forbidden", "The vault feed is available to internal all-clients keys only");
}

export async function listSdrNumbers(ctx: Ctx) {
  requireInternal(ctx);
  const users = await ctx.db.user.findMany({
    where: { alloPhoneNumber: { not: null } },
    select: { id: true, alloPhoneNumber: true, isActive: true },
    orderBy: { id: "asc" },
  });
  return users
    .filter((u) => u.alloPhoneNumber && u.alloPhoneNumber.trim() !== "")
    .map((u) => ({ id: u.id, allo_phone_number: u.alloPhoneNumber as string, is_active: u.isActive }));
}

export const vaultCallActionsParams = {
  since: zDate.optional().describe("First page: only actions logged at/after this instant (ISO). Later pages: pass `cursor` instead."),
  cursor: z.string().max(300).optional().describe("Opaque cursor from the previous page's next_cursor"),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
};
export type VaultCallActionsInput = z.infer<z.ZodObject<typeof vaultCallActionsParams>>;

export async function listVaultCallActions(ctx: Ctx, input: VaultCallActionsInput) {
  requireInternal(ctx);

  const cur = decodeCursor<{ t?: string; id?: string }>(input.cursor);
  const sinceRaw = cur?.t ?? input.since;
  if (!sinceRaw) throw new ApiError(400, "invalid_params", "`since` (or a `cursor`) is required");
  const since = new Date(sinceRaw);
  if (Number.isNaN(since.getTime())) throw new ApiError(400, "invalid_params", "`since` must be an ISO date");
  const afterId = typeof cur?.id === "string" ? cur.id : undefined;

  // Keyset on (createdAt, id): ties on createdAt can't be skipped across pages.
  const after = afterId
    ? { OR: [{ createdAt: { gt: since } }, { createdAt: since, id: { gt: afterId } }] }
    : { createdAt: { gte: since } };

  const rows = await ctx.db.action.findMany({
    where: { AND: [{ channel: "CALL" }, after] },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: input.limit + 1,
    select: {
      id: true,
      sdrId: true,
      contactId: true,
      companyId: true,
      campaignId: true,
      result: true,
      createdAt: true,
      meetingPhone: true,
      campaign: { select: { missionId: true, mission: { select: { clientId: true } } } },
      contact: {
        select: {
          companyId: true,
          phone: true,
          additionalPhones: true,
          company: { select: { phone: true, customData: true } },
        },
      },
      company: { select: { phone: true, customData: true } },
    },
  });

  const hasMore = rows.length > input.limit;
  const page = hasMore ? rows.slice(0, input.limit) : rows;
  const items = page.map((a) => {
    // Same resolution as the vault's old SQL: the action's own company, else the contact's.
    const company = a.company ?? a.contact?.company ?? null;
    return {
      id: a.id,
      sdr_id: a.sdrId,
      contact_id: a.contactId,
      company_id: a.companyId ?? a.contact?.companyId ?? null,
      campaign_id: a.campaignId,
      mission_id: a.campaign.missionId,
      client_id: a.campaign.mission.clientId,
      result: a.result,
      logged_at: iso(a.createdAt) as string,
      meeting_phone: a.meetingPhone,
      contact_phone: a.contact?.phone ?? null,
      contact_additional_phones: a.contact?.additionalPhones ?? null,
      company_phone: company?.phone ?? null,
      company_custom_data: company?.customData ?? null,
    };
  });

  const last = items[items.length - 1];
  return { items, next_cursor: hasMore && last ? encodeCursor({ t: last.logged_at, id: last.id }) : null };
}
