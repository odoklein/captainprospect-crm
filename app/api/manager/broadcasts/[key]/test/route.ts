import { NextRequest } from "next/server";
import { z } from "zod";
import {
  successResponse,
  errorResponse,
  requireRole,
  withErrorHandler,
} from "@/lib/api-utils";
import { sendTestBroadcast } from "@/lib/broadcast/service";

const testSchema = z.object({
  targetEmail: z.string().email().optional(),
  subject: z.string().optional(),
  blocks: z.array(z.any()).optional(),
  rawHtml: z.string().optional(),
  accentColor: z.string().optional(),
});

// POST /api/manager/broadcasts/[key]/test
export const POST = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) => {
  const session = await requireRole(["MANAGER"], request);
  const { key } = await params;

  const body = await request.json().catch(() => ({}));
  const parsed = testSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message || "Données invalides", 400);
  }

  // Target email defaults to current logged-in manager's email
  const destinationEmail = parsed.data.targetEmail || session.user.email;
  if (!destinationEmail) {
    return errorResponse("Aucune adresse email de destination renseignée", 400);
  }

  const result = await sendTestBroadcast(key, destinationEmail, parsed.data);
  if (!result.ok) {
    return errorResponse(result.message, 500);
  }

  return successResponse({
    sent: true,
    to: destinationEmail,
    message: result.message,
  });
});
