import { NextRequest } from "next/server";
import { requireRole, withErrorHandler, errorResponse, successResponse } from "@/lib/api-utils";
import { fetchVaultCallMatches, vaultRecordingProxyUrl } from "@/lib/call-vault-client";
import { AlloProvider } from "@/lib/call-enrichment/allo-provider";
import { findTwilioCalls } from "@/lib/call-enrichment/twilio-provider";
import { callSourceAvailability, CALL_SOURCE_ORDER, type CallSourceKey } from "@/lib/call-enrichment/provider";
import { loadRdvCallContext, numberMatches, type PhoneSourceKey } from "@/lib/call-enrichment/rdv-call-context";
import { integrationKey } from "@/lib/integrations/keys";

const CANDIDATE_WINDOW_DAYS = 90;
const CANDIDATE_LIMIT = 50;
/** Allo is read page by page per line: keep its window tight around the booking. */
const ALLO_DAYS_BEFORE = 7;
const ALLO_DAYS_AFTER = 2;

type SourceStatus = "ok" | "empty" | "skipped" | "error" | "not_asked";

/** One candidate call, whatever its source. `id` is "<source>:<provider id>". */
interface RdvCandidateCall {
  id: string;
  source: CallSourceKey;
  providerCallId: string;
  from: string;
  to: string;
  direction: "INBOUND" | "OUTBOUND";
  durationSec: number;
  startedAt: string | null;
  status: string | null;
  summary: string | null;
  transcription: string | null;
  /** Stable, persistable reference (never a presigned URL). */
  recordingUrl: string | null;
  matchedPhones: PhoneSourceKey[];
  /** Twilio: the softphone call already linked to this RDV. */
  linkedToRdv: boolean;
  /** Twilio: still on the line — transcript partial, recording not ready yet. */
  inProgress: boolean;
}

/**
 * GET /api/manager/rdv/[id]/calls — every call of the RDV's prospect the call sources
 * know about, for the manager to pick from. Call Vault and Twilio are always read;
 * Allo (slow, rate-limited) is read when both came back empty, or on ?allo=1.
 */
