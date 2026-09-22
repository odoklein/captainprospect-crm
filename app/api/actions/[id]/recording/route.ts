import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    errorResponse,
    requireRole,
    withErrorHandler,
    NotFoundError,
} from "@/lib/api-utils";
import { actionService } from "@/lib/services/ActionService";

const ALLO_HOST = "api.withallo.com";
const ALLO_RECORDINGS_PATH_PREFIX = "/v1/assets/recordings/";
const VAULT_RECORDING_PATH_SUFFIX = "/recording";

type Upstream = { url: URL; authHeader: string };

/**
 * Resolves a stored callRecordingUrl to an allowed upstream + the auth header it needs. Two
 * sources are legitimate: WithAllo directly (legacy rows, and the ALLO_API_KEY fallback path in
 * lib/call-enrichment/provider.ts) and call-vault (its stable /api/calls/:id/recording redirect —
 * see lib/call-vault-client.ts's vaultRecordingProxyUrl). Anything else is rejected outright.
 */
function resolveUpstream(urlString: string): Upstream {
    let u: URL;
    try {
        u = new URL(urlString.trim());
    } catch {
        throw new NotFoundError("Enregistrement introuvable");
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") {
        throw new NotFoundError("Enregistrement introuvable");
    }

    if (u.protocol === "https:" && u.hostname === ALLO_HOST && u.pathname.startsWith(ALLO_RECORDINGS_PATH_PREFIX)) {
        const apiKey = process.env.ALLO_API_KEY;
        if (!apiKey) throw new NotFoundError("Enregistrement introuvable");
        return { url: u, authHeader: apiKey };
    }

    const vaultBase = process.env.VAULT_API_URL;
    const vaultKey = process.env.VAULT_API_KEY;
    if (vaultBase && vaultKey) {
        const vaultUrl = new URL(vaultBase);
        if (u.hostname === vaultUrl.hostname && u.port === vaultUrl.port && u.pathname.endsWith(VAULT_RECORDING_PATH_SUFFIX)) {
            return { url: u, authHeader: `Bearer ${vaultKey}` };
        }
    }

    throw new NotFoundError("Enregistrement introuvable");
}

async function assertCanStreamRecording(
    userId: string,
    role: string,
    action: { sdrId: string; campaign: { missionId: string } },
) {
    if (role === "MANAGER" || role === "BOOKER") return;
    if (role === "SDR" || role === "BUSINESS_DEVELOPER") {
        if (action.sdrId === userId) return;
        const isLead = await actionService.isTeamLeadForMission(userId, action.campaign.missionId);
        if (isLead) return;
    }
    throw new NotFoundError("Enregistrement introuvable");
}

// GET /api/actions/[id]/recording — stream the recording (Allo or call-vault) with a server-side
// key the browser can't send itself.
export const GET = withErrorHandler(
    async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
        const session = await requireRole(
            ["MANAGER", "SDR", "BUSINESS_DEVELOPER", "BOOKER"],
            request,
        );
        const { id } = await params;

        const action = await prisma.action.findUnique({
            where: { id },
            select: {
                callRecordingUrl: true,
                sdrId: true,
                campaign: { select: { missionId: true } },
            },
        });

        if (!action?.callRecordingUrl?.trim()) {
            throw new NotFoundError("Enregistrement introuvable");
        }

        await assertCanStreamRecording(session.user.id, session.user.role, action);

        const { url: targetUrl, authHeader } = resolveUpstream(action.callRecordingUrl);

        const range = request.headers.get("Range") ?? undefined;
        const upstream = await fetch(targetUrl.toString(), {
            headers: {
                Authorization: authHeader,
                ...(range ? { Range: range } : {}),
            },
            cache: "no-store",
        });

        if (!upstream.ok && upstream.status !== 206) {
            return errorResponse("Impossible de lire l'enregistrement", upstream.status >= 500 ? 502 : 404);
        }

        const out = new Headers();
        const ct = upstream.headers.get("Content-Type");
        out.set("Content-Type", ct || "audio/mpeg");
        const ar = upstream.headers.get("Accept-Ranges");
        if (ar) out.set("Accept-Ranges", ar);
        const cr = upstream.headers.get("Content-Range");
        if (cr) out.set("Content-Range", cr);
        const cl = upstream.headers.get("Content-Length");
        if (cl) out.set("Content-Length", cl);
        out.set("Cache-Control", "private, max-age=300");

        return new NextResponse(upstream.body, {
            status: upstream.status,
            headers: out,
        });
    },
);
