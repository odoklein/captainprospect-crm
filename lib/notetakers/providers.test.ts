// npm run test:notetakers — each adapter against a stubbed fetch with payloads shaped like the
// vendor's documented responses: the request it sends and how the answer is mapped.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.MODJO_API_KEY = "modjo-key";
process.env.CLAAP_API_KEY = "cla_key";
process.env.FIREFLIES_API_KEY = "ff-key";
process.env.FATHOM_API_KEY = "fathom-key";
process.env.GRAIN_API_KEY = "grain-key";
process.env.TLDV_API_KEY = "tldv-key";

import { ADAPTERS } from "./providers";
import { NotetakerError } from "./types";

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
let routes: Array<{ match: RegExp; status?: number; body: unknown }> = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
    calls = [];
    routes = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const url = String(input);
        calls.push({ url, init });
        const route = routes.find((r) => r.match.test(`${init.method ?? "GET"} ${url}`));
        if (!route) return new Response(JSON.stringify({ message: "no route" }), { status: 500 });
        return new Response(JSON.stringify(route.body), { status: route.status ?? 200 });
    }) as typeof fetch;
});
afterEach(() => {
    globalThis.fetch = realFetch;
});

const header = (c: Call, name: string) => (c.init.headers as Record<string, string>)[name];

test("modjo: Bearer key, pages by number, maps users and contacts, reads the three sub-resources", async () => {
    routes.push(
        {
            match: /GET .*\/calls\?/,
            body: {
                data: [{ id: 12, name: "Closing Octofilms", date: "2026-10-20T09:00:00Z", duration: 1800, users: [{ email: "marie@suzali.fr", firstName: "Marie", lastName: "Dupont" }], contacts: [{ name: "Paul Martin", email: "paul@octofilms.fr" }] }],
                pagination: { page: 1, size: 50, total: 120 },
            },
        },
        { match: /GET .*\/calls\/12\?expand/, body: { id: 12, name: "Closing Octofilms", date: "2026-10-20T09:00:00Z", duration: 1800, users: [], contacts: [{ name: "Paul Martin", email: "paul@octofilms.fr" }] } },
        { match: /summaries/, body: { data: [{ templateTitle: "Besoins", answer: "20 RDV/mois" }, { templateTitle: "Vide", answer: null }] } },
        { match: /next-steps/, body: { data: [{ title: "Proposition", description: "avant vendredi" }] } },
        { match: /transcript/, body: { data: [{ content: "Bonjour", speaker: { name: "Marie" } }, { content: "Salut", speaker: { name: "Paul" } }] } },
    );
    const page = await ADAPTERS.modjo.list({ cursor: null, since: new Date("2026-09-01") });
    assert.equal(header(calls[0], "Authorization"), "Bearer modjo-key");
    assert.match(calls[0].url, /page=1.*from=2026-09-01/);
    assert.equal(page.next, "2");
    assert.deepEqual(page.meetings[0].attendees.map((a) => a.name), ["Marie Dupont", "Paul Martin"]);
    assert.equal(page.meetings[0].durationSec, 1800);
    assert.equal(page.meetings[0].summary, undefined);

    const m = await ADAPTERS.modjo.get("12");
    assert.equal(m.summary, "### Besoins\n20 RDV/mois");
    assert.deepEqual(m.actionItems, ["Proposition : avant vendredi"]);
    assert.equal(m.transcript, "Marie : Bonjour\nPaul : Salut");
});

test("modjo: a transcript still processing (409) is empty, not an error", async () => {
    routes.push(
        { match: /GET .*\/calls\/5\?expand/, body: { id: 5, name: "x", date: "2026-10-20T09:00:00Z", duration: 60 } },
        { match: /summaries/, body: { data: [] } },
        { match: /next-steps/, body: { data: [] } },
        { match: /transcript/, status: 409, body: { error: "not_ready" } },
    );
    const m = await ADAPTERS.modjo.get("5");
    assert.equal(m.transcript, "");
});

