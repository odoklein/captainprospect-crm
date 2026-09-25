import { NextRequest } from "next/server";
import { z } from "zod";
import {
  successResponse,
  errorResponse,
  requireRole,
  withErrorHandler,
} from "@/lib/api-utils";
import { getAllBroadcasts, saveBroadcast } from "@/lib/broadcast/service";

const createBroadcastSchema = z.object({
  key: z.string().min(2).max(100),
  name: z.string().min(2).max(150),
  subject: z.string().min(1).max(300),
  blocks: z.array(z.any()).optional(),
  rawHtml: z.string().optional(),
  accentColor: z.string().optional(),
});

// GET /api/manager/broadcasts
export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireRole(["MANAGER"], request);

  const items = await getAllBroadcasts();
  return successResponse({
    items,
    total: items.length,
  });
});

// POST /api/manager/broadcasts (create new custom broadcast)
export const POST = withErrorHandler(async (request: NextRequest) => {
  await requireRole(["MANAGER"], request);

  const body = await request.json();
  const parsed = createBroadcastSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message || "Données invalides", 400);
  }

  const { key, name, subject, blocks, rawHtml, accentColor } = parsed.data;

  // Key must be unique or custom-prefixed
  const normalizedKey = key.startsWith("custom_") ? key : `custom_${key}`;

  const record = await saveBroadcast(normalizedKey, {
    name,
    subject,
    blocks,
    rawHtml,
    accentColor,
  });

  return successResponse(record, 201);
});
