// ============================================
// Everything the call sources need to find an RDV's call: the prospect's
// numbers (normalized, deduplicated, labelled by where they come from) and
// the time windows to search, closest first.
// ============================================

import { DateTime } from "luxon";
import { parsePhoneNumber, isValidPhoneNumber } from "libphonenumber-js";
import { prisma } from "@/lib/prisma";
import { getAlloNumbersForAction } from "./enrich-action";
import type { SearchWindow } from "./provider";

const DEFAULT_COUNTRY = (process.env.PHONE_DEFAULT_COUNTRY ?? "FR") as Parameters<typeof isValidPhoneNumber>[1];
const ENRICHMENT_DAY_TZ = process.env.CALL_ENRICHMENT_DAY_TZ ?? "Europe/Paris";

export type PhoneSourceKey = "contact" | "company" | "meeting" | "other";

export interface PhoneSource {
    key: PhoneSourceKey;
    label: string;
    /** E.164 */
    phone: string;
    rawPhone: string;
}

export function normalizePhone(raw: string | null | undefined): string | null {
    if (!raw) return null;
    try {
        if (isValidPhoneNumber(raw, DEFAULT_COUNTRY)) return parsePhoneNumber(raw, DEFAULT_COUNTRY).format("E.164");
        return null;
    } catch {
        return null;
    }
}

/** Every number written in a field ("07 57 59 24 77 / +33 7 57…", 0033…, bare digits). */
export function extractPhoneCandidates(raw: string | null | undefined): string[] {
    const text = raw?.trim();
    if (!text) return [];
    const chunks = text.match(/(?:\+|00)?\d(?:[\d\s()./-]{6,}\d)?/g) ?? [];
    if (chunks.length === 0) return [text];
    const candidates = new Set<string>();
    for (const chunk of chunks) {
        const cleaned = chunk.replace(/[^\d+]/g, "");
        if (!cleaned) continue;
        candidates.add(cleaned);
        if (cleaned.startsWith("00")) candidates.add(`+${cleaned.slice(2)}`);
        const digits = cleaned.replace(/\D/g, "");
        if (digits.length === 10 && digits.startsWith("0")) {
            candidates.add(digits);
            candidates.add(`+33${digits.slice(1)}`);
        }
        if (digits.length === 11 && digits.startsWith("33")) candidates.add(`+${digits}`);
    }
    return [...candidates];
}

export function normalizePhonesFromField(raw: string | null | undefined): string[] {
    return [...new Set(extractPhoneCandidates(raw).map(normalizePhone).filter((p): p is string => p !== null))];
}

/** additionalPhones / phones / phoneNumbers arrays stored in JSON columns. */
export function extractAdditionalPhonesFromJson(data: unknown): string[] {
    if (!data || typeof data !== "object") return [];
    if (Array.isArray(data)) return data.filter((v): v is string => typeof v === "string");
    const r = data as Record<string, unknown>;
    return ["additionalPhones", "phones", "phoneNumbers"]
        .flatMap((k) => {
            const v = r[k];
            return Array.isArray(v) ? v : v == null ? [] : [v];
        })
        .filter((v): v is string => typeof v === "string");
}

/** E.164, French local and no-plus forms — how providers may write the same number. */
export function phoneVariants(e164: string): string[] {
    const variants = new Set([e164]);
    if (e164.startsWith("+33")) variants.add("0" + e164.slice(3));
    if (e164.startsWith("+")) variants.add(e164.slice(1));
    return [...variants];
}

/** True when `number` (as a provider wrote it) is one of `e164`'s forms. */
export function numberMatches(number: string | null | undefined, e164: string): boolean {
    const n = (number ?? "").replace(/\s+/g, "").toLowerCase();
    if (!n) return false;
    return phoneVariants(e164).some((v) => n.includes(v.toLowerCase()));
}

export function calendarDayWindow(date: Date): { start: Date; end: Date } {
    const local = DateTime.fromJSDate(date, { zone: "utc" }).setZone(ENRICHMENT_DAY_TZ);
    return { start: local.startOf("day").toUTC().toJSDate(), end: local.endOf("day").toUTC().toJSDate() };
}

