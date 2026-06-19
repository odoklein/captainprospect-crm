import { DateTime } from 'luxon';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';
import { prisma } from '@/lib/prisma';
import { ceDebug, isCallEnrichmentDebug } from './debug';
import { callProvider } from './provider';
import { acquireAlloSlot } from './allo-semaphore';

const DEFAULT_COUNTRY = (process.env.PHONE_DEFAULT_COUNTRY ?? 'FR') as Parameters<typeof isValidPhoneNumber>[1];
const WINDOW_BEFORE_MS = parseInt(process.env.CALL_ENRICHMENT_WINDOW_BEFORE_MS ?? '3600000', 10); // 60 min (call happens before action is saved)
const WINDOW_AFTER_MS  = parseInt(process.env.CALL_ENRICHMENT_WINDOW_AFTER_MS  ?? '300000',  10); // 5 min
/** IANA zone for “whole calendar day” matching (default France). */
const ENRICHMENT_DAY_TZ = process.env.CALL_ENRICHMENT_DAY_TZ ?? 'Europe/Paris';
const USE_RELATIVE_WINDOW =
  process.env.CALL_ENRICHMENT_RELATIVE_WINDOW === '1' ||
  process.env.CALL_ENRICHMENT_RELATIVE_WINDOW === 'true';

function enrichmentWindowForAction(createdAt: Date): { windowStart: Date; windowEnd: Date; logHint: string } {
  if (USE_RELATIVE_WINDOW) {
    return {
      windowStart: new Date(createdAt.getTime() - WINDOW_BEFORE_MS),
      windowEnd:   new Date(createdAt.getTime() + WINDOW_AFTER_MS),
      logHint:     `relative ±${WINDOW_BEFORE_MS / 1000}s before / ${WINDOW_AFTER_MS / 1000}s after`,
    };
  }
  const local = DateTime.fromJSDate(createdAt, { zone: 'utc' }).setZone(ENRICHMENT_DAY_TZ);
  const start = local.startOf('day');
  const end = local.endOf('day');
  return {
    windowStart: start.toUTC().toJSDate(),
    windowEnd:   end.toUTC().toJSDate(),
    logHint:     `calendar day ${start.toISODate()} (${ENRICHMENT_DAY_TZ})`,
  };
}

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    if (isValidPhoneNumber(raw, DEFAULT_COUNTRY)) {
      return parsePhoneNumber(raw, DEFAULT_COUNTRY).format('E.164');
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

  // Keep permissive chunks to support "07 57 59 24 77 / +33 7 57 59 24 77" and similar.
  const chunks = text.match(/(?:\+|00)?\d(?:[\d\s()./-]{6,}\d)?/g) ?? [];
  if (chunks.length === 0) {
    return [text];
  }

  const candidates = new Set<string>();
  for (const chunk of chunks) {
    const cleaned = chunk.replace(/[^\d+]/g, '');
    if (!cleaned) continue;
    candidates.add(cleaned);

    // Accept numbers written as 0033... too.
    if (cleaned.startsWith('00')) {
      candidates.add(`+${cleaned.slice(2)}`);
    }

    // If someone stores plain FR number without separators, keep both forms.
    const digitsOnly = cleaned.replace(/\D/g, '');
    if (digitsOnly.length === 10 && digitsOnly.startsWith('0')) {
      candidates.add(digitsOnly);
      candidates.add(`+33${digitsOnly.slice(1)}`);
    }
    if (digitsOnly.length === 11 && digitsOnly.startsWith('33')) {
      candidates.add(`+${digitsOnly}`);
    }
  }

  return [...candidates];
}

function normalizePhonesFromField(raw: string | null | undefined): string[] {
  const normalized = extractPhoneCandidates(raw)
    .map(normalizePhone)
    .filter((p): p is string => p !== null);
  return [...new Set(normalized)];
}

