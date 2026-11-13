import { prisma } from "@/lib/prisma";
import { acquireAlloSlot } from "./allo-semaphore";
import { findCallWithFallback, type CallSourceKey, type SourceAttempt } from "./provider";
import { loadRdvCallContext } from "./rdv-call-context";
import { fillRdvFicheIfEmpty } from "./rdv-fiche";

/** A linked softphone call this old with no hang-up is treated as lost, not live. */
const LINKED_CALL_MAX_LIVE_MS = 2 * 60 * 60 * 1000;
/** Time Twilio gets after the hang-up to deliver the recording before we search elsewhere. */
const RECORDING_GRACE_MS = 15 * 60 * 1000;

export interface AutoEnrichResult {
  found: boolean;
  ficheGenerated: boolean;
  /**
   * A softphone call is linked to the RDV but its audio / transcript are not in yet
   * (still on the line, or Twilio still processing): they arrive on their own.
   */
  pending?: { source: "twilio"; inProgress: boolean };
  /** Which source the call came from (found only). */
  source?: CallSourceKey;
  /** Which time window matched (found only). */
  window?: string;
  /** What every source answered, in order — the UI shows the chain. */
  attempts?: SourceAttempt[];
  callSummary?: string | null;
  callTranscription?: string | null;
  callRecordingUrl?: string | null;
  /** The fiche written from the transcription (ficheGenerated only). */
  fiche?: Record<string, string> | null;
  error?: string;
}

/**
 * Finds the call an RDV was booked on and brings it onto the RDV: Call Vault, then
 * the Twilio softphone, then Allo directly (lib/call-enrichment/provider). Fills the
 * fiche from the transcription when it is still empty. Idempotent: an RDV that
 * already has call data is returned as is.
 */
export async function autoEnrichAction(actionId: string): Promise<AutoEnrichResult> {
  // Global slot: simultaneous bookings must not all hit the providers at once.
  const release = await acquireAlloSlot();
  try {
    const existing = await prisma.action.findUnique({
      where: { id: actionId, result: { in: ["MEETING_BOOKED", "MEETING_CANCELLED"] } },
      select: { callSummary: true, callTranscription: true, callRecordingUrl: true },
    });
    if (!existing) return { found: false, ficheGenerated: false, error: "RDV introuvable" };

    if (existing.callRecordingUrl?.trim() || existing.callTranscription?.trim() || existing.callSummary?.trim()) {
      return {
        found: true,
        ficheGenerated: false,
        callSummary: existing.callSummary,
        callTranscription: existing.callTranscription,
        callRecordingUrl: existing.callRecordingUrl,
      };
    }

    // Booked from the softphone: the call is already linked, Twilio delivers the rest.
    const linkedCall = await prisma.telephonyCall.findUnique({
      where: { actionId },
      select: { endedAt: true, answeredAt: true, recordingUrl: true, createdAt: true },
    });
    const awaitingTwilio =
      !!linkedCall &&
      !linkedCall.recordingUrl &&
      // Still on the line (bounded, in case the hang-up callback was lost)…
      ((!linkedCall.endedAt && Date.now() - linkedCall.createdAt.getTime() < LINKED_CALL_MAX_LIVE_MS) ||
        // …or answered and just ended: Twilio is processing the recording.
        (!!linkedCall.endedAt && !!linkedCall.answeredAt && Date.now() - linkedCall.endedAt.getTime() < RECORDING_GRACE_MS));
    if (linkedCall && awaitingTwilio) {
      return { found: false, ficheGenerated: false, pending: { source: "twilio", inProgress: !linkedCall.endedAt } };
    }

    const ctx = await loadRdvCallContext(actionId);
    if (!ctx) return { found: false, ficheGenerated: false, error: "RDV introuvable" };

    const { record, attempts } = await findCallWithFallback({
      phones: ctx.phones,
      alloNumbers: ctx.alloNumbers,
      sdrId: ctx.sdrId,
      actionId: ctx.actionId,
      contactId: ctx.contactId,
      companyId: ctx.companyId,
      windows: ctx.windows,
    });

    if (!record) {
      await prisma.action.update({ where: { id: actionId }, data: { callEnrichmentError: "NO_MATCH" } });
      return { found: false, ficheGenerated: false, attempts };
    }

    // Someone (manager pick, upload, softphone link) may have attached a call meanwhile: keep theirs.
    const updated = await prisma.action.updateMany({
      where: { id: actionId, callRecordingUrl: null, callTranscription: null, callSummary: null },
      data: {
        callSummary: record.summary ?? null,
        callTranscription: record.transcription ?? null,
        callRecordingUrl: record.recordingUrl ?? null,
        ...(record.duration ? { duration: record.duration } : {}),
        callEnrichmentAt: new Date(),
        callEnrichmentError: null,
      },
    });
    if (updated.count === 0) {
      const current = await prisma.action.findUnique({
        where: { id: actionId },
        select: { callSummary: true, callTranscription: true, callRecordingUrl: true },
      });
      return { found: true, ficheGenerated: false, attempts, ...current };
    }

    const fiche = record.transcription?.trim() ? await fillRdvFicheIfEmpty(actionId) : null;

    return {
      found: true,
      ficheGenerated: Boolean(fiche),
      fiche: fiche ? { ...fiche } : null,
      source: record.source,
      window: record.window,
      attempts,
      callSummary: record.summary ?? null,
      callTranscription: record.transcription ?? null,
      callRecordingUrl: record.recordingUrl ?? null,
    };
  } catch (e) {
    console.error("[auto-enrichment]", e);
    return { found: false, ficheGenerated: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    release();
  }
}
