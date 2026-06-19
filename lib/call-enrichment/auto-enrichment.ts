import { prisma } from "@/lib/prisma";
import { getAlloNumbersForAction } from "./enrich-action";
import { callProvider } from "./provider";
import { acquireAlloSlot } from "./allo-semaphore";
import { parsePhoneNumber, isValidPhoneNumber } from "libphonenumber-js";
import { DateTime } from "luxon";

const DEFAULT_COUNTRY = (process.env.PHONE_DEFAULT_COUNTRY ?? "FR") as Parameters<typeof isValidPhoneNumber>[1];
const ENRICHMENT_DAY_TZ = process.env.CALL_ENRICHMENT_DAY_TZ ?? "Europe/Paris";

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    if (isValidPhoneNumber(raw, DEFAULT_COUNTRY)) return parsePhoneNumber(raw, DEFAULT_COUNTRY).format("E.164");
    return null;
  } catch {
    return null;
  }
}

function extractPhoneCandidates(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const text = raw.trim();
  if (!text) return [];
  const chunks = text.match(/(?:\+|00)?\d(?:[\d\s()./-]{6,}\d)?/g) ?? [];
  if (chunks.length === 0) return [text];
  const candidates = new Set<string>();
  for (const chunk of chunks) {
    const cleaned = chunk.replace(/[^\d+]/g, "");
    if (!cleaned) continue;
    candidates.add(cleaned);
    if (cleaned.startsWith("00")) candidates.add(`+${cleaned.slice(2)}`);
    const d = cleaned.replace(/\D/g, "");
    if (d.length === 10 && d.startsWith("0")) { candidates.add(d); candidates.add(`+33${d.slice(1)}`); }
    if (d.length === 11 && d.startsWith("33")) candidates.add(`+${d}`);
  }
  return [...candidates];
}

function normalizePhonesFromField(raw: string | null | undefined): string[] {
  return [...new Set(
    extractPhoneCandidates(raw).map(normalizePhone).filter((p): p is string => p !== null),
  )];
}

function extractAdditionalPhonesFromJson(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const r = data as Record<string, unknown>;
  const candidates: unknown[] = [];
  for (const k of ["additionalPhones", "phones", "phoneNumbers"]) {
    if (k in r) candidates.push(r[k]);
  }
  return candidates
    .flatMap((v) => (Array.isArray(v) ? v : v == null ? [] : [v]))
    .map((v) => (typeof v === "string" ? v : null))
    .filter((v): v is string => !!v);
}

function calendarDayWindow(date: Date) {
  const local = DateTime.fromJSDate(date, { zone: "utc" }).setZone(ENRICHMENT_DAY_TZ);
  return { start: local.startOf("day").toUTC().toJSDate(), end: local.endOf("day").toUTC().toJSDate() };
}

function relativeWindow(date: Date, beforeH: number, afterH: number) {
  return {
    start: new Date(date.getTime() - beforeH * 3_600_000),
    end: new Date(date.getTime() + afterH * 3_600_000),
  };
}

async function generateFicheFromTranscription(transcription: string): Promise<Record<string, string> | null> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey || !transcription.trim()) return null;
  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "mistral-large-latest",
        messages: [
          {
            role: "system",
            content: `Tu es un assistant de compte-rendu commercial (CRM CaptainProspect).\n\nTa tâche: à partir d'une transcription d'échange (appel / RDV), extraire et structurer les informations dans une "fiche RDV".\n\nRetourne UNIQUEMENT un JSON valide avec EXACTEMENT ces clés (toutes présentes, même si vides):\n- "contexte"\n- "besoinsProblemes"\n- "solutionsEnPlace"\n- "objectionsFreins"\n- "notesImportantes"\n\nContraintes:\n- Écris en français.\n- Pas de blabla, pas de Markdown, pas de texte hors JSON.\n- Chaque champ doit être une chaîne de caractères (string).`,
          },
          {
            role: "user",
            content: `Transcription (source brute) :\n\n${transcription.trim()}\n\nExtrais les sections demandées. Si une section est absente, mets une chaîne vide.`,
          },
        ],
        temperature: 0.2,
        max_tokens: 1200,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const o = parsed as Record<string, unknown>;
    return {
      contexte: typeof o.contexte === "string" ? o.contexte.trim() : "",
      besoinsProblemes: typeof o.besoinsProblemes === "string" ? o.besoinsProblemes.trim() : "",
      solutionsEnPlace: typeof o.solutionsEnPlace === "string" ? o.solutionsEnPlace.trim() : "",
      objectionsFreins: typeof o.objectionsFreins === "string" ? o.objectionsFreins.trim() : "",
      notesImportantes: typeof o.notesImportantes === "string" ? o.notesImportantes.trim() : "",
    };
  } catch {
    return null;
  }
}

