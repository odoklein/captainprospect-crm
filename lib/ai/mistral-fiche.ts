// ============================================
// Shared "fiche RDV" extraction via Mistral AI.
// Used by /api/ai/mistral/rdv-fiche (manual paste flow) and the
// manual audio-upload flow (app/api/actions/[id]/upload-audio).
// ============================================

export interface FicheData {
  contexte: string;
  besoinsProblemes: string;
  solutionsEnPlace: string;
  objectionsFreins: string;
  notesImportantes: string;
}

export type GenerateFicheResult =
  | { ok: true; fiche: FicheData; usage?: unknown }
  | { ok: false; message: string; status: number };

const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || "mistral-small-latest";

function cleanJsonString(str: string): string {
  let cleaned = str.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

function extractFieldText(val: unknown): string {
  if (typeof val === "string") return val.trim();
  if (Array.isArray(val)) {
    return val
      .map((item) => (typeof item === "string" ? `• ${item.trim()}` : JSON.stringify(item)))
      .join("\n");
  }
  if (val && typeof val === "object") {
    return Object.values(val)
      .filter((v) => typeof v === "string" || typeof v === "number")
      .join("\n");
  }
  return "";
}

/**
 * Calls Mistral to extract a structured "fiche RDV" from a raw transcription.
 * Retries on 429/503 (Mistral free tier is rate-limited to ~1 req/sec).
 */
export async function generateFicheFromTranscription(
  transcription: string,
): Promise<GenerateFicheResult> {
  const mistralApiKey = process.env.MISTRAL_API_KEY;
  if (!mistralApiKey) {
    return { ok: false, message: "Clé API Mistral non configurée (MISTRAL_API_KEY)", status: 503 };
  }

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

  let response: Response | null = null;
  let lastErrorText = "";

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }

    try {
      response = await fetch(MISTRAL_API_URL, {
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

      if (response.status !== 429 && response.status !== 503) {
        break;
      }

      lastErrorText = await response.clone().text().catch(() => "");
      console.warn(`Mistral rate limited (${response.status}), retrying attempt ${attempt + 1}/3...`);
    } catch (e) {
      console.warn(`Mistral fetch error attempt ${attempt + 1}/3:`, e);
      if (attempt === 2) throw e;
    }
  }

  if (!response) {
    return { ok: false, message: "Impossible de contacter le service Mistral AI", status: 500 };
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const message =
      (err as { error?: { message?: string } })?.error?.message ||
      (response.status === 429
        ? "Trop de requêtes vers Mistral AI. Veuillez patienter quelques secondes avant de réessayer."
        : "Erreur IA Mistral");
    console.error("Mistral fiche generation error:", response.status, err || lastErrorText);
    return { ok: false, message, status: response.status };
  }

  const result = await response.json();
  const rawContent = result.choices?.[0]?.message?.content?.trim();
  if (!rawContent) return { ok: false, message: "Réponse vide de l'IA Mistral", status: 500 };

  const cleanContent = cleanJsonString(rawContent);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanContent);
  } catch {
    console.error("Failed to parse Mistral response:", cleanContent);
    return { ok: false, message: "Impossible de parser la réponse JSON de Mistral", status: 500 };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, message: "Format de réponse IA invalide", status: 500 };
  }

  const obj = parsed as Record<string, unknown>;
  const fiche: FicheData = {
    contexte: extractFieldText(obj.contexte ?? obj.context),
    besoinsProblemes: extractFieldText(
      obj.besoinsProblemes ?? obj.besoins_problemes ?? obj.besoins ?? obj.problemes,
    ),
    solutionsEnPlace: extractFieldText(
      obj.solutionsEnPlace ?? obj.solutions_en_place ?? obj.solutions,
    ),
    objectionsFreins: extractFieldText(
      obj.objectionsFreins ?? obj.objections_freins ?? obj.objections ?? obj.freins,
    ),
    notesImportantes: extractFieldText(
      obj.notesImportantes ?? obj.notes_importantes ?? obj.notes,
    ),
  };

  return { ok: true, fiche, usage: result.usage };
}
