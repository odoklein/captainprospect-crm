import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchVaultCallMatches, isVaultConfigured, vaultRecordingProxyUrl, type VaultCallMatch } from '@/lib/call-vault-client';

const CANDIDATE_WINDOW_DAYS = 90;
const CANDIDATE_LIMIT = 20;

function parisDayKey(value: Date): string {
  return value.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
}

/** Maps a vault match onto the legacy shape app/sdr/action/page.tsx's AlloCallItem expects. */
function toAlloCallItem(m: VaultCallMatch) {
  return {
    id: m.callId,
    from: m.fromNumber,
    to: m.toNumber,
    duration: m.durationSec,
    direction: m.direction,
    outcome: m.status ?? undefined,
    summary: m.summary ?? undefined,
    // Stable reference, not the presigned URL the vault returned inline — this can get stored
    // via enrich-call/updateMeeting, and a presigned URL would expire within the hour.
    recording_url: m.recordingUrl ? (vaultRecordingProxyUrl(m.callId) ?? undefined) : undefined,
    transcription: m.transcription ?? undefined,
    start_time: m.startedAt ?? undefined,
  };
}

// GET /api/sdr/calls/for-contact?phone=+33644606054
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
  }

  const phone = req.nextUrl.searchParams.get('phone');
  const meetingDate = req.nextUrl.searchParams.get('meetingDate');
  if (!phone) {
    return NextResponse.json({ success: false, error: 'phone requis' }, { status: 400 });
  }

  if (!isVaultConfigured()) {
    return NextResponse.json({ success: false, error: 'VAULT_API_URL/VAULT_API_KEY non configuré' }, { status: 503 });
  }

  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - CANDIDATE_WINDOW_DAYS * 86400_000);

  const matches = await fetchVaultCallMatches({
    phones: [phone],
    windowStart,
    windowEnd,
    limit: CANDIDATE_LIMIT,
  });

  const targetMeetingDay = (() => {
    if (!meetingDate) return null;
    const d = new Date(meetingDate);
    if (Number.isNaN(d.getTime())) return null;
    return parisDayKey(d);
  })();

  let calls = matches.map(toAlloCallItem);
  if (targetMeetingDay) {
    calls = calls.filter((call) => {
      if (!call.start_time) return false;
      const d = new Date(call.start_time);
      if (Number.isNaN(d.getTime())) return false;
      return parisDayKey(d) === targetMeetingDay;
    });
  }

  // Already ranked by the vault (content score), but re-sort newest first to match prior UX.
  calls = calls.sort((a, b) => {
    const ta = a.start_time ? new Date(a.start_time).getTime() : 0;
    const tb = b.start_time ? new Date(b.start_time).getTime() : 0;
    return tb - ta;
  });

  return NextResponse.json({
    success: true,
    data: {
      calls,
      meta: {
        filterPhone: phone,
        // No longer a meaningful "lines queried" count once matching runs against the vault's
        // already-synced data instead of live-querying each WithAllo line — left null, the UI
        // already hides this badge when it's null (AlloCallPickerModal.tsx:246).
        alloLineCount: null,
        filteredOnMeetingDay: !!targetMeetingDay,
        meetingDay: targetMeetingDay,
      },
    },
  });
}
