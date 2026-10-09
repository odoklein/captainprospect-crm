import { z } from "zod";
import { ApiError, notFound } from "../errors";
import { zBool, zDate, dateRange } from "../pagination";
import { withPeriod, zPeriod } from "../dates";
import { resultLabel } from "../glossary";
import { fullName, iso, trunc, type Ctx } from "../serializers";
import { actionScope, clientFilterParam, companyScope, contactScope, userScope } from "../tenant";
import {
  vaultReader,
  VaultUnavailableError,
  type VaultCallDetail,
  type VaultReader,
  type VaultSearchItem,
} from "../../call-vault-client";

/**
 * Transcripts live in the call vault (separate service + database), not in the CRM. These
 * services resolve the tenant from the principal — exactly like every other service — and pass
 * it to the vault, which then only returns calls linked to that client's CRM actions. A
 * client-bound key can't reach a call the vault matched to another client, or to nobody.
 */

const TRANSCRIPT_MAX_CHARS = 30_000;

const vault = (ctx: Ctx): VaultReader => ctx.vault ?? vaultReader;

async function callVault<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof VaultUnavailableError) throw new ApiError(503, "vault_unavailable", e.message);
    throw e;
  }
}

/**
 * The tenant to send to the vault: always the key's own client/mission; an optional narrowing
 * argument may only restrict further. Returns null when the narrowing can match nothing.
 */
function vaultTenant(ctx: Ctx, narrowClient?: string, narrowMission?: string): { clientId?: string; missionId?: string } | null {
  const { clientId, missionId } = ctx.p;
  if (clientId && narrowClient && narrowClient !== clientId) return null;
  if (missionId && narrowMission && narrowMission !== missionId) return null;
  return { clientId: clientId ?? narrowClient, missionId: missionId ?? narrowMission };
}

/** Names for the ids a vault page refers to — one query per kind, each inside the tenant. */
async function resolveNames(ctx: Ctx, rows: { contactId: string | null; companyId: string | null; sdrUserId: string | null }[]) {
  const ids = (k: "contactId" | "companyId" | "sdrUserId") => [...new Set(rows.map((r) => r[k]).filter((v): v is string => !!v))];
  const [contactIds, companyIds, userIds] = [ids("contactId"), ids("companyId"), ids("sdrUserId")];
  const [contacts, companies, users] = await Promise.all([
    contactIds.length
      ? ctx.db.contact.findMany({ where: { AND: [{ id: { in: contactIds } }, contactScope(ctx.p)] }, select: { id: true, firstName: true, lastName: true } })
      : [],
    companyIds.length
      ? ctx.db.company.findMany({ where: { AND: [{ id: { in: companyIds } }, companyScope(ctx.p)] }, select: { id: true, name: true } })
      : [],
    userIds.length ? ctx.db.user.findMany({ where: { AND: [{ id: { in: userIds } }, userScope(ctx.p)] }, select: { id: true, name: true } }) : [],
  ]);
  return {
    contact: new Map(contacts.map((c) => [c.id, { id: c.id, name: fullName(c) }])),
    company: new Map(companies.map((c) => [c.id, { id: c.id, name: c.name }])),
    user: new Map(users.map((u) => [u.id, { id: u.id, name: u.name }])),
  };
}

const match = (confidence: string | null | undefined, reason: string | null | undefined) =>
  confidence ? { confidence, reason: reason ?? null } : null;

// ============================================
// search_transcripts
// ============================================

export const searchTranscriptsParams = {
  query: z
    .string()
    .trim()
    .min(2)
    .max(200)
    .optional()
    .describe("Words said on the call (French full-text: 'alternance cuisine', '\"pas de budget\"', 'rappel -mail'). Searches transcripts and AI summaries."),
  contact_id: z.string().max(40).optional(),
  company_id: z.string().max(40).optional(),
  user_id: z.string().max(40).optional().describe("The SDR on the call"),
  mission_id: z.string().max(40).optional(),
  client_id: clientFilterParam,
  has_transcript: zBool.describe("true = only calls with a transcript; false = only calls without (gaps)"),
  period: zPeriod.optional(),
  date_from: zDate.optional(),
  date_to: zDate.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10).describe("Page size (default 10, max 50)"),
  cursor: z.string().max(300).optional().describe("Opaque cursor from a previous response's next_cursor"),
};
export type SearchTranscriptsInput = z.infer<z.ZodObject<typeof searchTranscriptsParams>>;

export async function searchTranscripts(ctx: Ctx, rawInput: SearchTranscriptsInput) {
  const input = withPeriod(rawInput);
  const tenant = vaultTenant(ctx, input.client_id, input.mission_id);
  if (!tenant) return { items: [], next_cursor: null };
  const range = dateRange(input.date_from, input.date_to);

  const page = await callVault(() =>
    vault(ctx).searchCalls({
      q: input.query,
      ...tenant,
      contactId: input.contact_id,
      companyId: input.company_id,
      sdrUserId: input.user_id,
      from: range?.gte?.toISOString(),
      // Vault `to` is exclusive; dateRange's lte is the inclusive last millisecond.
      to: range?.lte ? new Date(range.lte.getTime() + 1).toISOString() : undefined,
      hasTranscript: input.has_transcript,
      cursor: input.cursor,
      limit: input.limit,
    }),
  );

  const names = await resolveNames(ctx, page.items);
  return {
    items: page.items.map((c: VaultSearchItem) => ({
      call_id: c.id,
      action_id: c.actionId,
      date: c.startedAt,
      duration_sec: c.durationSec,
      direction: c.direction,
      result: c.result,
      result_label: c.result ? resultLabel(c.result) : null,
      user: c.sdrUserId ? (names.user.get(c.sdrUserId) ?? { id: c.sdrUserId, name: null }) : null,
      contact: c.contactId ? (names.contact.get(c.contactId) ?? { id: c.contactId, name: null }) : null,
      company: c.companyId ? (names.company.get(c.companyId) ?? { id: c.companyId, name: null }) : null,
      excerpt: c.snippet,
      ai_summary: trunc(c.summary, 600),
      has_transcript: c.hasTranscript,
      has_recording: c.hasRecording,
      link: match(c.matchConfidence, c.matchReason),
    })),
    next_cursor: page.nextCursor,
  };
}

