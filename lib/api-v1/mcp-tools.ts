import { z } from "zod";
import type { Scope } from "./scopes";
import type { Ctx } from "./serializers";
import { searchContacts, getContact, getContactContext, searchContactsParams, contactContextParams } from "./services/contacts";
import { searchCompanies, getCompany, searchCompaniesParams } from "./services/companies";
import { searchLeads, getLead, searchLeadsParams } from "./services/leads";
import {
  searchCalls,
  getCall,
  searchActivities,
  searchAppointments,
  searchCallsParams,
  searchActivitiesParams,
  searchAppointmentsParams,
} from "./services/actions";
import { searchTeams, getTeam, searchUsers, getUser, searchTeamsParams, searchUsersParams } from "./services/team";
import { getSalesReport, salesReportParams } from "./services/reports";
import { getAccount, globalSearch, globalSearchParams } from "./services/account";
import { parseInput } from "./input";

export interface ToolDef {
  name: string;
  description: string;
  /** null = available to every valid key (the tool gates its sections itself). */
  scope: Scope | null;
  shape: z.ZodRawShape;
  /** Name of the argument holding the id of the record being read — kept in the audit trail. */
  idArg?: string;
  run: (ctx: Ctx, args: Record<string, unknown>) => Promise<unknown>;
}

const id = (what: string) => z.string().min(1).max(40).describe(`Id of the ${what}`);

function tool<S extends z.ZodRawShape>(
  def: Omit<ToolDef, "shape" | "run"> & { shape: S; run: (ctx: Ctx, input: z.infer<z.ZodObject<S>>) => Promise<unknown> },
): ToolDef {
  return { ...def, run: (ctx, args) => def.run(ctx, parseInput(def.shape, args)) };
}

const DATES = " Dates: prefer the `period` preset (Paris time).";
const PAGING = " Results are paginated: pass the returned next_cursor as `cursor` to get the next page.";

/**
 * Every MCP tool is a thin wrapper over the same service functions the REST
 * API uses, called with the principal resolved from the API key — an agent
 * cannot reach data, or pass a tenant, that the key itself does not allow.
 * All tools are read-only.
 */
