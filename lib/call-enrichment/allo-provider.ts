import type { CallProvider, CallProviderInput, CallRecord } from './provider';
import { ceDebug, isCallEnrichmentDebug } from './debug';
import { parseAlloCallsListResponse } from './allo-response';
import { logExternalApiCallMetric } from '@/lib/api-request-metrics';

const BASE_URL = 'https://api.withallo.com';
// Lowered from 60 → 15: the matching call is almost always in the first few pages.
// Set CALL_ENRICHMENT_ALLO_MAX_PAGES in env if you need deeper history.
const MAX_PAGES = Math.max(1, parseInt(process.env.CALL_ENRICHMENT_ALLO_MAX_PAGES ?? '15', 10));
/** WithAllo rate-limits hard if we hit many lines at once; keep line searches serial. */
// Raised from 120ms → 400ms to reduce burst density across concurrent syncs.
const LINE_GAP_MS = Math.max(0, parseInt(process.env.CALL_ENRICHMENT_ALLO_LINE_GAP_MS ?? '400', 10));
/** Retries per page request when WithAllo returns 429. */
const RETRIES_429 = Math.max(0, parseInt(process.env.CALL_ENRICHMENT_ALLO_429_RETRIES ?? '6', 10));
const RETRY_429_BASE_MS = Math.max(100, parseInt(process.env.CALL_ENRICHMENT_ALLO_429_BASE_MS ?? '750', 10));
/** Retries when fetch throws (connect timeout, DNS, reset). Each attempt is a new TCP handshake. */
const NETWORK_RETRIES = Math.max(0, parseInt(process.env.CALL_ENRICHMENT_ALLO_NETWORK_RETRIES ?? '3', 10));
const NETWORK_RETRY_BASE_MS = Math.max(200, parseInt(process.env.CALL_ENRICHMENT_ALLO_NETWORK_RETRY_MS ?? '1500', 10));
/** Overall request budget (Undici may still use ~10s connect timeout per attempt). */
const FETCH_TIMEOUT_MS = Math.max(5_000, parseInt(process.env.CALL_ENRICHMENT_ALLO_FETCH_TIMEOUT_MS ?? '30000', 10));

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchErrorHint(e: unknown): string {
  if (e instanceof Error) {
    const c = (e as Error & { cause?: { code?: string; message?: string } }).cause;
    const code = c && typeof c === "object" && "code" in c ? String((c as { code: string }).code) : "";
    return [e.name, e.message, code].filter(Boolean).join(" | ");
  }
  return String(e);
}

function isRetriableFetchError(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  if (e instanceof Error && e.name === "AbortError") return true;
  const c = (e as { cause?: { code?: string } })?.cause;
  const code = c?.code;
  if (
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_HEADERS_TIMEOUT" ||
    code === "UND_ERR_BODY_TIMEOUT" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN"
  ) {
    return true;
  }
  return false;
}

/** Retry-After: seconds or HTTP-date */
function retryAfterMs(res: Response): number | null {
  const h = res.headers.get('Retry-After');
  if (!h) return null;
  const sec = parseInt(h.trim(), 10);
  if (Number.isFinite(sec) && sec >= 0) return Math.min(sec * 1000, 120_000);
  const t = Date.parse(h);
  if (!Number.isNaN(t)) return Math.min(Math.max(0, t - Date.now()), 120_000);
  return null;
}

interface AlloTranscriptEntry {
  source: 'AGENT' | 'EXTERNAL' | 'USER';
  text: string;
  start_time?: number;
}

interface AlloCall {
  id: string;
  from: string;
  to: string;
  duration: number;
  direction: 'INBOUND' | 'OUTBOUND';
  outcome?: string;
  summary?: string;
  recording_url?: string;
  transcript?: AlloTranscriptEntry[];
  /** Some API versions return a single string instead of transcript[] */
  transcriptPlain?: string;
  created_at?: string;
  /** ISO string or unix seconds depending on Allo version */
  start_time?: string | number;
}