async function collectCandidatePhones(actionId: string): Promise<string[]> {
  const action = await prisma.action.findUnique({
    where: { id: actionId },
    select: {
      meetingPhone: true,
      contact: { select: { phone: true } },
      company:  { select: { phone: true } },
    },
  });
  if (!action) return [];

  ceDebug("raw phone fields", {
    meetingPhone: action.meetingPhone ?? null,
    contactPhone: action.contact?.phone ?? null,
    companyPhone: action.company?.phone ?? null,
  });

  const normalized = [
    ...normalizePhonesFromField(action.meetingPhone),
    ...normalizePhonesFromField(action.contact?.phone),
    ...normalizePhonesFromField(action.company?.phone),
  ];

  return [...new Set(normalized)];
}

function getAlloNumbers(): string[] {
  return (process.env.ALLO_NUMBERS ?? '').split(',').map((n) => n.trim()).filter(Boolean);
}

export async function getAlloNumbersForAction(sdrId: string): Promise<{ alloNumbers: string[]; source: "sdr" | "env" }> {
  const configuredNumbers = getAlloNumbers();
  const user = await prisma.user.findUnique({
    where: { id: sdrId },
    select: { alloPhoneNumber: true },
  });
  const sdrAlloNumber = user?.alloPhoneNumber?.trim();

  if (sdrAlloNumber && process.env.CALL_ENRICHMENT_SCAN_ALL_LINES !== "1") {
    return { alloNumbers: [sdrAlloNumber], source: "sdr" };
  }

  return { alloNumbers: configuredNumbers, source: "env" };
}

/** True when default enrichment would skip but résumé or enregistrement is still missing (re-sync avec force). */
export function enrichActionShouldUseForce(action: {
  callEnrichmentAt: Date | null;
  callSummary: string | null;
  callRecordingUrl: string | null;
}): boolean {
  const hasSummary = !!action.callSummary?.trim();
  const hasRecording = !!action.callRecordingUrl?.trim();
  const wouldSkipNormal =
    !!action.callEnrichmentAt && (hasSummary || hasRecording);
  return wouldSkipNormal && (!hasSummary || !hasRecording);
}

export type EnrichActionOptions = {
  /**
   * When true, re-run Allo lookup even if a prior enrichment exists (e.g. partial summary without recording).
   * Default false keeps SDR auto-sync and post-create enrichment idempotent.
   */
  force?: boolean;
};

