import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    errorResponse,
    requireRole,
    withErrorHandler,
} from "@/lib/api-utils";
import { z } from "zod";
import { checkLeexiKey } from "@/lib/leexi/service";

const CONFIG_KEY_ID = "leexiApiKeyId";
const CONFIG_KEY_SECRET = "leexiApiKeySecret";

const updateLeexiConfigSchema = z.object({
    keyId: z.string().min(1, "L'identifiant API Leexi est requis"),
    keySecret: z.string().min(1, "Le secret API Leexi est requis"),
});

// GET /api/system-config/leexi — Returns whether Leexi is configured and where the values come from
export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);

    const records = await prisma.systemConfig.findMany({
        where: { key: { in: [CONFIG_KEY_ID, CONFIG_KEY_SECRET] } },
    });

    const idFromSettings = records.find((r) => r.key === CONFIG_KEY_ID)?.value?.trim();
    const secretFromSettings = records.find((r) => r.key === CONFIG_KEY_SECRET)?.value?.trim();

    const hasSettings = !!idFromSettings && !!secretFromSettings;
    const hasEnv =
        !!process.env.LEEXI_API_KEY_ID?.trim() &&
        !!process.env.LEEXI_API_KEY_SECRET?.trim();

    return successResponse({
        enabled: hasSettings || hasEnv,
        source: hasSettings ? "settings" : hasEnv ? "env" : "none",
        // Never expose actual values to the client
    });
});

// PUT /api/system-config/leexi — Save Leexi API credentials in SystemConfig
export const PUT = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);

    const body = await request.json();
    const parsed = updateLeexiConfigSchema.safeParse(body);
    if (!parsed.success) {
        return errorResponse(parsed.error.issues[0].message, 400);
    }

    const { keyId, keySecret } = parsed.data;

    // A key Leexi refuses (e.g. without « read_calls ») would silently take
    // precedence over a working one: check it before saving.
    const check = await checkLeexiKey(keyId.trim(), keySecret.trim());
    if (!check.ok) {
        return errorResponse(check.message, 400);
    }

    await prisma.$transaction([
        prisma.systemConfig.upsert({
            where: { key: CONFIG_KEY_ID },
            update: { value: keyId },
            create: { key: CONFIG_KEY_ID, value: keyId },
        }),
        prisma.systemConfig.upsert({
            where: { key: CONFIG_KEY_SECRET },
            update: { value: keySecret },
            create: { key: CONFIG_KEY_SECRET, value: keySecret },
        }),
    ]);

    return successResponse({ enabled: true, source: "settings" });
});

// DELETE /api/system-config/leexi — Remove Leexi credentials from SystemConfig
export const DELETE = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);

    await prisma.systemConfig.deleteMany({
        where: { key: { in: [CONFIG_KEY_ID, CONFIG_KEY_SECRET] } },
    });

    const hasEnv =
        !!process.env.LEEXI_API_KEY_ID?.trim() &&
        !!process.env.LEEXI_API_KEY_SECRET?.trim();

    return successResponse({
        enabled: hasEnv,
        source: hasEnv ? "env" : "none",
    });
});

