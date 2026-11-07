// Fathom — REST, header X-Api-Key (no « Bearer »). Docs: https://developers.fathom.ai
//   GET /meetings?cursor&created_after&include_summary&include_action_items&include_transcript
//        { items[], next_cursor }   (no duration: end − start of the recording)
// There is no « get one meeting » call: an id is `<recording_id>~<created_at epoch seconds>` and the
// detail asks the list for that few-second window with summary, tasks and transcript included.
// The key belongs to one user: it sees that user's meetings and those shared with them.
// Rate limit: 60 requests/minute, 30 for calls that include summary or transcript.

import { integrationKey } from "@/lib/integrations/keys";
import { NotetakerError } from "../types";
import { arr, dedupePeople, isoDate, listIn, obj, person, providerFetch, secondsBetween, str, type Obj } from "../http";
import { transcriptLines } from "../normalize";
import type { NotetakerAdapter, ProviderMeeting } from "../types";

const LABEL = "Fathom";
const BASE = "https://api.fathom.ai/external/v1";

function headers() {
    return { "X-Api-Key": integrationKey("FATHOM_API_KEY") ?? "" };
}

function toMeeting(m: Obj): ProviderMeeting {
    const start = m.recording_start_time ?? m.scheduled_start_time ?? m.created_at;
    const date = isoDate(start) ?? isoDate(m.created_at);
    const recordedBy = obj(m.recorded_by);
    const host = recordedBy.name || recordedBy.email ? person(recordedBy.name, recordedBy.email) : null;
    return {
        // The detail looks the meeting up by created_at (what the API filters on).
        id: `${String(m.recording_id ?? "")}~${Math.floor(new Date(isoDate(m.created_at) ?? date ?? 0).getTime() / 1000)}`,
        title: str(m.meeting_title) || str(m.title),
        date,
        durationSec: secondsBetween(m.recording_start_time, m.recording_end_time),
        url: str(m.share_url) || str(m.url) || null,
        attendees: dedupePeople([...(host ? [host] : []), ...arr(m.calendar_invitees).map((p) => person(p.name, p.email))]),
        host,
    };
}

export const fathom: NotetakerAdapter = {
    id: "fathom",
    label: LABEL,
    keys: ["FATHOM_API_KEY"],

    async list({ cursor, since }) {
        const url = new URL(`${BASE}/meetings`);
        if (cursor) url.searchParams.set("cursor", cursor);
        if (since) url.searchParams.set("created_after", since.toISOString());
        const body = await providerFetch(LABEL, url.toString(), { headers: headers() });
        return {
            meetings: listIn(body, "items", "data", "meetings").map(toMeeting),
            next: str(obj(body).next_cursor) || null,
        };
    },

    async get(id) {
        const [recordingId, epoch] = id.split("~");
        const at = Number(epoch);
        if (!recordingId || !at) throw new NotetakerError("Enregistrement Fathom invalide.", 404);
        const url = new URL(`${BASE}/meetings`);
        url.searchParams.set("created_after", new Date((at - 2) * 1000).toISOString());
        url.searchParams.set("created_before", new Date((at + 2) * 1000).toISOString());
        for (const flag of ["include_summary", "include_action_items", "include_transcript"]) url.searchParams.set(flag, "true");
        const body = await providerFetch(LABEL, url.toString(), { headers: headers() });
        const raw = listIn(body, "items", "data", "meetings").find((m) => String(m.recording_id) === recordingId);
        if (!raw) throw new NotetakerError("Enregistrement introuvable dans Fathom.", 404);

        const meeting = toMeeting(raw);
        meeting.id = id;
        meeting.summary = str(obj(raw.default_summary).markdown_formatted);
        meeting.actionItems = arr(raw.action_items).map((a) => str(a.description)).filter(Boolean);
        meeting.transcript = transcriptLines(
            arr(raw.transcript).map((t) => ({ speaker: str(obj(t.speaker).display_name), text: str(t.text) })),
        );
        return meeting;
    },
};
