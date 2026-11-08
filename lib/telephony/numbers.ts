// ============================================
// TELEPHONY — the phone numbers of the agency's Twilio account, and who uses
// which. Server-only.
//
// A number can be: bought in Twilio (IncomingPhoneNumbers) or an existing
// number verified as a Caller ID (OutgoingCallerIds). Each user calls with the
// number assigned to them (User.twilioCallerId); a number belongs to one user
// at a time so prospects always see the same SDR behind it.
// ============================================

import twilio from "twilio";
import { prisma } from "@/lib/prisma";
import type { TwilioConfig } from "./config";
import { toE164 } from "./phone";
import { TELEPHONY_ROLES } from "./roles";

export interface AccountNumber {
    number: string;
    label: string | null;
    source: "twilio" | "verified";
    /** False for a bought number without voice (SMS only): it cannot place calls. */
    voice: boolean;
}

const CACHE_MS = 60_000;
let cache: { key: string; at: number; numbers: AccountNumber[] } | null = null;

/** The account's numbers, from Twilio (cached a minute). Throws when Twilio refuses. */
export async function listAccountNumbers(config: TwilioConfig, opts: { fresh?: boolean } = {}): Promise<AccountNumber[]> {
    const key = `${config.accountSid}|${config.apiKeySid}`;
    if (!opts.fresh && cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return cache.numbers;

    const client = twilio(config.apiKeySid, config.apiKeySecret, { accountSid: config.accountSid });
    const [bought, verified] = await Promise.all([
        client.incomingPhoneNumbers.list({ limit: 200 }),
        client.outgoingCallerIds.list({ limit: 200 }),
    ]);
    const byNumber = new Map<string, AccountNumber>();
    for (const n of bought) {
        const number = toE164(n.phoneNumber);
        if (number) byNumber.set(number, { number, label: n.friendlyName || null, source: "twilio", voice: n.capabilities?.voice !== false });
    }
    for (const n of verified) {
        const number = toE164(n.phoneNumber);
        if (number && !byNumber.has(number)) byNumber.set(number, { number, label: n.friendlyName || null, source: "verified", voice: true });
    }
    const numbers = [...byNumber.values()].sort((a, b) => a.number.localeCompare(b.number));
    cache = { key, at: Date.now(), numbers };
    return numbers;
}

export interface PhoneUserRow {
    id: string;
    name: string;
    email: string;
    role: string;
    number: string | null;
}

/** Active users who may call, with their assigned number. */
export async function listPhoneUsers(): Promise<PhoneUserRow[]> {
    const users = await prisma.user.findMany({
        where: { isActive: true, role: { in: [...TELEPHONY_ROLES] } },
        select: { id: true, name: true, email: true, role: true, twilioCallerId: true },
        orderBy: [{ role: "asc" }, { name: "asc" }],
    });
    return users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, number: toE164(u.twilioCallerId) }));
}

export class NumberAssignmentError extends Error {
    constructor(message: string, public status = 400) {
        super(message);
    }
}

/**
 * Gives `number` to `userId` (null removes theirs). The number must be one of
 * the account's voice numbers; whoever had it loses it, in the same
 * transaction. Returns the user who lost it, if any.
 */
export async function assignNumber(
    config: TwilioConfig,
    userId: string,
    rawNumber: string | null,
): Promise<{ previousHolder: { id: string; name: string } | null }> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, isActive: true, role: true } });
    if (!user || !user.isActive || !(TELEPHONY_ROLES as readonly string[]).includes(user.role)) {
        throw new NumberAssignmentError("Utilisateur introuvable ou sans accès au téléphone", 404);
    }
    if (rawNumber === null) {
        await prisma.user.update({ where: { id: userId }, data: { twilioCallerId: null } });
        return { previousHolder: null };
    }
    const number = toE164(rawNumber);
    if (!number) throw new NumberAssignmentError("Numéro invalide");
    const account = await listAccountNumbers(config);
    const found = account.find((n) => n.number === number);
    if (!found) throw new NumberAssignmentError("Ce numéro n'appartient pas à votre compte Twilio", 422);
    if (!found.voice) throw new NumberAssignmentError("Ce numéro ne permet pas d'appeler (pas de capacité voix)", 422);

    // Stored values may be typed differently ("06…", "+33 6…"): compare in E.164.
    const holders = (await prisma.user.findMany({ where: { twilioCallerId: { not: null }, id: { not: userId } }, select: { id: true, name: true, twilioCallerId: true } }))
        .filter((u) => toE164(u.twilioCallerId) === number);
    await prisma.$transaction([
        ...holders.map((h) => prisma.user.update({ where: { id: h.id }, data: { twilioCallerId: null } })),
        prisma.user.update({ where: { id: userId }, data: { twilioCallerId: number } }),
    ]);
    return { previousHolder: holders[0] ? { id: holders[0].id, name: holders[0].name } : null };
}