export const TOOLS: ToolDef[] = [
  tool({
    name: "whoami",
    description:
      "CALL THIS FIRST. Returns who this API key is, which client's data it can see (it is NOT the whole CRM), today's date in Paris time, the active missions, the permissions, a glossary of result codes grouped by meaning, and usage tips.",
    scope: null,
    shape: {},
    run: (ctx) => getAccount(ctx),
  }),
  tool({
    name: "global_search",
    description:
      "Find anything by name in one call: contacts, companies and teams/missions matching a text (e.g. 'TALIS', 'Dupont'). Use it when the user names something and you do not know what kind of record it is.",
    scope: null,
    shape: globalSearchParams,
    run: (ctx, a) => globalSearch(ctx, a),
  }),
  tool({
    name: "search_contacts",
    description: "Search people (prospects) by name, email, phone, title or company. Returns compact rows with call count, last contact and appointment count." + PAGING,
    scope: "contacts:read",
    shape: searchContactsParams,
    run: (ctx, a) => searchContacts(ctx, a),
  }),
  tool({
    name: "get_contact",
    description: "Get one contact's details and activity counters. For the full commercial history use get_contact_context instead.",
    scope: "contacts:read",
    shape: { contact_id: id("contact") },
    idArg: "contact_id",
    run: (ctx, a) => getContact(ctx, a.contact_id),
  }),
  tool({
    name: "get_contact_context",
    description:
      "BEST FIRST CALL for anything about one prospect: returns in a single response the contact, its company, lead stage, recent calls, recent email/LinkedIn activities, appointments, SDR notes, who worked it, last interaction and a sales summary (call count, calls by result, appointments, days since last contact, called-without-appointment flag).",
    scope: "contacts:read",
    shape: { contact_id: id("contact"), ...contactContextParams },
    idArg: "contact_id",
    run: (ctx, { contact_id, ...rest }) => getContactContext(ctx, contact_id, parseInput(contactContextParams, rest)),
  }),
  tool({
    name: "search_companies",
    description: "Search companies (accounts) by name, industry or website." + PAGING,
    scope: "companies:read",
    shape: searchCompaniesParams,
    run: (ctx, a) => searchCompanies(ctx, a),
  }),
  tool({
    name: "get_company",
    description: "Get one company with its contacts, recent actions, opportunities and a sales summary.",
    scope: "companies:read",
    shape: { company_id: id("company") },
    idArg: "company_id",
    run: (ctx, a) => getCompany(ctx, a.company_id),
  }),
  tool({
    name: "search_leads",
    description:
      "Search worked prospects (contacts with at least one action) by pipeline stage. Stages: meeting_booked, to_follow_up (latest action is a callback/follow-up), contacted (worked, no meeting). Useful filters: min_calls + no_appointment ('called several times, no RDV'), callback_due_before (today's date → 'to follow up today'), date_from ('recent activity')." + DATES + PAGING,
    scope: "leads:read",
    shape: searchLeadsParams,
    run: (ctx, a) => searchLeads(ctx, a),
  }),
  tool({
    name: "get_lead",
    description: "Get one worked prospect's pipeline state (stage, counts, next callback) and its opportunities. `lead_id` is the contact id.",
    scope: "leads:read",
    shape: { lead_id: id("lead (contact id)") },
    idArg: "lead_id",
    run: (ctx, a) => getLead(ctx, a.lead_id),
  }),
  tool({
    name: "search_calls",
    description: "Search calls (phone actions) by text in notes/summary, result code, contact, company, SDR and date range. Newest first." + DATES + PAGING,
    scope: "calls:read",
    shape: searchCallsParams,
    run: (ctx, a) => searchCalls(ctx, a),
  }),
  tool({
    name: "get_call",
    description: "Get one call in full: note, AI summary and transcription when available.",
    scope: "calls:read",
    shape: { call_id: id("call") },
    idArg: "call_id",
    run: (ctx, a) => getCall(ctx, a.call_id),
  }),
  tool({
    name: "search_activities",
    description: "Search all prospecting actions (calls, emails, LinkedIn) with the same filters as search_calls plus `channel`." + DATES + PAGING,
    scope: "activities:read",
    shape: searchActivitiesParams,
    run: (ctx, a) => searchActivities(ctx, a),
  }),
  tool({
    name: "search_appointments",
    description: "Search appointments (RDV): booked or cancelled, confirmation status, upcoming only, by SDR, contact, company, mission or date. Includes the client's meeting outcome when reported." + DATES + PAGING,
    scope: "appointments:read",
    shape: searchAppointmentsParams,
    run: (ctx, a) => searchAppointments(ctx, a),
  }),
  tool({
    name: "list_teams",
    description: "List teams (one per mission): team lead, members and the last 30 days of calls and appointments." + PAGING,
    scope: "users:read",
    shape: searchTeamsParams,
    run: (ctx, a) => searchTeams(ctx, a),
  }),
  tool({
    name: "get_team",
    description: "Get one team (mission staffing) with members and last-30-days performance.",
    scope: "users:read",
    shape: { team_id: id("team / mission") },
    idArg: "team_id",
    run: (ctx, a) => getTeam(ctx, a.team_id),
  }),
  tool({
    name: "list_users",
    description: "List the SDRs and client users visible to this account (names and roles only)." + PAGING,
    scope: "users:read",
    shape: searchUsersParams,
    run: (ctx, a) => searchUsers(ctx, a),
  }),
  tool({
    name: "get_user",
    description: "Get one user with their missions and last-30-days activity (actions, calls, appointments).",
    scope: "users:read",
    shape: { user_id: id("user") },
    idArg: "user_id",
    run: (ctx, a) => getUser(ctx, a.user_id),
  }),
  tool({
    name: "get_sales_report",
    description: "THE tool for any number or trend. Use `period` (this_month, last_month, last_7_days…) for the dates. Returns calls, DISTINCT contacts and companies phoned (unique_called — a call is not a person), appointments, reach rate (conversations), results grouped by meaning (by_category) and by code with French labels, a per-day (or per-month) series, per SDR and per mission. `compare_previous` adds the change vs the previous period of equal length.",
    scope: "reports:read",
    shape: salesReportParams,
    run: (ctx, a) => getSalesReport(ctx, a),
  }),
];

export const toolByName = new Map(TOOLS.map((t) => [t.name, t]));