export async function enrichActionFromCallProvider(
  actionId: string,
  options?: EnrichActionOptions,
): Promise<void> {
  const force = options?.force === true;
  const hasKey = !!process.env.ALLO_API_KEY?.trim();
  console.log(
    `[call-enrichment] ▶ start actionId=${actionId}${force ? " (force)" : ""} ALLO_API_KEY=${hasKey ? "set" : "MISSING"} CALL_ENRICHMENT_DEBUG=${isCallEnrichmentDebug() ? "on" : "off"}`,
  );

  const action = await prisma.action.findUnique({
    where: { id: actionId },
    select: { id: true, sdrId: true, createdAt: true, callEnrichmentAt: true, callSummary: true, callRecordingUrl: true },
  });

  if (!action) {
    console.warn(`[call-enrichment] outcome=ACTION_NOT_FOUND actionId=${actionId}`);
    return;
  }
  // Skip only if enrichment ran AND produced at least some data (summary OR recording)
  if (!force && action.callEnrichmentAt && (action.callSummary?.trim() || action.callRecordingUrl?.trim())) {
    console.log(
      `[call-enrichment] outcome=SKIP_ALREADY_ENRICHED actionId=${actionId} ` +
        `callEnrichmentAt=${action.callEnrichmentAt?.toISOString() ?? "null"} hasSummary=${!!action.callSummary?.trim()} hasRecording=${!!action.callRecordingUrl?.trim()} ` +
        `(partial data: set CALL_ENRICHMENT_DEBUG=1 and re-sync; manager queue sets force when summary or recording still missing)`,
    );
    return;
  }

  const phones = await collectCandidatePhones(actionId);
  const { alloNumbers, source: alloNumberSource } = await getAlloNumbersForAction(action.sdrId);

  console.log(
    `[call-enrichment] phones=${JSON.stringify(phones)} alloNumbers=${JSON.stringify(alloNumbers)} alloNumberSource=${alloNumberSource} actionCreatedAt=${action.createdAt.toISOString()}`,
  );
  ceDebug("window mode", {
    USE_RELATIVE_WINDOW,
    ENRICHMENT_DAY_TZ,
    WINDOW_BEFORE_MS,
    WINDOW_AFTER_MS,
  });

  if (phones.length === 0) {
    console.warn(`[call-enrichment] outcome=NO_PHONE actionId=${actionId} — no E.164-normalized number from meetingPhone / contact / company`);
    await prisma.action.update({ where: { id: actionId }, data: { callEnrichmentError: 'NO_PHONE' } });
    return;
  }

  if (alloNumbers.length === 0) {
    console.warn(`[call-enrichment] outcome=NO_ALLO_NUMBERS actionId=${actionId} — env ALLO_NUMBERS is empty`);
    await prisma.action.update({ where: { id: actionId }, data: { callEnrichmentError: 'NO_ALLO_NUMBERS' } });
    return;
  }

  const { windowStart, windowEnd, logHint } = enrichmentWindowForAction(action.createdAt);
  console.log(
    `[call-enrichment] window ${windowStart.toISOString()} → ${windowEnd.toISOString()} (${logHint}) actionCreatedAt=${action.createdAt.toISOString()}`,
  );

  let record;
  const releaseAlloSlot = await acquireAlloSlot();
  try {
    record = await callProvider.fetchMatchingCallRecord({ phones, alloNumbers, sdrId: action.sdrId, windowStart, windowEnd });
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : 'PROVIDER_ERROR';
    console.error(`[call-enrichment] outcome=PROVIDER_ERROR actionId=${actionId} message=${msg}`, err);
    await prisma.action.update({ where: { id: actionId }, data: { callEnrichmentError: msg } });
    return;
  } finally {
    releaseAlloSlot();
  }

  if (!record) {
    const noop = !hasKey;
    console.warn(
      `[call-enrichment] outcome=NO_MATCH actionId=${actionId}` +
        (noop
          ? " — provider is NOOP (ALLO_API_KEY unset); no WithAllo request was made"
          : " — no call matched phone + time window on any ALLO_NUMBERS line (see [allo] line reports above)"),
    );
    await prisma.action.update({ where: { id: actionId }, data: { callEnrichmentError: 'NO_MATCH' } });
    return;
  }

  console.log(
    `[call-enrichment] match payload actionId=${actionId} summary=${!!record.summary} transcription=${!!record.transcription} recording=${!!record.recordingUrl}`,
  );

  // Another writer (e.g. SDR picked a call manually) may have enriched while we were fetching — do not overwrite.
  const latest = await prisma.action.findUnique({
    where: { id: actionId },
    select: { callEnrichmentAt: true, callSummary: true, callRecordingUrl: true },
  });
  if (!force && latest?.callEnrichmentAt && (latest.callSummary?.trim() || latest.callRecordingUrl?.trim())) {
    console.log(
      `[call-enrichment] outcome=SKIP_RACE actionId=${actionId} — another request enriched this action while WithAllo was in flight; not overwriting`,
    );
    return;
  }

  await prisma.action.update({
    where: { id: actionId },
    data: {
      callSummary:         record.summary        ?? null,
      callTranscription:   record.transcription  ?? null,
      callRecordingUrl:    record.recordingUrl   ?? null,
      callEnrichmentAt:    new Date(),
      callEnrichmentError: null,
    },
  });

  console.log(
    `[call-enrichment] outcome=ENRICHED_OK actionId=${actionId} summary=${!!record.summary} transcription=${!!record.transcription} recording=${!!record.recordingUrl}`,
  );
}
