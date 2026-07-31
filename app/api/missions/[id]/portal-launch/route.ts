import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  NotFoundError,
  requireRole,
  successResponse,
  validateRequest,
  withErrorHandler,
} from "@/lib/api-utils";

const launchSchema = z.object({
  days: z.number().int().min(1).max(30).default(7),
});

export const POST = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  await requireRole(["MANAGER"], request);
  const { id } = await params;
  const { days } = await validateRequest(request, launchSchema);

  const existing = await prisma.mission.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Mission introuvable");

  const startedAt = new Date();
  const visibleAt = new Date(startedAt);
  visibleAt.setDate(visibleAt.getDate() + days);

  const mission = await prisma.mission.update({
    where: { id },
    data: {
      status: "ACTIVE",
      isActive: true,
      portalLaunchStartedAt: startedAt,
      portalVisibleAt: visibleAt,
    },
    select: {
      id: true,
      status: true,
      isActive: true,
      portalLaunchStartedAt: true,
      portalVisibleAt: true,
    },
  });

  return successResponse(mission);
});

export const DELETE = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  await requireRole(["MANAGER"], request);
  const { id } = await params;

  const existing = await prisma.mission.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Mission introuvable");

  const mission = await prisma.mission.update({
    where: { id },
    data: { portalVisibleAt: new Date() },
    select: {
      id: true,
      portalLaunchStartedAt: true,
      portalVisibleAt: true,
    },
  });

  return successResponse(mission);
});
