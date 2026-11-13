// ============================================
// SMS on the agency's Twilio numbers. Server-only.
//
// An SDR texts from the number assigned to them (Paramètres → Téléphonie);
// replies to that number come back to them. A conversation is every message
// between one of our lines and one prospect number. STOP / ARRÊT puts the
// number on SmsOptOut: nothing is sent to it again.
//
// French landline numbers (+33 1–5, 9) cannot send SMS: the SDR needs a
// mobile number (+33 6 / 7), which Twilio sells with a regulatory bundle.
// ============================================

import twilio from "twilio";
import type { SmsMessage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { findCallerCandidates } from "@/lib/incoming-calls/caller-lookup";
import { publicUrl, type TwilioConfig } from "@/lib/telephony/config";
import { checkDialNumber, phonesInField, toE164 } from "@/lib/telephony/phone";
import { listAccountNumbers } from "@/lib/telephony/numbers";
import { isStopKeyword, withSignature } from "./segments";

export const SMS_MAX_CHARS = 1000;

export class SmsError extends Error {
    constructor(message: string, public status = 400) {
        super(message);
    }
}

/** Twilio's error codes, in words an SDR can act on. */
function twilioErrorMessage(code: number | undefined, fallback: string): string {
    switch (code) {
        case 21211:
        case 21614:
            return "Ce numéro ne peut pas recevoir de SMS (numéro invalide ou fixe).";
        case 21408:
            return "Les SMS vers ce pays ne sont pas activés sur le compte Twilio (Geo permissions).";
        case 21606:
        case 21659:
            return "Votre numéro Twilio ne permet pas d'envoyer des SMS. Demandez un numéro mobile à votre manager.";
        case 21610:
            return "Ce destinataire a refusé vos SMS (STOP).";
        case 21612:
            return "Twilio ne peut pas envoyer de SMS entre ces deux numéros.";
        default:
            return fallback;
    }
}

function client(config: TwilioConfig) {
    return twilio(config.apiKeySid, config.apiKeySecret, { accountSid: config.accountSid });
}

/** The active user a Twilio number is assigned to. */
export async function holderOfNumber(number: string) {
    const e164 = toE164(number);
    if (!e164) return null;
    const users = await prisma.user.findMany({
        where: { isActive: true, twilioCallerId: { not: null } },
        select: { id: true, name: true, role: true, twilioCallerId: true, smsSignature: true },
    });
    return users.find((u) => toE164(u.twilioCallerId) === e164) ?? null;
}

export async function sendSms(
    config: TwilioConfig,
    userId: string,
    input: { to: string; body: string; contactId?: string | null; companyId?: string | null; campaignId?: string | null },
): Promise<SmsMessage> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true, twilioCallerId: true, smsSignature: true } });
    const line = toE164(user?.twilioCallerId);
    if (!user?.isActive || !line) throw new SmsError("Aucun numéro Twilio attribué : demandez-en un à votre manager (Paramètres → Téléphonie).", 409);

    // A landline number cannot text: say so before Twilio does (when Twilio answers quickly).
    try {
        const numbers = await Promise.race([listAccountNumbers(config), new Promise<null>((r) => setTimeout(() => r(null), 2500))]);
        const own = numbers?.find((n) => n.number === line);
        if (own && !own.sms) {
            throw new SmsError(`Votre numéro ${line} ne permet pas d'envoyer des SMS (numéro fixe). Demandez un numéro mobile à votre manager.`, 409);
        }
    } catch (err) {
        if (err instanceof SmsError) throw err; // Twilio unreachable: let the send itself decide
    }

    const check = checkDialNumber(input.to, { allowedCountries: config.allowedCountries });
    if (!check.ok) throw new SmsError(check.message, 422);
    const to = check.e164;
    if (await prisma.smsOptOut.findUnique({ where: { number: to } })) {
        throw new SmsError("Ce numéro a demandé à ne plus recevoir de SMS (STOP).", 403);
    }

    const text = input.body.trim();
    if (!text) throw new SmsError("Message vide");
    const body = withSignature(text, user.smsSignature);
    if (body.length > SMS_MAX_CHARS) throw new SmsError(`Message trop long (${SMS_MAX_CHARS} caractères maximum)`);

    const statusCallback = publicUrl("/api/webhooks/twilio/sms?step=status");
    let sid: string | null = null;
    let status = "queued";
    let errorCode: string | null = null;
    try {
        const msg = await client(config).messages.create({
            from: line,
            to,
            body,
            ...(statusCallback?.startsWith("https://") ? { statusCallback } : {}),
        });
        sid = msg.sid;
        status = msg.status ?? "queued";
    } catch (err) {
        const e = err as { code?: number; message?: string };
        errorCode = typeof e.code === "number" ? String(e.code) : null; // Twilio's codes only, not network errors
        await prisma.smsMessage.create({
            data: { sdrId: userId, direction: "OUTBOUND", prospectNumber: to, lineNumber: line, body, status: "failed", errorCode, contactId: input.contactId ?? null, companyId: input.companyId ?? null, campaignId: input.campaignId ?? null },
        });
        throw new SmsError(twilioErrorMessage(e.code, "Twilio a refusé le SMS"), 502);
    }
    return prisma.smsMessage.create({
        data: {
            sdrId: userId,
            direction: "OUTBOUND",
            prospectNumber: to,
            lineNumber: line,
            body,
            status,
            twilioSid: sid,
            contactId: input.contactId ?? null,
            companyId: input.companyId ?? null,
            campaignId: input.campaignId ?? null,
        },
    });
}

