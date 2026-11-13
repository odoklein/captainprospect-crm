import { NextRequest } from "next/server";
import { acceptVoiceRequest } from "@/lib/telephony/service";
import { callbackBase, dialTwiml, rejectTwiml, twiml } from "@/lib/telephony/twilio";
import { gateTwilioWebhook } from "@/lib/telephony/webhook";
import { userIdFromIdentity } from "@/lib/telephony/twilio";
import { prisma } from "@/lib/prisma";
import { claimAgentLeg } from "@/lib/dialer/store";
import { conferenceCallbackUrl, dialerAvailability } from "@/lib/dialer/runtime";
import { agentConferenceTwiml } from "@/lib/dialer/twiml";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/twilio/voice — the TwiML App's Voice URL.
 * The browser placed a call with { callId }; dial the number stored on that row.
 */
export async function POST(req: NextRequest) {
    const gate = await gateTwilioWebhook(req, "voice");
    if (!gate.ok) return gate.response;
    const { config, params } = gate.ctx;

    try {
        // Parallel dialer: the SDR's browser joins its session's conference instead of dialling a number.
        if (params.dialerSessionId) return await agentLeg(params);

        const decision = await acceptVoiceRequest(params);
        if (!decision.ok) {
            console.warn(`[webhooks/twilio/voice] refused: ${decision.reason}`);
            return twiml(rejectTwiml(decision.message));
        }

        const base = callbackBase(req);
        const q = `callId=${encodeURIComponent(decision.call.id)}`;
        return twiml(
            dialTwiml({
                to: decision.call.toNumber,
                callerId: decision.call.fromNumber,
                record: config.record,
                transcription: config.transcription,
                urls: {
                    transcription: `${base}/api/webhooks/twilio/transcription?${q}`,
                    dialAction: `${base}/api/webhooks/twilio/status?leg=dial&${q}`,
                    legStatus: `${base}/api/webhooks/twilio/status?leg=child&${q}`,
                    recording: `${base}/api/webhooks/twilio/recording?${q}`,
                    notice: `${base}/api/webhooks/twilio/notice`,
                },
            }),
        );
    } catch (error) {
        console.error("[webhooks/twilio/voice] failed", error);
        return twiml(rejectTwiml("Une erreur technique empêche l'appel."));
    }
}

async function agentLeg(params: Record<string, string>): Promise<Response> {
    const availability = await dialerAvailability();
    if (!availability.ok) return twiml(rejectTwiml("Le mode parallèle n'est pas disponible."));
    const userId = userIdFromIdentity(params.From);
    const session = await prisma.dialerSession.findUnique({ where: { id: params.dialerSessionId } });
    if (!session || !userId || session.sdrId !== userId || session.status === "ENDED" || !params.CallSid) {
        console.warn(`[webhooks/twilio/voice] dialer leg refused for session ${params.dialerSessionId}`);
        return twiml(rejectTwiml("Session d'appel introuvable ou terminée."));
    }
    if (!(await claimAgentLeg(prisma, session.id, params.CallSid))) {
        return twiml(rejectTwiml("Cette session est déjà ouverte dans un autre onglet."));
    }
    return new Response(agentConferenceTwiml(session.conferenceName, conferenceCallbackUrl(availability.base, session.id)), {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
}
