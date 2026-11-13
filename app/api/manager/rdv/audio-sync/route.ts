import { NextRequest, after } from "next/server";
import { DateTime } from "luxon";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAlloNumbersForAction } from "@/lib/call-enrichment/enrich-action";
import { findCallWithFallback } from "@/lib/call-enrichment/provider";
import {
  extractAdditionalPhonesFromJson,
  normalizePhonesFromField,
  rdvSearchWindows,
} from "@/lib/call-enrichment/rdv-call-context";
import { fillRdvFicheIfEmpty } from "@/lib/call-enrichment/rdv-fiche";
import { errorResponse, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
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

function phoneMatchesFilter(phones: string[], filter: string | undefined): boolean {
  const needle = filter?.replace(/\D/g, "");
  if (!needle) return true;
  return phones.some((phone) => phone.replace(/\D/g, "").includes(needle));
}

/** Runs `fn` over `items` with at most `limit` in flight (Allo rate-limits bursts). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
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
      contactId: true,
      companyId: true,
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

  const items = await mapLimit(actionsWithPhones, 4, async ({ action: a, phones: dedupedPhones }) => {
    const searchWays = [
      "meetingPhone",
      "contact.phone",
      "company.phone",
      "contact.additionalPhones",
      "company.customData(additionalPhones/phones/phoneNumbers)",
    ];
    const { alloNumbers } = await getAlloNumbersForAction(a.sdrId);
    // Call Vault → Twilio → Allo, each on every window, closest window first.
    const { record, attempts } = await findCallWithFallback({
      phones: dedupedPhones,
      alloNumbers,
      sdrId: a.sdrId,
      actionId: a.id,
      contactId: a.contactId,
      companyId: a.companyId,
      windows: rdvSearchWindows({ createdAt: a.createdAt, callbackDate: a.callbackDate }),
    });
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
      sourceAttempts: attempts,
      match: record
        ? {
            source: record.source,
            windowLabel: record.window,
            hasSummary: !!record.summary,
            hasTranscription: !!record.transcription,
            hasRecording: !!record.recordingUrl,
            syncPayload: {
              summary: record.summary ?? null,
              transcription: record.transcription ?? null,
              recordingUrl: record.recordingUrl ?? null,
            },
          }
        : null,
    };
  });

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
  const withTranscript: string[] = [];
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
    if (payload.transcription?.trim()) withTranscript.push(a.id);
  }

  // Fiches are written from the transcripts after the response (one AI call each).
  if (withTranscript.length) {
    after(async () => {
      for (const id of withTranscript) await fillRdvFicheIfEmpty(id);
    });
  }

  return successResponse({ synced, noMatch, noPhone: 0, total: actions.length });
});

