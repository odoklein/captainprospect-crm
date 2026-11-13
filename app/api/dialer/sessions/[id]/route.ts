import { NextRequest } from "next/server";
import { z } from "zod";
import { NotFoundError, errorResponse, requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { TELEPHONY_ROLES } from "@/lib/telephony/roles";
import { agentReady, endSession, hangupCurrent, pauseSession, pump, resumeSession, sweep } from "@/lib/dialer/orchestrator";
import { buildDialerDeps } from "@/lib/dialer/runtime";
import { touchHeartbeat } from "@/lib/dialer/store";
import { sessionView } from "@/lib/dialer/view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function own(id: string, userId: string) {
    const s = await prisma.dialerSession.findUnique({ where: { id }, select: { id: true, sdrId: true } });
    if (!s || s.sdrId !== userId) throw new NotFoundError("Session introuvable");
    return s;
}

/** GET /api/dialer/sessions/[id] — live state for the SDR's screen. */
export const GET = withErrorHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const session = await requireRole([...TELEPHONY_ROLES], request);
    const { id } = await params;
    await own(id, session.user.id);
    return successResponse(await sessionView(id));
});

const schema = z.object({ action: z.enum(["heartbeat", "ready", "hangup", "pause", "resume", "end"]) });

// The sweeper also runs from heartbeats, at most once per instance every few seconds,
// so timeouts are enforced even where the cron runs only once a minute.
const SWEEP_EVERY_MS = 5_000;
const g = globalThis as typeof globalThis & { __dialerLastSweep?: number };

/**
 * POST /api/dialer/sessions/[id] { action }
 *   heartbeat  every few seconds from the open tab; keeps the session alive and the lines topped up
 *   ready      the SDR finished qualifying the last conversation
 *   hangup     ends the current conversation; the SDR stays in the session
 *   pause | resume | end
 */
export const POST = withErrorHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const session = await requireRole([...TELEPHONY_ROLES], request);
    const { id } = await params;
    await own(id, session.user.id);
    const { action } = await validateRequest(request, schema);
    const built = await buildDialerDeps();
    if (!built.ok) {
        // Switched off while running: end the session cleanly instead of leaving it half-alive.
        if (action !== "heartbeat") return errorResponse(built.reason, 503);
        await prisma.dialerSession.updateMany({ where: { id, status: { not: "ENDED" } }, data: { status: "ENDED", agentState: "OFFLINE", endedAt: new Date(), endReason: "disabled" } });
        return successResponse({ ...(await sessionView(id)), notice: built.reason });
    }
    const d = built.deps;
    let decision: string | null = null;
    switch (action) {
        case "heartbeat": {
            if (!(await touchHeartbeat(prisma, id, session.user.id))) break;
            const now = Date.now();
            if (!g.__dialerLastSweep || now - g.__dialerLastSweep > SWEEP_EVERY_MS) {
                g.__dialerLastSweep = now;
                await sweep(d).catch((e) => console.error("[dialer] sweep from heartbeat", e));
            }
            decision = (await pump(d, id)).reason;
            break;
        }
        case "ready":
            await agentReady(d, id);
            break;
        case "hangup":
            await hangupCurrent(d, id);
            break;
        case "pause":
            await pauseSession(d, id);
            break;
        case "resume":
            await resumeSession(d, id);
            break;
        case "end":
            await endSession(d, id, "sdr_stopped");
            break;
    }
    return successResponse({ ...(await sessionView(id)), decision });
});
