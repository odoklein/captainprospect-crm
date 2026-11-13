/**
 * The parallel dialer end to end on a real Postgres (PGlite) with the actual
 * migration, and a fake Twilio that records every REST call.
 *     npm run test:dialer
 */

process.env.TZ = "UTC";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Prisma } from "@prisma/client";
import { DEFAULT_DIALER_POLICY, type DialerPolicy } from "./policy";
import { agentReady, endSession, onAgentLeg, onAmd, onConferenceJoin, onConferenceLeave, onStatus, pauseSession, pump, sweep, type Candidate, type DialerDeps } from "./orchestrator";
import { getSession, liveAttempts, type AttemptRow, type SqlDb } from "./store";
import type { CreateCallInput, TwilioCalls } from "./twilio-rest";

let pg: PGlite;
const db: SqlDb = {
    async $queryRaw<T>(sql: Prisma.Sql): Promise<T> {
        const values = sql.values.map((v) => (v instanceof Date ? v.toISOString().replace("Z", "") : v));
        return (await pg.query(sql.text, values)).rows as T;
    },
};
const MIGRATION = readFileSync(join(process.cwd(), "prisma/migrations/20261112100000_add_sales_execution_engine/migration.sql"), "utf8");

// Thursday 12 Nov 2026, 10:00 Paris.
let clock = new Date("2026-11-12T09:00:00.000Z");
const advance = (sec: number) => (clock = new Date(clock.getTime() + sec * 1000));

interface FakeTwilio extends TwilioCalls {
    created: CreateCallInput[];
    redirects: { sid: string; twiml: string }[];
    ended: { sid: string; answered: boolean }[];
    recordings: string[];
    failNextCreate: boolean;
    sids: string[];
}
function fakeTwilio(): FakeTwilio {
    let n = 0;
    const t: FakeTwilio = {
        created: [], redirects: [], ended: [], recordings: [], failNextCreate: false, sids: [],
        async createCall(i) {
            if (t.failNextCreate) {
                t.failNextCreate = false;
                throw new Error("Twilio 503");
            }
            t.created.push(i);
            const sid = `CA${String(++n).padStart(32, "0")}`;
            t.sids.push(sid);
            return { sid };
        },
        async redirectCall(sid, twiml) { t.redirects.push({ sid, twiml }); },
        async endCall(sid, answered) { t.ended.push({ sid, answered }); },
        async startRecording(sid) { t.recordings.push(sid); },
    };
    return t;
}

const PROSPECTS: Candidate[] = Array.from({ length: 12 }, (_, i) => ({
    contactId: `c${i}`, companyId: `co${i}`, campaignId: "camp1", toNumber: `+3361000000${String(i).padStart(2, "0")}`, selection: { score: 90 - i, headline: "Prêt à appeler" },
}));

let twilio: FakeTwilio;
let ended: AttemptRow[];
let connected: AttemptRow[];
let policy: DialerPolicy;

function deps(over: Partial<DialerDeps> = {}): DialerDeps {
    const held = new Set<string>();
    return {
        db, twilio, policy, now: () => clock,
        urls: { answer: (id) => `https://crm/answer?attemptId=${id}`, status: (id) => `https://crm/status?attemptId=${id}`, amd: (id) => `https://crm/amd?attemptId=${id}`, recording: (id) => `https://crm/recording?callId=${id}` },
        callerId: async () => "+33100000000",
        candidates: async (_s, limit, exclude) => PROSPECTS.filter((p) => !exclude.has(p.contactId!)).slice(0, limit),
        lock: async (id, fn) => {
            if (held.has(id)) return null;
            held.add(id);
            try { return await fn(); } finally { held.delete(id); }
        },
        onConnected: async (a) => { connected.push(a); return `tc_${a.id}`; },
        onEnded: async (a) => { ended.push(a); },
        record: true, notice: true, brand: "Suzalink",
        ...over,
    };
}

async function openSession(id = "s1", sdrId = "sdr1") {
    await pg.query(`INSERT INTO "DialerSession" ("id","sdrId","conferenceName","maxLines","updatedAt") VALUES ($1,$2,$3,2,now())`, [id, sdrId, `conf_${id}`]);
    await onAgentLeg(deps(), id, `CA_AGENT_${id}`);
    await onConferenceJoin(deps(), id, `CA_AGENT_${id}`); // SDR in the conference → READY → first lines placed
}

const answerHuman = async (a: AttemptRow, d = deps()) => { await onStatus(d, a.id, "in-progress"); await onAmd(d, a.id, "human"); };

before(async () => {
    pg = new PGlite();
    await pg.exec(`CREATE TABLE "TelephonyCall" ("id" text PRIMARY KEY, "contactId" text, "companyId" text, "startedAt" timestamp);`);
    await pg.exec(MIGRATION);
});
after(async () => { await pg.close(); });
beforeEach(async () => {
    await pg.exec(`DELETE FROM "DialAttempt"; DELETE FROM "DialerSession"; DELETE FROM "DialerEvent";`);
    clock = new Date("2026-11-12T09:00:00.000Z");
    twilio = fakeTwilio();
    ended = [];
    connected = [];
    policy = { ...DEFAULT_DIALER_POLICY, parallelEnabled: true };
});