/** Delivery report (statusCallback): queued → sent → delivered / undelivered / failed. */
export async function applySmsStatus(params: Record<string, string>): Promise<void> {
    const sid = params.MessageSid ?? params.SmsSid;
    const status = (params.MessageStatus ?? params.SmsStatus ?? "").toLowerCase();
    if (!sid || !status) return;
    await prisma.smsMessage.updateMany({ where: { twilioSid: sid }, data: { status, errorCode: params.ErrorCode || null } });
}

/** A prospect texted one of our numbers. Idempotent on MessageSid. */
export async function receiveSms(params: Record<string, string>): Promise<{ stored: boolean; optOut: boolean }> {
    const sid = params.MessageSid ?? params.SmsSid ?? null;
    if (sid && (await prisma.smsMessage.findUnique({ where: { twilioSid: sid }, select: { id: true } }))) return { stored: false, optOut: false };
    const owner = await holderOfNumber(params.To ?? "");
    if (!owner) return { stored: false, optOut: false };
    const from = toE164(params.From ?? "") ?? params.From ?? "";
    const body = (params.Body ?? "").slice(0, 5000);

    let contactId: string | null = null;
    let companyId: string | null = null;
    let who = from;
    try {
        const best = (await findCallerCandidates(from, owner.id))[0];
        if (best) {
            contactId = best.contactId;
            companyId = best.companyId;
            who = best.callerName ?? best.companyName ?? from;
        }
    } catch (err) {
        console.error("[messaging/sms] caller lookup failed", err);
    }

    await prisma.smsMessage.create({
        data: {
            sdrId: owner.id,
            direction: "INBOUND",
            prospectNumber: from,
            lineNumber: toE164(owner.twilioCallerId) ?? owner.twilioCallerId!,
            body,
            status: "received",
            twilioSid: sid,
            contactId,
            companyId,
        },
    });

    const stop = isStopKeyword(body);
    if (stop) {
        await prisma.smsOptOut.upsert({ where: { number: from }, create: { number: from, keyword: stop }, update: {} });
    }
    await createNotification({
        userId: owner.id,
        title: stop ? "Désinscription SMS" : "Nouveau SMS",
        message: stop ? `${who} ne souhaite plus recevoir de SMS (${stop}).` : `${who} : « ${body.slice(0, 140)}${body.length > 140 ? "…" : ""} »`,
        type: stop ? "warning" : "info",
        link: `${owner.role === "MANAGER" ? "/manager" : "/sdr"}/messages?n=${encodeURIComponent(from)}`,
    });
    return { stored: true, optOut: Boolean(stop) };
}

// ── Reading ─────────────────────────────────────────────────────────────────

export interface SmsView {
    id: string;
    direction: "OUTBOUND" | "INBOUND";
    body: string;
    status: string;
    errorCode: string | null;
    at: string;
    readAt: string | null;
}

const toView = (m: SmsMessage): SmsView => ({
    id: m.id,
    direction: m.direction,
    body: m.body,
    status: m.status,
    errorCode: m.errorCode,
    at: m.createdAt.toISOString(),
    readAt: m.readAt?.toISOString() ?? null,
});

/** The prospect's numbers on file (contact first, then the company's). */
export async function prospectNumbers(contactId: string | null, companyId: string | null): Promise<string[]> {
    const [contact, company] = await Promise.all([
        contactId ? prisma.contact.findUnique({ where: { id: contactId }, select: { phone: true, additionalPhones: true, company: { select: { phone: true } } } }) : null,
        companyId ? prisma.company.findUnique({ where: { id: companyId }, select: { phone: true } }) : null,
    ]);
    const raw = [contact?.phone, ...((contact?.additionalPhones as string[] | null) ?? []), contact?.company?.phone, company?.phone];
    return [...new Set(raw.flatMap((r) => phonesInField(r)).map((n) => toE164(n)).filter((n): n is string => Boolean(n)))];
}

