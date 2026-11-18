import { randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/api-utils";
import { registrationSchema } from "./self-service-schema";

export const AGENCY_INVITE_KEY = "agencyClientInviteToken";

export function validInviteToken(token: string, stored: string | null | undefined): boolean {
    if (!/^[a-f0-9]{64}$/.test(token) || !stored || !/^[a-f0-9]{64}$/.test(stored)) return false;
    return timingSafeEqual(Buffer.from(token), Buffer.from(stored));
}

export async function getAgencyInvite(db = prisma) {
    return (await db.systemConfig.findUnique({ where: { key: AGENCY_INVITE_KEY } }))?.value ?? null;
}

export async function ensureAgencyInvite(db = prisma) {
    const row = await db.systemConfig.upsert({
        where: { key: AGENCY_INVITE_KEY },
        create: { key: AGENCY_INVITE_KEY, value: randomBytes(32).toString("hex") },
        update: {},
    });
    return row.value;
}

export async function registerInvitedClient(token: string, raw: unknown, db = prisma) {
    const input = registrationSchema.parse(raw);
    // Reject invalid links before paying the cost of hashing a password.
    if (!validInviteToken(token, await getAgencyInvite(db))) throw new AuthError("Ce lien d’invitation n’est plus valide.", 404);
    const password = await bcrypt.hash(input.password, 12);
    return db.$transaction(async (tx) => {
        // Recheck after hashing: a manager may have revoked the link meanwhile.
        const invite = await tx.systemConfig.findUnique({ where: { key: AGENCY_INVITE_KEY } });
        if (!validInviteToken(token, invite?.value)) throw new AuthError("Ce lien d’invitation n’est plus valide.", 404);
        const existing = await tx.user.findFirst({ where: { email: { equals: input.email, mode: "insensitive" } }, select: { id: true } });
        if (existing) throw new AuthError("Impossible de créer ce compte. Essayez de vous connecter ou contactez l’agence.", 409);
        // Nested write is atomic: failed/duplicate user creation leaves no orphan space.
        const client = await tx.client.create({
            data: {
                name: input.companyName,
                email: input.email,
                users: { create: { email: input.email, name: input.name, password, role: "CLIENT", isActive: true } },
            },
            select: { id: true },
        });
        return { clientId: client.id };
    });
}
