import type { Prisma } from "@prisma/client";

export function portalVisibleMissionWhere(now = new Date()): Prisma.MissionWhereInput {
  return {
    OR: [
      { portalVisibleAt: null },
      { portalVisibleAt: { lte: now } },
    ],
  };
}

export function isMissionInPortalLaunch(
  mission: { portalVisibleAt: Date | string | null },
  now = new Date()
): boolean {
  return Boolean(
    mission.portalVisibleAt &&
    new Date(mission.portalVisibleAt).getTime() > now.getTime()
  );
}
