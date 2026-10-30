// tl;dv — REST v1alpha1, header x-api-key. Docs: https://doc.tldv.io
//   GET /meetings?page&limit&query   { page, pages, results[] }
//   GET /meetings/{id}/notes         { markdownContent, topics[]{title, summary} }
//   GET /meetings/{id}/transcript    { data[]{speaker, text} }   (404 until it is complete)
// A custom User-Agent is required (library defaults get a 403). Pro plan or above, the
// organizer's plan counting. `duration` is read as seconds (unit not stated in the docs).

import { integrationKey } from "@/lib/integrations/keys";
import { arr, dedupePeople, isoDate, listIn, num, obj, person, providerFetch, str, type Obj } from "../http";
import { transcriptLines } from "../normalize";
import type { NotetakerAdapter, ProviderMeeting, ProviderPage } from "../types";

const LABEL = "tl;dv";
const BASE = "https://pasta.tldv.io/v1alpha1";
const PAGE = 50;

function headers() {
    return { "x-api-key": integrationKey("TLDV_API_KEY") ?? "", "User-Agent": "Mozilla/5.0 (compatible; CRM-notetaker-import/1.0)" };
}

function toMeeting(m: Obj): ProviderMeeting {
    const organizer = obj(m.organizer);
    const host = organizer.name || organizer.email ? person(organizer.name, organizer.email) : null;
    return {
        id: str(m.id),
        title: str(m.name),
        date: isoDate(m.happenedAt),
        durationSec: Math.round(num(m.duration)),
        url: str(m.url) || null,
        attendees: dedupePeople([...(host ? [host] : []), ...arr(m.invitees).map((p) => person(p.name, p.email))]),
        host,
    };
}

async function page(cursor: string | null, query?: string): Promise<ProviderPage> {
    const n = Math.max(1, parseInt(cursor ?? "1", 10) || 1);
    const url = new URL(`${BASE}/meetings`);
    url.searchParams.set("page", String(n));
    url.searchParams.set("limit", String(PAGE));
    if (query) url.searchParams.set("query", query);
    const body = await providerFetch(LABEL, url.toString(), { headers: headers() });
    return {
        meetings: listIn(body, "results", "data").map(toMeeting),
        next: n < num(obj(body).pages) ? String(n + 1) : null,
    };
}

export const tldv: NotetakerAdapter = {
    id: "tldv",
    label: LABEL,
    keys: ["TLDV_API_KEY"],

    list: ({ cursor }) => page(cursor),
    search: (query) => page(null, query),

    async get(id) {
        const enc = encodeURIComponent(id);
        const opt = { emptyOn: [404, 409] };
        const [call, notes, transcript] = await Promise.all([
            providerFetch(LABEL, `${BASE}/meetings/${enc}`, { headers: headers() }),
            providerFetch(LABEL, `${BASE}/meetings/${enc}/notes`, { headers: headers() }, opt),
            providerFetch(LABEL, `${BASE}/meetings/${enc}/transcript`, { headers: headers() }, opt),
        ]);
        const meeting = toMeeting(obj(call));
        const n = obj(notes);
        const topics = arr(n.topics)
            .map((t) => (str(t.summary) ? `### ${str(t.title)}\n${str(t.summary)}` : ""))
            .filter(Boolean)
            .join("\n\n");
        meeting.summary = str(n.markdownContent) || topics;
        meeting.actionItems = [];
        meeting.transcript = transcriptLines(
            listIn(transcript, "data").map((t) => ({ speaker: str(t.speaker), text: str(t.text) })),
        );
        return meeting;
    },
};
