import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireRole, withErrorHandler } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { TELEPHONY_ROLES } from "@/lib/telephony/roles";
import { getKavkomConfig, kavkomClient, normalizeExtension } from "@/lib/kavkom/config";
import { kavkomErrorMessage, type KavkomSipLogin } from "@/lib/kavkom/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Kavkom is asked once per extension every 10 minutes, not on every page load.
const CACHE_MS = 10 * 60_000;
const g = globalThis as typeof globalThis & { __kavkomSip?: Map<string, { login: KavkomSipLogin; at: number }> };
const cache: Map<string, { login: KavkomSipLogin; at: number }> = (g.__kavkomSip ??= new Map());

/**
 * POST /api/telephony/kavkom/sip — the SIP login of the signed-in user's OWN Kavkom extension,
 * so the CRM tab can register as their phone (SIP over WebRTC, components/telephony/kavkom-phone).
 *
 * The password is read from Kavkom's API at request time and never stored by the CRM. It does
 * reach this user's browser (SIP needs it), the only one it is ever sent to: never another
 * user's extension, never cached by the browser (POST + no-store).
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole([...TELEPHONY_ROLES], request);
    const config = getKavkomConfig();
    if (!config?.webphone) return errorResponse("Téléphone Kavkom dans le CRM non configuré", 404);

    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isActive: true, name: true, kavkomExtension: true } });
    const extension = normalizeExtension(user?.kavkomExtension);
    if (!user?.isActive || !extension) return errorResponse("Aucune extension Kavkom attribuée à cet utilisateur", 409);

    let login = cache.get(extension);
    if (!login || Date.now() - login.at > CACHE_MS) {
        try {
            const fresh = await kavkomClient(config)!.sipLogin(extension);
            if (!fresh) return errorResponse(`Kavkom ne renvoie pas l'identifiant SIP de l'extension ${extension}`, 502);
            login = { login: fresh, at: Date.now() };
            cache.set(extension, login);
        } catch (err) {
            return errorResponse(kavkomErrorMessage(err), 502);
        }
    }

    const domain = config.webphone.domain ?? login.login.domain;
    if (!domain) return errorResponse("Domaine SIP Kavkom inconnu : renseignez KAVKOM_SIP_DOMAIN (Paramètres → Téléphonie)", 409);

    return NextResponse.json(
        {
            success: true,
            data: {
                server: config.webphone.server,
                domain,
                extension,
                password: login.login.password,
                displayName: user.name,
            },
        },
        { headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } },
    );
});