// ============================================
// get_transcript
// ============================================

function transcriptOut(detail: VaultCallDetail) {
  let used = 0;
  let truncated = false;
  const turns: { speaker: string; text: string }[] = [];
  for (const s of detail.transcriptSegments ?? []) {
    if (used + s.text.length > TRANSCRIPT_MAX_CHARS) {
      truncated = true;
      break;
    }
    used += s.text.length;
    turns.push({ speaker: s.speaker, text: s.text });
  }
  const text = turns.length ? null : trunc(detail.transcription, TRANSCRIPT_MAX_CHARS);
  if (!turns.length && detail.transcription && detail.transcription.length > TRANSCRIPT_MAX_CHARS) truncated = true;
  return { turns, text, truncated };
}

export async function getTranscript(ctx: Ctx, id: string) {
  const tenant = vaultTenant(ctx)!;

  // 1. A CRM call id (from search_calls / get_contact_context): must be visible to this key here,
  //    in the CRM, before the vault is even asked.
  const action = await ctx.db.action.findFirst({
    where: { AND: [{ id }, actionScope(ctx.p), { channel: "CALL" }] },
    select: { id: true, result: true, createdAt: true, callSummary: true, callTranscription: true },
  });

  const detail = await callVault(() =>
    action ? vault(ctx).getCall(action.id, { by: "action", ...tenant }) : vault(ctx).getCall(id, tenant),
  );

  if (!detail) {
    if (!action) throw notFound("Call");
    // Logged in the CRM, but the vault has no call linked to it (yet): say so, and fall back to
    // what CRM enrichment stored on the action, if anything.
    return {
      call_id: null,
      action_id: action.id,
      date: iso(action.createdAt),
      result: action.result,
      result_label: resultLabel(action.result),
      in_vault: false as const,
      ai_summary: action.callSummary,
      transcript: action.callTranscription ? { turns: [], text: trunc(action.callTranscription, TRANSCRIPT_MAX_CHARS), truncated: false } : null,
      note: "No vault call is linked to this CRM action yet. Shown: whatever CRM enrichment stored on the action (unverified match).",
    };
  }

  const link = detail.link;
  const names = await resolveNames(ctx, [{ contactId: link?.contactId ?? null, companyId: link?.companyId ?? null, sdrUserId: detail.sdrUserId }]);
  return {
    call_id: detail.id,
    action_id: link?.actionId ?? null,
    date: detail.startedAt,
    duration_sec: detail.durationSec,
    direction: detail.direction,
    result: link?.result ?? null,
    result_label: link?.result ? resultLabel(link.result) : null,
    user: detail.sdrUserId ? (names.user.get(detail.sdrUserId) ?? { id: detail.sdrUserId, name: null }) : null,
    contact: link?.contactId ? (names.contact.get(link.contactId) ?? { id: link.contactId, name: null }) : null,
    company: link?.companyId ? (names.company.get(link.companyId) ?? { id: link.companyId, name: null }) : null,
    in_vault: true as const,
    link: match(link?.confidence, link?.reason),
    has_recording: detail.hasRecording,
    ai_summary: detail.summary,
    transcript: detail.transcription || detail.transcriptSegments?.length ? transcriptOut(detail) : null,
  };
}

// ============================================
// get_call_coverage (internal keys only)
// ============================================

export const callCoverageParams = {
  period: zPeriod.optional().describe("Default: last_7_days"),
  date_from: zDate.optional(),
  date_to: zDate.optional(),
};
export type CallCoverageInput = z.infer<z.ZodObject<typeof callCoverageParams>>;

export async function getCallCoverage(ctx: Ctx, rawInput: CallCoverageInput) {
  if (!ctx.p.allClients) throw new ApiError(403, "forbidden", "Call coverage is available to internal all-clients keys only");
  const input = withPeriod(rawInput.period || rawInput.date_from || rawInput.date_to ? rawInput : { ...rawInput, period: "last_7_days" as const });
  const range = dateRange(input.date_from, input.date_to);
  const to = range?.lte ? new Date(range.lte.getTime() + 1) : new Date();
  const from = range?.gte ?? new Date(to.getTime() - 7 * 86_400_000);

  const report = (await callVault(() => vault(ctx).coverage(from.toISOString(), to.toISOString()))) as {
    bySdr?: { sdrUserId: string }[];
    sdrsWithoutLine?: string[];
    lines?: { sdrUserId: string | null }[];
  };
  const ids = [
    ...(report.bySdr ?? []).map((r) => r.sdrUserId),
    ...(report.sdrsWithoutLine ?? []),
    ...(report.lines ?? []).map((l) => l.sdrUserId),
  ].filter((v): v is string => !!v);
  const users = ids.length ? await ctx.db.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true } }) : [];
  return { ...report, user_names: Object.fromEntries(users.map((u) => [u.id, u.name])) };
}
