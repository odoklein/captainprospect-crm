import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  AuthError,
  requireRole,
  successResponse,
  withErrorHandler,
} from "@/lib/api-utils";

export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = await requireRole(["CLIENT", "COMMERCIAL"], request);

  let clientId = session.user.clientId;
  if (session.user.role === "COMMERCIAL") {
    if (!session.user.interlocuteurId) {
      throw new AuthError("Profil commercial introuvable", 403);
    }
    const interlocuteur = await prisma.clientInterlocuteur.findUnique({
      where: { id: session.user.interlocuteurId },
      select: { clientId: true },
    });
    clientId = interlocuteur?.clientId ?? null;
  }

  if (!clientId) {
    return successResponse({ isLaunching: false, missions: [] });
  }

  const now = new Date();
  const missions = await prisma.mission.findMany({
    where: {
      clientId,
      status: "ACTIVE",
      portalVisibleAt: { gt: now },
    },
    select: {
      id: true,
      name: true,
      portalLaunchStartedAt: true,
      portalVisibleAt: true,
    },
    orderBy: { portalVisibleAt: "asc" },
  });

  return successResponse({
    isLaunching: missions.length > 0,
    missions,
    visibleAt: missions[0]?.portalVisibleAt ?? null,
  });
});
