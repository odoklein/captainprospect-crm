import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    errorResponse,
    requireRole,
    withErrorHandler,
    NotFoundError,
} from "@/lib/api-utils";
import { actionService } from "@/lib/services/ActionService";
import { storageService } from "@/lib/storage/storage-service";
import { resolveAudioMime } from "@/lib/audio-upload";

const ALLO_HOST = "api.withallo.com";
const ALLO_RECORDINGS_PATH_PREFIX = "/v1/assets/recordings/";
const VAULT_RECORDING_PATH_SUFFIX = "/recording";

// Recordings uploaded by hand (app/api/actions/[id]/upload-audio) live in our own storage under
// call-recordings/<userId>/<timestamp>/<uuid>.<ext>. The stored URL can point at a private MinIO/S3
// bucket the browser cannot read, so they are streamed through here using the storage credentials.
const UPLOADED_KEY_RE = /^call-recordings\/[A-Za-z0-9_-]+\/\d+\/[0-9a-f-]{36}\.[A-Za-z0-9]{1,8}$/;

function uploadedRecordingKey(urlString: string): string | null {
    let pathname: string;
    try {
        pathname = decodeURIComponent(new URL(urlString.trim(), "http://local.invalid").pathname);
    } catch {
        return null;
    }
    const idx = pathname.indexOf("call-recordings/");
    if (idx < 0) return null;
    const key = pathname.slice(idx);
    return UPLOADED_KEY_RE.test(key) ? key : null;
}

async function serveUploadedRecording(request: NextRequest, key: string) {
    let data: Buffer;
    try {
        data = await storageService.download(key);
    } catch {
        throw new NotFoundError("Enregistrement introuvable");
    }
    const total = data.length;
    const mime = resolveAudioMime(key, "");
    const headers = new Headers({
        "Content-Type": mime,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=300",
    });

    const range = request.headers.get("Range");
    const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
    if (m && (m[1] || m[2])) {
        const start = m[1] ? parseInt(m[1], 10) : Math.max(0, total - parseInt(m[2], 10));
        let end = m[1] && m[2] ? parseInt(m[2], 10) : total - 1;
        end = Math.min(end, total - 1);
        if (start > end || start >= total) {
            headers.set("Content-Range", `bytes */${total}`);
            return new NextResponse(null, { status: 416, headers });
        }
        headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
        headers.set("Content-Length", String(end - start + 1));
        return new NextResponse(new Uint8Array(data.subarray(start, end + 1)), { status: 206, headers });
    }

    headers.set("Content-Length", String(total));
    return new NextResponse(new Uint8Array(data), { status: 200, headers });
}

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

        const uploadedKey = uploadedRecordingKey(action.callRecordingUrl);
        if (uploadedKey) {
            return serveUploadedRecording(request, uploadedKey);
        }

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
