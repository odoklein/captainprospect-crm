// POST /api/public/onboarding/[token]/market { sectors, sizes, regions }
// Live count + sample companies from the French company registry for the
// client's target profile. Token-gated so it is not an open proxy.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateRequest, withErrorHandler } from "@/lib/api-utils";
import { NO_STORE, overBudget, runLink } from "@/lib/client-onboarding/http";
import { marketSize } from "@/lib/client-onboarding/market";
import { isTokenShape, OnboardingLinkError } from "@/lib/client-onboarding/service";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ token: string }> };

const schema = z.object({
    sectors: z.array(z.string().max(4)).max(30),
    sizes: z.array(z.string().max(12)).max(10),
    regions: z.array(z.string().max(60)).max(20),
});

export const POST = withErrorHandler(async (request: NextRequest, { params }: Ctx) => {
    const { token } = await params;
    const limited = overBudget(request, "market", token, 40);
    if (limited) return limited;
    const filters = await validateRequest(request, schema);
    const result = await runLink(async () => {
        const live = isTokenShape(token)
            ? await prisma.clientOnboarding.findFirst({
                where: { shareToken: token, OR: [{ shareExpiresAt: null }, { shareExpiresAt: { gt: new Date() } }] },
                select: { id: true },
            })
            : null;
        if (!live) throw new OnboardingLinkError("Lien introuvable", 404);
        return marketSize(filters);
    });
    return result instanceof NextResponse ? result : NextResponse.json({ success: true, data: result }, { headers: NO_STORE });
});
