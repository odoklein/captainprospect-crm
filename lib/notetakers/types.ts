// ============================================
// NOTE-TAKERS — the meeting recorders a closing call can be imported from
// (« Nouveau client » wizard). Leexi keeps its own service (lib/leexi); every
// other provider is an adapter that maps its API to ProviderMeeting, and
// ./normalize turns that into the same call shape as Leexi's, so the wizard,
// the bot filtering and the recap the AI reads are shared.
// ============================================

import type { IntegrationKeyName } from "@/lib/integrations/catalog";

export interface ProviderPerson {
    name: string;
    email: string | null;
}

/** One meeting as a provider returns it, mapped to plain fields. */
export interface ProviderMeeting {
    id: string;
    title: string;
    /** Start of the meeting, ISO. */
    date: string | null;
    /** Seconds. */
    durationSec: number;
    /** Link to the recording in the provider's app. */
    url: string | null;
    /** Everyone on the invite or the call, our own people included (told apart later by domain and name). */
    attendees: ProviderPerson[];
    /** Who recorded the meeting: one of us. */
    host?: ProviderPerson | null;
    /** AI notes / summary. `undefined` = not fetched yet (list endpoints that don't return it). */
    summary?: string;
    actionItems?: string[];
    /** "Speaker: text" lines; empty when the provider has none or it was not fetched. */
    transcript?: string;
}

export interface ProviderPage {
    meetings: ProviderMeeting[];
    /** Opaque cursor for the next (older) page, null on the last one. */
    next: string | null;
}

export interface ListOptions {
    cursor: string | null;
    /** Only meetings after this day (search scans), when the API can filter. */
    since: Date | null;
}

export interface NotetakerAdapter {
    id: string;
    label: string;
    /** Keys read through integrationKey(); all of them are needed. */
    keys: readonly IntegrationKeyName[];
    list(opts: ListOptions): Promise<ProviderPage>;
    /** Summary, action items and transcript of one meeting. */
    get(id: string): Promise<ProviderMeeting>;
    /** Text search done by the API itself, when it has one (otherwise recent pages are scanned). */
    search?(query: string, opts: ListOptions): Promise<ProviderPage>;
}

export class NotetakerError extends Error {
    constructor(message: string, public status: number) {
        super(message);
        this.name = "NotetakerError";
    }
}
