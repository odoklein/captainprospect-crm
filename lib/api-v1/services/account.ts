import { z } from "zod";
import { CATEGORY_LABELS, RESULT_META, type ResultCategory } from "../glossary";
import { PERIODS, TIMEZONE, parisNow } from "../dates";
import { iso, type Ctx } from "../serializers";
import { missionScope } from "../tenant";
import { searchContacts, searchContactsParams } from "./contacts";
import { searchCompanies, searchCompaniesParams } from "./companies";
import { searchTeams, searchTeamsParams } from "./team";
import { parseInput } from "../input";

/**
 * "Who am I talking to, what can I see, what day is it". The first thing an
 * agent should call: it fixes the three mistakes models make on a CRM —
 * mistaking one client's slice for "the whole CRM", guessing today's date, and
 * misreading result codes.
 */
export async function getAccount(ctx: Ctx) {
  const now = new Date();
  const [client, missions] = await Promise.all([
    ctx.db.client.findUnique({ where: { id: ctx.p.clientId }, select: { id: true, name: true, status: true } }),
    ctx.db.mission.findMany({
      where: { AND: [missionScope(ctx.p), { status: "ACTIVE" }, { isActive: true }] },
      select: { id: true, name: true, startDate: true, endDate: true, teamLeadSdr: { select: { name: true } }, _count: { select: { sdrAssignments: true } } },
      orderBy: { name: "asc" },
      take: 50,
    }),
  ]);

  const categories = Object.fromEntries(
    (Object.keys(CATEGORY_LABELS) as ResultCategory[]).map((c) => [
      c,
      { label: CATEGORY_LABELS[c], codes: Object.entries(RESULT_META).filter(([, m]) => m.category === c).map(([code]) => code) },
    ]),
  );

  return {
    now: { iso: now.toISOString(), paris: parisNow(now), timezone: TIMEZONE },
    visible_scope: {
      client: client ? { id: client.id, name: client.name, status: client.status } : null,
      restricted_to_one_mission: ctx.p.missionId,
      statement: `This API key only sees the data of the client "${client?.name ?? "?"}"${ctx.p.missionId ? " (one mission only)" : ""}. It is NOT the whole CRM: other clients' missions, contacts and calls do not exist for it — say so instead of claiming something does not exist.`,
    },
    permissions: ctx.p.scopes,
    active_missions: missions.map((m) => ({
      id: m.id,
      name: m.name,
      start_date: iso(m.startDate),
      end_date: iso(m.endDate),
      team_lead: m.teamLeadSdr?.name ?? null,
      sdr_count: m._count.sdrAssignments,
    })),
    glossary: {
      call: "One phone attempt (Action on the CALL channel). A call is NOT a person: the same contact is often called several times — use get_sales_report.unique_called for distinct contacts / companies.",
      lead: "A contact that has been worked at least once (>= 1 action), with a pipeline stage: meeting_booked, to_follow_up, contacted.",
      team: "A mission's staffing (team lead + SDRs).",
      appointment: "RDV: a booked meeting. confirmation_status PENDING = awaiting manager review (SAS), CONFIRMED = validated, CANCELLED = rejected at the SAS.",
      result_categories: categories,
      result_labels: Object.fromEntries(Object.entries(RESULT_META).map(([code, m]) => [code, m.label])),
    },
    period_presets: PERIODS,
    tips: [
      "Use `period` (this_month, last_month, last_7_days…) instead of computing dates yourself.",
      "For totals, unique counts, rates and trends call get_sales_report — do not page through search_* results to count.",
      "For everything about one prospect call get_contact_context. To find something by name call global_search.",
      "Lists are paginated: when has_more is true, pass next_cursor as `cursor`.",
      "Never invent numbers. If a tool cannot answer, say what is missing.",
    ],
  };
}

// ============================================
// GLOBAL SEARCH — "TALIS", "Dupont": one call across contacts, companies and teams
// ============================================

export const globalSearchParams = {
  query: z.string().trim().min(2).max(100).describe("Name, company, mission or team to look for"),
  limit: z.coerce.number().int().min(1).max(10).default(5).describe("Max results per type (default 5, max 10)"),
};
export type GlobalSearchInput = z.infer<z.ZodObject<typeof globalSearchParams>>;

export async function globalSearch(ctx: Ctx, input: GlobalSearchInput) {
  const has = (s: string) => ctx.p.scopes.includes(s as never);
  const omitted: string[] = [];
  const run = async <T>(scope: string, what: string, fn: () => Promise<{ items: T[] }>) => {
    if (!has(scope)) { omitted.push(`${what} (needs ${scope})`); return [] as T[]; }
    return (await fn()).items;
  };
  const q = { query: input.query, limit: input.limit };
  const [contacts, companies, teams] = await Promise.all([
    run("contacts:read", "contacts", () => searchContacts(ctx, parseInput(searchContactsParams, q))),
    run("companies:read", "companies", () => searchCompanies(ctx, parseInput(searchCompaniesParams, q))),
    run("users:read", "teams", () => searchTeams(ctx, parseInput(searchTeamsParams, q))),
  ]);
  const nothing = contacts.length + companies.length + teams.length === 0;
  return {
    query: input.query,
    contacts,
    companies,
    teams,
    ...(omitted.length ? { omitted_sections: omitted } : {}),
    ...(nothing
      ? { note: "No match inside this API key's scope (one client only). It may exist under another client, or under a slightly different spelling: try a shorter or partial name." }
      : {}),
  };
}
