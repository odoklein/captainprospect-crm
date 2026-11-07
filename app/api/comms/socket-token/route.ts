import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getInstanceIdentity } from "@/lib/instance/identity";
import { SOCKET_TOKEN_MAX_AGE_MS, signSocketToken } from "@/lib/socket/handshake";

// Handshake token for the comms socket (lib/socket/handshake): who is this user,
// on which instance. Session-authenticated; the browser asks for a fresh one on
// every (re)connect. Without an instance identity (the original deployment) it
// answers { token: null } and the client connects exactly as before.
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Non autorisé" }, { status: 401 });

    const identity = getInstanceIdentity();
    if (!identity) return NextResponse.json({ token: null }, { headers: { "Cache-Control": "no-store" } });

    const now = Date.now();
    return NextResponse.json(
        {
            token: signSocketToken({ ...identity, userId: session.user.id, now }),
            instanceId: identity.instanceId,
            expiresAt: new Date(now + SOCKET_TOKEN_MAX_AGE_MS).toISOString(),
        },
        { headers: { "Cache-Control": "no-store" } },
    );
}
