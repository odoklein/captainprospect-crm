import { NextRequest, after } from "next/server";
import { getBrand } from "@/lib/brand/server";
import { INBOUND_RING_SEC, applyInboundDial, finalizeInboundCall, startInboundCall } from "@/lib/telephony/inbound";
import { callbackBase, defaultGreeting, emptyTwiml, identityFor, inboundTwiml, rejectTwiml, twiml, voicemailTwiml } from "@/lib/telephony/twilio";
import { gateTwilioWebhook } from "@/lib/telephony/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/twilio/incoming — Voice URL of the agency's Twilio numbers
 * (set automatically when a number is assigned in Paramètres → Téléphonie).
 *   ?step=start   a prospect calls: ring the owner's browser, else voicemail
 *   ?step=after   <Dial action>: answered → done; otherwise voicemail
 *   ?step=done    <Record action>: hang up
 *   ?step=status  the number's status callback: the caller's leg ended
 */
export async function POST(req: NextRequest) {
    const gate = await gateTwilioWebhook(req, "incoming");
    if (!gate.ok) return gate.response;
    const { config, params, callId } = gate.ctx;
    const step = req.nextUrl.searchParams.get("step") ?? "start";
    const base = callbackBase(req);

    try {
        if (step === "status") {
            after(() => finalizeInboundCall(params).catch((e) => console.error("[webhooks/twilio/incoming] finalize", e)));
            return new Response(null, { status: 204 });
        }
        if (step === "done") return twiml(emptyTwiml());

        const voicemail = async (ownerName: string, greeting: string | null, id: string) => {
            const brand = await getBrand();
            const firstName = ownerName.split(/\s+/)[0] || null;
            return twiml(
                voicemailTwiml({
                    greeting: greeting?.trim() || defaultGreeting(firstName, brand.name),
                    recording: `${base}/api/webhooks/twilio/recording?kind=voicemail&callId=${encodeURIComponent(id)}`,
                    done: `${base}/api/webhooks/twilio/incoming?step=done&callId=${encodeURIComponent(id)}`,
                }),
            );
        };

        if (step === "after") {
            if (!callId) return twiml(emptyTwiml());
            const answered = await applyInboundDial(callId, params);
            if (answered) return twiml(emptyTwiml());
            const { prisma } = await import("@/lib/prisma");
            const call = await prisma.telephonyCall.findUnique({ where: { id: callId }, select: { sdr: { select: { name: true, voicemailGreeting: true } } } });
            return voicemail(call?.sdr.name ?? "", call?.sdr.voicemailGreeting ?? null, callId);
        }

        // step=start
        const start = await startInboundCall(params);
        if (start.kind === "unassigned") {
            return twiml(rejectTwiml("Ce numéro n'est pas attribué pour le moment. Merci de rappeler plus tard."));
        }
        if (start.kind === "voicemail") {
            await applyInboundDial(start.call.id, { DialCallStatus: "no-answer" });
            return voicemail(start.owner.name, start.owner.greeting, start.call.id);
        }
        const q = `callId=${encodeURIComponent(start.call.id)}`;
        return twiml(
            inboundTwiml({
                identity: identityFor(start.owner.id),
                ringSec: INBOUND_RING_SEC,
                record: config.record,
                transcription: config.transcription,
                parameters: {
                    callId: start.call.id,
                    callerName: start.caller.name ?? "",
                    companyName: start.caller.company ?? "",
                    contactId: start.call.contactId ?? "",
                    companyId: start.call.companyId ?? "",
                    campaignId: start.call.campaignId ?? "",
                },
                urls: {
                    dialAction: `${base}/api/webhooks/twilio/incoming?step=after&${q}`,
                    legStatus: `${base}/api/webhooks/twilio/status?leg=child&${q}`,
                    recording: `${base}/api/webhooks/twilio/recording?${q}`,
                    transcription: `${base}/api/webhooks/twilio/transcription?${q}`,
                },
            }),
        );
    } catch (error) {
        console.error(`[webhooks/twilio/incoming] step=${step} failed`, error);
        return twiml(rejectTwiml("Une erreur technique empêche l'appel. Merci de rappeler plus tard."));
    }
}
