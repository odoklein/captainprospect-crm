import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { getTwilioConfig } from "@/lib/telephony/config";
import { toE164 } from "@/lib/telephony/phone";
import { TELEPHONY_ROLES } from "@/lib/telephony/roles";
import { SMS_MAX_CHARS, SmsError, getThread, myLine, prospectNumbers, sendSms } from "@/lib/messaging/sms";

export const dynamic = "force-dynamic";

/**
 * GET /api/messaging/sms?contactId=&companyId=  or  ?number=+33…
 * My conversation with a prospect; their inbound messages are marked read.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole([...TELEPHONY_ROLES], request);
    const sp = new URL(request.url).searchParams;
    const contactId = sp.get("contactId") || null;
    const companyId = sp.get("companyId") || null;
    // Stored as received when the phone library does not recognise the range: match it as is.
    const rawNumber = sp.get("number")?.trim() ?? null;
    const number = toE164(rawNumber) ?? (rawNumber && /^\+\d{6,15}$/.test(rawNumber) ? rawNumber : null);
    const numbers = number ? [number] : await prospectNumbers(contactId, companyId);
    const [thread, line] = await Promise.all([
        getThread(session.user.id, { numbers, contactId: number ? null : contactId, companyId: number ? null : companyId }),
        myLine(getTwilioConfig(), session.user.id),
    ]);
    return successResponse({ ...thread, numbers, ...line });
});

const sendSchema = z.object({
    to: z.string().min(4).max(32),
    body: z.string().min(1).max(SMS_MAX_CHARS),
    contactId: z.string().max(64).nullable().optional(),
    companyId: z.string().max(64).nullable().optional(),
    campaignId: z.string().max(64).nullable().optional(),
});

/** POST /api/messaging/sms — send from my Twilio number. */
export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole([...TELEPHONY_ROLES], request);
    const config = getTwilioConfig();
    if (!config) return errorResponse("Twilio n'est pas configuré", 409);
    const input = await validateRequest(request, sendSchema);
    try {
        const message = await sendSms(config, session.user.id, input);
        return successResponse({
            id: message.id,
            direction: message.direction,
            body: message.body,
            status: message.status,
            errorCode: message.errorCode,
            at: message.createdAt.toISOString(),
            readAt: null,
        });
    } catch (err) {
        if (err instanceof SmsError) return errorResponse(err.message, err.status);
        throw err;
    }
});