test("claap: X-Claap-Key, cursor paging, French texts preferred", async () => {
    routes.push(
        {
            match: /GET .*\/recordings\?/,
            body: { result: { recordings: [{ id: "r1", title: "Visio", createdAt: "2026-10-20T09:00:00Z", durationSeconds: 900, url: "https://app.claap.io/x", meeting: { startingAt: "2026-10-20T08:30:00Z", participants: [{ name: "Paul", email: "p@octofilms.fr" }] }, recorder: { name: "Marie", email: "marie@suzali.fr" } }], pagination: { nextCursor: "c2" } } },
        },
        {
            match: /GET .*\/recordings\/r1\?|GET .*\/recordings\/r1$/,
            body: { result: { recording: { id: "r1", title: "Visio", createdAt: "2026-10-20T09:00:00Z", durationSeconds: 900, keyTakeaways: [{ langIso2: "en", text: "English" }, { langIso2: "fr", text: "Français" }], actionItems: [{ langIso2: "fr", items: [{ description: "Envoyer devis" }] }] } } },
        },
        { match: /transcript/, body: { result: { transcript: { segments: [{ speaker: "Paul", text: "Bonjour" }] } } } },
    );
    const page = await ADAPTERS.claap.list({ cursor: null, since: null });
    assert.equal(header(calls[0], "X-Claap-Key"), "cla_key");
    assert.equal(page.next, "c2");
    assert.equal(page.meetings[0].date, "2026-10-20T08:30:00.000Z");
    assert.equal(page.meetings[0].host?.email, "marie@suzali.fr");

    const m = await ADAPTERS.claap.get("r1");
    assert.match(m.summary ?? "", /Français/);
    assert.doesNotMatch(m.summary ?? "", /English/);
    assert.deepEqual(m.actionItems, ["Envoyer devis"]);
    assert.equal(m.transcript, "Paul : Bonjour");
});

test("fireflies: GraphQL POST, minutes become seconds, skip paging", async () => {
    routes.push({
        match: /POST .*graphql/,
        body: { data: { transcripts: [{ id: "t1", title: "Appel", dateString: "2026-10-20T09:00:00.000Z", duration: 31.5, transcript_url: "https://app.fireflies.ai/view/t1", organizer_email: "marie@suzali.fr", participants: ["marie@suzali.fr", "paul@octofilms.fr"], meeting_attendees: [{ displayName: "Paul Martin", email: "paul@octofilms.fr" }] }] } },
    });
    const page = await ADAPTERS.fireflies.list({ cursor: "50", since: new Date("2026-09-01") });
    assert.equal(header(calls[0], "Authorization"), "Bearer ff-key");
    const sent = JSON.parse(String(calls[0].init.body));
    assert.equal(sent.variables.skip, 50);
    assert.equal(sent.variables.fromDate, "2026-09-01T00:00:00.000Z");
    assert.equal(page.meetings[0].durationSec, 1890);
    assert.equal(page.next, null);
    const names = page.meetings[0].attendees.map((a) => a.name);
    assert.deepEqual(names, ["Paul Martin", "marie"]);
});

test("fireflies: summary, action items and sentences; GraphQL errors become French messages", async () => {
    routes.push({
        match: /POST .*graphql/,
        body: { data: { transcript: { id: "t1", title: "Appel", dateString: "2026-10-20T09:00:00.000Z", duration: 10, summary: { overview: "Résumé", bullet_gist: "* point 1\n* point 2", action_items: "**Marie**\n- Envoyer devis\n- Relancer" }, sentences: [{ speaker_name: "Marie", text: "Bonjour" }] } } },
    });
    const m = await ADAPTERS.fireflies.get("t1");
    assert.equal(m.summary, "Résumé\n\n- point 1\n- point 2");
    assert.deepEqual(m.actionItems, ["Marie : Envoyer devis", "Marie : Relancer"]);
    assert.equal(m.transcript, "Marie : Bonjour");

    routes.length = 0;
    routes.push({ match: /POST .*graphql/, body: { errors: [{ message: "Invalid API key", code: "auth_failed" }] } });
    await assert.rejects(() => ADAPTERS.fireflies.list({ cursor: null, since: null }), (e) => e instanceof NotetakerError && e.status === 403 && /refuse la clé/.test(e.message));
});

test("fathom: X-Api-Key, duration from start/end, detail found again by its created_at window", async () => {
    const meeting = { recording_id: 987, title: "Appel", meeting_title: "Closing Octofilms", share_url: "https://fathom.video/share/x", created_at: "2026-10-20T10:00:00Z", recording_start_time: "2026-10-20T09:00:00Z", recording_end_time: "2026-10-20T09:30:00Z", recorded_by: { name: "Marie", email: "marie@suzali.fr" }, calendar_invitees: [{ name: "Paul", email: "paul@octofilms.fr", is_external: true }] };
    routes.push({
        match: /GET .*\/meetings(\?|$)/,
        body: { items: [{ ...meeting, default_summary: { template_name: "General", markdown_formatted: "## Résumé\nTexte" }, action_items: [{ description: "Envoyer devis" }], transcript: [{ speaker: { display_name: "Paul" }, text: "Bonjour", timestamp: "00:00:01" }] }], next_cursor: null },
    });
    const page = await ADAPTERS.fathom.list({ cursor: null, since: null });
    assert.equal(header(calls[0], "X-Api-Key"), "fathom-key");
    assert.equal(page.meetings[0].title, "Closing Octofilms");
    assert.equal(page.meetings[0].durationSec, 1800);
    const id = page.meetings[0].id;
    assert.match(id, /^987~\d+$/);

    const m = await ADAPTERS.fathom.get(id);
    assert.match(calls[1].url, /include_summary=true.*include_transcript=true|include_transcript=true.*include_summary=true/);
    assert.match(calls[1].url, /created_after=2026-10-20T09%3A59%3A58/);
    assert.equal(m.summary, "## Résumé\nTexte");
    assert.deepEqual(m.actionItems, ["Envoyer devis"]);
    assert.equal(m.transcript, "Paul : Bonjour");

    await assert.rejects(() => ADAPTERS.fathom.get("5~1760000000"), (e) => e instanceof NotetakerError && e.status === 404);
});

