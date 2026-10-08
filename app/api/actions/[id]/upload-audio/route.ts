// ============================================
// POST /api/actions/[id]/upload-audio
// Manual audio upload for a meeting/RDV: stores the recording,
// transcribes it in French (OpenAI), then extracts a
// "fiche RDV" from the transcription (OpenAI) and saves both on
// the Action. Every failure step is returned explicitly instead of
// leaving fields silently blank.
// ============================================

import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { actionService } from "@/lib/services/ActionService";
import {
  successResponse,
  errorResponse,
  requireRole,
  withErrorHandler,
  NotFoundError,
} from "@/lib/api-utils";
import { storageService } from "@/lib/storage/storage-service";
import { transcribeAudioFr } from "@/lib/ai/mistral-transcribe";
import { generateFicheFromTranscription, type GenerateFicheResult } from "@/lib/ai/mistral-fiche";
import {
  AUDIO_FORMATS_LABEL,
  MAX_AUDIO_SIZE,
  MAX_AUDIO_SIZE_LABEL,
  ensureAudioFilename,
  isAcceptedAudioFile,
  resolveAudioMime,
} from "@/lib/audio-upload";

// Transcription of long recordings can take a few minutes.
export const maxDuration = 300;

async function assertCanUploadActionAudio(
  userId: string,
  role: string,
  action: { sdrId: string; campaign: { missionId: string } },
) {
  if (role === "MANAGER" || role === "BOOKER") return;
  if (role === "SDR" || role === "BUSINESS_DEVELOPER") {
    if (action.sdrId === userId) return;
    const isLead = await actionService.isTeamLeadForMission(userId, action.campaign.missionId);
    if (isLead) return;
  }
  throw new NotFoundError("RDV introuvable");
}

export const POST = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const session = await requireRole(["MANAGER", "SDR", "BUSINESS_DEVELOPER", "BOOKER"], request);
  const { id } = await params;

  const action = await prisma.action.findUnique({
    where: { id },
    select: { id: true, sdrId: true, campaign: { select: { missionId: true } } },
  });
  if (!action) throw new NotFoundError("RDV introuvable");

  await assertCanUploadActionAudio(session.user.id, session.user.role, action);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(
      `Impossible de lire le fichier envoyé (trop volumineux ou transfert interrompu, ${MAX_AUDIO_SIZE_LABEL} max)`,
      400,
    );
  }
  const file = formData.get("file") as File | null;
  if (!file || typeof file === "string") {
    return errorResponse("Aucun fichier audio fourni", 400);
  }
  // When true, only the recording + transcription are saved; the fiche is left untouched.
  const skipFiche = formData.get("skipFiche") === "1";

  if (!isAcceptedAudioFile(file.name, file.type)) {
    return errorResponse(`Type de fichier non autorisé (audio uniquement : ${AUDIO_FORMATS_LABEL})`, 400);
  }
  if (file.size === 0) {
    return errorResponse("Le fichier audio est vide", 400);
  }
  if (!storageService.isAllowedSize(file.size, MAX_AUDIO_SIZE)) {
    return errorResponse(`Fichier audio trop volumineux (${MAX_AUDIO_SIZE_LABEL} max)`, 400);
  }

  const mimeType = resolveAudioMime(file.name, file.type);
  const filename = ensureAudioFilename(file.name, mimeType);
  const buffer = Buffer.from(await file.arrayBuffer());

  // Storage failure must not block transcription: the transcript is the valuable part.
  let recordingUrl: string | null = null;
  let storageError: string | null = null;
  try {
    const stored = await storageService.upload(
      buffer,
      { filename, mimeType, size: file.size, folder: "call-recordings" },
      session.user.id,
    );
    recordingUrl = stored.url;
  } catch (e) {
    console.error("[upload-audio] storage upload failed:", e);
    storageError = "L'enregistrement n'a pas pu être stocké (stockage indisponible). La transcription est tout de même tentée.";
  }

  // Transcription failure: keep the recording, explain why nothing else got filled.
  const transcriptionResult = await transcribeAudioFr(buffer, filename, mimeType);
  if (!transcriptionResult.ok) {
    await prisma.action.update({
      where: { id },
      data: {
        ...(recordingUrl ? { callRecordingUrl: recordingUrl } : {}),
        callEnrichmentAt: new Date(),
        callEnrichmentError: `TRANSCRIPTION_FAILED: ${transcriptionResult.message}`,
      },
    });
    return successResponse({
      callRecordingUrl: recordingUrl,
      callTranscription: null,
      fiche: null,
      transcriptionError: transcriptionResult.message,
      ficheError: null,
      storageError,
    });
  }

  const transcription = transcriptionResult.text;
  let ficheResult: GenerateFicheResult | null = null;
  if (!skipFiche) {
    try {
      ficheResult = await generateFicheFromTranscription(transcription);
    } catch (e) {
      console.error("[upload-audio] fiche generation failed:", e);
      ficheResult = { ok: false, message: "Impossible de contacter le service OpenAI pour la fiche", status: 502 };
    }
  }

  const now = new Date();
  await prisma.action.update({
    where: { id },
    data: {
      ...(recordingUrl ? { callRecordingUrl: recordingUrl } : {}),
      callTranscription: transcription,
      callEnrichmentAt: now,
      callEnrichmentError: null,
      ...(ficheResult?.ok
        ? { rdvFiche: ficheResult.fiche as unknown as Prisma.InputJsonValue, rdvFicheUpdatedAt: now }
        : {}),
    },
  });

  return successResponse({
    callRecordingUrl: recordingUrl,
    callTranscription: transcription,
    fiche: ficheResult?.ok ? ficheResult.fiche : null,
    transcriptionError: null,
    ficheError: ficheResult && !ficheResult.ok ? ficheResult.message : null,
    storageError,
  });
});
