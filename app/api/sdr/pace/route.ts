import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { computeSdrPaceFor } from "@/lib/sdr-pace/server";

// ============================================
// GET /api/sdr/pace
// Where the SDR stands against today's call pace: calls done, calls expected at
// this point of their effective calling time, and the resulting status.
// The computation lives in lib/sdr-pace/server.ts (shared with the agent).
// ============================================

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: "Non autorisé" }, { status: 401 });
        }
        const { pace, time, config } = await computeSdrPaceFor(session.user.id, new Date());

        return NextResponse.json({
            success: true,
            data: {
                ...pace,
                isCallingTime: time.isCallingTime,
                forgivenPauseMinutes: Math.round(time.forgivenPauseMinutes),
                config,
            },
        });
    } catch (error) {
        console.error("Error computing SDR pace:", error);
        return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 });
    }
}
