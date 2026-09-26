import { NextRequest } from "next/server";
import {
  successResponse,
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

  const where: any = {};
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

  return paginatedResponse(logs, total, page, limit);
});
