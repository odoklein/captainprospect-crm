import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const schema = z.object({
  callId:        z.string().min(1),
  summary:       z.string().optional().nullable(),
  transcription: z.string().optional().nullable(),
  recordingUrl:  z.string().optional().nullable(),
  duration:      z.number().optional().nullable(),
});

// PATCH /api/actions/[id]/enrich-call
// Saves manually selected Allo call data onto an action.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Données invalides' }, { status: 400 });
  }

  // Verify action belongs to this SDR
  const action = await prisma.action.findUnique({
    where: { id },
    select: { sdrId: true },
  });
  if (!action) {
    return NextResponse.json({ success: false, error: 'Action introuvable' }, { status: 404 });
  }
  if (action.sdrId !== session.user.id) {
    return NextResponse.json({ success: false, error: 'Interdit' }, { status: 403 });
  }

  const { summary, transcription, recordingUrl, duration } = parsed.data;

  await prisma.action.update({
    where: { id },
    data: {
      callSummary:         summary       ?? null,
      callTranscription:   transcription ?? null,
      callRecordingUrl:    recordingUrl  ?? null,
      duration:            duration != null ? Math.round(duration) : undefined,
      callEnrichmentAt:    new Date(),
      callEnrichmentError: null,
    },
  });

  return NextResponse.json({ success: true });
}
