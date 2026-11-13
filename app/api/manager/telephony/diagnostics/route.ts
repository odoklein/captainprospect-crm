import { NextRequest } from "next/server";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { integrationKey } from "@/lib/integrations/keys";
import { callModelChoice } from "@/lib/ai/call-model";
import { runtimeAppUrl } from "@/lib/runtime-config/env";
import { getTwilioConfig, missingTwilioKeys } from "@/lib/telephony/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/manager/telephony/diagnostics — why calls, recordings, transcripts
 * or summaries are missing: each prerequisite checked, then the last calls with
 * what Twilio actually delivered for them. Never returns a secret.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    const config = getTwilioConfig();
    const appUrl = runtimeAppUrl() ?? null;
    const ai = Boolean(integrationKey("OPENAI_API_KEY"));
    const whisper = Boolean(process.env.WHISPER_API_URL);
    const callModel = callModelChoice();
    const assigned = await prisma.user.count({ where: { isActive: true, twilioCallerId: { not: null } } });

    const checks = [
        {
            id: "keys",
            label: "Clés Twilio",
            ok: missingTwilioKeys().length === 0,
            detail: missingTwilioKeys().length ? `Manquantes : ${missingTwilioKeys().join(", ")}` : "Les 5 clés sont présentes",
        },
        {
            id: "callerId",
            label: "Numéros attribués",
            ok: assigned > 0,
            detail: assigned
                ? `${assigned} personne${assigned > 1 ? "s" : ""} avec un numéro Twilio (Paramètres → Téléphonie)`
                : "Aucun numéro attribué : tout le monde appelle encore via Allo (Paramètres → Téléphonie)",
        },
        {
            id: "appUrl",
            label: "URL publique (webhooks)",
            ok: Boolean(appUrl?.startsWith("https://")),
            detail: appUrl ? `${appUrl}/api/webhooks/twilio/…` : "APP_URL / NEXTAUTH_URL absente : Twilio ne peut pas joindre le CRM",
        },
        {
            id: "recording",
            label: "Enregistrement des appels",
            ok: Boolean(config?.record),
            detail: config?.record ? "Activé (TWILIO_RECORD_CALLS=1)" : "Désactivé : sans enregistrement, pas de transcription de secours",
        },
        {
            id: "liveTranscription",
            label: "Transcription en direct",
            ok: Boolean(config?.transcription),
            detail: config?.transcription
                ? `Activée : ${config.transcription.engine} / ${config.transcription.model} / ${config.transcription.language}`
                : "Désactivée (TWILIO_TRANSCRIBE_CALLS=1 pour l'activer)",
        },
        {
            id: "ai",
            label: "Transcription de l'enregistrement",
            ok: ai || whisper,
            detail: whisper ? "Service Whisper local" : ai ? "OpenAI (DeepSeek ne transcrit pas l'audio)" : "OPENAI_API_KEY ou WHISPER_API_URL absente",
        },
        {
            id: "callModel",
            label: "IA des appels (résumé, résultat proposé, brief)",
            ok: !callModel.reason || callModel.model !== callModel.requested,
            detail: callModel.reason
                ? callModel.model !== callModel.requested
                    ? `${callModel.requested} demandé, ${callModel.model} utilisé : ${callModel.reason}`
                    : `${callModel.requested} inutilisable : ${callModel.reason}`
                : `${callModel.model}${callModel.fallback ? ` (relais : ${callModel.fallback})` : ""} · réglable dans Intégrations (CALL_AI_MODEL)`,
        },
    ];

    const calls = await prisma.telephonyCall.findMany({
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
            id: true, startedAt: true, status: true, answeredAt: true, durationSec: true, parentCallSid: true,
            recordingUrl: true, aiSummaryStatus: true, aiSummaryError: true, errorCode: true, actionId: true,
            sdr: { select: { name: true } },
            _count: { select: { transcript: true } },
        },
    });

    return successResponse({
        checks,
        calls: calls.map((c) => ({
            id: c.id,
            at: c.startedAt.toISOString(),
            sdr: c.sdr.name,
            status: c.status,
            reachedTwilio: Boolean(c.parentCallSid),
            answered: Boolean(c.answeredAt),
            durationSec: c.durationSec,
            recording: Boolean(c.recordingUrl),
            transcriptLines: c._count.transcript,
            summary: c.aiSummaryStatus,
            summaryNote: c.aiSummaryError,
            errorCode: c.errorCode,
            qualified: Boolean(c.actionId),
        })),
    });
});