function normalizeAlloCall(raw: Record<string, unknown>): AlloCall {
  const from = String(raw.from ?? raw.from_number ?? '');
  const to = String(raw.to ?? raw.to_number ?? '');
  const typeRaw = String(raw.direction ?? raw.type ?? 'OUTBOUND').toUpperCase();
  const direction: 'INBOUND' | 'OUTBOUND' = typeRaw === 'INBOUND' ? 'INBOUND' : 'OUTBOUND';

  let duration = typeof raw.duration === 'number' ? raw.duration : 0;
  if (!duration && typeof raw.length_in_minutes === 'number') {
    duration = Math.round(raw.length_in_minutes * 60);
  }

  const startRaw = raw.start_time ?? raw.start_date ?? raw.created_at;

  const recordingRaw = raw.recording_url ?? raw.recording;
  const recording_url =
    typeof recordingRaw === 'string' && /^https?:\/\//i.test(recordingRaw) ? recordingRaw : undefined;

  const summary =
    typeof raw.summary === 'string'
      ? raw.summary
      : typeof raw.call_summary === 'string'
        ? raw.call_summary
        : undefined;

  const transcript = Array.isArray(raw.transcript) ? (raw.transcript as AlloTranscriptEntry[]) : undefined;
  const transcriptPlain =
    typeof raw.transcription === 'string' && raw.transcription.trim()
      ? raw.transcription
      : undefined;

  return {
    id:           String(raw.id ?? ''),
    from,
    to,
    duration,
    direction,
    outcome:      typeof raw.outcome === 'string' ? raw.outcome : undefined,
    summary,
    recording_url,
    transcript,
    transcriptPlain,
    created_at:   typeof raw.created_at === 'string' ? raw.created_at : undefined,
    start_time:   typeof startRaw === 'string' || typeof startRaw === 'number' ? startRaw : undefined,
  };
}

function formatTranscript(entries: AlloTranscriptEntry[]): string {
  return entries.map((e) => `${e.source}: ${e.text}`).join('\n');
}

/** Prefer calls with real Allo content; tie-break with duration then recency. */
function contentScore(call: AlloCall): number {
  let s = 0;
  if (call.summary?.trim()) s += 1_000_000;
  if (call.transcript?.length) {
    const len = call.transcript.reduce((n, e) => n + (e.text?.length ?? 0), 0);
    s += 100_000 + Math.min(len, 50_000);
  }
  if (call.transcriptPlain?.trim()) s += 100_000 + Math.min(call.transcriptPlain.length, 50_000);
  if (call.recording_url?.trim()) s += 10_000;
  s += Math.min(call.duration, 3600);
  return s;
}

function alloCallToRecord(call: AlloCall): CallRecord {
  const transcription = call.transcript?.length
    ? formatTranscript(call.transcript)
    : call.transcriptPlain?.trim() || undefined;
  return {
    summary:        call.summary?.trim() || undefined,
    transcription,
    recordingUrl:   call.recording_url?.trim() || undefined,
    duration:       typeof call.duration === 'number' && !Number.isNaN(call.duration) ? Math.round(call.duration) : undefined,
  };
}

function callTimestamp(call: AlloCall): Date | null {
  const raw = call.start_time ?? call.created_at;
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number') return new Date(raw > 1e12 ? raw : raw * 1000);
  return new Date(raw);
}

function callFallsInWindow(call: AlloCall, windowStart: Date, windowEnd: Date): boolean {
  const ts = callTimestamp(call);
  if (!ts || Number.isNaN(ts.getTime())) return true; // can't determine — include it
  return ts >= windowStart && ts <= windowEnd;
}

/**
 * All format variants of a phone number to match against Allo's from/to fields.
 * Allo may store numbers in local, E.164, or without-plus format.
 */
function phoneVariants(e164: string): string[] {
  const variants: string[] = [e164];
  if (e164.startsWith('+33')) {
    variants.push('0' + e164.slice(3)); // French local: 0644606054
  }
  if (e164.startsWith('+')) {
    variants.push(e164.slice(1)); // without leading +: 33644606054
  }
  return [...new Set(variants)];
}

function stripSpaces(s: string): string {
  return s.replace(/\s+/g, '');
}

