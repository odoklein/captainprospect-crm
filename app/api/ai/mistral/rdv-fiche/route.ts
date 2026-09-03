// ============================================
// POST /api/ai/mistral/rdv-fiche
// Extract structured "fiche RDV" sections from a transcription.
// Uses Gemini 2.0 Flash (free) with fallback to Mistral.
// ============================================

import { NextRequest } from "next/server";
import {
  successResponse,
  errorResponse,
  requireAuth,
  withErrorHandler,
  validateRequest,
} from "@/lib/api-utils";
import { z } from "zod";

const schema = z.object({
  transcription: z.string().min(20, "Transcription requise (minimum 20 caractères)").max(120_000, "Transcription trop longue"),
});

const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || "mistral-small-latest";

export const POST = withErrorHandler(async (request: NextRequest) => {
  await requireAuth(request);

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

  const geminiApiKey = process.env.GEMINI_API_KEY;
  const mistralApiKey = process.env.MISTRAL_API_KEY;

  // 1. Try Gemini 2.0 Flash first (free model)
  if (geminiApiKey) {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 2048,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      if (geminiRes.ok) {
        const data = await geminiRes.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (content) {
          const parsed = JSON.parse(content);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            const obj = parsed as Record<string, unknown>;
            const fiche = {
              contexte: typeof obj.contexte === "string" ? obj.contexte.trim() : "",
              besoinsProblemes: typeof obj.besoinsProblemes === "string" ? obj.besoinsProblemes.trim() : "",
              solutionsEnPlace: typeof obj.solutionsEnPlace === "string" ? obj.solutionsEnPlace.trim() : "",
              objectionsFreins: typeof obj.objectionsFreins === "string" ? obj.objectionsFreins.trim() : "",
              notesImportantes: typeof obj.notesImportantes === "string" ? obj.notesImportantes.trim() : "",
            };
            return successResponse({ fiche });
          }
        }
      } else {
        console.warn("Gemini rdv-fiche error, trying Mistral fallback:", await geminiRes.text());
      }
    } catch (e) {
      console.warn("Gemini rdv-fiche request failed, trying Mistral fallback:", e);
    }
  }

  // 2. Fallback to Mistral
  if (!mistralApiKey) {
    return errorResponse("Aucune clé API IA configurée (GEMINI_API_KEY ou MISTRAL_API_KEY)", 503);
  }

  const response = await fetch(MISTRAL_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${mistralApiKey}`,
    },
    body: JSON.stringify({
      model: MISTRAL_MODEL,
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
    console.error("Mistral rdv-fiche error:", err);
    return errorResponse(
      (err as { error?: { message?: string } })?.error?.message || "Erreur IA Mistral",
      response.status
    );
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content?.trim();
  if (!content) return errorResponse("Réponse vide de l'IA", 500);

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error("Failed to parse IA response:", content);
    return errorResponse("Impossible de parser la réponse de l'IA", 500);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return errorResponse("Réponse IA invalide", 500);
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
