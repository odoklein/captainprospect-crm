import { NextRequest } from "next/server";
import { z } from "zod";
import {
  successResponse,
  errorResponse,
  requireRole,
  withErrorHandler,
} from "@/lib/api-utils";
import {
  getBroadcastByKey,
  saveBroadcast,
  resetBroadcast,
} from "@/lib/broadcast/service";

const updateBroadcastSchema = z.object({
  name: z.string().optional(),
  subject: z.string().min(1, "Le sujet est obligatoire").max(300),
  blocks: z.array(z.any()).optional(),
  rawHtml: z.string().optional(),
  accentColor: z.string().optional(),
});

// GET /api/manager/broadcasts/[key]
export const GET = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) => {
  await requireRole(["MANAGER"], request);
  const { key } = await params;

  const item = await getBroadcastByKey(key);
  if (!item) {
    return errorResponse("Broadcast non trouvé", 404);
  }

  return successResponse(item);
});

// PUT /api/manager/broadcasts/[key]
export const PUT = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) => {
  await requireRole(["MANAGER"], request);
  const { key } = await params;

  const body = await request.json();
  const parsed = updateBroadcastSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message || "Données invalides", 400);
  }

  const updated = await saveBroadcast(key, parsed.data);
  return successResponse(updated);
});

// DELETE /api/manager/broadcasts/[key]
export const DELETE = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) => {
  await requireRole(["MANAGER"], request);
  const { key } = await params;

  const res = await resetBroadcast(key);
  return successResponse(res);
});