export function relativeWindow(date: Date, beforeHours: number, afterHours: number): { start: Date; end: Date } {
    return {
        start: new Date(date.getTime() - beforeHours * 3_600_000),
        end: new Date(date.getTime() + afterHours * 3_600_000),
    };
}

/**
 * Where the booking call can be, closest first: the day the RDV was logged (the
 * booking call), then ±24h around it, then around the RDV date itself (an RDV
 * logged afterwards, or a call on the meeting day).
 */
export function rdvSearchWindows(input: { createdAt: Date; callbackDate: Date | null }): SearchWindow[] {
    const windows: SearchWindow[] = [];
    const createdDay = calendarDayWindow(input.createdAt);
    windows.push({ label: "Jour de prise du RDV", ...createdDay });
    windows.push({ label: "Prise du RDV ±24h", ...relativeWindow(input.createdAt, 24, 24) });
    if (input.callbackDate) {
        windows.push({ label: "Jour du RDV", ...calendarDayWindow(input.callbackDate) });
        windows.push({ label: "RDV ±24h", ...relativeWindow(input.callbackDate, 24, 24) });
    }
    return windows;
}

export interface RdvCallContext {
    actionId: string;
    sdrId: string;
    contactId: string | null;
    companyId: string | null;
    createdAt: Date;
    callbackDate: Date | null;
    phoneSources: PhoneSource[];
    phones: string[];
    alloNumbers: string[];
    windows: SearchWindow[];
}

/** Loads the RDV (MEETING_BOOKED / MEETING_CANCELLED) and builds its search context. */
export async function loadRdvCallContext(actionId: string): Promise<RdvCallContext | null> {
    const action = await prisma.action.findUnique({
        where: { id: actionId, result: { in: ["MEETING_BOOKED", "MEETING_CANCELLED"] } },
        select: {
            id: true,
            sdrId: true,
            contactId: true,
            companyId: true,
            createdAt: true,
            callbackDate: true,
            meetingPhone: true,
            contact: { select: { firstName: true, lastName: true, phone: true, additionalPhones: true } },
            company: { select: { name: true, phone: true, customData: true } },
        },
    });
    if (!action) return null;

    const contactLabel = [action.contact?.firstName, action.contact?.lastName].filter(Boolean).join(" ").trim() || "Contact";
    const fields: Array<{ key: PhoneSourceKey; label: string; raw: string | null | undefined }> = [
        { key: "contact", label: contactLabel, raw: action.contact?.phone },
        { key: "meeting", label: "Téléphone RDV", raw: action.meetingPhone },
        { key: "company", label: action.company?.name || "Société", raw: action.company?.phone },
        ...extractAdditionalPhonesFromJson(action.contact?.additionalPhones).map((raw) => ({ key: "other" as const, label: `${contactLabel} (autre)`, raw })),
        ...extractAdditionalPhonesFromJson(action.company?.customData).map((raw) => ({ key: "other" as const, label: `${action.company?.name || "Société"} (autre)`, raw })),
    ];

    const seen = new Set<string>();
    const phoneSources: PhoneSource[] = [];
    for (const f of fields) {
        for (const phone of normalizePhonesFromField(f.raw)) {
            if (seen.has(phone)) continue;
            seen.add(phone);
            phoneSources.push({ key: f.key, label: f.label, phone, rawPhone: f.raw ?? phone });
        }
    }

    const { alloNumbers } = await getAlloNumbersForAction(action.sdrId);

    return {
        actionId: action.id,
        sdrId: action.sdrId,
        contactId: action.contactId,
        companyId: action.companyId,
        createdAt: action.createdAt,
        callbackDate: action.callbackDate,
        phoneSources,
        phones: phoneSources.map((p) => p.phone),
        alloNumbers,
        windows: rdvSearchWindows({ createdAt: action.createdAt, callbackDate: action.callbackDate }),
    };
}
