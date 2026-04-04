import { NextRequest } from "next/server";
import {
    successResponse,
    requireAuth,
    withErrorHandler,
    validateRequest,
} from "@/lib/api-utils";
import { processActionXP, updateStreak } from "@/lib/gamification/engine";
import { z } from "zod";

const checkSchema = z.object({
    actionResult: z.string().optional(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);
    const data = await validateRequest(request, checkSchema);

    const xpResult = await processActionXP(
        session.user.id,
        data.actionResult || "NO_RESPONSE"
    );

    // Also check streak
    const streakResult = await updateStreak(session.user.id);

    return successResponse({
        xpGained: xpResult.xpGained,
        totalXp: xpResult.totalXp,
        leveledUp: xpResult.leveledUp,
        newLevel: xpResult.newLevel,
        achievementsUnlocked: xpResult.achievementsUnlocked,
        streak: streakResult,
    });
});
