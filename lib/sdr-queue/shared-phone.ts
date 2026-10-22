/**
 * "Numéro déjà appelé via un autre contact" warning for the SDR action page.
 *
 * Contacts without a direct line are dialed on their company's standard, so an
 * SDR working three contacts of one company can ring the same number three
 * times without noticing. An Action doesn't record which number was dialed, so
 * it is inferred the way the page does: the contact's own phone, else the
 * company standard (a company-level action dials the company standard).
 *
 * A row is flagged when another contact (or a company-level action) of the same
 * company was called on the very number this row would dial. Shared by
 * /api/sdr/action-queue and /api/actions/next.
 */

import { prisma } from "@/lib/prisma";

/** Same horizon as the "Déjà contacté" warning (35 days). */
export const SHARED_PHONE_WINDOW_MS = 35 * 24 * 60 * 60 * 1000;

export interface SharedPhoneCall {
    calledAt: string;
    sdrId: string | null;
    sdrName: string | null;
    /** The other contact the number was dialed for; null for a company-level call. */
    contactName: string | null;
}

export interface SharedPhoneRow {
    contactId: string | null;
    companyId: string;
    /** The number the row displays / would dial: contact phone, else company standard. */
    phone: string | null | undefined;
}

export interface SharedPhoneAction {
    createdAt: Date;
    contactId: string | null;
    /** Company of the action, resolved through the contact when the action has none. */
    companyId: string | null;
    /** Number that was dialed for this action (contact phone, else company standard). */
    dialedPhone: string | null;
    sdrId: string | null;
    sdrName: string | null;
    contactName: string | null;
}

/**
 * Comparable form of a phone number: digits only, French numbers folded to
 * 33XXXXXXXXX whatever the notation ("04 72…", "+33 (0)4 72…", "0033 4 72…").
 * When a field holds several numbers ("04… / 06…") the first one counts, like
 * the number the page displays. Returns null for junk ("44", an email, …).
 */
export function phoneKey(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const first = raw.split(/[\/;|]|\bou\b/i)[0];
    let digits = first.replace(/\D/g, "");
    if (digits.startsWith("00")) digits = digits.slice(2);
    else if (digits.startsWith("0")) digits = `33${digits.slice(1)}`;
    if (digits.startsWith("330")) digits = `33${digits.slice(3)}`; // "+33 (0)4…"
    return digits.length >= 7 && digits.length <= 15 ? digits : null;
}

export function sharedPhoneRowKey(contactId: string | null, companyId: string): string {
    return `${contactId ?? ""}:${companyId}`;
}

/** Pure matching step: `actions` must be newest first. */
export function matchSharedPhoneCalls(
    rows: SharedPhoneRow[],
    actions: SharedPhoneAction[],
): Map<string, SharedPhoneCall> {
    const byCompany = new Map<string, SharedPhoneAction[]>();
    for (const action of actions) {
        if (!action.companyId) continue;
        const list = byCompany.get(action.companyId);
        if (list) list.push(action);
        else byCompany.set(action.companyId, [action]);
    }

    const result = new Map<string, SharedPhoneCall>();
    for (const row of rows) {
        const key = phoneKey(row.phone);
        if (!key) continue;
        const hit = byCompany
            .get(row.companyId)
            ?.find((a) => a.contactId !== row.contactId && phoneKey(a.dialedPhone) === key);
        if (!hit) continue;
        result.set(sharedPhoneRowKey(row.contactId, row.companyId), {
            calledAt: hit.createdAt.toISOString(),
            sdrId: hit.sdrId,
            sdrName: hit.sdrName,
            contactName: hit.contactName,
        });
    }
    return result;
}

/**
 * Fail-open: a badge must never take the queue down, so any error yields an
 * empty map.
 */
export async function findSharedPhoneCalls(
    rows: SharedPhoneRow[],
    now: Date = new Date(),
): Promise<Map<string, SharedPhoneCall>> {
    const candidates = rows.filter((r) => phoneKey(r.phone));
    if (candidates.length === 0) return new Map();
    const companyIds = Array.from(new Set(candidates.map((r) => r.companyId)));

    try {
        const actions = await prisma.action.findMany({
            where: {
                channel: "CALL",
                createdAt: { gte: new Date(now.getTime() - SHARED_PHONE_WINDOW_MS) },
                OR: [{ companyId: { in: companyIds } }, { contact: { companyId: { in: companyIds } } }],
            },
            orderBy: { createdAt: "desc" },
            take: 5000,
            select: {
                createdAt: true,
                contactId: true,
                companyId: true,
                sdr: { select: { id: true, name: true } },
                company: { select: { phone: true } },
                contact: {
                    select: {
                        firstName: true,
                        lastName: true,
                        phone: true,
                        companyId: true,
                        company: { select: { phone: true } },
                    },
                },
            },
        });

        return matchSharedPhoneCalls(
            candidates,
            actions.map((a) => ({
                createdAt: a.createdAt,
                contactId: a.contactId,
                companyId: a.contact?.companyId ?? a.companyId,
                dialedPhone: a.contact
                    ? a.contact.phone || a.contact.company.phone
                    : a.company?.phone ?? null,
                sdrId: a.sdr?.id ?? null,
                sdrName: a.sdr?.name ?? null,
                contactName: a.contact
                    ? `${a.contact.firstName ?? ""} ${a.contact.lastName ?? ""}`.trim() || null
                    : null,
            })),
        );
    } catch (error) {
        console.error("[shared-phone] lookup failed", error);
        return new Map();
    }
}
