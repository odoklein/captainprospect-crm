// Modjo (French) — REST v2, Bearer key. Docs: https://api.modjo.ai/v2/docs
//   GET /calls?page&size&from&expand=contacts,users   { data|results[], pagination{page,size,total} }
//   GET /calls/{id}/summaries  → data[]{templateTitle, answer}
//   GET /calls/{id}/next-steps → data[]{title, description}
//   GET /calls/{id}/transcript → data[]{content, speaker{name}}   (409 = still processing)
// Rate limit: 100 requests/minute per workspace.

import { integrationKey } from "@/lib/integrations/keys";
import { arr, dedupePeople, isoDate, listIn, num, obj, person, providerFetch, str } from "../http";
import { transcriptLines } from "../normalize";
import type { NotetakerAdapter, ProviderMeeting } from "../types";

const LABEL = "Modjo";
const BASE = "https://api.modjo.ai/v2";
const PAGE = 50;

function headers() {
    return { Authorization: `Bearer ${integrationKey("MODJO_API_KEY")}` };
}

function toMeeting(c: Record<string, unknown>): ProviderMeeting {
    const users = arr(c.users).map((u) => person([str(u.firstName), str(u.lastName)].filter(Boolean).join(" "), u.email));
    const contacts = arr(c.contacts).map((p) => person(p.name, p.email));
    return {
        id: String(c.id ?? ""),
        title: str(c.name) || str(c.title),
        date: isoDate(c.date),
        durationSec: Math.round(num(c.duration)),
        url: null,
        attendees: dedupePeople([...users, ...contacts]),
        host: users[0] ?? null,
    };
}

export const modjo: NotetakerAdapter = {
    id: "modjo",
    label: LABEL,
    keys: ["MODJO_API_KEY"],

    async list({ cursor, since }) {
        const page = Math.max(1, parseInt(cursor ?? "1", 10) || 1);
        const url = new URL(`${BASE}/calls`);
        url.searchParams.set("page", String(page));
        url.searchParams.set("size", String(PAGE));
        url.searchParams.set("expand", "contacts,users");
        if (since) url.searchParams.set("from", since.toISOString());
        const body = await providerFetch(LABEL, url.toString(), { headers: headers() });
        const total = num(obj(obj(body).pagination).total);
        const meetings = listIn(body, "data", "results", "calls").map(toMeeting);
        return { meetings, next: page * PAGE < total ? String(page + 1) : null };
    },

    async get(id) {
        const enc = encodeURIComponent(id);
        const opt = { emptyOn: [404, 409] };
        const [call, summaries, steps, transcript] = await Promise.all([
            providerFetch(LABEL, `${BASE}/calls/${enc}?expand=contacts,users`, { headers: headers() }),
            providerFetch(LABEL, `${BASE}/calls/${enc}/summaries`, { headers: headers() }, opt),
            providerFetch(LABEL, `${BASE}/calls/${enc}/next-steps`, { headers: headers() }, opt),
            providerFetch(LABEL, `${BASE}/calls/${enc}/transcript`, { headers: headers() }, opt),
        ]);
        const raw = obj(call);
        const meeting = toMeeting(raw.data && typeof raw.data === "object" ? obj(raw.data) : raw);
        meeting.summary = listIn(summaries, "data")
            .map((s) => (str(s.answer) ? `${str(s.templateTitle) ? `### ${str(s.templateTitle)}\n` : ""}${str(s.answer)}` : ""))
            .filter(Boolean)
            .join("\n\n");
        meeting.actionItems = listIn(steps, "data")
            .map((s) => [str(s.title), str(s.description)].filter(Boolean).join(" : "))
            .filter(Boolean);
        meeting.transcript = transcriptLines(
            listIn(transcript, "data").map((t) => ({ speaker: str(obj(t.speaker).name), text: str(t.content) })),
        );
        return meeting;
    },
};
