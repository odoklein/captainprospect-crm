import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  AuthError,
  requireRole,
  successResponse,
  withErrorHandler,
} from "@/lib/api-utils";
import { clientCountableMeetingWhere } from "@/lib/meetings/clientVisibility";
import { NO_SHOW_REPORT_WINDOW_MS } from "@/lib/meetings/noShowWindow";
import {
  compareReminderItems,
  reminderDateRange,
  toReminderItem,
} from "@/lib/meetings/feedbackReminder";
import { portalVisibleMissionWhere } from "@/lib/portal-visibility";

const MAX_ITEMS = 50;

// ============================================
// GET /api/portal/meetings/feedback-pending
// Past confirmed RDVs still waiting for « Mon avis ». A COMMERCIAL gets the
// meetings booked for them, a CLIENT every meeting of their client space.
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = await requireRole(["CLIENT", "COMMERCIAL"], request);
  const empty = { items: [], total: 0, urgentCount: 0 };

  let clientId: string | null = null;
  let interlocuteurId: string | null = null;
  if (session.user.role === "COMMERCIAL") {
    interlocuteurId = session.user.interlocuteurId ?? null;
    if (!interlocuteurId) throw new AuthError("Profil commercial introuvable", 403);
    const interlocuteur = await prisma.clientInterlocuteur.findUnique({
      where: { id: interlocuteurId },
      select: { clientId: true },
    });
    if (!interlocuteur) throw new AuthError("Interlocuteur introuvable", 403);
    clientId = interlocuteur.clientId;
  } else {
    clientId = session.user.clientId ?? null;
  }
  if (!clientId) return successResponse(empty);

  const missions = await prisma.mission.findMany({
    where: { clientId, AND: [portalVisibleMissionWhere()] },
    select: { id: true },
  });
  if (missions.length === 0) return successResponse(empty);

  const now = Date.now();
  const { from, to } = reminderDateRange(now);
  const where: Prisma.ActionWhereInput = {
    AND: [clientCountableMeetingWhere],
    campaign: { missionId: { in: missions.map((m) => m.id) } },
    callbackDate: { gte: from, lte: to },
    meetingFeedback: { is: null },
    ...(interlocuteurId ? { interlocuteurId } : {}),
  };

  const [rows, total, urgentCount] = await Promise.all([
    // Newest first: the open-window meetings are always the most recent ones,
    // so the cap only ever drops old, non-urgent rows.
    prisma.action.findMany({
      where,
      orderBy: { callbackDate: "desc" },
      take: MAX_ITEMS,
      select: {
        id: true,
        callbackDate: true,
        contact: {
          select: { firstName: true, lastName: true, company: { select: { name: true } } },
        },
        company: { select: { name: true } },
        campaign: { select: { mission: { select: { name: true } } } },
        interlocuteur: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.action.count({ where }),
    prisma.action.count({
      where: { AND: [where, { callbackDate: { gte: new Date(now - NO_SHOW_REPORT_WINDOW_MS) } }] },
    }),
  ]);

  const items = rows
    .filter((r) => r.callbackDate)
    .map((r) => {
      const timing = toReminderItem({ callbackDate: r.callbackDate! }, now);
      const contactName = [r.contact?.firstName, r.contact?.lastName].filter(Boolean).join(" ") || null;
      const interlocuteurName =
        [r.interlocuteur?.firstName, r.interlocuteur?.lastName].filter(Boolean).join(" ") || null;
      return {
        actionId: r.id,
        meetingAt: r.callbackDate!.toISOString(),
        contactName,
        companyName: r.contact?.company?.name ?? r.company?.name ?? null,
        missionName: r.campaign.mission.name,
        interlocuteurName,
        noShowDeadline: timing.noShowDeadline.toISOString(),
        windowOpen: timing.windowOpen,
        hoursLeft: timing.hoursLeft,
      };
    })
    .sort(compareReminderItems);

  return successResponse({ items, total, urgentCount });
});