/** One conversation (messages with any of `numbers`, or tagged with the prospect); inbound marked read. */
export async function getThread(userId: string, q: { numbers: string[]; contactId?: string | null; companyId?: string | null }) {
    const or = [
        ...(q.numbers.length ? [{ prospectNumber: { in: q.numbers } }] : []),
        ...(q.contactId ? [{ contactId: q.contactId }] : []),
        ...(q.companyId && !q.contactId ? [{ companyId: q.companyId }] : []),
    ];
    if (!or.length) return { messages: [] as SmsView[], optedOut: [] as string[] };
    const messages = await prisma.smsMessage.findMany({ where: { sdrId: userId, OR: or }, orderBy: { createdAt: "asc" }, take: 300 });
    const unread = messages.filter((m) => m.direction === "INBOUND" && !m.readAt).map((m) => m.id);
    if (unread.length) await prisma.smsMessage.updateMany({ where: { id: { in: unread } }, data: { readAt: new Date() } });
    const numbers = [...new Set([...q.numbers, ...messages.map((m) => m.prospectNumber)])];
    const optedOut = numbers.length ? (await prisma.smsOptOut.findMany({ where: { number: { in: numbers } }, select: { number: true } })).map((o) => o.number) : [];
    return { messages: messages.map(toView), optedOut };
}

export interface ThreadSummary {
    prospectNumber: string;
    name: string | null;
    company: string | null;
    contactId: string | null;
    companyId: string | null;
    last: SmsView;
    unread: number;
}

/** The user's conversations, most recent first. */
export async function listThreads(userId: string, limit = 60): Promise<ThreadSummary[]> {
    const recent = await prisma.smsMessage.findMany({ where: { sdrId: userId }, orderBy: { createdAt: "desc" }, take: 1000 });
    const byNumber = new Map<string, SmsMessage[]>();
    for (const m of recent) {
        const list = byNumber.get(m.prospectNumber) ?? [];
        list.push(m);
        byNumber.set(m.prospectNumber, list);
    }
    const threads = [...byNumber.entries()].slice(0, limit);
    const contactIds = [...new Set(threads.flatMap(([, ms]) => ms.map((m) => m.contactId)).filter((v): v is string => Boolean(v)))];
    const companyIds = [...new Set(threads.flatMap(([, ms]) => ms.map((m) => m.companyId)).filter((v): v is string => Boolean(v)))];
    const [contacts, companies] = await Promise.all([
        contactIds.length ? prisma.contact.findMany({ where: { id: { in: contactIds } }, select: { id: true, firstName: true, lastName: true, company: { select: { name: true } } } }) : [],
        companyIds.length ? prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } }) : [],
    ]);
    const contactOf = new Map(contacts.map((c) => [c.id, c]));
    const companyOf = new Map(companies.map((c) => [c.id, c]));
    return threads.map(([number, ms]) => {
        const contactId = ms.find((m) => m.contactId)?.contactId ?? null;
        const companyId = ms.find((m) => m.companyId)?.companyId ?? null;
        const c = contactId ? contactOf.get(contactId) : undefined;
        const name = c ? [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || null : null;
        return {
            prospectNumber: number,
            name,
            company: c?.company?.name ?? (companyId ? companyOf.get(companyId)?.name ?? null : null),
            contactId,
            companyId,
            last: toView(ms[0]),
            unread: ms.filter((m) => m.direction === "INBOUND" && !m.readAt).length,
        };
    });
}

/** My Twilio line and whether it can text (null = unknown, Twilio unreachable). */
export async function myLine(config: TwilioConfig | null, userId: string): Promise<{ line: string | null; canText: boolean | null }> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { twilioCallerId: true } });
    const line = toE164(user?.twilioCallerId);
    if (!config || !line) return { line, canText: null };
    // Never let a slow Twilio hold up the inbox: after 2.5 s the answer is « unknown ».
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));
    try {
        const numbers = await Promise.race([listAccountNumbers(config), timeout]);
        return { line, canText: numbers ? numbers.find((n) => n.number === line)?.sms ?? null : null };
    } catch {
        return { line, canText: null };
    }
}

export async function unreadCount(userId: string): Promise<number> {
    return prisma.smsMessage.count({ where: { sdrId: userId, direction: "INBOUND", readAt: null } });
}