function phoneMatchesCall(call: AlloCall, variants: string[]): boolean {
  const fromN = stripSpaces(call.from ?? '').toLowerCase();
  const toN = stripSpaces(call.to ?? '').toLowerCase();
  return variants.some((v) => {
    const q = stripSpaces(v).toLowerCase();
    return fromN.includes(q) || toN.includes(q);
  });
}

/** Per Allo line: why we did or did not find a call (printed when no match). */
type AlloLineSearchReport = {
  alloNumber: string;
  pagesFetched: number;
  callsExamined: number;
  bothMatch: number;
  phoneNotWindow: number;
  windowNotPhone: number;
  neither: number;
  stopReason: string;
  apiNonOk?: number;
};

export class AlloProvider implements CallProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Fetch one page of calls for an allo_number WITHOUT contact_number filter.
   * Allo's contact_number filter has proven unreliable (returns 0 even when calls exist).
   * We fetch by allo_number only and match the contact phone locally against from/to.
   */
  private async fetchPageForLine(
    alloNumber: string,
    page: number,
  ): Promise<{ calls: AlloCall[]; totalPages: number; httpOk: boolean; httpStatus: number }> {
    const url = new URL(`${BASE_URL}/v1/api/calls`);
    url.searchParams.set('allo_number', alloNumber);
    url.searchParams.set('size', String(Math.min(100, Math.max(1, parseInt(process.env.CALL_ENRICHMENT_ALLO_PAGE_SIZE ?? '100', 10)))));
    url.searchParams.set('page', String(page));

    for (let net = 0; net <= NETWORK_RETRIES; net++) {
      try {
        for (let attempt = 0; attempt <= RETRIES_429; attempt++) {
          const netTag = net > 0 ? ` netRetry=${net}/${NETWORK_RETRIES}` : "";
          console.log(
            `[call-enrichment][allo] GET ${url.toString()}${attempt > 0 ? ` (429 retry ${attempt}/${RETRIES_429})` : ""}${netTag}`,
          );

          const res = await fetch(url.toString(), {
            headers: { Authorization: this.apiKey },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });
          await logExternalApiCallMetric('allo', url.pathname, 'GET', res.status);

          console.log(`[call-enrichment][allo] response status=${res.status} alloNumber=${alloNumber} page=${page}`);

          if (res.status === 429 && attempt < RETRIES_429) {
            const fromHeader = retryAfterMs(res);
            const backoff = fromHeader ?? Math.min(RETRY_429_BASE_MS * 2 ** attempt, 30_000);
            console.warn(
              `[call-enrichment][allo] HTTP 429 rate limit — wait ${backoff}ms then retry (${attempt + 1}/${RETRIES_429}) line=${alloNumber} page=${page}`,
            );
            await sleep(backoff);
            continue;
          }

          if (res.status === 401 || res.status === 403) {
            throw new Error(`Allo API auth error: ${res.status}`);
          }
          if (!res.ok) {
            if (res.status === 429) {
              console.warn(
                `[call-enrichment][allo] HTTP 429 after ${RETRIES_429 + 1} attempts — line=${alloNumber} page=${page} (WithAllo quota); try fewer ALLO_NUMBERS or lower CALL_ENRICHMENT_SYNC_CONCURRENCY`,
              );
            } else {
              console.warn(
                `[call-enrichment][allo] non-ok HTTP status=${res.status} alloNumber=${alloNumber} page=${page} — body not parsed; this line may contribute 0 calls`,
              );
            }
            return { calls: [], totalPages: 0, httpOk: false, httpStatus: res.status };
          }

          const data = await res.json();
          const { rawCalls, totalPages } = parseAlloCallsListResponse(data);
          const calls = rawCalls.map(normalizeAlloCall).filter((c) => c.id);
          console.log(`[call-enrichment][allo] page=${page}/${totalPages} count=${calls.length} for alloNumber=${alloNumber}`);
          return { calls, totalPages, httpOk: true, httpStatus: res.status };
        }

        return { calls: [], totalPages: 0, httpOk: false, httpStatus: 429 };
      } catch (e) {
        await logExternalApiCallMetric('allo', '/v1/api/calls', 'GET', 0);
        const retriable = isRetriableFetchError(e);
        if (net < NETWORK_RETRIES && retriable) {
          const backoff = Math.min(NETWORK_RETRY_BASE_MS * 2 ** net, 20_000);
          console.warn(
            `[call-enrichment][allo] fetch failed — wait ${backoff}ms then network retry (${net + 1}/${NETWORK_RETRIES}) ` +
              `line=${alloNumber} page=${page} hint=${fetchErrorHint(e)}`,
          );
          await sleep(backoff);
          continue;
        }
        throw e;
      }
    }

    return { calls: [], totalPages: 0, httpOk: false, httpStatus: 0 };
  }

  private async searchForLine(
    alloNumber: string,
    contactPhoneVariants: string[],
    windowStart: Date,
    windowEnd: Date,
  ): Promise<{ call: AlloCall | null; report: AlloLineSearchReport }> {
    const report: AlloLineSearchReport = {
      alloNumber,
      pagesFetched: 0,
      callsExamined: 0,
      bothMatch: 0,
      phoneNotWindow: 0,
      windowNotPhone: 0,
      neither: 0,
      stopReason: "init",
      apiNonOk: 0,
    };

    for (let page = 0; page < MAX_PAGES; page++) {
      const { calls, totalPages, httpOk, httpStatus } = await this.fetchPageForLine(alloNumber, page);
      report.pagesFetched += 1;

      if (!httpOk) {
        report.apiNonOk = (report.apiNonOk ?? 0) + 1;
        report.stopReason = `http_error_${httpStatus}`;
        break;
      }

      if (calls.length === 0) {
        report.stopReason = page === 0 ? "empty_first_page" : "empty_page";
        break;
      }

      let dbgShown = 0;
      const dbgLimit = isCallEnrichmentDebug() ? 12 : 0;

      for (const call of calls) {
        report.callsExamined += 1;
        const inWindow = callFallsInWindow(call, windowStart, windowEnd);
        const matchesPhone = phoneMatchesCall(call, contactPhoneVariants);
        const ts = callTimestamp(call);

        if (dbgShown < dbgLimit) {
          dbgShown += 1;
          ceDebug(`line=${alloNumber} page=${page} sample`, {
            id: call.id,
            from: call.from,
            to: call.to,
            parsedTs: ts && !Number.isNaN(ts.getTime()) ? ts.toISOString() : null,
            inWindow,
            matchesPhone,
            hasSummary: !!call.summary?.trim(),
            hasRecording: !!call.recording_url?.trim(),
            durationSec: call.duration,
          });
        }

        if (inWindow && matchesPhone) {
          report.bothMatch += 1;
          report.stopReason = "matched";
          console.log(
            `[call-enrichment][allo] match callId=${call.id} from=${call.from} to=${call.to} ` +
              `start=${call.start_time ?? call.created_at} duration=${call.duration}s line=${alloNumber} ` +
              `hasSummary=${!!call.summary?.trim()} hasRecording=${!!call.recording_url?.trim()}`,
          );
          return { call, report };
        }

        if (matchesPhone && !inWindow) {
          report.phoneNotWindow += 1;
          console.log(
            `[call-enrichment][allo] near-miss PHONE_OK_WINDOW_NO callId=${call.id} from=${call.from} to=${call.to} ` +
              `ts=${ts && !Number.isNaN(ts.getTime()) ? ts.toISOString() : String(call.start_time ?? call.created_at)} ` +
              `window=${windowStart.toISOString()}→${windowEnd.toISOString()}`,
          );
        } else if (inWindow && !matchesPhone) {
          report.windowNotPhone += 1;
        } else {
          report.neither += 1;
        }
      }

      const oldest = calls[calls.length - 1];
      const oldestTs = callTimestamp(oldest);
      if (oldestTs && !Number.isNaN(oldestTs.getTime()) && oldestTs < windowStart) {
        report.stopReason = "oldest_before_window";
        console.log(
          `[call-enrichment][allo] stop line=${alloNumber} oldest=${oldestTs.toISOString()} < windowStart=${windowStart.toISOString()}`,
        );
        break;
      }

      if (page + 1 >= totalPages) {
        report.stopReason = "reached_total_pages";
        break;
      }
    }

    if (report.stopReason === "init") {
      report.stopReason = "max_pages_or_break";
    }

    return { call: null, report };
  }

  async fetchMatchingCallRecord(input: CallProviderInput): Promise<CallRecord | null> {
    const { phones, alloNumbers, windowStart, windowEnd } = input;

    // Build all phone variants once
    const contactVariants = phones.flatMap(phoneVariants);
    console.log(`[call-enrichment][allo] searching across ${alloNumbers.length} lines (serial, gap=${LINE_GAP_MS}ms), contact variants: ${contactVariants.join(', ')}`);
    console.log(`[call-enrichment][allo] window: ${windowStart.toISOString()} → ${windowEnd.toISOString()} MAX_PAGES=${MAX_PAGES}`);

    // Serial line search: parallel requests caused mass HTTP 429 from WithAllo (one burst per line).
    const lineResults: Array<{ call: AlloCall | null; report: AlloLineSearchReport }> = [];
    for (let i = 0; i < alloNumbers.length; i++) {
      lineResults.push(await this.searchForLine(alloNumbers[i]!, contactVariants, windowStart, windowEnd));
      if (i < alloNumbers.length - 1 && LINE_GAP_MS > 0) {
        await sleep(LINE_GAP_MS);
      }
    }

    const candidates = lineResults.map((r) => r.call).filter((c): c is AlloCall => c !== null);

    if (candidates.length === 0) {
      for (const { report } of lineResults) {
        console.log(
          `[call-enrichment][allo] line-report line=${report.alloNumber} stop=${report.stopReason} ` +
            `pages=${report.pagesFetched} examined=${report.callsExamined} ` +
            `both=${report.bothMatch} phoneOnly=${report.phoneNotWindow} windowOnly=${report.windowNotPhone} neither=${report.neither} apiNonOk=${report.apiNonOk ?? 0}`,
        );
      }
      const all429 =
        lineResults.length > 0 &&
        lineResults.every((r) => r.report.stopReason === "http_error_429");
      if (all429) {
        console.warn(
          `[call-enrichment][allo] NO_LINE_MATCH: every line got HTTP 429 (WithAllo rate limit). ` +
            `Serial fetch + retries exhausted. Reduce ALLO_NUMBERS to likely lines, lower CALL_ENRICHMENT_SYNC_CONCURRENCY when bulk syncing, or increase CALL_ENRICHMENT_ALLO_429_RETRIES / gaps.`,
        );
      } else {
        console.log(
          `[call-enrichment][allo] NO_LINE_MATCH hint: wrong ALLO_NUMBERS, action created on different calendar day than call ` +
            `(see CALL_ENRICHMENT_DAY_TZ / CALL_ENRICHMENT_RELATIVE_WINDOW), phone not in from/to, or call beyond first ${MAX_PAGES} pages for that line`,
        );
      }
      return null;
    }

    candidates.sort((a, b) => {
      const sa = contentScore(a);
      const sb = contentScore(b);
      if (sb !== sa) return sb - sa;
      const ta = callTimestamp(a)?.getTime() ?? 0;
      const tb = callTimestamp(b)?.getTime() ?? 0;
      return tb - ta;
    });

    const best = candidates[0]!;
    if (candidates.length > 1) {
      console.log(
        `[call-enrichment][allo] chose best of ${candidates.length} line matches: callId=${best.id} ` +
          `contentScore=${contentScore(best)} (prefer summary/transcript/recording, then duration, then newest)`,
      );
    }

    const mapped = alloCallToRecord(best);
    console.log(
      `[call-enrichment][allo] best-call callId=${best.id} raw: summary=${!!best.summary?.trim()} recording=${!!best.recording_url?.trim()} transcript=${!!(best.transcript?.length || best.transcriptPlain?.trim())} → ` +
        `mapped: summary=${!!mapped.summary} recording=${!!mapped.recordingUrl} transcription=${!!mapped.transcription}`,
    );
    if (!mapped.summary?.trim() && !mapped.recordingUrl?.trim()) {
      console.warn(
        `[call-enrichment][allo] MATCH_BUT_EMPTY_PAYLOAD callId=${best.id} — WithAllo returned a matching call but no summary/recording URL yet (processing delay or product limits). Action may get empty CRM fields.`,
      );
    }

    return mapped;
  }
}