test("SDR joins → the conservative 2 lines ring, with machine detection and signed callbacks", async () => {
    await openSession();
    assert.equal(twilio.created.length, 2);
    assert.equal((await getSession(db, "s1"))?.agentState, "READY");
    const c = twilio.created[0];
    assert.match(c.answerUrl, /answer\?attemptId=/);
    assert.ok(c.amdCallback);
    assert.equal(c.from, "+33100000000");
    assert.deepEqual(twilio.created.map((x) => x.to), [PROSPECTS[0].toNumber, PROSPECTS[1].toNumber], "best-ranked prospects first");
});

test("two humans answer at the same time: one is bridged, the other hears who called — never two on the SDR", async () => {
    await openSession();
    const [a, b] = await liveAttempts(db, "s1");
    await Promise.all([onStatus(deps(), a.id, "in-progress"), onStatus(deps(), b.id, "in-progress")]);
    await Promise.all([onAmd(deps(), a.id, "human"), onAmd(deps(), b.id, "human")]);

    const bridges = twilio.redirects.filter((r) => r.twiml.includes("<Conference"));
    const abandons = twilio.redirects.filter((r) => r.twiml.includes("a cherché à vous joindre"));
    assert.equal(bridges.length, 1);
    assert.equal(abandons.length, 1);
    assert.match(bridges[0].twiml, /susceptible d'être enregistré/, "recording notice before the bridge");
    const s = await getSession(db, "s1");
    assert.equal(s?.agentState, "RESERVED");
    assert.equal(twilio.created.length, 2, "no new line while the SDR is reserved");
    assert.equal(ended.filter((e) => e.outcome === "ABANDONED").length, 1, "the abandoned call is counted");
});

test("bridged → conference join is the real connection → hang-up → wrap-up → ready → next lines", async () => {
    await openSession();
    const [a] = await liveAttempts(db, "s1");
    await answerHuman(a);
    const winnerSid = twilio.sids[0];
    await onConferenceJoin(deps(), "s1", winnerSid);
    assert.equal((await getSession(db, "s1"))?.agentState, "ON_CALL");
    assert.equal(connected.length, 1, "the call log row is opened only at the real connection");
    assert.deepEqual(twilio.recordings, [winnerSid]);
    assert.equal(ended.find((e) => e.contactId === "c1")?.outcome, "CANCELED_SIBLING", "the other line stopped ringing");

    advance(120);
    await onStatus(deps(), a.id, "completed");
    assert.equal(ended.find((e) => e.id === a.id)?.outcome, "CONVERSATION");
    assert.equal((await getSession(db, "s1"))?.agentState, "WRAP_UP");
    assert.equal(twilio.created.length, 2, "nothing rings while the SDR qualifies");

    assert.equal(await agentReady(deps(), "s1"), true);
    assert.equal(twilio.created.length, 4);
    assert.ok(!twilio.created.slice(2).some((c) => c.to === PROSPECTS[0].toNumber || c.to === PROSPECTS[1].toNumber), "already-rung prospects are not redialled");
});

test("a duplicated or late verdict never bridges twice", async () => {
    await openSession();
    const [a] = await liveAttempts(db, "s1");
    await answerHuman(a);
    await onAmd(deps(), a.id, "human");
    await onAmd(deps(), a.id, "machine_start");
    await onStatus(deps(), a.id, "in-progress");
    assert.equal(twilio.redirects.filter((r) => r.twiml.includes("<Conference")).length, 1);
});

test("voicemail is released and the line replaced; the SDR never hears it", async () => {
    await openSession();
    const [a] = await liveAttempts(db, "s1");
    await onStatus(deps(), a.id, "in-progress");
    await onAmd(deps(), a.id, "machine_end_beep");
    assert.equal(twilio.redirects.length, 0);
    assert.deepEqual(twilio.ended.at(-1), { sid: twilio.sids[0], answered: true });
    assert.equal(ended[0].outcome, "VOICEMAIL");
    assert.equal(twilio.created.length, 3, "a fresh line replaces it");
    assert.equal((await getSession(db, "s1"))?.agentState, "READY");
});

test("uncertain detection is bridged by default (a person may have said « allô »)", async () => {
    await openSession();
    const [a] = await liveAttempts(db, "s1");
    await onStatus(deps(), a.id, "in-progress");
    await onAmd(deps(), a.id, "unknown");
    assert.equal(twilio.redirects.filter((r) => r.twiml.includes("<Conference")).length, 1);
});

test("a provider failure on one line is recorded and does not stop the session", async () => {
    twilio = fakeTwilio();
    twilio.failNextCreate = true;
    await openSession();
    assert.equal(ended[0]?.outcome, "FAILED");
    assert.equal(twilio.created.length, 1);
    assert.equal((await getSession(db, "s1"))?.agentState, "READY");
});

test("late events after the end change nothing", async () => {
    await openSession();
    const [a] = await liveAttempts(db, "s1");
    await onStatus(deps(), a.id, "no-answer");
    const before = ended.length;
    await onStatus(deps(), a.id, "ringing");
    await onStatus(deps(), a.id, "in-progress");
    await onAmd(deps(), a.id, "human");
    assert.equal(twilio.redirects.length, 0);
    assert.equal(ended.length, before);
});

test("the SDR's browser drops out of the conference: session ends, ringing lines stop", async () => {
    await openSession();
    await onConferenceLeave(deps(), "s1", "CA_AGENT_s1");
    assert.equal((await getSession(db, "s1"))?.status, "ENDED");
    assert.equal((await liveAttempts(db, "s1")).length, 0);
    assert.equal(twilio.ended.length, 2);
    assert.ok(twilio.ended.every((e) => !e.answered), "unanswered lines are canceled, not completed");
});

test("pause stops ringing lines but leaves a live conversation alone", async () => {
    await openSession();
    const [a] = await liveAttempts(db, "s1");
    await answerHuman(a);
    await onConferenceJoin(deps(), "s1", twilio.sids[0]);
    await pauseSession(deps(), "s1");
    const live = await liveAttempts(db, "s1");
    assert.deepEqual(live.map((x) => x.state), ["CONNECTED"]);
});

test("ending a session while a person waits on an answered line plays the abandon message", async () => {
    await openSession();
    const [a] = await liveAttempts(db, "s1");
    await onStatus(deps(), a.id, "in-progress"); // answered, verdict pending
    await endSession(deps(), "s1", "sdr_stopped");
    assert.ok(twilio.redirects.some((r) => r.sid === twilio.sids[0] && r.twiml.includes("a cherché à vous joindre")));
});

test("sweeper: lost heartbeat ends the session; stuck lines time out; a missing verdict is routed as unknown", async () => {
    await openSession();
    const [a, b] = await liveAttempts(db, "s1");
    await onStatus(deps(), a.id, "in-progress");
    await onStatus(deps(), b.id, "ringing");
    advance(policy.amdTimeoutSec + 1);
    let r = await sweep(deps());
    assert.equal(r.unknownRouted, 1);
    assert.equal(twilio.redirects.filter((x) => x.twiml.includes("<Conference")).length, 1);

    advance(policy.ringTimeoutSec + 30);
    await pg.query(`UPDATE "DialerSession" SET "lastHeartbeatAt" = $1`, [new Date(clock.getTime() - 5 * 60_000).toISOString().replace("Z", "")]);
    r = await sweep(deps());
    assert.equal(r.sessionsEnded, 1);
    assert.equal((await getSession(db, "s1"))?.status, "ENDED");
});

test("outside calling hours nothing rings", async () => {
    clock = new Date("2026-11-14T10:00:00.000Z"); // Saturday
    await openSession();
    assert.equal(twilio.created.length, 0);
    const p = await pump(deps(), "s1");
    assert.match(p.reason, /plages d'appel/);
});

test("a number already ringing for another SDR is skipped, never doubled", async () => {
    await openSession("s1", "sdr1");
    await openSession("s2", "sdr2");
    const numbers = (await pg.query<{ toNumber: string }>(`SELECT "toNumber" FROM "DialAttempt" WHERE "state" <> 'ENDED'`)).rows.map((r) => r.toNumber);
    assert.equal(new Set(numbers).size, numbers.length);
    assert.equal(numbers.length, 4);
});

test("caller-id daily quota protects the number's reputation", async () => {
    policy = { ...policy, maxDailyCallsPerNumber: 10 };
    for (let i = 0; i < 10; i++) {
        await pg.query(`INSERT INTO "DialerSession" ("id","sdrId","conferenceName","maxLines","status","updatedAt") VALUES ($1,'old',$2,1,'ENDED',now()) ON CONFLICT DO NOTHING`, ["old", "conf_old"]);
        await pg.query(`INSERT INTO "DialAttempt" ("id","sessionId","sdrId","toNumber","fromNumber","state","outcome","createdAt") VALUES ($1,'old','old',$2,'+33100000000','ENDED','NO_ANSWER',$3)`, [`h${i}`, `+3399${i}`, clock.toISOString().replace("Z", "")]);
    }
    await openSession();
    assert.equal(twilio.created.length, 0);
    assert.match((await pump(deps(), "s1")).reason, /Quota quotidien/);
});

test("parallel switched off for the organisation: nothing rings", async () => {
    policy = { ...policy, parallelEnabled: false };
    await openSession();
    assert.equal(twilio.created.length, 0);
});
