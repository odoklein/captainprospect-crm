import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auditSystem } from "@/lib/audit";
import { getBrand } from "@/lib/brand/server";
import { brandUrlOf } from "@/lib/brand/resolve";
import { guardInstanceRequest, instanceError, instanceJson, parseJsonBody } from "@/lib/instance/respond";

// First manager of a fresh instance. HMAC-signed.
//   POST { email, name } → 201 { ok, userId, email, inviteUrl, expiresAt }
//   409 as soon as any user exists (so a retry after success is refused).
// The manager gets a random, never-revealed password plus a 24 h reset token:
// inviteUrl is the standard /reset-password link (same flow as "mot de passe
// oublié"), so no password ever travels in clear.
export const dynamic = "force-dynamic";

const ACTOR = "instance-api";
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

const bodySchema = z.object({
    email: z.string().trim().email(),
    name: z.string().trim().min(1).max(120),
});

class AlreadyBootstrapped extends Error {}

export async function POST(request: NextRequest) {
    const guard = await guardInstanceRequest(request, "bootstrap");
    if (!guard.ok) return guard.response;

    const body = parseJsonBody(guard.rawBody);
    if (!body.ok) return instanceError(400, "invalid_json");
    const parsed = bodySchema.safeParse(body.value);
    if (!parsed.success) {
        return instanceError(422, "validation_failed", {
            errors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join(".") || "_", i.message])),
        });
    }

    const email = parsed.data.email.toLowerCase();
    const name = parsed.data.name;

    // Hashes before the transaction (bcrypt is slow; keep the lock short).
    const unusablePassword = await bcrypt.hash(crypto.randomBytes(48).toString("base64url"), 10);
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = await bcrypt.hash(rawToken, 10);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    let userId: string;
    try {
        userId = await prisma.$transaction(
            async (tx) => {
                const existing = await tx.user.count();
                if (existing > 0) throw new AlreadyBootstrapped();
                const user = await tx.user.create({
                    data: { email, name, password: unusablePassword, role: "MANAGER", isActive: true },
                    select: { id: true },
                });
                await tx.passwordResetToken.create({ data: { email, token: hashedToken, expiresAt } });
                return user.id;
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
    } catch (err) {
        if (err instanceof AlreadyBootstrapped) return instanceError(409, "already_bootstrapped");
        // Concurrent bootstrap: serialization failure (P2034) or the same email twice (P2002).
        const code = (err as { code?: string } | null)?.code;
        if (code === "P2034" || code === "P2002") return instanceError(409, "already_bootstrapped");
        console.error("[instance-api] bootstrap", err);
        return instanceError(500, "database_error");
    }

    const brand = await getBrand();
    const inviteUrl = brandUrlOf(brand, `/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`);

    auditSystem(
        {
            action: "CREATE",
            entityType: "User",
            entityId: userId,
            summary: `Premier manager créé par le control plane (${email})`,
            after: { email, name, role: "MANAGER" },
            metadata: { source: ACTOR, bootstrap: true, inviteExpiresAt: expiresAt.toISOString() },
        },
        ACTOR,
    );

    return instanceJson({ ok: true, userId, email, inviteUrl, expiresAt: expiresAt.toISOString() }, 201);
}
