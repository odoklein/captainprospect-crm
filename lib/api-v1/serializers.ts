import type { Prisma, PrismaClient } from "@prisma/client";
import type { Principal } from "./auth";
import { actionScope } from "./tenant";

/** What every service receives: the authenticated principal and a DB handle. */
export interface Ctx {
  p: Principal;
  db: PrismaClient;
}

/**
 * Results the teams actually use to say "come back to this" (see the result-codes
 * note: RAPPEL / RELANCE / PROJET_A_SUIVRE, with the legacy codes kept for old rows).
 */
export const FOLLOW_UP_RESULTS = ["RAPPEL", "RELANCE", "PROJET_A_SUIVRE", "CALLBACK_REQUESTED", "INTERESTED"] as const;

export const fullName = (c: { firstName: string | null; lastName: string | null }): string | null =>
  [c.firstName, c.lastName].filter(Boolean).join(" ") || null;

export const trunc = (s: string | null | undefined, max: number): string | null => {
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export const ref = (o: { id: string; name: string } | null | undefined) => (o ? { id: o.id, name: o.name } : null);

// ============================================
// ACTIONS (calls, emails, linkedin touches, meetings)
// ============================================

export const ACTION_SELECT = {
  id: true,
  createdAt: true,
  channel: true,
  result: true,
  note: true,
  duration: true,
  callbackDate: true,
  callSummary: true,
  callRecordingUrl: true,
  sdr: { select: { id: true, name: true } },
  contact: {
    select: { id: true, firstName: true, lastName: true, company: { select: { id: true, name: true } } },
  },
  company: { select: { id: true, name: true } },
} satisfies Prisma.ActionSelect;

export type ActionRow = Prisma.ActionGetPayload<{ select: typeof ACTION_SELECT }>;

export function actionSummary(a: ActionRow, noteMax = 300) {
  const company = a.company ?? a.contact?.company ?? null;
  return {
    id: a.id,
    date: a.createdAt.toISOString(),
    channel: a.channel,
    result: a.result,
    note: trunc(a.note, noteMax),
    duration_sec: a.duration,
    callback_at: iso(a.callbackDate),
    has_recording: Boolean(a.callRecordingUrl),
    ai_summary: trunc(a.callSummary, 600),
    contact: a.contact ? { id: a.contact.id, name: fullName(a.contact) } : null,
    company: ref(company),
    user: ref(a.sdr),
  };
}

// ============================================
// PER-CONTACT AGGREGATES — one groupBy for a whole page, never one query per row
// ============================================

export interface ContactStats {
  action_count: number;
  call_count: number;
  appointment_count: number;
  last_contact: string | null;
  last_call: string | null;
}

export const EMPTY_STATS: ContactStats = {
  action_count: 0,
  call_count: 0,
  appointment_count: 0,
  last_contact: null,
  last_call: null,
};

export async function contactStats(ctx: Ctx, contactIds: string[]): Promise<Map<string, ContactStats>> {
  const out = new Map<string, ContactStats>();
  if (contactIds.length === 0) return out;

  const rows = await ctx.db.action.groupBy({
    by: ["contactId", "channel", "result"],
    where: { AND: [actionScope(ctx.p), { contactId: { in: contactIds } }] },
    _count: { _all: true },
    _max: { createdAt: true },
  });

  const latest = (a: string | null, b: Date | null) => (b && (!a || b.toISOString() > a) ? b.toISOString() : a);
  for (const r of rows) {
    if (!r.contactId) continue;
    const s = out.get(r.contactId) ?? { ...EMPTY_STATS };
    s.action_count += r._count._all;
    s.last_contact = latest(s.last_contact, r._max.createdAt);
    if (r.channel === "CALL") {
      s.call_count += r._count._all;
      s.last_call = latest(s.last_call, r._max.createdAt);
    }
    if (r.result === "MEETING_BOOKED") s.appointment_count += r._count._all;
    out.set(r.contactId, s);
  }
  return out;
}

// ============================================
// INPUT PARSING
// ============================================

export const escapeLike = (q: string) => q.replace(/[\\%_]/g, (m) => `\\${m}`);
