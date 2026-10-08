import { z } from "zod";
import { Prisma } from "@prisma/client";
import { dateRange, pageArgs, pageParams, toPage, zBool, zDate } from "../pagination";
import { withPeriod, zPeriod } from "../dates";
import { buildRdvOverview, type OverviewRow } from "../../rdv/overview";
import { iso, ref, trunc, type Ctx } from "../serializers";
import { actionScope, clientFilterParam, clientSql, companyScope, contactScope, missionScope } from "../tenant";

// ============================================
// RDV OVERVIEW ("Bilan des RDV") — what happened to every appointment
// ============================================

export const rdvOverviewParams = {
  period: zPeriod.optional().describe("Window on the meeting date (booking date when none is set)"),
  date_from: zDate.optional(),
  date_to: zDate.optional(),
  mission_id: z.string().max(40).optional(),
  client_id: clientFilterParam,
};
export type RdvOverviewInput = z.infer<z.ZodObject<typeof rdvOverviewParams>>;

const OVERVIEW_CAP = 5000;

export async function getRdvOverview(ctx: Ctx, raw: RdvOverviewInput) {
  const i = withPeriod(raw);
  const range = dateRange(i.date_from, i.date_to);
  const rows = await ctx.db.action.findMany({
    where: {
      AND: [
        actionScope(ctx.p, i.client_id),
        { result: { in: ["MEETING_BOOKED", "MEETING_CANCELLED"] } },
        i.mission_id ? { campaign: { missionId: i.mission_id } } : {},
        range ? { OR: [{ callbackDate: range }, { AND: [{ callbackDate: null }, { createdAt: range }] }] } : {},
      ],
    },
    select: {
      result: true,
      confirmationStatus: true,
      callbackDate: true,
      cancellationReason: true,
      sdr: { select: { id: true, name: true } },
      campaign: { select: { mission: { select: { client: { select: { id: true, name: true } } } } } },
      meetingFeedback: { select: { outcome: true, standByAt: true, outOfScopeAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: OVERVIEW_CAP + 1,
  });
  const truncated = rows.length > OVERVIEW_CAP;
  const overviewRows: OverviewRow[] = rows.slice(0, OVERVIEW_CAP).map((r) => ({
    result: r.result,
    confirmationStatus: r.confirmationStatus,
    callbackDate: r.callbackDate,
    cancellationReason: r.cancellationReason,
    sdr: r.sdr,
    client: r.campaign.mission.client,
    feedback: r.meetingFeedback,
  }));
  const o = buildRdvOverview(overviewRows, new Date());
  return {
    total: o.total,
    buckets: o.buckets,
    no_show: { open: o.noShow.open, stand_by: o.noShow.standBy, out_of_scope: o.noShow.outOfScope },
    rates_pct: { show_rate: o.rates.showRate, positive_rate: o.rates.positiveRate, feedback_coverage: o.rates.feedbackCoverage, loss_rate: o.rates.lossRate },
    by_sdr: o.bySdr,
    legend: {
      upcoming_confirmed: "à venir, validé", upcoming_pending: "à venir, en attente de validation (SAS)", positive: "tenu, retour positif", neutral: "tenu, neutre",
      negative: "tenu, négatif", no_show: "prospect absent", no_feedback: "passé sans retour du client", rejected: "refusé au SAS", cancelled: "annulé", replaced: "remplacé par un nouveau RDV",
      show_rate: "tenus / (tenus + absents)", feedback_coverage: "RDV passés avec un retour / RDV passés",
    },
    ...(truncated ? { note: `Capped at ${OVERVIEW_CAP} appointments: narrow the period.` } : {}),
  };
}

// ============================================
// EXCLUSIONS — "ne plus contacter" rules that apply to this client
// ============================================

export const searchExclusionsParams = {
  client_id: clientFilterParam,
  include_lifted: zBool.describe("Include rules that were lifted (default false)"),
  ...pageParams,
};
export type SearchExclusionsInput = z.infer<z.ZodObject<typeof searchExclusionsParams>>;

export async function searchExclusions(ctx: Ctx, i: SearchExclusionsInput) {
  const missions = await ctx.db.mission.findMany({ where: missionScope(ctx.p, i.client_id), select: { id: true } });
  // An all-clients key with no narrowing sees every rule; otherwise: the rules of the visible clients and missions + global ones.
  const everything = ctx.p.allClients && !i.client_id && !ctx.p.missionId;
  const clientIds = ctx.p.clientId ? [ctx.p.clientId] : i.client_id ? [i.client_id] : [];
  const rows = await ctx.db.exclusion.findMany({
    where: {
      AND: [
        everything
          ? {}
          : {
              OR: [
                { scope: "CLIENT", scopeId: { in: clientIds } },
                { scope: "MISSION", scopeId: { in: missions.map((m) => m.id) } },
                { scope: "GLOBAL" },
              ],
            },
        i.include_lifted ? {} : { liftedAt: null },
      ],
    },
    select: {
      id: true, target: true, scope: true, label: true, reason: true, source: true, createdAt: true,
      expiresAt: true, liftedAt: true, liftReason: true, appliedCompanies: true, appliedContacts: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...pageArgs(i.limit, i.cursor),
  });
  return toPage(rows, i.limit, (e) => ({
    id: e.id,
    label: e.label,
    target: e.target,
    scope: e.scope,
    reason: trunc(e.reason, 400),
    source: e.source,
    created_at: e.createdAt.toISOString(),
    expires_at: iso(e.expiresAt),
    lifted_at: iso(e.liftedAt),
    lift_reason: e.liftReason,
    applied_to: { companies: e.appliedCompanies, contacts: e.appliedContacts },
  }));
}

// ============================================
// DAILY REPORTS — what the SDRs say from the field (Retour journée)
// ============================================

export const dailyReportsParams = {
  period: zPeriod.optional(),
  date_from: zDate.optional(),
  date_to: zDate.optional(),
  user_id: z.string().max(40).optional(),
  mission_id: z.string().max(40).optional(),
  client_id: clientFilterParam,
  ...pageParams,
};
export type DailyReportsInput = z.infer<z.ZodObject<typeof dailyReportsParams>>;

export async function getDailyReports(ctx: Ctx, raw: DailyReportsInput) {
  const i = withPeriod(raw);
  const range = dateRange(i.date_from, i.date_to);
  const inTenant = { OR: [{ mission: missionScope(ctx.p, i.client_id) }, { missions: { some: { mission: missionScope(ctx.p, i.client_id) } } }] };
  const rows = await ctx.db.sdrDailyFeedback.findMany({
    where: {
      AND: [
        inTenant,
        i.user_id ? { sdrId: i.user_id } : {},
        i.mission_id ? { OR: [{ missionId: i.mission_id }, { missions: { some: { missionId: i.mission_id } } }] } : {},
        range ? { submittedAt: range } : {},
      ],
    },
    select: {
      id: true, reportDate: true, submittedAt: true, score: true, review: true, objections: true, missionComment: true,
      reachability: true, prospectReturns: true, pitchFeeling: true, mainBlocker: true, fieldComment: true,
      sdr: { select: { id: true, name: true } },
      missions: { select: { mission: { select: { id: true, name: true } } } },
    },
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    ...pageArgs(i.limit, i.cursor),
  });
  return toPage(rows, i.limit, (r) => ({
    id: r.id,
    date: r.reportDate ?? r.submittedAt.toISOString().slice(0, 10),
    sdr: ref(r.sdr),
    missions: r.missions.map((m) => ref(m.mission)),
    reachability: r.reachability,
    prospect_returns: r.prospectReturns,
    pitch_feeling: r.pitchFeeling,
    main_blocker: r.mainBlocker,
    field_comment: trunc(r.fieldComment, 1200),
    legacy: r.score !== null || r.review ? { score: r.score, review: trunc(r.review, 600), objections: trunc(r.objections, 600), mission_comment: trunc(r.missionComment, 600) } : null,
  }));
}

// ============================================
// DATA QUALITY — the state of the databases, in numbers
// ============================================

export const dataQualityParams = {
  mission_id: z.string().max(40).optional().describe("Restrict to one mission"),
  client_id: clientFilterParam,
};
export type DataQualityInput = z.infer<z.ZodObject<typeof dataQualityParams>>;

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

export async function getDataQuality(ctx: Ctx, i: DataQualityInput) {
  const co = { AND: [companyScope(ctx.p, i.client_id), i.mission_id ? { list: { missionId: i.mission_id } } : {}] };
  const ct = { AND: [contactScope(ctx.p, i.client_id), i.mission_id ? { company: { list: { missionId: i.mission_id } } } : {}] };
  const dupWhere = (extra: Prisma.Sql) => Prisma.sql`
    WHERE ${clientSql(ctx.p, "m", i.client_id)}
      ${ctx.p.missionId ? Prisma.sql`AND m.id = ${ctx.p.missionId}` : Prisma.empty}
      ${i.mission_id ? Prisma.sql`AND m.id = ${i.mission_id}` : Prisma.empty}
      ${extra}`;

  const [companies, coNoPhone, coNoWebsite, contacts, ctNoPhone, ctNoEmail, ctNoReach, ctExcluded, ctNeverWorked, coStatus, ctStatus, dupCompanies, dupEmails] = await Promise.all([
    ctx.db.company.count({ where: co }),
    ctx.db.company.count({ where: { AND: [co, { phone: null }] } }),
    ctx.db.company.count({ where: { AND: [co, { website: null }] } }),
    ctx.db.contact.count({ where: ct }),
    ctx.db.contact.count({ where: { AND: [ct, { phone: null }] } }),
    ctx.db.contact.count({ where: { AND: [ct, { email: null }] } }),
    ctx.db.contact.count({ where: { AND: [ct, { phone: null, email: null }] } }),
    ctx.db.contact.count({ where: { AND: [ct, { excludedAt: { not: null } }] } }),
    ctx.db.contact.count({ where: { AND: [ct, { actions: { none: {} } }] } }),
    ctx.db.company.groupBy({ by: ["status"], where: co, _count: { _all: true } }),
    ctx.db.contact.groupBy({ by: ["status"], where: ct, _count: { _all: true } }),
    // Same normalised name inside the same mission = the same company loaded twice.
    ctx.db.$queryRaw<Array<{ groups: number; excess: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS groups, COALESCE(SUM(n - 1), 0)::int AS excess FROM (
        SELECT COUNT(*) AS n
        FROM "Company" co JOIN "List" l ON l.id = co."listId" JOIN "Mission" m ON m.id = l."missionId"
        ${dupWhere(Prisma.empty)}
        GROUP BY l."missionId", lower(btrim(regexp_replace(co.name, '\\s+', ' ', 'g')))
        HAVING COUNT(*) > 1) t`),
    ctx.db.$queryRaw<Array<{ groups: number; excess: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS groups, COALESCE(SUM(n - 1), 0)::int AS excess FROM (
        SELECT COUNT(*) AS n
        FROM "Contact" c JOIN "Company" co ON co.id = c."companyId" JOIN "List" l ON l.id = co."listId" JOIN "Mission" m ON m.id = l."missionId"
        ${dupWhere(Prisma.sql`AND c.email IS NOT NULL AND btrim(c.email) <> ''`)}
        GROUP BY lower(btrim(c.email))
        HAVING COUNT(*) > 1) t`),
  ]);

  const dist = (rows: Array<{ status: string; _count: { _all: number } }>) => Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
  return {
    companies: {
      total: companies,
      without_phone: { count: coNoPhone, pct: pct(coNoPhone, companies) },
      without_website: { count: coNoWebsite, pct: pct(coNoWebsite, companies) },
      completeness: dist(coStatus),
      duplicates_same_name_same_mission: { groups: dupCompanies[0]?.groups ?? 0, extra_rows: dupCompanies[0]?.excess ?? 0, pct_of_companies: pct(dupCompanies[0]?.excess ?? 0, companies) },
    },
    contacts: {
      total: contacts,
      without_phone: { count: ctNoPhone, pct: pct(ctNoPhone, contacts) },
      without_email: { count: ctNoEmail, pct: pct(ctNoEmail, contacts) },
      unreachable_no_phone_no_email: { count: ctNoReach, pct: pct(ctNoReach, contacts) },
      excluded_do_not_contact: ctExcluded,
      never_worked: { count: ctNeverWorked, pct: pct(ctNeverWorked, contacts) },
      completeness: dist(ctStatus),
      duplicates_same_email: { groups: dupEmails[0]?.groups ?? 0, extra_rows: dupEmails[0]?.excess ?? 0 },
    },
    reading: "duplicates = rows beyond the first for the same name (companies, per mission) or email (contacts). 'never_worked' = no action ever logged — the pool still to call.",
  };
}
