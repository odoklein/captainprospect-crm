import { NextRequest } from "next/server";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { getTwilioConfig } from "@/lib/telephony/config";
import { TELEPHONY_ROLES } from "@/lib/telephony/roles";
import { listThreads, myLine, unreadCount } from "@/lib/messaging/sms";

export const dynamic = "force-dynamic";

/**
 * GET /api/messaging/threads[?count=1]
 * My SMS conversations (most recent first), the unread total, and whether my
 * number can text. ?count=1 returns the unread total only (dock badge poll).
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole([...TELEPHONY_ROLES], request);
    const unread = await unreadCount(session.user.id);
    if (new URL(request.url).searchParams.get("count") === "1") return successResponse({ unread });

    const config = getTwilioConfig();
    const { line, canText } = await myLine(config, session.user.id);
    return successResponse({ line, canText, configured: Boolean(config), unread, threads: await listThreads(session.user.id) });
});
