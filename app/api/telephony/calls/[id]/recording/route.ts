import { NextRequest, NextResponse } from "next/server";
import { NotFoundError, errorResponse, requireRole, withErrorHandler } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { integrationKey } from "@/lib/integrations/keys";
import { isTwilioRecordingUrl } from "@/lib/telephony/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/telephony/calls/[id]/recording — audio of a softphone call that has
 * no qualification (so no /api/actions/[id]/recording). Managers, or the call's own SDR; the
 * Twilio credentials never leave the server.
 */
export const GET = withErrorHandler(
    async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
        const session = await requireRole(["MANAGER", "SDR", "BUSINESS_DEVELOPER", "BOOKER"], request);
        const { id } = await params;

        const call = await prisma.telephonyCall.findUnique({ where: { id }, select: { recordingUrl: true, sdrId: true } });
        // Managers hear every call; anyone else only their own.
        if (call && session.user.role !== "MANAGER" && call.sdrId !== session.user.id) throw new NotFoundError("Enregistrement introuvable");
        const sid = integrationKey("TWILIO_ACCOUNT_SID");
        const token = integrationKey("TWILIO_AUTH_TOKEN");
        if (!call?.recordingUrl || !sid || !token) throw new NotFoundError("Enregistrement introuvable");

        let url: URL;
        try {
            url = new URL(call.recordingUrl);
        } catch {
            throw new NotFoundError("Enregistrement introuvable");
        }
        if (!isTwilioRecordingUrl(url, sid)) throw new NotFoundError("Enregistrement introuvable");

        const range = request.headers.get("Range");
        const upstream = await fetch(url.toString(), {
            headers: {
                Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
                ...(range ? { Range: range } : {}),
            },
            cache: "no-store",
        });
        if (!upstream.ok && upstream.status !== 206) {
            return errorResponse("Impossible de lire l'enregistrement", upstream.status >= 500 ? 502 : 404);
        }

        const out = new Headers();
        out.set("Content-Type", upstream.headers.get("Content-Type") || "audio/mpeg");
        for (const h of ["Accept-Ranges", "Content-Range", "Content-Length"]) {
            const v = upstream.headers.get(h);
            if (v) out.set(h, v);
        }
        out.set("Cache-Control", "private, max-age=300");
        return new NextResponse(upstream.body, { status: upstream.status, headers: out });
    },
);
