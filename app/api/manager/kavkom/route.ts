import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { errorResponse, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { getKavkomConfig, kavkomClient } from "@/lib/kavkom/config";
import { kavkomErrorMessage, type KavkomExtension } from "@/lib/kavkom/api";
import { KAVKOM_PROVIDER } from "@/lib/kavkom/webhook";
import { integrationKey } from "@/lib/integrations/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Paramètres → Téléphonie → Kavkom (app/manager/settings/KavkomPanel.tsx).
//   GET                    connection state, what the CRM holds
//   GET ?extensions=1      « Tester » : Kavkom's extensions and the CRM user behind each
//   POST { action: "match" }  gives each unassigned extension to the CRM user with the same e-mail

interface ExtensionRow extends KavkomExtension {
    user: { id: string; name: string } | null;
    /** Matched by e-mail but not saved yet. */
    suggested: { id: string; name: string } | null;
}

async function extensionsWithUsers(list: KavkomExtension[]): Promise<ExtensionRow[]> {
    const users = await prisma.user.findMany({
        where: { isActive: true, role: { notIn: ["CLIENT", "COMMERCIAL"] } },
        select: { id: true, name: true, email: true, kavkomExtension: true },
    });
    const byExt = new Map(users.filter((u) => u.kavkomExtension).map((u) => [u.kavkomExtension!, u]));
    const taken = new Set(byExt.values());
    return list.map((x) => {
        const holder = byExt.get(x.extension) ?? null;
        const byEmail = !holder && x.userEmail ? users.find((u) => u.email.trim().toLowerCase() === x.userEmail && !u.kavkomExtension && !taken.has(u)) ?? null : null;
        return { ...x, user: holder ? { id: holder.id, name: holder.name } : null, suggested: byEmail ? { id: byEmail.id, name: byEmail.name } : null };
    });
}

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    const config = getKavkomConfig();

    if (new URL(request.url).searchParams.get("extensions") === "1") {
        const client = kavkomClient(config);
        if (!client) return errorResponse("Renseignez d'abord le jeton API et le domaine Kavkom.", 409);
        try {
            return successResponse(await extensionsWithUsers(await client.listExtensions()));
        } catch (e) {
            return errorResponse(kavkomErrorMessage(e), 400);
        }
    }

    const [calls, withAudio, withSummary, last, assigned] = await Promise.all([
        prisma.telephonyCall.count({ where: { provider: KAVKOM_PROVIDER } }),
        prisma.telephonyCall.count({ where: { provider: KAVKOM_PROVIDER, recordingUrl: { not: null } } }),
        prisma.telephonyCall.count({ where: { provider: KAVKOM_PROVIDER, aiSummaryStatus: "done" } }),
        prisma.telephonyCall.findFirst({ where: { provider: KAVKOM_PROVIDER }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
        prisma.user.count({ where: { isActive: true, kavkomExtension: { not: null } } }),
    ]);
    return successResponse({
        apiConfigured: Boolean(config),
        webhookConfigured: Boolean(integrationKey("KAVKOM_WEBHOOK_SECRET")?.trim()),
        autoAnswer: config?.autoAnswer ?? true,
        dialFormat: config?.dialFormat ?? "national",
        stats: { calls, withAudio, withSummary, lastCallAt: last?.startedAt ?? null, assigned },
    });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const body = (await request.json().catch(() => null)) as { action?: string } | null;
    if (body?.action !== "match") return errorResponse("Action inconnue", 400);
    const client = kavkomClient();
    if (!client) return errorResponse("Renseignez d'abord le jeton API et le domaine Kavkom.", 409);

    let rows: ExtensionRow[];
    try {
        rows = await extensionsWithUsers(await client.listExtensions());
    } catch (e) {
        return errorResponse(kavkomErrorMessage(e), 400);
    }
    const toAssign = rows.filter((r) => r.enabled && r.suggested);
    for (const r of toAssign) {
        await prisma.user.update({ where: { id: r.suggested!.id }, data: { kavkomExtension: r.extension } });
    }
    if (toAssign.length) {
        audit(request, session, {
            action: AUDIT_ACTIONS.UPDATE,
            entityType: "User",
            entityId: toAssign[0].suggested!.id,
            summary: `Extensions Kavkom attribuées par e-mail : ${toAssign.map((r) => `${r.extension} → ${r.suggested!.name}`).join(", ")}`,
            metadata: { assigned: toAssign.map((r) => ({ extension: r.extension, userId: r.suggested!.id })) },
        });
    }
    return successResponse({ assigned: toAssign.length, extensions: await extensionsWithUsers(rows) });
});
