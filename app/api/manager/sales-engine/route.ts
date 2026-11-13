import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { CEILINGS, DIALER_POLICY_KEY, parseDialerPolicy } from "@/lib/dialer/policy";
import { parallelFlagOn } from "@/lib/dialer/runtime";
import { CEILING, KIND_LABELS, POLICY_KEY, parsePolicy, serializePolicy } from "@/lib/post-call/policy";
import { smartQueueMode } from "@/lib/qualification/queue";
import { salesEngineMetrics } from "@/lib/sales-engine/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readConfig() {
    const rows = await prisma.systemConfig.findMany({ where: { key: { in: [DIALER_POLICY_KEY, POLICY_KEY] } } });
    const get = (k: string) => rows.find((r) => r.key === k)?.value ?? null;
    return {
        dialer: parseDialerPolicy(get(DIALER_POLICY_KEY)),
        automation: parsePolicy(get(POLICY_KEY)),
        ceilings: { dialer: CEILINGS, automation: CEILING },
        kindLabels: KIND_LABELS,
        // Container switches: shown so a manager knows why a setting has no effect yet.
        flags: { parallel: parallelFlagOn(), smartQueue: smartQueueMode() },
    };
}

/** GET /api/manager/sales-engine?days=7 — policies, their ceilings and the measured numbers. */
export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    const days = Math.max(1, Math.min(90, Number(request.nextUrl.searchParams.get("days")) || 7));
    const [config, metrics] = await Promise.all([readConfig(), salesEngineMetrics(days)]);
    return successResponse({ ...config, metrics });
});

const schema = z.object({
    dialer: z.record(z.string(), z.unknown()).optional(),
    automation: z.record(z.string(), z.unknown()).optional(),
});

/** PUT /api/manager/sales-engine — stores policies; every value is re-clamped to its ceiling server-side. */
export const PUT = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const body = await validateRequest(request, schema);
    const before = await readConfig();
    if (body.dialer) {
        const value = JSON.stringify(parseDialerPolicy(JSON.stringify({ ...before.dialer, ...body.dialer })));
        await prisma.systemConfig.upsert({ where: { key: DIALER_POLICY_KEY }, create: { key: DIALER_POLICY_KEY, value }, update: { value } });
    }
    if (body.automation) {
        const value = serializePolicy(parsePolicy(JSON.stringify({ ...before.automation, ...body.automation })));
        await prisma.systemConfig.upsert({ where: { key: POLICY_KEY }, create: { key: POLICY_KEY, value }, update: { value } });
    }
    const after = await readConfig();
    audit(request, session, {
        action: "UPDATE",
        entityType: "SalesEnginePolicy",
        summary: "Politique de numérotation / d'automatisation modifiée",
        before: { dialer: before.dialer, automation: before.automation },
        after: { dialer: after.dialer, automation: after.automation },
    });
    return successResponse(after);
});
