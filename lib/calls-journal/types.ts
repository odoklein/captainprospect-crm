// Shapes shared by /api/manager/calls and the manager's call journal page.

import type { CallSource } from "./filters";
import type { TelephonyStatus } from "@/lib/telephony/status";
import type { SummaryState } from "@/lib/telephony/summary-shape";

export interface JournalStatusRef {
    code: string;
    label: string;
    color: string | null;
}

export interface JournalRow {
    /** Action id (journal) or TelephonyCall id (unqualified view). */
    id: string;
    kind: "action" | "call";
    at: string;
    sdr: { id: string; name: string };
    contact: { id: string; name: string; title: string | null } | null;
    company: { id: string; name: string; website?: string | null } | null;
    phone: string | null;
    mission: { id: string; name: string; client: string | null } | null;
    /** The CRM status the SDR logged. Null on an unqualified call. */
    status: JournalStatusRef | null;
    /** What Twilio saw (integrated phone only). */
    telephonyStatus: TelephonyStatus | null;
    durationSec: number | null;
    hasRecording: boolean;
    hasSummary: boolean;
    note: string | null;
    source: CallSource;
    /** The prospect called the SDR's Twilio number. */
    inbound?: boolean;
    /** Inbound and not answered: the caller left a message. */
    voicemail?: boolean;
}

export interface JournalFacet {
    id: string;
    label: string;
    count: number;
    color?: string | null;
}

export interface JournalKpis {
    /** Calls matching every filter. */
    calls: number;
    meetings: number;
    /** Sum of measured durations, and how many calls carry one. Never extrapolated. */
    talkSeconds: number;
    measuredCalls: number;
    withRecording: number;
}

export interface JournalResponse {
    view: "journal" | "unqualified";
    start: string;
    end: string;
    page: number;
    limit: number;
    total: number;
    rows: JournalRow[];
    kpis: JournalKpis;
    /** Calls placed from the integrated phone more than the grace period ago, with no status logged. */
    unqualified: number;
    facets: { statuses: JournalFacet[]; sdrs: JournalFacet[]; missions: JournalFacet[] };
    /** Integrated phone (Twilio) usable for this agency. */
    telephonyEnabled: boolean;
}

export interface CallDetail {
    id: string;
    kind: "action" | "call";
    at: string;
    sdr: { id: string; name: string };
    contact: { id: string; name: string; title: string | null; email: string | null } | null;
    company: { id: string; name: string; website?: string | null } | null;
    phone: string | null;
    mission: { id: string; name: string; client: string | null } | null;
    status: JournalStatusRef | null;
    note: string | null;
    callbackDate: string | null;
    durationSec: number | null;
    source: CallSource;
    /** URL the audio element streams from, or null without a recording. */
    recordingUrl: string | null;
    /** Plain-text summary/transcript (Allo, or copied from the AI summary). */
    summary: string | null;
    transcription: string | null;
    /** Structured AI summary of an integrated-phone call. */
    ai: SummaryState;
    /** Speaker-labelled live transcript of an integrated-phone call. */
    transcript: { speaker: "sdr" | "prospect" | "mixed"; text: string; at: string }[];
    telephony: {
        status: TelephonyStatus;
        from: string;
        to: string;
        startedAt: string;
        answeredAt: string | null;
        endedAt: string | null;
    } | null;
    /** The prospect’s recorded activities with this agency, newest first (max 20). */
    history: { id: string; at: string; sdr: string; status: JournalStatusRef | null; durationSec: number | null; channel?: string; note?: string | null; summary?: string | null }[];
}
