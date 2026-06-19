import { NextRequest } from "next/server";
import { DateTime } from "luxon";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAlloNumbersForAction } from "@/lib/call-enrichment/enrich-action";
import { callProvider } from "@/lib/call-enrichment/provider";
import { errorResponse, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { parsePhoneNumber, isValidPhoneNumber } from "libphonenumber-js";

const DEFAULT_COUNTRY = (process.env.PHONE_DEFAULT_COUNTRY ?? "FR") as Parameters<typeof isValidPhoneNumber>[1];
const ENRICHMENT_DAY_TZ = process.env.CALL_ENRICHMENT_DAY_TZ ?? "Europe/Paris";
const MAX_ACTIONS = 150;
const schema = z.object({
  actionIds: z.array(z.string().min(1)).min(1).max(MAX_ACTIONS),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  phone: z.string().trim().min(1).max(40).optional(),
});
const syncSchema = z.object({
  items: z
    .array(
      z.object({
        actionId: z.string().min(1),
        summary: z.string().nullable().optional(),
        transcription: z.string().nullable().optional(),
        recordingUrl: z.string().nullable().optional(),
      }),
    )
    .min(1)
    .max(MAX_ACTIONS),
});

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    if (isValidPhoneNumber(raw, DEFAULT_COUNTRY)) {
      return parsePhoneNumber(raw, DEFAULT_COUNTRY).format("E.164");
    }
    return null;
  } catch {
    return null;
  }
}

function extractPhoneCandidates(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const text = raw.trim();
  if (!text) return [];
  const chunks = text.match(/(?:\+|00)?\d(?:[\d\s()./-]{6,}\d)?/g) ?? [];
  if (chunks.length === 0) return [text];
  const candidates = new Set<string>();
  for (const chunk of chunks) {
    const cleaned = chunk.replace(/[^\d+]/g, "");
    if (!cleaned) continue;
    candidates.add(cleaned);
    if (cleaned.startsWith("00")) candidates.add(`+${cleaned.slice(2)}`);
    const digitsOnly = cleaned.replace(/\D/g, "");
    if (digitsOnly.length === 10 && digitsOnly.startsWith("0")) {
      candidates.add(digitsOnly);
      candidates.add(`+33${digitsOnly.slice(1)}`);
    }
    if (digitsOnly.length === 11 && digitsOnly.startsWith("33")) candidates.add(`+${digitsOnly}`);
  }
  return [...candidates];
}

function normalizePhonesFromField(raw: string | null | undefined): string[] {
  return [
    ...new Set(
      extractPhoneCandidates(raw)
        .map(normalizePhone)
        .filter((p): p is string => p !== null),
    ),
  ];
}

function phoneMatchesFilter(phones: string[], filter: string | undefined): boolean {
  const needle = filter?.replace(/\D/g, "");
  if (!needle) return true;
  return phones.some((phone) => phone.replace(/\D/g, "").includes(needle));
}

function extractAdditionalPhonesFromJson(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const asRecord = data as Record<string, unknown>;
  const candidates: unknown[] = [];
  for (const key of ["additionalPhones", "phones", "phoneNumbers"]) {
    if (key in asRecord) candidates.push(asRecord[key]);
  }
  const flattened = candidates.flatMap((value) =>
    Array.isArray(value) ? value : value == null ? [] : [value],
  );
  return flattened
    .map((v) => (typeof v === "string" ? v : null))
    .filter((v): v is string => !!v);
}

function calendarDayWindow(date: Date): { start: Date; end: Date } {
  const local = DateTime.fromJSDate(date, { zone: "utc" }).setZone(ENRICHMENT_DAY_TZ);
  return {
    start: local.startOf("day").toUTC().toJSDate(),
    end: local.endOf("day").toUTC().toJSDate(),
  };
}

function relativeWindow(date: Date, beforeHours: number, afterHours: number): { start: Date; end: Date } {
  return {
    start: new Date(date.getTime() - beforeHours * 60 * 60 * 1000),
    end: new Date(date.getTime() + afterHours * 60 * 60 * 1000),
  };
}

