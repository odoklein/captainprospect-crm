// ============================================
// POST /api/ai/mistral/rdv-fiche
// Extract structured "fiche RDV" sections from a transcription.
// Uses Mistral AI (mistral-small-latest) directly (no Google AI).
// ============================================

import { NextRequest } from "next/server";
import {
  successResponse,
  errorResponse,
  requireAuth,
  withErrorHandler,
  validateRequest,
} from "@/lib/api-utils";
import { generateFicheFromTranscription } from "@/lib/ai/mistral-fiche";
import { z } from "zod";

const schema = z.object({
  transcription: z
    .string()
    .min(5, "Transcription requise (minimum 5 caractères)")
    .max(120_000, "Transcription trop longue"),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  await requireAuth(request);

  const { transcription } = await validateRequest(request, schema);

  const result = await generateFicheFromTranscription(transcription);
  if (!result.ok) {
    return errorResponse(result.message, result.status);
  }

  return successResponse({ fiche: result.fiche, usage: result.usage });
});