export interface AutoEnrichResult {
  found: boolean;
  ficheGenerated: boolean;
  callSummary?: string | null;
  callTranscription?: string | null;
  callRecordingUrl?: string | null;
  error?: string;
}

export async function autoEnrichAction(actionId: string): Promise<AutoEnrichResult> {
  // Acquire global slot: prevents simultaneous bookings from all hitting Allo at once.
  // Falls through immediately when ALLO_ENRICH_CONCURRENCY > 1 or on serverless.
  const release = await acquireAlloSlot();
  try {
    const action = await prisma.action.findUnique({
      where: { id: actionId, result: { in: ["MEETING_BOOKED", "MEETING_CANCELLED"] } },
      select: {
        id: true,
        sdrId: true,
        createdAt: true,
        callbackDate: true,
        meetingPhone: true,
        callSummary: true,
        callTranscription: true,
        callRecordingUrl: true,
        contact: { select: { phone: true, additionalPhones: true } },
        company: { select: { phone: true, customData: true } },
      },
    });

    if (!action) return { found: false, ficheGenerated: false, error: "Action not found" };

    // Already enriched — return cached data
    if (action.callRecordingUrl?.trim() || action.callTranscription?.trim() || action.callSummary?.trim()) {
      return {
        found: true,
        ficheGenerated: false,
        callSummary: action.callSummary,
        callTranscription: action.callTranscription,
        callRecordingUrl: action.callRecordingUrl,
      };
    }

    const { alloNumbers } = await getAlloNumbersForAction(action.sdrId);
    if (!alloNumbers.length) return { found: false, ficheGenerated: false, error: "No Allo number configured for SDR or ALLO_NUMBERS" };

    const phones = [
      ...normalizePhonesFromField(action.meetingPhone),
      ...normalizePhonesFromField(action.contact?.phone),
      ...normalizePhonesFromField(action.company?.phone),
      ...extractAdditionalPhonesFromJson(action.contact?.additionalPhones).flatMap((p) => normalizePhonesFromField(p)),
      ...extractAdditionalPhonesFromJson(action.company?.customData).flatMap((p) => normalizePhonesFromField(p)),
    ];
    const dedupedPhones = [...new Set(phones)];

    if (!dedupedPhones.length) return { found: false, ficheGenerated: false, error: "No valid phones" };

    const windows = [
      ...(action.callbackDate
        ? [calendarDayWindow(action.callbackDate), relativeWindow(action.callbackDate, 24, 24)]
        : []),
      calendarDayWindow(action.createdAt),
      relativeWindow(action.createdAt, 24, 24),
    ];

    let matchedRecord: { summary?: string; transcription?: string; recordingUrl?: string } | null = null;
    for (const w of windows) {
      const rec = await callProvider.fetchMatchingCallRecord({
        phones: dedupedPhones,
        alloNumbers,
        sdrId: action.sdrId,
        windowStart: w.start,
        windowEnd: w.end,
      });
      if (rec && (rec.recordingUrl?.trim() || rec.transcription?.trim() || rec.summary?.trim())) {
        matchedRecord = rec;
        break;
      }
    }

    if (!matchedRecord) return { found: false, ficheGenerated: false };

    await prisma.action.update({
      where: { id: actionId },
      data: {
        callSummary: matchedRecord.summary ?? null,
        callTranscription: matchedRecord.transcription ?? null,
        callRecordingUrl: matchedRecord.recordingUrl ?? null,
        callEnrichmentAt: new Date(),
        callEnrichmentError: null,
      },
    });

    let ficheGenerated = false;
    if (matchedRecord.transcription?.trim()) {
      const fiche = await generateFicheFromTranscription(matchedRecord.transcription);
      if (fiche && Object.values(fiche).some((v) => v.trim())) {
        await prisma.action.update({
          where: { id: actionId },
          data: { rdvFiche: fiche, rdvFicheUpdatedAt: new Date() },
        });
        ficheGenerated = true;
      }
    }

    return {
      found: true,
      ficheGenerated,
      callSummary: matchedRecord.summary ?? null,
      callTranscription: matchedRecord.transcription ?? null,
      callRecordingUrl: matchedRecord.recordingUrl ?? null,
    };
  } catch (e) {
    console.error("[auto-enrichment]", e);
    return { found: false, ficheGenerated: false, error: String(e) };
  } finally {
    release();
  }
}
