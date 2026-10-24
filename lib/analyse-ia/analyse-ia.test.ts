import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlyAiError } from "./errors";
import { defaultWeekOffset, parisWeekBounds } from "./week";
import { classifyOpenAiFailure } from "../ai/json-call";

test("production failure messages map to an actionable French title", () => {
    const quota = friendlyAiError(
        "OpenAI API error: You have no credits remaining. Add credits to continue using the API at https://platform.openai.com",
    );
    assert.equal(quota.code, "QUOTA");
    assert.equal(quota.title, "Crédits OpenAI épuisés");

    assert.equal(friendlyAiError("Impossible de parser la réponse JSON de Mistral").code, "UNPARSABLE");
    assert.equal(friendlyAiError("TIMEOUT: analyse interrompue").code, "TIMEOUT");
    assert.equal(friendlyAiError("AUTH: OpenAI API error: Incorrect API key provided").title, "Clé OpenAI invalide ou absente");
    assert.equal(friendlyAiError("QUOTA: OpenAI API error: x").raw, "OpenAI API error: x");
    assert.equal(friendlyAiError("Something odd").code, "UNKNOWN");
    assert.equal(friendlyAiError(null).code, "UNKNOWN");
});

test("OpenAI HTTP failures are classified", () => {
    assert.equal(classifyOpenAiFailure(429, "insufficient_quota", "You exceeded your current quota"), "QUOTA");
    assert.equal(classifyOpenAiFailure(429, undefined, "Rate limit reached"), "RATE_LIMIT");
    assert.equal(classifyOpenAiFailure(401, "invalid_api_key", "Incorrect API key"), "AUTH");
    assert.equal(classifyOpenAiFailure(500, undefined, "boom"), "UNKNOWN");
});

test("week bounds are Paris Monday → Sunday, across the DST switch", () => {
    // Sunday 25 Oct 2026 23:30 Paris is still that Sunday
    assert.deepEqual(parisWeekBounds(0, new Date("2026-10-25T22:30:00Z")), { start: "2026-10-19", end: "2026-10-25" });
    // 23:30 UTC on Sunday 25 Oct is Monday 26 Oct 00:30 in Paris (winter time)
    assert.deepEqual(parisWeekBounds(0, new Date("2026-10-25T23:30:00Z")), { start: "2026-10-26", end: "2026-11-01" });
    assert.deepEqual(parisWeekBounds(-1, new Date("2026-10-28T10:00:00Z")), { start: "2026-10-19", end: "2026-10-25" });
});

test("Monday and Tuesday default to the previous week, otherwise this week", () => {
    assert.equal(defaultWeekOffset(new Date("2026-10-26T09:00:00Z")), -1); // Monday
    assert.equal(defaultWeekOffset(new Date("2026-10-27T09:00:00Z")), -1); // Tuesday
    assert.equal(defaultWeekOffset(new Date("2026-10-28T09:00:00Z")), 0); // Wednesday
    assert.equal(defaultWeekOffset(new Date("2026-11-01T09:00:00Z")), 0); // Sunday
});
