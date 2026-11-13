import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { getBrand } from "@/lib/brand/server";
import { getTwilioConfig } from "@/lib/telephony/config";
import { toE164 } from "@/lib/telephony/phone";
import { TELEPHONY_ROLES } from "@/lib/telephony/roles";
import { defaultGreeting } from "@/lib/telephony/twilio";

export const dynamic = "force-dynamic";

async function view(userId: string) {
    const [user, brand] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, twilioCallerId: true, twilioReceiveCalls: true, voicemailGreeting: true, smsSignature: true } }),
        getBrand(),
    ]);
    return {
        configured: Boolean(getTwilioConfig()),
        number: toE164(user.twilioCallerId),
        receiveCalls: user.twilioReceiveCalls,
        voicemailGreeting: user.voicemailGreeting,
        smsSignature: user.smsSignature,
        defaultGreeting: defaultGreeting(user.name.split(/\s+/)[0] || null, brand.name),
    };
}

/** GET /api/telephony/prefs — my number and my incoming-call preferences. */
export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole([...TELEPHONY_ROLES], request);
    return successResponse(await view(session.user.id));
});

const schema = z.object({
    receiveCalls: z.boolean().optional(),
    /** Empty = back to the default greeting. */
    voicemailGreeting: z.string().max(600).nullable().optional(),
    /** Appended to my SMS on its own line; empty = none. */
    smsSignature: z.string().max(80).nullable().optional(),
});

/** PUT /api/telephony/prefs — the SDR's own choices (the number itself is a manager's). */
export const PUT = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole([...TELEPHONY_ROLES], request);
    const body = await validateRequest(request, schema);
    await prisma.user.update({
        where: { id: session.user.id },
        data: {
            ...(body.receiveCalls !== undefined ? { twilioReceiveCalls: body.receiveCalls } : {}),
            ...(body.voicemailGreeting !== undefined ? { voicemailGreeting: body.voicemailGreeting?.trim() || null } : {}),
            ...(body.smsSignature !== undefined ? { smsSignature: body.smsSignature?.trim() || null } : {}),
        },
    });
    return successResponse(await view(session.user.id));
});