test("grain: POST with the version header, title search, ms durations, transcript variants", async () => {
    routes.push(
        { match: /POST .*\/recordings$/, body: { recordings: [{ id: "g1", title: "Octofilms", start_datetime: "2026-10-20T09:00:00Z", duration_ms: 1_200_000, url: "https://grain.com/share/g1", participants: [{ name: "Paul", email: "paul@octofilms.fr" }] }], cursor: "next" } },
        { match: /POST .*\/recordings\/g1$/, body: { id: "g1", title: "Octofilms", start_datetime: "2026-10-20T09:00:00Z", duration_ms: 1_200_000, participants: [], ai_summary: { text: "Résumé" }, ai_action_items: [{ text: "Envoyer devis" }] } },
        { match: /GET .*\/recordings\/g1\/transcript/, body: [{ speaker: "Paul", text: "Bonjour" }] },
    );
    const found = await ADAPTERS.grain.search!("Octofilms", { cursor: null, since: null });
    assert.equal(header(calls[0], "Authorization"), "Bearer grain-key");
    assert.ok(header(calls[0], "Public-Api-Version"));
    assert.equal(JSON.parse(String(calls[0].init.body)).filter.title_search, "Octofilms");
    assert.equal(found.meetings[0].durationSec, 1200);
    assert.equal(found.next, "next");

    const m = await ADAPTERS.grain.get("g1");
    assert.equal(m.summary, "Résumé");
    assert.deepEqual(m.actionItems, ["Envoyer devis"]);
    assert.equal(m.transcript, "Paul : Bonjour");
});

test("tldv: x-api-key and a User-Agent, page paging, notes fall back to topics", async () => {
    routes.push(
        { match: /GET .*\/meetings\?/, body: { page: 1, pages: 3, total: 120, results: [{ id: "m1", name: "Appel", happenedAt: "2026-10-20T09:00:00Z", duration: 1500, url: "https://tldv.io/app/meetings/m1", organizer: { name: "Marie", email: "marie@suzali.fr" }, invitees: [{ name: "Paul", email: "paul@octofilms.fr" }] }] } },
        { match: /GET .*\/meetings\/m1$/, body: { id: "m1", name: "Appel", happenedAt: "2026-10-20T09:00:00Z", duration: 1500, organizer: { name: "Marie", email: "marie@suzali.fr" }, invitees: [] } },
        { match: /notes/, body: { markdownContent: "", topics: [{ title: "Besoin", summary: "20 RDV" }] } },
        { match: /transcript/, status: 404, body: { message: "not ready" } },
    );
    const page = await ADAPTERS.tldv.list({ cursor: null, since: null });
    assert.equal(header(calls[0], "x-api-key"), "tldv-key");
    assert.ok(header(calls[0], "User-Agent"));
    assert.equal(page.next, "2");
    const search = await ADAPTERS.tldv.search!("Octo", { cursor: null, since: null });
    assert.match(calls[1].url, /query=Octo/);
    assert.equal(search.meetings.length, 1);

    const m = await ADAPTERS.tldv.get("m1");
    assert.equal(m.summary, "### Besoin\n20 RDV");
    assert.equal(m.transcript, "");
});

test("provider refusals and limits carry a French message and the right status", async () => {
    routes.push({ match: /./, status: 401, body: { message: "bad key" } });
    await assert.rejects(() => ADAPTERS.claap.list({ cursor: null, since: null }), (e) => e instanceof NotetakerError && e.status === 403 && /Claap refuse la clé API/.test(e.message));
    routes.length = 0;
    routes.push({ match: /./, status: 429, body: {} });
    await assert.rejects(() => ADAPTERS.modjo.list({ cursor: null, since: null }), (e) => e instanceof NotetakerError && e.status === 429);
});
