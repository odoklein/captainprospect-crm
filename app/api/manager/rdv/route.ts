import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  successResponse,
  requireRole,
  withErrorHandler,
  getPaginationParams,
} from "@/lib/api-utils";
import { Prisma } from "@prisma/client";
import { createClientPortalNotification, sendNewRdvEmailNotification } from "@/lib/notifications";
import { filterRdvList } from "@/lib/utils/meetingFilters";

export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireRole(["MANAGER"], request);
  const sp = new URL(request.url).searchParams;

  const search = sp.get("search")?.trim() ?? "";
  const clientIds = sp.getAll("clientIds[]");
  const missionIds = sp.getAll("missionIds[]");
  const sdrIds = sp.getAll("sdrIds[]");
  const dateFrom = sp.get("dateFrom");
  const dateTo = sp.get("dateTo");
  const statuses = sp.getAll("status[]");
  const meetingTypes = sp.getAll("meetingType[]");
  const meetingCategories = sp.getAll("meetingCategory[]");
  const outcomes = sp.getAll("outcome[]");
  const confirmationStatuses = sp.getAll("confirmationStatus[]");
  const channels = sp.getAll("channel[]");
  const hasAudioParam = sp.get("hasAudio");
  const hasFeedbackParam = sp.get("hasFeedback");
  const sortByParam = sp.get("sortBy") ?? "createdAt";
  const sortDirParam = (sp.get("sortDir") ?? "desc") as "asc" | "desc";
  const sortDir: "asc" | "desc" = sortDirParam === "asc" ? "asc" : "desc";

  const { page, limit, skip } = getPaginationParams(sp);

  const now = new Date();

  // SAS RDV: auto-confirm booked meetings after 24h without confirmation
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const toAutoConfirm = await prisma.action.findMany({
    where: {
      result: "MEETING_BOOKED",
      confirmationStatus: "PENDING",
      createdAt: { lt: cutoff },
    },
    select: {
      id: true,
      callbackDate: true,
      interlocuteurId: true,
      meetingType: true,
      meetingJoinUrl: true,
      meetingAddress: true,
      meetingPhone: true,
      contact: { select: { firstName: true, lastName: true, company: { select: { name: true } } } },
      company: { select: { name: true } },
      campaign: { select: { mission: { select: { id: true, name: true, clientId: true } } } },
    },
    take: 500,
  });

  if (toAutoConfirm.length > 0) {
    await prisma.action.updateMany({
      where: { id: { in: toAutoConfirm.map((m) => m.id) } },
      data: {
        confirmationStatus: "CONFIRMED",
        confirmationUpdatedAt: now,
        confirmedAt: now,
      },
    });

    // Background notification dispatch to prevent blocking API response
    void (async () => {
      try {
        await Promise.allSettled(
          toAutoConfirm
            .filter((m) => !!m.campaign?.mission?.clientId)
            .map(async (m) => {
              const clientId = m.campaign!.mission!.clientId!;
              await createClientPortalNotification(clientId, {
                title: "Nouveau RDV confirmé",
                message: "Un rendez-vous a été confirmé pour une de vos missions.",
                type: "success",
                link: "/client/portal/meetings",
              });

              void sendNewRdvEmailNotification(clientId, {
                contactFirstName: m.contact?.firstName ?? null,
                contactLastName: m.contact?.lastName ?? null,
                companyName: m.company?.name ?? m.contact?.company?.name ?? null,
                missionName: m.campaign?.mission?.name ?? null,
                scheduledAt: m.callbackDate ?? null,
                meetingChannel: (m.channel as any) ?? "CALL",
                meetingType: (m.meetingType as any) ?? null,
                meetingJoinUrl: m.meetingJoinUrl ?? null,
                meetingAddress: m.meetingAddress ?? null,
                meetingPhone: m.meetingPhone ?? null,
                interlocuteurId: m.interlocuteurId ?? undefined,
              });
            })
        );
      } catch (err) {
        console.error("Auto-confirm background notification error:", err);
      }
    })();
  }

  const where: Prisma.ActionWhereInput = {
    result: { in: ["MEETING_BOOKED", "MEETING_CANCELLED"] },
  };

  const andClauses: Prisma.ActionWhereInput[] = [];

  if (search) {
    andClauses.push({
      OR: [
        { contact: { firstName: { contains: search, mode: "insensitive" } } },
        { contact: { lastName: { contains: search, mode: "insensitive" } } },
        { contact: { email: { contains: search, mode: "insensitive" } } },
        { contact: { company: { name: { contains: search, mode: "insensitive" } } } },
        { company: { name: { contains: search, mode: "insensitive" } } },
        { campaign: { mission: { client: { name: { contains: search, mode: "insensitive" } } } } },
        { campaign: { mission: { name: { contains: search, mode: "insensitive" } } } },
        { campaign: { name: { contains: search, mode: "insensitive" } } },
        { sdr: { name: { contains: search, mode: "insensitive" } } },
      ],
    });
  }

  if (clientIds.length > 0) {
    andClauses.push({ campaign: { mission: { clientId: { in: clientIds } } } });
  }
  if (missionIds.length > 0) {
    andClauses.push({ campaign: { missionId: { in: missionIds } } });
  }
  if (sdrIds.length > 0) {
    andClauses.push({ sdrId: { in: sdrIds } });
  }
  if (dateFrom) {
    andClauses.push({ createdAt: { gte: new Date(dateFrom) } });
  }
  if (dateTo) {
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
    andClauses.push({ createdAt: { lte: end } });
  }

  if (statuses.length > 0) {
    const statusOr: Prisma.ActionWhereInput[] = [];
    for (const s of statuses) {
      if (s === "upcoming") statusOr.push({ result: "MEETING_BOOKED", callbackDate: { gte: now } });
      if (s === "past") statusOr.push({ result: "MEETING_BOOKED", callbackDate: { lt: now } });
      if (s === "cancelled") statusOr.push({ result: "MEETING_CANCELLED" });
    }
    if (statusOr.length > 0) andClauses.push({ OR: statusOr });
  }

  if (meetingTypes.length > 0) {
    andClauses.push({ meetingType: { in: meetingTypes } });
  }

  if (meetingCategories.length > 0) {
    andClauses.push({ meetingCategory: { in: meetingCategories } });
  }

  if (outcomes.length > 0) {
    andClauses.push({ meetingFeedback: { outcome: { in: outcomes as any[] } } });
  }

  if (confirmationStatuses.length > 0) {
    andClauses.push({ confirmationStatus: { in: confirmationStatuses as any[] } });
  }

  if (channels.length > 0) {
    andClauses.push({ channel: { in: channels as any[] } });
  }

  if (hasAudioParam === "1") {
    andClauses.push({ callRecordingUrl: { not: null } });
  } else if (hasAudioParam === "0") {
    andClauses.push({ callRecordingUrl: null });
  }

  if (hasFeedbackParam === "1") {
    andClauses.push({ meetingFeedback: { isNot: null } });
  } else if (hasFeedbackParam === "0") {
    andClauses.push({ meetingFeedback: null });
  }

  if (andClauses.length > 0) where.AND = andClauses;

  const include = {
    // Contact + its company (classic flow)
    contact: {
      include: {
        company: {
          include: { list: { include: { mission: true } } },
        },
      },
    },
    // Company directly linked to the meeting (company-only meetings)
    company: {
      include: { list: { include: { mission: true } } },
    },
    sdr: { select: { id: true, name: true, email: true } },
    campaign: {
      include: {
        mission: {
          include: { client: { select: { id: true, name: true, industry: true } } },
        },
      },
    },
    meetingFeedback: true,
    interlocuteur: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        title: true,
      },
    },
  } satisfies Prisma.ActionInclude;

  // Fetch enough rows so that after excluding RDV cancelled with <10 min notice we can fill this page
  const fetchTake = Math.min(skip + limit + 200, 1000);
  // Build dynamic orderBy from sortByParam
  const orderBy: Prisma.ActionOrderByWithRelationInput[] = (() => {
    switch (sortByParam) {
      case "callbackDate":
        return [{ callbackDate: sortDir }, { createdAt: "desc" as const }];
      case "duration":
        return [{ duration: sortDir }, { createdAt: "desc" as const }];
      case "contactName":
        return [{ contact: { lastName: sortDir } }, { contact: { firstName: sortDir } }, { createdAt: "desc" as const }];
      case "companyName":
        return [{ company: { name: sortDir } }, { contact: { company: { name: sortDir } } }, { createdAt: "desc" as const }];
      case "sdrName":
        return [{ sdr: { name: sortDir } }, { createdAt: "desc" as const }];
      default:
        return [{ createdAt: sortDir }];
    }
  })();

  const [rawMeetings, totalCount] = await Promise.all([
    prisma.action.findMany({
      where,
      include,
      orderBy,
      skip: 0,
      take: fetchTake,
    }),
    prisma.action.count({ where }),
  ]);

  const meetingsFiltered = filterRdvList(rawMeetings);
  const meetings = meetingsFiltered.slice(skip, skip + limit);

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Aggregates MUST match the current filters (same `where` as the list).
  // We combine with extra constraints via AND to avoid losing existing callbackDate ranges.
  const aggBase = where;

  const [
    upcomingCount,
    pastCount,
    cancelledCount,
    weekCount,
    monthCount,
    sdrCounts,
    confirmedBookedCount,
    totalBookedCount,
    pendingCount,
  ] = await Promise.all([
    prisma.action.count({
      where: { AND: [aggBase, { result: "MEETING_BOOKED" }, { callbackDate: { gte: now } }] },
    }),
    prisma.action.count({
      where: { AND: [aggBase, { result: "MEETING_BOOKED" }, { callbackDate: { lt: now } }] },
    }),
    prisma.action.count({
      where: { AND: [aggBase, { result: "MEETING_CANCELLED" }] },
    }),
    prisma.action.count({
      where: { AND: [aggBase, { result: "MEETING_BOOKED" }, { callbackDate: { gte: weekStart } }] },
    }),
    prisma.action.count({
      where: { AND: [aggBase, { result: "MEETING_BOOKED" }, { callbackDate: { gte: monthStart } }] },
    }),
    prisma.action.groupBy({
      by: ["sdrId"],
      where: { AND: [aggBase, { result: "MEETING_BOOKED" }] },
      _count: true,
    }),
    prisma.action.count({
      where: { AND: [aggBase, { result: "MEETING_BOOKED" }, { confirmationStatus: "CONFIRMED" as any }] },
    }),
    prisma.action.count({
      where: { AND: [aggBase, { result: "MEETING_BOOKED" }] },
    }),
    prisma.action.count({
      where: { AND: [aggBase, { result: "MEETING_BOOKED" }, { confirmationStatus: "PENDING" as any }] },
    }),
  ]);

  const avgPerSdr = sdrCounts.length > 0 ? Math.round(totalBookedCount / sdrCounts.length) : 0;
  // SAS RDV conversion = % of booked meetings that are confirmed
  const conversionRate =
    totalBookedCount > 0 ? Math.round((confirmedBookedCount / totalBookedCount) * 100) : 0;

  const data = meetings.map((m) => ({
    id: m.id,
    result: m.result,
    confirmationStatus: m.confirmationStatus,
    confirmationUpdatedAt: m.confirmationUpdatedAt,
    confirmedAt: m.confirmedAt,
    confirmedById: m.confirmedById,
    rdvFiche: m.rdvFiche,
    rdvFicheUpdatedAt: m.rdvFicheUpdatedAt,
    callbackDate: m.callbackDate,
    channel: m.channel ?? "CALL",
    meetingType: m.meetingType,
    meetingCategory: m.meetingCategory,
    meetingAddress: m.meetingAddress,
    meetingJoinUrl: m.meetingJoinUrl,
    meetingPhone: m.meetingPhone,
    note: m.note,
    managerNote: m.note,
    cancellationReason: m.cancellationReason,
    createdAt: m.createdAt,
    duration: m.duration,
    callSummary: m.callSummary,
    callTranscription: m.callTranscription,
    callRecordingUrl: m.callRecordingUrl,
    contact: m.contact
      ? {
          id: m.contact.id,
          firstName: m.contact.firstName,
          lastName: m.contact.lastName,
          title: m.contact.title,
          email: m.contact.email,
          phone: m.contact.phone,
          linkedin: m.contact.linkedin,
          customData: m.contact.customData,
        }
      : null,
    // Prefer direct company link (companyId) but fall back to contact.company
    company: m.company
      ? {
          id: m.company.id,
          name: m.company.name,
          industry: m.company.industry,
          country: m.company.country,
          size: m.company.size,
          website: m.company.website,
          phone: m.company.phone ?? null,
        }
      : m.contact?.company
      ? {
          id: m.contact.company.id,
          name: m.contact.company.name,
          industry: m.contact.company.industry,
          country: m.contact.company.country,
          size: m.contact.company.size,
          website: m.contact.company.website,
          phone: m.contact.company.phone ?? null,
        }
      : null,
    campaign: { id: m.campaign.id, name: m.campaign.name },
    mission: { id: m.campaign.mission.id, name: m.campaign.mission.name },
    client: m.campaign.mission.client,
    sdr: m.sdr,
    interlocuteur: m.interlocuteur
      ? {
          id: m.interlocuteur.id,
          firstName: m.interlocuteur.firstName,
          lastName: m.interlocuteur.lastName,
          title: m.interlocuteur.title,
        }
      : null,
    feedback: m.meetingFeedback
      ? {
          outcome: m.meetingFeedback.outcome,
          recontact: m.meetingFeedback.recontactRequested,
          note: m.meetingFeedback.clientNote,
        }
      : null,
  }));

  return successResponse({
    meetings: data,
    pagination: {
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      hasMore: page * limit < totalCount,
    },
    aggregates: {
      totalCount,
      pendingCount,
      upcomingCount,
      pastCount,
      cancelledCount,
      avgPerSdr,
      conversionRate,
      meetingsThisWeek: weekCount,
      meetingsThisMonth: monthCount,
    },
  });
});