type MatchResult = {
  summary?: string;
  transcription?: string;
  recordingUrl?: string;
  windowLabel: string;
};

type SearchAttempt = {
  label: string;
  found: boolean;
};

async function findBestMatchForAction(input: {
  sdrId: string;
  createdAt: Date;
  callbackDate: Date | null;
  phones: string[];
  alloNumbers: string[];
}): Promise<{ match: MatchResult | null; attempts: SearchAttempt[] }> {
  const windows: Array<{ label: string; start: Date; end: Date }> = [];
  const attempts: SearchAttempt[] = [];
  if (input.callbackDate) {
    const day = calendarDayWindow(input.callbackDate);
    windows.push({ label: "Jour RDV", start: day.start, end: day.end });
    const rel = relativeWindow(input.callbackDate, 24, 24);
    windows.push({ label: "RDV ±24h", start: rel.start, end: rel.end });
  }
  const createdDay = calendarDayWindow(input.createdAt);
  windows.push({ label: "Jour création action", start: createdDay.start, end: createdDay.end });
  const createdRel = relativeWindow(input.createdAt, 24, 24);
  windows.push({ label: "Création ±24h", start: createdRel.start, end: createdRel.end });

  for (const w of windows) {
    const record = await callProvider.fetchMatchingCallRecord({
      phones: input.phones,
      alloNumbers: input.alloNumbers,
      sdrId: input.sdrId,
      windowStart: w.start,
      windowEnd: w.end,
    });
    if (record && (record.recordingUrl?.trim() || record.transcription?.trim() || record.summary?.trim())) {
      attempts.push({ label: w.label, found: true });
      return {
        attempts,
        match: {
          summary: record.summary?.trim() || undefined,
          transcription: record.transcription?.trim() || undefined,
          recordingUrl: record.recordingUrl?.trim() || undefined,
          windowLabel: w.label,
        },
      };
    }
    attempts.push({ label: w.label, found: false });
  }
  return { match: null, attempts };
}

