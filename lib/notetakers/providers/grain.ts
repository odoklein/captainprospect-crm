// Grain — REST v2, Bearer personal token + a required version header. Docs: https://developers.grain.com
//   POST /recordings {cursor, filter{title_search}, include{participants}}   { recordings[], cursor }
//   POST /recordings/{id} {include{participants, ai_summary, ai_action_items}}
//   GET  /recordings/{id}/transcript → [{speaker, text, start, end}]
// duration_ms is in milliseconds. The docs' before/after_datetime descriptions look
// swapped, so no date filter is sent. Rate limit: 30 burst, 2 requests/second.

import { integrationKey } from "@/lib/integrations/keys";
import { arr, dedupePeople, isoDate, listIn, num, obj, person, providerFetch, str, type Obj } from "../http";
import { transcriptLines } from "../normalize";
import type { NotetakerAdapter, ProviderMeeting, ProviderPage } from "../types";

const LABEL = "Grain";
const BASE = "https://api.grain.com/_/public-api/v2";
const API_VERSION = "2026-10-01";

function headers(json = false) {
    return {
        Authorization: `Bearer ${integrationKey("GRAIN_API_KEY")}`,
        "Public-Api-Version": API_VERSION,
        ...(json ? { "Content-Type": "application/json" } : {}),
    };
}

function toMeeting(r: Obj): ProviderMeeting {
    return {
        id: str(r.id),
        title: str(r.title),
        date: isoDate(r.start_datetime),
        durationSec: Math.round(num(r.duration_ms) / 1000),
        url: str(r.url) || null,
        attendees: dedupePeople(arr(r.participants).map((p) => person(p.name, p.email))),
    };
}

async function page(cursor: string | null, titleSearch?: string): Promise<ProviderPage> {
    const body = await providerFetch(LABEL, `${BASE}/recordings`, {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({
            ...(cursor ? { cursor } : {}),
            ...(titleSearch ? { filter: { title_search: titleSearch } } : {}),
            include: { participants: true },
        }),
    });
    return {
        meetings: listIn(body, "recordings", "data").map(toMeeting),
        next: str(obj(body).cursor) || null,
    };
}

export const grain: NotetakerAdapter = {
    id: "grain",
    label: LABEL,
    keys: ["GRAIN_API_KEY"],

    list: ({ cursor }) => page(cursor),
    // Grain searches titles; company names are usually in them.
    search: (query) => page(null, query),

    async get(id) {
        const enc = encodeURIComponent(id);
        const [rec, transcript] = await Promise.all([
            providerFetch(LABEL, `${BASE}/recordings/${enc}`, {
                method: "POST",
                headers: headers(true),
                body: JSON.stringify({ include: { participants: true, ai_summary: true, ai_action_items: true } }),
            }),
            providerFetch(LABEL, `${BASE}/recordings/${enc}/transcript`, { headers: headers() }, { emptyOn: [404, 409] }),
        ]);
        const raw = obj(obj(rec).recording ?? rec);
        const meeting = toMeeting(raw);
        meeting.summary = str(obj(raw.ai_summary).text);
        meeting.actionItems = arr(raw.ai_action_items).map((a) => str(a.text)).filter(Boolean);
        meeting.transcript = transcriptLines(
            listIn(transcript, "transcript", "data").map((t) => ({ speaker: str(t.speaker), text: str(t.text) })),
        );
        return meeting;
    },
};
