// ============================================
// POST /api/ai/openai/rdv-fiche
// Extract structured "fiche RDV" sections from a transcription.
// ============================================

import { NextRequest } from "next/server";
import {
  successResponse,
  errorResponse,
  requireRole,
  withErrorHandler,
  validateRequest,
} from "@/lib/api-utils";
import { z } from "zod";

const schema = z.object({
  transcription: z.string().min(20, "Transcription requise").max(120_000, "Transcription trop longue"),
});

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o";

export const POST = withErrorHandler(async (request: NextRequest) => {
  await requireAuth(request);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return errorResponse("OPENAI_API_KEY non configurée", 503);

  const { transcription } = await validateRequest(request, schema);

  const systemPrompt = `Tu es un assistant de compte-rendu commercial (CRM CaptainProspect).

Ta tâche: à partir d'une transcription d'échange (appel / RDV), extraire et structurer les informations dans une "fiche RDV".

Retourne UNIQUEMENT un JSON valide avec EXACTEMENT ces clés (toutes présentes, même si vides):
- "contexte"
- "besoinsProblemes"
- "solutionsEnPlace"
- "objectionsFreins"
- "notesImportantes"

Contraintes:
- Écris en français.
- Pas de blabla, pas de Markdown, pas de texte hors JSON.
- Chaque champ doit être une chaîne de caractères (string).`;

  const userPrompt = `Transcription (source brute) :

${transcription.trim()}

Extrais les sections demandées. Si une section est absente, mets une chaîne vide.`;

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 1200,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.error("OpenAI rdv-fiche error:", err);
    return errorResponse(
      (err as { error?: { message?: string } })?.error?.message || "Erreur OpenAI",
      response.status
    );
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content?.trim();
  if (!content) return errorResponse("Réponse vide d'OpenAI", 500);

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error("Failed to parse OpenAI response:", content);
    return errorResponse("Impossible de parser la réponse d'OpenAI", 500);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return errorResponse("Réponse OpenAI invalide", 500);
  }

  const obj = parsed as Record<string, unknown>;
  const fiche = {
    contexte: typeof obj.contexte === "string" ? obj.contexte.trim() : "",
    besoinsProblemes: typeof obj.besoinsProblemes === "string" ? obj.besoinsProblemes.trim() : "",
    solutionsEnPlace: typeof obj.solutionsEnPlace === "string" ? obj.solutionsEnPlace.trim() : "",
    objectionsFreins: typeof obj.objectionsFreins === "string" ? obj.objectionsFreins.trim() : "",
    notesImportantes: typeof obj.notesImportantes === "string" ? obj.notesImportantes.trim() : "",
  };

  return successResponse({ fiche, usage: result.usage });
});