async function fetchRdvActions(input: { actionIds: string[]; dateFrom?: string; dateTo?: string }) {
  const callbackDate: { gte?: Date; lte?: Date } = {};
  if (input.dateFrom) callbackDate.gte = DateTime.fromISO(input.dateFrom).startOf("day").toJSDate();
  if (input.dateTo) callbackDate.lte = DateTime.fromISO(input.dateTo).endOf("day").toJSDate();

  return prisma.action.findMany({
    where: {
      id: { in: input.actionIds },
      result: { in: ["MEETING_BOOKED", "MEETING_CANCELLED"] },
      ...(input.dateFrom || input.dateTo ? { callbackDate } : {}),
    },
    select: {
      id: true,
      sdrId: true,
      createdAt: true,
      callbackDate: true,
      meetingPhone: true,
      contact: {
        select: {
          firstName: true,
          lastName: true,
          phone: true,
          additionalPhones: true,
        },
      },
      company: {
        select: {
          name: true,
          phone: true,
          customData: true,
        },
      },
      callSummary: true,
      callTranscription: true,
      callRecordingUrl: true,
    },
  });
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  await requireRole(["MANAGER"], request);
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return errorResponse("actionIds invalides", 400);

  const actionIds = [...new Set(parsed.data.actionIds)];
  const actions = await fetchRdvActions({
    actionIds,
    dateFrom: parsed.data.dateFrom,
    dateTo: parsed.data.dateTo,
  });
  if (actions.length === 0) return successResponse({ items: [] });

  const actionsWithPhones = actions
    .map((a) => {
      const phones = [
        ...normalizePhonesFromField(a.meetingPhone),
        ...normalizePhonesFromField(a.contact?.phone),
        ...normalizePhonesFromField(a.company?.phone),
        ...extractAdditionalPhonesFromJson(a.contact?.additionalPhones).flatMap((p) => normalizePhonesFromField(p)),
        ...extractAdditionalPhonesFromJson(a.company?.customData).flatMap((p) => normalizePhonesFromField(p)),
      ];
      const dedupedPhones = [...new Set(phones)];
      return { action: a, phones: dedupedPhones };
    })
    .filter(({ phones }) => phoneMatchesFilter(phones, parsed.data.phone));

  if (actionsWithPhones.length === 0) return successResponse({ items: [], matchedCount: 0 });

  const items = await Promise.all(
    actionsWithPhones.map(async ({ action: a, phones: dedupedPhones }) => {
      const searchWays = [
        "meetingPhone",
        "contact.phone",
        "company.phone",
        "contact.additionalPhones",
        "company.customData(additionalPhones/phones/phoneNumbers)",
      ];
      const lookup =
        dedupedPhones.length > 0
          ? await getAlloNumbersForAction(a.sdrId).then(({ alloNumbers }) =>
              alloNumbers.length > 0
                ? findBestMatchForAction({
                    sdrId: a.sdrId,
                    createdAt: a.createdAt,
                    callbackDate: a.callbackDate,
                    phones: dedupedPhones,
                    alloNumbers,
                  })
                : { match: null, attempts: [] as SearchAttempt[] },
            )
          : { match: null, attempts: [] as SearchAttempt[] };
      const contactName = [a.contact?.firstName, a.contact?.lastName].filter(Boolean).join(" ").trim() || "—";
      return {
        actionId: a.id,
        contactName,
        companyName: a.company?.name || "—",
        phonesTried: dedupedPhones,
        existing: {
          hasSummary: !!a.callSummary?.trim(),
          hasTranscription: !!a.callTranscription?.trim(),
          hasRecording: !!a.callRecordingUrl?.trim(),
        },
        searchWays,
        windowAttempts: lookup.attempts,
        match: lookup.match
          ? {
              windowLabel: lookup.match.windowLabel,
              hasSummary: !!lookup.match.summary,
              hasTranscription: !!lookup.match.transcription,
              hasRecording: !!lookup.match.recordingUrl,
              syncPayload: {
                summary: lookup.match.summary ?? null,
                transcription: lookup.match.transcription ?? null,
                recordingUrl: lookup.match.recordingUrl ?? null,
              },
            }
          : null,
      };
    }),
  );

  return successResponse({
    items,
    matchedCount: items.filter((i) => !!i.match).length,
  });
});

export const PATCH = withErrorHandler(async (request: NextRequest) => {
  await requireRole(["MANAGER"], request);
  const parsed = syncSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse("items invalides", 400);

  const unique = new Map<string, { summary?: string | null; transcription?: string | null; recordingUrl?: string | null }>();
  for (const item of parsed.data.items) {
    unique.set(item.actionId, {
      summary: item.summary ?? null,
      transcription: item.transcription ?? null,
      recordingUrl: item.recordingUrl ?? null,
    });
  }
  const actionIds = [...unique.keys()];
  const actions = await prisma.action.findMany({
    where: {
      id: { in: actionIds },
      result: { in: ["MEETING_BOOKED", "MEETING_CANCELLED"] },
    },
    select: { id: true },
  });
  if (actions.length === 0) return successResponse({ synced: 0, noMatch: 0, noPhone: 0, total: 0 });

  let synced = 0;
  let noMatch = 0;
  for (const a of actions) {
    const payload = unique.get(a.id);
    if (!payload) continue;
    const hasAny = !!(payload.summary?.trim() || payload.transcription?.trim() || payload.recordingUrl?.trim());
    if (!hasAny) {
      noMatch += 1;
      continue;
    }
    await prisma.action.update({
      where: { id: a.id },
      data: {
        callSummary: payload.summary ?? null,
        callTranscription: payload.transcription ?? null,
        callRecordingUrl: payload.recordingUrl ?? null,
        callEnrichmentAt: new Date(),
        callEnrichmentError: null,
      },
    });
    synced += 1;
  }

  return successResponse({ synced, noMatch, noPhone: 0, total: actions.length });
});

