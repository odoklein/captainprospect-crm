import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import {
  requireRole,
  requirePermission,
  withErrorHandler,
  getPaginationParams,
  paginatedResponse,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

// ============================================
// GET /api/hr/audit - Get HR audit logs
// ============================================
export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireRole(["MANAGER"], request);
  await requirePermission("features.hr_view", request);

  const { searchParams } = new URL(request.url);
  const { page, limit, skip } = getPaginationParams(searchParams);
  const userId = searchParams.get("userId");
  const monthRecordId = searchParams.get("monthRecordId");

  const where: Prisma.HrAuditLogWhereInput = {};
  if (userId) where.userId = userId;
  if (monthRecordId) where.monthRecordId = monthRecordId;

  const [logs, total] = await Promise.all([
    prisma.hrAuditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.hrAuditLog.count({ where }),
  ]);

  const actorIds = [...new Set(logs.map((l) => l.actorId))];
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : [];
  const actorNames = new Map(actors.map((a) => [a.id, a.name]));

  return paginatedResponse(
    logs.map((l) => ({ ...l, actorName: actorNames.get(l.actorId) ?? null })),
    total,
    page,
    limit
  );
});
