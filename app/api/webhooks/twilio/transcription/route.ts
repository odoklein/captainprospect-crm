import { NextRequest, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { summarizeCall } from "@/lib/telephony/summary";
import { parseTranscriptionCallback } from "@/lib/telephony/transcription";
import { gateTwilioWebhook } from "@/lib/telephony/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/twilio/transcription?callId= — <Transcription statusCallbackUrl>.
 * Stores each final sentence; when Twilio stops the transcription (end of
 * call), builds the AI summary in the background.
 */
export async function POST(req: NextRequest) {
    const gate = await gateTwilioWebhook(req, "transcription");
    if (!gate.ok) return gate.response;
    const { params, callId } = gate.ctx;
    if (!callId) return new Response(null, { status: 204 });

    const event = parseTranscriptionCallback(params);
    try {
        if (event.kind === "line" && event.final) {
            const exists = await prisma.telephonyCall.count({ where: { id: callId } });
            if (exists) {
                await prisma.telephonyTranscriptLine.upsert({
                    where: { callId_speaker_seq: { callId, speaker: event.speaker, seq: event.seq } },
                    create: { callId, speaker: event.speaker, seq: event.seq, text: event.text, confidence: event.confidence, at: event.at },
                    update: { text: event.text, confidence: event.confidence },
                });
            }
        } else if (event.kind === "stopped") {
            // Final lines can trail the stop by a moment: give them time before summarising.
            after(async () => {
                await new Promise((r) => setTimeout(r, 4000));
                await summarizeCall(callId).catch((e) => console.error("[webhooks/twilio/transcription] summary", e));
            });
        } else if (event.kind === "error") {
            // The error payload is not documented in the SDK typings: log every field (minus the account) to diagnose.
            const { AccountSid: _account, ...fields } = params;
            void _account;
            console.warn(`[webhooks/twilio/transcription] ${callId}: ${event.message}`, JSON.stringify(fields));
        }
        return new Response(null, { status: 204 });
    } catch (error) {
        console.error("[webhooks/twilio/transcription] failed", error);
        return new Response("handler failed", { status: 500 }); // Twilio retries
    }
}
