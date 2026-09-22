import { NextRequest, NextResponse } from "next/server";
import { requireRole, withErrorHandler, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { parsePhoneNumber, isValidPhoneNumber } from "libphonenumber-js";
import { fetchVaultCallMatches, isVaultConfigured, vaultRecordingProxyUrl, type VaultCallMatch } from "@/lib/call-vault-client";

const DEFAULT_COUNTRY = (process.env.PHONE_DEFAULT_COUNTRY ?? "FR") as Parameters<typeof isValidPhoneNumber>[1];
const CANDIDATE_WINDOW_DAYS = 90;
const CANDIDATE_LIMIT = 50;

type PhoneSourceKey = "contact" | "company" | "meeting";

interface PhoneSourceInfo {
  key: PhoneSourceKey;
  label: string;
  rawPhone: string;
  normalizedPhone: string;
}

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    if (isValidPhoneNumber(raw, DEFAULT_COUNTRY)) return parsePhoneNumber(raw, DEFAULT_COUNTRY).format("E.164");
    return null;
  } catch {
    return null;
  }
}

function stripSpaces(s: string): string {
  return s.replace(/\s+/g, "");
}

/** Same E.164/local/no-plus variant set the vault matches against — used here only to attribute
 *  a returned call back to whichever phone source(s) it matched, for the UI's per-source grouping. */
function phoneVariants(e164: string): string[] {
  const variants = new Set([e164]);
  if (e164.startsWith("+33")) variants.add("0" + e164.slice(3));
  if (e164.startsWith("+")) variants.add(e164.slice(1));
  return [...variants];
}

function callMatchesSource(call: VaultCallMatch, variants: string[]): boolean {
  const from = stripSpaces(call.fromNumber ?? "").toLowerCase();
  const to = stripSpaces(call.toNumber ?? "").toLowerCase();
  return variants.some((v) => {
    const q = stripSpaces(v).toLowerCase();
    return q.length > 0 && (from.includes(q) || to.includes(q));
  });
}

export const GET = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  await requireRole(["MANAGER"], request);
  const { id } = await params;

  const action = await prisma.action.findUnique({
    where: { id, result: { in: ["MEETING_BOOKED", "MEETING_CANCELLED"] } },
    select: {
      id: true,
      meetingPhone: true,
      contact: { select: { firstName: true, lastName: true, phone: true } },
      company: { select: { name: true, phone: true } },
    },
  });

  if (!action) return errorResponse("RDV introuvable", 404);

  if (!isVaultConfigured()) return errorResponse("VAULT_API_URL/VAULT_API_KEY non configuré", 503);

  // Build unique phone sources (deduplicated by normalized phone)
  const seenNormalized = new Set<string>();
  const phoneSources: PhoneSourceInfo[] = [];

  const candidateSources: Array<{ key: PhoneSourceKey; raw: string | null | undefined; label: string }> = [
    {
      key: "contact",
      raw: action.contact?.phone,
      label: [action.contact?.firstName, action.contact?.lastName].filter(Boolean).join(" ").trim() || "Contact",
    },
    {
      key: "company",
      raw: action.company?.phone,
      label: action.company?.name || "Société",
    },
    {
      key: "meeting",
      raw: action.meetingPhone,
      label: "Téléphone RDV",
    },
  ];

  for (const { key, raw, label } of candidateSources) {
    if (!raw?.trim()) continue;
    const normalized = normalizePhone(raw) ?? raw.replace(/[\s()./-]/g, "");
    if (!normalized || seenNormalized.has(normalized)) continue;
    seenNormalized.add(normalized);
    phoneSources.push({ key, label, rawPhone: raw, normalizedPhone: normalized });
  }

  if (!phoneSources.length) {
    return NextResponse.json({
      success: true,
      data: { calls: [], phoneSources: [], alloLineCount: null, totalCalls: 0 },
    });
  }

  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - CANDIDATE_WINDOW_DAYS * 86400_000);

  const matches = await fetchVaultCallMatches({
    phones: phoneSources.map((s) => s.normalizedPhone),
    windowStart,
    windowEnd,
    limit: CANDIDATE_LIMIT,
  });

  const sourceVariants = phoneSources.map((s) => ({ key: s.key, variants: phoneVariants(s.normalizedPhone) }));

  const calls = matches
    .map((m) => ({
      id: m.callId,
      from: m.fromNumber,
      to: m.toNumber,
      duration: m.durationSec,
      direction: m.direction,
      outcome: m.status ?? undefined,
      summary: m.summary ?? undefined,
      // Stable reference, not the presigned URL the vault returned inline — AudioTab.tsx persists
      // this via updateMeeting({ callRecordingUrl }), and a presigned URL would expire within the hour.
      recording_url: m.recordingUrl ? (vaultRecordingProxyUrl(m.callId) ?? undefined) : undefined,
      transcription: m.transcription ?? undefined,
      start_time: m.startedAt ?? undefined,
      _matchedSources: sourceVariants.filter(({ variants }) => callMatchesSource(m, variants)).map((s) => s.key),
    }))
    .sort((a, b) => {
      const ta = a.start_time ? new Date(a.start_time).getTime() : 0;
      const tb = b.start_time ? new Date(b.start_time).getTime() : 0;
      return tb - ta;
    });

  return NextResponse.json({
    success: true,
    data: {
      calls,
      phoneSources: phoneSources.map((s) => ({
        key: s.key,
        label: s.label,
        phone: s.normalizedPhone,
        rawPhone: s.rawPhone,
        callCount: calls.filter((c) => c._matchedSources.includes(s.key)).length,
      })),
      // No longer a meaningful "lines queried" count once matching runs against the vault's
      // already-synced data instead of live-querying each WithAllo line — left null, the UI
      // already hides this badge when it's null.
      alloLineCount: null,
      totalCalls: calls.length,
    },
  });
});
