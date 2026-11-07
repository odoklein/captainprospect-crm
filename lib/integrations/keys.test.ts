/**
 * Changeable integration keys: precedence, value checks, and the Console's copy of the catalog.
 *     npm run test:integration-keys
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { INTEGRATION_KEY_NAMES, checkIntegrationValue, keyHint } from "./catalog";
import { integrationKey, integrationKeySource, registerIntegrationRefresher, replaceIntegrationSnapshot } from "./keys";

test("stored value wins over the container env, env is the fallback, nothing means off", () => {
    process.env.SERPER_API_KEY = "env-serper";
    delete process.env.ALLO_API_KEY;
    replaceIntegrationSnapshot(new Map([["OPENAI_API_KEY", "sk-stored"]]));
    process.env.OPENAI_API_KEY = "sk-env";

    assert.equal(integrationKey("OPENAI_API_KEY"), "sk-stored");
    assert.equal(integrationKeySource("OPENAI_API_KEY"), "stored");
    assert.equal(integrationKey("SERPER_API_KEY"), "env-serper");
    assert.equal(integrationKeySource("SERPER_API_KEY"), "env");
    assert.equal(integrationKey("ALLO_API_KEY"), undefined);
    assert.equal(integrationKeySource("ALLO_API_KEY"), "none");

    process.env.SERPER_API_KEY = "   ";
    assert.equal(integrationKey("SERPER_API_KEY"), undefined, "a blank env value is no key");
});

test("a stale snapshot refreshes in the background, a fresh one does not", async () => {
    let calls = 0;
    registerIntegrationRefresher(async () => {
        calls++;
        await Promise.resolve(); // the real one reads the database first
        replaceIntegrationSnapshot(new Map([["GEMINI_API_KEY", "AIza-new"]]));
    });
    replaceIntegrationSnapshot(new Map());
    integrationKey("GEMINI_API_KEY");
    assert.equal(calls, 0, "fresh: no reload");

    const realNow = Date.now;
    Date.now = () => realNow() + 31_000;
    try {
        assert.equal(integrationKey("GEMINI_API_KEY"), undefined, "the read never waits");
        await new Promise((r) => setImmediate(r));
        assert.equal(calls, 1);
    } finally {
        Date.now = realNow;
    }
    assert.equal(integrationKey("GEMINI_API_KEY"), "AIza-new");
});

test("pasted values are cleaned or refused", () => {
    assert.deepEqual(checkIntegrationValue("OPENAI_API_KEY", "  sk-abc  "), { ok: true, value: "sk-abc" });
    assert.deepEqual(checkIntegrationValue("OPENAI_API_KEY", 'OPENAI_API_KEY="sk-abc"'), { ok: true, value: "sk-abc" });
    assert.equal(checkIntegrationValue("OPENAI_API_KEY", "sk abc").ok, false);
    assert.equal(checkIntegrationValue("OPENAI_API_KEY", "").ok, false);
    assert.equal(checkIntegrationValue("OPENAI_API_KEY", "x".repeat(513)).ok, false);
    assert.equal(keyHint("sk-0123456789abcdefWXYZ"), "••••WXYZ");
    assert.equal(keyHint("short"), "••••", "short secrets show nothing");
});

test("the Console withholds exactly the keys this catalog lets an agency own", (t) => {
    const file = path.join(process.cwd(), "console", "src", "integration-keys.ts");
    if (!existsSync(file)) return t.skip("console/ checkout absent");
    const block = /INTEGRATION_KEY_NAMES = \[([\s\S]*?)\]/.exec(readFileSync(file, "utf8"))![1];
    const consoleNames = [...block.matchAll(/'([A-Z0-9_]+)'/g)].map((m) => m[1]).sort();
    assert.deepEqual(consoleNames, [...INTEGRATION_KEY_NAMES].sort());
});
