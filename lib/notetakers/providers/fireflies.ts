// Fireflies.ai — GraphQL, Bearer key. Docs: https://docs.fireflies.ai/graphql-api
//   transcripts(limit ≤ 50, skip, fromDate)   duration is in MINUTES
//   transcript(id) { summary{…} sentences{speaker_name text} }
// The cursor is the `skip` offset. Free plan: 30 requests/minute, 500/day.

import { integrationKey } from "@/lib/integrations/keys";
import { NotetakerError } from "../types";
import { arr, dedupePeople, isoDate, num, obj, person, providerFetch, str, type Obj } from "../http";
import { transcriptLines } from "../normalize";
import type { NotetakerAdapter, ProviderMeeting } from "../types";

const LABEL = "Fireflies";
const ENDPOINT = "https://api.fireflies.ai/graphql";
const PAGE = 50;

const FIELDS = "id title date dateString duration transcript_url organizer_email participants meeting_attendees { displayName email name }";

async function gql(query: string, variables: Record<string, unknown>): Promise<Obj> {
    const body = obj(
        await providerFetch(LABEL, ENDPOINT, {
            method: "POST",
            headers: { Authorization: `Bearer ${integrationKey("FIREFLIES_API_KEY")}`, "Content-Type": "application/json" },
            body: JSON.stringify({ query, variables }),
        }),
    );
    const errors = arr(body.errors);
    if (errors.length) {
        const first = errors[0];
        const code = str(obj(first.extensions).code) || str(first.code);
        const message = str(first.message);
        if (/auth|api key|unauthor|invalid/i.test(`${code} ${message}`)) {
            throw new NotetakerError(`${LABEL} refuse la clé API (« ${message} »). Vérifiez-la dans Paramètres › Intégrations.`, 403);
        }
        if (/too_many_requests/i.test(`${code} ${message}`)) throw new NotetakerError(`${LABEL} limite les requêtes : réessayez dans une minute.`, 429);
        throw new NotetakerError(`${LABEL} : ${message || "erreur"}`, 502);
    }
    return obj(body.data);
}

function toMeeting(t: Obj): ProviderMeeting {
    const attendees = arr(t.meeting_attendees).map((a) => person(str(a.displayName) || str(a.name), a.email));
    // `participants` is a list of emails (sometimes names).
    const emails = (Array.isArray(t.participants) ? t.participants : []).map(str).filter(Boolean);
    const organizer = str(t.organizer_email);
    const fromEmails = emails.map((e) => (e.includes("@") ? person("", e) : person(e, null)));
    return {
        id: str(t.id),
        title: str(t.title),
        date: isoDate(t.dateString) ?? isoDate(t.date),
        durationSec: Math.round(num(t.duration) * 60),
        url: str(t.transcript_url) || null,
        attendees: dedupePeople([...attendees, ...fromEmails]).map((p) => ({ ...p, name: p.name || (p.email?.split("@")[0] ?? "") })),
        host: organizer ? person("", organizer) : null,
    };
}

/** Free text, a line per item, bullet markers dropped. */
function lines(v: unknown): string[] {
    const text = Array.isArray(v) ? v.map(str).join("\n") : str(v);
    return text
        .split(/\r?\n/)
        .map((l) => l.replace(/^\s*[-*•–]\s+/, "").trim())
        .filter(Boolean);
}

/** Action items come grouped under a bold owner line (« **Marie** » then her tasks): the owner prefixes each task. */
function actionItems(v: unknown): string[] {
    let owner = "";
    const out: string[] = [];
    for (const l of lines(v)) {
        const heading = /^\*\*(.+?)\*\*:?$/.exec(l);
        if (heading) owner = heading[1].trim();
        else out.push(owner ? `${owner} : ${l}` : l);
    }
    return out;
}

export const fireflies: NotetakerAdapter = {
    id: "fireflies",
    label: LABEL,
    keys: ["FIREFLIES_API_KEY"],

    async list({ cursor, since }) {
        const skip = Math.max(0, parseInt(cursor ?? "0", 10) || 0);
        const data = await gql(
            `query($limit: Int, $skip: Int, $fromDate: DateTime) { transcripts(limit: $limit, skip: $skip, fromDate: $fromDate) { ${FIELDS} } }`,
            { limit: PAGE, skip, fromDate: since ? since.toISOString() : null },
        );
        const meetings = arr(data.transcripts).map(toMeeting);
        return { meetings, next: meetings.length === PAGE ? String(skip + PAGE) : null };
    },

    async get(id) {
        const data = await gql(
            `query($id: String!) { transcript(id: $id) { ${FIELDS} summary { overview short_summary bullet_gist action_items } sentences { speaker_name text } } }`,
            { id },
        );
        const t = obj(data.transcript);
        if (!str(t.id)) throw new NotetakerError("Enregistrement introuvable dans Fireflies.", 404);
        const meeting = toMeeting(t);
        const s = obj(t.summary);
        meeting.summary = [str(s.overview) || str(s.short_summary), lines(s.bullet_gist).map((l) => `- ${l}`).join("\n")].filter(Boolean).join("\n\n");
        meeting.actionItems = actionItems(s.action_items);
        meeting.transcript = transcriptLines(arr(t.sentences).map((x) => ({ speaker: str(x.speaker_name), text: str(x.text) })));
        return meeting;
    },
};
