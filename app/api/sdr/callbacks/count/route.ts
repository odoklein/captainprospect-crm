import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findLiveCallbacks, type CallbackScope } from "@/lib/callbacks/pending";

// ============================================
// GET /api/sdr/callbacks/count
// Sidebar badge. Counts exactly what the Rappels page shows by default
// (GET /api/sdr/callbacks without filters), with the same "pending" rule
// (lib/callbacks/pending.ts):
//   - SDR: own callbacks + orphaned callbacks on their assigned missions;
//   - BD: every callback on their assigned missions;
//   - Booker: every callback.
// `assignedOnly` is accepted for backward compatibility and has no effect.
// ============================================

export async function GET() {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: "Non autorisé" },
                { status: 401 }
            );
        }

        const userRole = (session.user as { role?: string }).role;
        const isBusinessDeveloper = userRole === "BUSINESS_DEVELOPER";
        const isBooker = userRole === "BOOKER";

        const assignedMissionIds = isBooker
            ? []
            : (
                  await prisma.sDRAssignment.findMany({
                      where: { sdrId: session.user.id },
                      select: { missionId: true },
                  })
              ).map((a) => a.missionId);

        const scope: CallbackScope = {};
        if (isBusinessDeveloper) {
            if (assignedMissionIds.length === 0) {
                return NextResponse.json({ success: true, count: 0, nextCallbackDate: null });
            }
            scope.missionIds = assignedMissionIds;
        } else if (!isBooker) {
            scope.sdrIds = [session.user.id];
            scope.orphanMissionIds = assignedMissionIds;
        }

        const live = await findLiveCallbacks(scope);
        const now = Date.now();
        const next = live
            .filter((c) => c.callbackDate && new Date(c.callbackDate).getTime() >= now)
            .map((c) => new Date(c.callbackDate!).getTime())
            .sort((a, b) => a - b)[0];

        return NextResponse.json({
            success: true,
            count: live.length,
            nextCallbackDate: next ? new Date(next).toISOString() : null,
        });
    } catch (error) {
        console.error("Error fetching callback count:", error);
        return NextResponse.json(
            { success: false, error: "Erreur serveur" },
            { status: 500 }
        );
    }
}
