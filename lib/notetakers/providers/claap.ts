// Claap (French) — REST v1, header X-Claap-Key. Docs: https://docs.claap.io
//   GET /recordings?limit&cursor   { result{ recordings[], pagination{nextCursor} } }
//   GET /recordings/{id}           keyTakeaways[], outlines[], actionItems[]{items[]{description}}
//   GET /recordings/{id}/transcript?format=json → result.transcript.segments[]{speaker, text}
// The docs' createdAfter/createdBefore descriptions contradict each other: no date
// filter is sent, the service stops at the first page older than the window.
// Rate limit: 3 requests/second, 3000/day per workspace.

import { integrationKey } from "@/lib/integrations/keys";
import { arr, dedupePeople, isoDate, num, obj, person, providerFetch, str, type Obj } from "../http";
import { transcriptLines } from "../normalize";
import type { NotetakerAdapter, ProviderMeeting } from "../types";

const LABEL = "Claap";
const BASE = "https://api.claap.io/v1";
const PAGE = 50;

function headers() {
    return { "X-Claap-Key": integrationKey("CLAAP_API_KEY") ?? "" };
}

/** Claap returns one text per language: the French one first. */
function byLang(items: Obj[], pick: (i: Obj) => string): string {
    const fr = items.find((i) => str(i.langIso2).toLowerCase() === "fr");
    return pick(fr ?? items[0] ?? {});
}

function toMeeting(r: Obj): ProviderMeeting {
    const meeting = obj(r.meeting);
    const recorder = obj(r.recorder);
    const host = recorder.name || recorder.email ? person(recorder.name, recorder.email) : null;
    return {
        id: String(r.id ?? ""),
        title: str(r.title),
        date: isoDate(meeting.startingAt) ?? isoDate(r.createdAt),
        durationSec: Math.round(num(r.durationSeconds)),
        url: str(r.url) || null,
        attendees: dedupePeople([...(host ? [host] : []), ...arr(meeting.participants).map((p) => person(p.name, p.email))]),
        host,
    };
}

function result(body: unknown): Obj {
    return obj(obj(body).result);
}

export const claap: NotetakerAdapter = {
    id: "claap",
    label: LABEL,
    keys: ["CLAAP_API_KEY"],

    async list({ cursor }) {
        const url = new URL(`${BASE}/recordings`);
        url.searchParams.set("limit", String(PAGE));
        if (cursor) url.searchParams.set("cursor", cursor);
        const body = await providerFetch(LABEL, url.toString(), { headers: headers() });
        const res = result(body);
        return {
            meetings: arr(res.recordings).map(toMeeting),
            next: str(obj(res.pagination).nextCursor) || null,
        };
    },

    async get(id) {
        const enc = encodeURIComponent(id);
        const [rec, transcript] = await Promise.all([
            providerFetch(LABEL, `${BASE}/recordings/${enc}`, { headers: headers() }),
            providerFetch(LABEL, `${BASE}/recordings/${enc}/transcript?format=json&lang=fr`, { headers: headers() }, { emptyOn: [404, 409] }),
        ]);
        const res = result(rec);
        const raw = obj(res.recording ?? res);
        const meeting = toMeeting(raw);

        const takeaways = byLang(arr(raw.keyTakeaways), (i) => str(i.text));
        const outline = byLang(arr(raw.outlines), (i) => str(i.text));
        const fields = arr(raw.aiFields)
            .map((f) => (str(f.description) ? `### ${str(f.title)}\n${str(f.description)}` : ""))
            .filter(Boolean)
            .join("\n\n");
        meeting.summary = [takeaways && `### Points clés\n${takeaways}`, outline && `### Plan\n${outline}`, fields].filter(Boolean).join("\n\n");
        meeting.actionItems = byLang(arr(raw.actionItems), (i) => arr(i.items).map((a) => str(a.description)).filter(Boolean).join("\n"))
            .split("\n")
            .filter(Boolean);
        meeting.transcript = transcriptLines(
            arr(obj(result(transcript).transcript).segments).map((s) => ({ speaker: str(s.speaker), text: str(s.text) })),
        );
        return meeting;
    },
};