export const GET = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  await requireRole(["MANAGER"], request);
  const { id } = await params;
  const forceAllo = request.nextUrl.searchParams.get("allo") === "1";

  const ctx = await loadRdvCallContext(id);
  if (!ctx) return errorResponse("RDV introuvable", 404);

  const availability = callSourceAvailability({ alloNumbers: ctx.alloNumbers });
  const status: Record<CallSourceKey, { status: SourceStatus; count: number; reason?: string }> = {
    vault: { status: "not_asked", count: 0 },
    twilio: { status: "not_asked", count: 0 },
    allo: { status: "not_asked", count: 0 },
  };
  for (const a of availability) if (!a.available) status[a.source] = { status: "skipped", count: 0, reason: a.reason };

  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - CANDIDATE_WINDOW_DAYS * 86_400_000);
  const matchedPhones = (from: string, to: string): PhoneSourceKey[] => [
    ...new Set(ctx.phoneSources.filter((p) => numberMatches(from, p.phone) || numberMatches(to, p.phone)).map((p) => p.key)),
  ];

  const calls: RdvCandidateCall[] = [];

  const readVault = async () => {
    if (status.vault.status === "skipped") return;
    if (!ctx.phones.length) {
      status.vault = { status: "skipped", count: 0, reason: "Aucun numéro exploitable" };
      return;
    }
    try {
      const matches = await fetchVaultCallMatches({ phones: ctx.phones, windowStart, windowEnd, limit: CANDIDATE_LIMIT });
      for (const m of matches) {
        calls.push({
          id: `vault:${m.callId}`,
          source: "vault",
          providerCallId: m.callId,
          from: m.fromNumber,
          to: m.toNumber,
          direction: m.direction,
          durationSec: m.durationSec ?? 0,
          startedAt: m.startedAt,
          status: m.status,
          summary: m.summary?.trim() || null,
          transcription: m.transcription?.trim() || null,
          // Stable reference, not the presigned URL the vault returned inline (it expires in the hour).
          recordingUrl: m.recordingUrl ? vaultRecordingProxyUrl(m.callId) : null,
          matchedPhones: matchedPhones(m.fromNumber, m.toNumber),
          linkedToRdv: false,
          inProgress: false,
        });
      }
      status.vault = { status: matches.length ? "ok" : "empty", count: matches.length };
    } catch {
      status.vault = { status: "error", count: 0, reason: "Call Vault indisponible" };
    }
  };

  const readTwilio = async () => {
    try {
      const matches = await findTwilioCalls({
        phones: ctx.phones,
        actionId: ctx.actionId,
        contactId: ctx.contactId,
        companyId: ctx.companyId,
        windowStart,
        windowEnd,
        limit: CANDIDATE_LIMIT,
      });
      for (const m of matches) {
        calls.push({
          id: `twilio:${m.id}`,
          source: "twilio",
          providerCallId: m.id,
          from: m.fromNumber,
          to: m.toNumber,
          direction: m.direction,
          durationSec: m.durationSec,
          startedAt: m.startedAt,
          status: m.status,
          summary: m.summary,
          transcription: m.transcription,
          recordingUrl: m.recordingUrl,
          matchedPhones: matchedPhones(m.fromNumber, m.toNumber),
          linkedToRdv: m.actionId === ctx.actionId,
          inProgress: m.inProgress,
        });
      }
      status.twilio = { status: matches.length ? "ok" : "empty", count: matches.length };
    } catch {
      status.twilio = { status: "error", count: 0, reason: "Lecture des appels Twilio impossible" };
    }
  };

  await Promise.all([readVault(), readTwilio()]);

  const shouldReadAllo = status.allo.status !== "skipped" && (forceAllo || calls.length === 0);
  if (shouldReadAllo) {
    const apiKey = integrationKey("ALLO_API_KEY")?.trim();
    if (!apiKey || !ctx.phones.length) {
      status.allo = { status: "skipped", count: 0, reason: !apiKey ? "Clé API Allo absente" : "Aucun numéro exploitable" };
    } else {
      try {
        const start = new Date(ctx.createdAt.getTime() - ALLO_DAYS_BEFORE * 86_400_000);
        const end = new Date(Math.min(Date.now(), ctx.createdAt.getTime() + ALLO_DAYS_AFTER * 86_400_000));
        const matches = await new AlloProvider(apiKey).listMatchingCalls({
          phones: ctx.phones,
          alloNumbers: ctx.alloNumbers,
          windowStart: start,
          windowEnd: end,
          limit: CANDIDATE_LIMIT,
        });
        let added = 0;
        for (const m of matches) {
          // The vault mirrors Allo: drop a call it already listed (same minute, same remote number).
          if (calls.some((c) => c.source === "vault" && sameCall(c, m))) continue;
          added += 1;
          calls.push({
            id: `allo:${m.id}`,
            source: "allo",
            providerCallId: m.id,
            from: m.fromNumber,
            to: m.toNumber,
            direction: m.direction,
            durationSec: m.durationSec,
            startedAt: m.startedAt,
            status: m.status,
            summary: m.summary,
            transcription: m.transcription,
            recordingUrl: m.recordingUrl,
            matchedPhones: matchedPhones(m.fromNumber, m.toNumber),
            linkedToRdv: false,
            inProgress: false,
          });
        }
        status.allo = { status: added ? "ok" : "empty", count: added };
      } catch {
        status.allo = { status: "error", count: 0, reason: "Allo indisponible" };
      }
    }
  }

  calls.sort((a, b) => {
    if (a.linkedToRdv !== b.linkedToRdv) return a.linkedToRdv ? -1 : 1;
    return (b.startedAt ?? "").localeCompare(a.startedAt ?? "");
  });

  return successResponse({
    calls,
    phoneSources: ctx.phoneSources.map((p) => ({
      ...p,
      callCount: calls.filter((c) => c.matchedPhones.includes(p.key)).length,
    })),
    sources: CALL_SOURCE_ORDER.map((source) => ({ source, ...status[source] })),
    rdvCreatedAt: ctx.createdAt.toISOString(),
    totalCalls: calls.length,
  });
});

function digitsTail(n: string): string {
  return n.replace(/\D/g, "").slice(-9);
}

function sameCall(a: { from: string; to: string; startedAt: string | null }, b: { fromNumber: string; toNumber: string; startedAt: string | null }): boolean {
  if (!a.startedAt || !b.startedAt) return false;
  const dt = Math.abs(new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
  if (dt > 90_000) return false;
  const remoteA = new Set([digitsTail(a.from), digitsTail(a.to)]);
  return remoteA.has(digitsTail(b.fromNumber)) && remoteA.has(digitsTail(b.toNumber));
}
