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
import { searchMissions, getMission, searchMissionsParams } from "./services/missions";
import { searchLists, getList, searchListsParams } from "./services/lists";
import { searchClients, searchCampaigns, getCampaign, searchClientsParams, searchCampaignsParams } from "./services/campaigns";
import {
  getRdvOverview,
  searchExclusions,
  getDailyReports,
  getDataQuality,
  rdvOverviewParams,
  searchExclusionsParams,
  dailyReportsParams,
  dataQualityParams,
} from "./services/insights";
import {
  searchTranscripts,
  getTranscript,
  getCallCoverage,
  searchTranscriptsParams,
  callCoverageParams,
} from "./services/transcripts";
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
    name: "search_transcripts",
    description:
      "Search what was SAID on calls: French full-text search over the transcripts and AI summaries of every recorded call (call vault), with highlighted excerpts («…»). Each hit gives the call, its CRM action and result, the contact, company and SDR, and how reliably the recording was linked to the CRM action. Filter by contact, company, SDR, mission, transcript presence and dates. Use get_transcript for the full conversation." + DATES + PAGING,
    scope: "calls:read",
    shape: searchTranscriptsParams,
    run: (ctx, a) => searchTranscripts(ctx, a),
  }),
  tool({
    name: "get_transcript",
    description:
      "The full conversation of one call, turn by turn (SDR / PROSPECT), with AI summary, duration, result, contact, company and SDR. `call_id` accepts a CRM call id (from search_calls, get_contact_context) or a vault call id (from search_transcripts).",
    scope: "calls:read",
    shape: { call_id: id("call (CRM call id or vault call id)") },
    idArg: "call_id",
    run: (ctx, a) => getTranscript(ctx, a.call_id),
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
    name: "list_clients",
    description: "The clients (companies we prospect for) with their status and number of missions (total / active). With an all-clients key this is EVERY client; with a client-bound key, just that one. Use the ids as `client_id` to narrow other tools." + PAGING,
    scope: "missions:read",
    shape: searchClientsParams,
    run: (ctx, a) => searchClients(ctx, a),
  }),
  tool({
    name: "list_campaigns",
    description: "Campaigns across missions (and clients, with an all-clients key): target profile (ICP), pitch and a script preview, plus client and mission. Searchable by text inside the pitch/script. Use get_campaign for the full script." + PAGING,
    scope: "missions:read",
    shape: searchCampaignsParams,
    run: (ctx, a) => searchCampaigns(ctx, a),
  }),
  tool({
    name: "get_campaign",
    description: "One campaign in full: complete script, pitch, target profile (ICP), rules, and the lists that use this script.",
    scope: "missions:read",
    shape: { campaign_id: id("campaign") },
    idArg: "campaign_id",
    run: (ctx, a) => getCampaign(ctx, a.campaign_id),
  }),
  tool({
    name: "list_missions",
    description: "List the missions (what each team sells): objective, channels, dates, team lead, number of lists, campaigns and SDRs." + PAGING,
    scope: "missions:read",
    shape: searchMissionsParams,
    run: (ctx, a) => searchMissions(ctx, a),
  }),
  tool({
    name: "get_mission",
    description: "One mission in depth: objective, campaigns with target profile (ICP), pitch and call script, playbook, lists with sizes, team, and the last 30 days of activity. Use it to answer 'what are we selling / how do we pitch / who is on it'.",
    scope: "missions:read",
    shape: { mission_id: id("mission") },
    idArg: "mission_id",
    run: (ctx, a) => getMission(ctx, a.mission_id),
  }),
  tool({
    name: "list_lists",
    description: "List the prospect lists (databases) with how far each was worked: companies, contacts, contacts already worked, coverage %, contacts left to call, calls, appointments, last activity." + PAGING,
    scope: "lists:read",
    shape: searchListsParams,
    run: (ctx, a) => searchLists(ctx, a),
  }),
  tool({
    name: "get_list",
    description: "One prospect list in depth: size, coverage, calls, appointments and the data-completeness breakdown (INCOMPLETE / PARTIAL / ACTIONABLE).",
    scope: "lists:read",
    shape: { list_id: id("list") },
    idArg: "list_id",
    run: (ctx, a) => getList(ctx, a.list_id),
  }),
  tool({
    name: "get_rdv_overview",
    description: "The appointments balance sheet: how many RDV are upcoming (validated / awaiting review), held (positive, neutral, negative), absent (open, on stand-by, out of scope), without client feedback, rejected, cancelled or replaced; show rate, positive rate, feedback coverage, loss rate; by SDR." + DATES,
    scope: "appointments:read",
    shape: rdvOverviewParams,
    run: (ctx, a) => getRdvOverview(ctx, a),
  }),
  tool({
    name: "list_exclusions",
    description: "The 'do not contact' rules that apply to this client (company or contact level; client, mission or global scope), with reason, source and how many records each one blocked." + PAGING,
    scope: "contacts:read",
    shape: searchExclusionsParams,
    run: (ctx, a) => searchExclusions(ctx, a),
  }),
  tool({
    name: "get_daily_reports",
    description: "The SDRs' end-of-day field reports ('Retour journée'): reachability, prospect feedback, how the pitch felt, main blocker, free comment. Useful to understand WHY numbers move." + DATES + PAGING,
    scope: "reports:read",
    shape: dailyReportsParams,
    run: (ctx, a) => getDailyReports(ctx, a),
  }),
  tool({
    name: "get_data_quality",
    description: "State of the databases in numbers: contacts and companies without phone / email / website, unreachable contacts, data completeness, same-name duplicate companies, duplicate emails, contacts never worked, do-not-contact count.",
    scope: "contacts:read",
    shape: dataQualityParams,
    run: (ctx, a) => getDataQuality(ctx, a),
  }),
  tool({
    name: "get_sales_report",
    description: "THE tool for any number or trend. Use `period` (this_month, last_month, last_7_days…) for the dates. Returns calls, DISTINCT contacts and companies phoned (unique_called — a call is not a person), appointments, reach rate (conversations), results grouped by meaning (by_category) and by code with French labels, a per-day (or per-month) series, per SDR and per mission. `compare_previous` adds the change vs the previous period of equal length.",
    scope: "reports:read",
    shape: salesReportParams,
    run: (ctx, a) => getSalesReport(ctx, a),
  }),
];

/** Registered only for internal all-clients keys (like the admin DB tools): cross-client operations. */
export const INTERNAL_TOOLS: ToolDef[] = [
  tool({
    name: "get_call_coverage",
    description:
      "INTERNAL. Are we missing any call, transcript or recording? Per SDR: CRM-logged calls vs calls in the vault, how many were linked, conversations, transcripts present / missing, conversations never logged in the CRM, failed recordings. Per phone line: last sync, errors, history backfill progress. Also lists SDRs whose calls are not synced at all." + DATES,
    scope: null,
    shape: callCoverageParams,
    run: (ctx, a) => getCallCoverage(ctx, a),
  }),
];

export const toolByName = new Map([...TOOLS, ...INTERNAL_TOOLS].map((t) => [t.name, t]));
