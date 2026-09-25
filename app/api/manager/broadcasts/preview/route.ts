import { NextRequest } from "next/server";
import { z } from "zod";
import {
  successResponse,
  errorResponse,
  requireRole,
  withErrorHandler,
} from "@/lib/api-utils";
import {
  compileBlocksToHtml,
  substituteVariables,
} from "@/lib/broadcast/compiler";
import { BROADCAST_VARIABLES_REGISTRY } from "@/lib/broadcast/types";

const previewSchema = z.object({
  key: z.string().optional(),
  subject: z.string().default("Aperçu du message"),
  blocks: z.array(z.any()).optional(),
  rawHtml: z.string().optional(),
  accentColor: z.string().default("#4f46e5"),
  useSampleData: z.boolean().default(true),
});

// POST /api/manager/broadcasts/preview
export const POST = withErrorHandler(async (request: NextRequest) => {
  await requireRole(["MANAGER"], request);

  const body = await request.json().catch(() => ({}));
  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message || "Données invalides", 400);
  }

  const { key, subject, blocks, rawHtml, accentColor, useSampleData } = parsed.data;

  let baseHtml = rawHtml;
  if (!baseHtml && blocks && blocks.length > 0) {
    baseHtml = compileBlocksToHtml(subject, blocks, accentColor);
  } else if (!baseHtml) {
    baseHtml = "<p>Aucun contenu</p>";
  }

  let finalSubject = subject;
  let finalHtml = baseHtml;

  if (useSampleData) {
    const registry =
      (key && BROADCAST_VARIABLES_REGISTRY[key]) ||
      BROADCAST_VARIABLES_REGISTRY.general ||
      [];
    const sampleMap: Record<string, string> = {};
    for (const v of registry) {
      sampleMap[v.key] = v.sampleValue;
    }
    // Also include common defaults
    sampleMap.userName = sampleMap.userName || "Jean Dupont";
    sampleMap.contactFirstName = sampleMap.contactFirstName || "Jean";
    sampleMap.contactLastName = sampleMap.contactLastName || "Dupont";
    sampleMap.companyName = sampleMap.companyName || "Acme SAS";
    sampleMap.missionName = sampleMap.missionName || "Prospection SaaS Q3";
    sampleMap.scheduledDate = sampleMap.scheduledDate || "Mardi 14 Octobre 2026";
    sampleMap.scheduledTime = sampleMap.scheduledTime || "14:30";
    sampleMap.meetingType = sampleMap.meetingType || "Visioconférence";
    sampleMap.meetingJoinUrl = sampleMap.meetingJoinUrl || "https://meet.google.com/xyz";
    sampleMap.portalUrl = sampleMap.portalUrl || "https://app.captainprospect.fr/client/portal/meetings";
    sampleMap.resetUrl = sampleMap.resetUrl || "https://app.captainprospect.fr/reset-password?token=example";
    sampleMap.otpCode = sampleMap.otpCode || "729 481";
    sampleMap.expiryMinutes = sampleMap.expiryMinutes || "60";

    finalSubject = substituteVariables(subject, sampleMap);
    finalHtml = substituteVariables(baseHtml, sampleMap);
  }

  return successResponse({
    subject: finalSubject,
    html: finalHtml,
  });
});
