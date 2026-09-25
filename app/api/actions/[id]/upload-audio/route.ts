// ============================================
// POST /api/actions/[id]/upload-audio
// Manual audio upload for a meeting/RDV: stores the recording,
// transcribes it in French (Mistral Voxtral), then extracts a
// "fiche RDV" from the transcription (Mistral) and saves both on
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
import { generateFicheFromTranscription } from "@/lib/ai/mistral-fiche";

import { audioQueue } from "@/lib/bullmq";

// Practical upload cap for the audio/transcriptions endpoint.
const MAX_AUDIO_SIZE = 100 * 1024 * 1024; // Increased to 100MB

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

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return errorResponse("Aucun fichier audio fourni", 400);
  }

  if (!storageService.isAllowedType(file.type, ["audio/*", "video/*"])) {
    return errorResponse("Type de fichier non autorisé (audio ou vidéo)", 400);
  }
  if (!storageService.isAllowedSize(file.size, MAX_AUDIO_SIZE)) {
    return errorResponse("Fichier trop volumineux (100 Mo max)", 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const { url: recordingUrl } = await storageService.upload(
    buffer,
    { filename: file.name, mimeType: file.type, size: file.size, folder: "call-recordings" },
    session.user.id,
  );

  // Update action to indicate recording is present and processing started
  await prisma.action.update({
    where: { id },
    data: {
      callRecordingUrl: recordingUrl,
      callEnrichmentError: null,
    },
  });

  // Push to queue for background processing
  await audioQueue.add('transcribe-and-fiche', {
    actionId: id,
    recordingUrl,
    fileName: file.name,
    fileType: file.type
  });

  return successResponse({
    callRecordingUrl: recordingUrl,
    processingInBackground: true,
  });
});
