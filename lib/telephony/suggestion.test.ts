/**
 * Post-call suggestion and call-AI model choice, no database:
 *     npm run test:telephony
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestCallResult, type SuggestableStatus, type SuggestionInput } from "./suggestion";
import { chooseCallModel } from "../ai/call-model";
import { localDateTime } from "./summary";

const S = (code: string, extra: Partial<SuggestableStatus> = {}): SuggestableStatus => ({
    code, label: code, color: null, requiresNote: false, triggersCallback: false, ...extra,
});
const STATUSES = [S("NO_RESPONSE"), S("CALLBACK_REQUESTED", { triggersCallback: true }), S("MEETING_BOOKED"), S("REFUS", { requiresNote: true })];
const t0 = new Date("2026-11-07T10:00:00Z");
const at = (sec: number) => new Date(t0.getTime() + sec * 1000);
const base: SuggestionInput = {
    status: "NO_ANSWER", answeredAt: null, startedAt: t0, endedAt: at(28), actionId: null, campaignId: "camp", summary: { status: "none" }, statuses: STATUSES,
};
const done = (suggestedStatus: string | null, callbackAt: string | null = null): SuggestionInput["summary"] => ({
    status: "done", at: null,
    data: { summary: "Le gérant veut être rappelé jeudi.", keyPoints: [], objections: [], nextSteps: [], suggestedStatus, callbackAt,
        qualification: { need: null, currentSolution: null, timing: null, decisionMaker: null, budget: null } },
});

test("no answer → « pas de réponse » at once, from Twilio, with the ring time", () => {
    const r = suggestCallResult(base);
    assert.equal(r.state, "ready");
    if (r.state !== "ready") return;
    assert.equal(r.status.code, "NO_RESPONSE");
    assert.equal(r.source, "twilio");
    assert.match(r.note, /28 s/);
    assert.equal(r.confirmable, true);
});

test("busy → pas de réponse, « ligne occupée »", () => {
    const r = suggestCallResult({ ...base, status: "BUSY" });
    assert.ok(r.state === "ready" && r.note === "Ligne occupée.");
});

test("hung up before it really rang → nothing to propose; after 15 s → pas de réponse", () => {
    assert.equal(suggestCallResult({ ...base, status: "CANCELED", endedAt: at(4) }).state, "none");
    assert.equal(suggestCallResult({ ...base, status: "CANCELED", endedAt: at(22) }).state, "ready");
});

test("failed call, no campaign, mission without NO_RESPONSE → nothing", () => {
    assert.equal(suggestCallResult({ ...base, status: "FAILED" }).state, "none");
    assert.equal(suggestCallResult({ ...base, campaignId: null }).state, "none");
    assert.equal(suggestCallResult({ ...base, statuses: [S("REFUS")] }).state, "none");
});

test("already qualified → saved; still live → waiting", () => {
    assert.equal(suggestCallResult({ ...base, actionId: "a1" }).state, "saved");
    assert.equal(suggestCallResult({ ...base, status: "IN_PROGRESS", endedAt: null }).state, "waiting");
});

test("answered: waits for the AI, then its status and summary; callback time only for a callback status", () => {
    const answered = { ...base, status: "COMPLETED" as const, answeredAt: at(5), endedAt: at(140) };
    assert.equal(suggestCallResult(answered).state, "waiting");
    assert.equal(suggestCallResult({ ...answered, summary: { status: "pending" } }).state, "waiting");

    const cb = suggestCallResult({ ...answered, summary: done("CALLBACK_REQUESTED", "2026-11-12T14:00") });
    assert.ok(cb.state === "ready" && cb.source === "ai" && cb.callbackAt === "2026-11-12T14:00" && cb.note.startsWith("Le gérant"));

    const refus = suggestCallResult({ ...answered, summary: done("REFUS", "2026-11-12T14:00") });
    assert.ok(refus.state === "ready" && refus.callbackAt === null);
});

test("answered: a meeting is proposed but never confirmed from the card; unknown or missing status → nothing", () => {
    const answered = { ...base, status: "COMPLETED" as const, answeredAt: at(5) };
    const rdv = suggestCallResult({ ...answered, summary: done("MEETING_BOOKED") });
    assert.ok(rdv.state === "ready" && rdv.confirmable === false);
    assert.equal(suggestCallResult({ ...answered, summary: done("NOT_A_STATUS") }).state, "none");
    assert.equal(suggestCallResult({ ...answered, summary: done(null) }).state, "none");
    assert.equal(suggestCallResult({ ...answered, summary: { status: "skipped", reason: "trop court" } }).state, "none");
});

test("callbackAt from the model: only a well-formed date-time survives", () => {
    assert.equal(localDateTime("2026-11-12T14:00"), "2026-11-12T14:00");
    assert.equal(localDateTime("2026-11-12 09:30:00"), "2026-11-12T09:30");
    assert.equal(localDateTime("jeudi 14h"), null);
    assert.equal(localDateTime("2026-13-40T25:00"), null);
    assert.equal(localDateTime(null), null);
});

test("call model: OpenAI by default; DeepSeek when set, with OpenAI as relay", () => {
    const def = chooseCallModel({ setting: "", openaiKey: true, deepseekKey: false, env: {} });
    assert.equal(def.model, "gpt-4o");
    assert.equal(def.fallback, null);

    const eu = chooseCallModel({ setting: "deepseek-chat", openaiKey: true, deepseekKey: true, env: { DEEPSEEK_RESIDENCY: "eu" } });
    assert.equal(eu.model, "deepseek-chat");
    assert.equal(eu.fallback, "gpt-4o");
    assert.equal(eu.reason, null);
});

test("call model: DeepSeek's China-hosted API is refused for call data → OpenAI directly, with the reason", () => {
    const cn = chooseCallModel({ setting: "deepseek-chat", openaiKey: true, deepseekKey: true, env: {} });
    assert.equal(cn.model, "gpt-4o");
    assert.match(cn.reason ?? "", /Chine/);

    const allowed = chooseCallModel({ setting: "deepseek-chat", openaiKey: true, deepseekKey: true, env: { AI_ALLOW_CN_RAW_CRM: "true" } });
    assert.equal(allowed.model, "deepseek-chat");

    const noKey = chooseCallModel({ setting: "deepseek-chat", openaiKey: true, deepseekKey: false, env: { DEEPSEEK_RESIDENCY: "eu" } });
    assert.equal(noKey.model, "gpt-4o");
    assert.match(noKey.reason ?? "", /DEEPSEEK_API_KEY/);

    const alone = chooseCallModel({ setting: "deepseek-chat", openaiKey: false, deepseekKey: true, env: { DEEPSEEK_RESIDENCY: "eu" } });
    assert.equal(alone.model, "deepseek-chat");
    assert.equal(alone.fallback, null, "no OpenAI key: no relay");
});

test("caller id: only the number assigned to the user, never a shared default", async () => {
    const { callerIdFor } = await import("./config");
    const config = { defaultCallerId: "+33423490783" } as Parameters<typeof callerIdFor>[0];
    assert.equal(callerIdFor(config, "06 12 34 56 78"), "+33612345678");
    assert.equal(callerIdFor(config, null), null, "no number → Allo, not the default");
    assert.equal(callerIdFor(config, ""), null);
});
