import { test } from "node:test";
import assert from "node:assert/strict";
import { mapExtension, mapSipLogin } from "./api";
import { parseWssUrl } from "./config";
import { wantsAutoAnswer } from "@/components/telephony/kavkom-phone";

test("SIP login: exact extension only, domain from user_context", () => {
    const row = { extension: "1001", password: "s3cr3t", user_context: "acme.kavkom.com", extension_uuid: "u1" };
    assert.deepEqual(mapSipLogin(row, "1001"), { extension: "1001", password: "s3cr3t", domain: "acme.kavkom.com" });
    assert.equal(mapSipLogin({ ...row, extension: "10011" }, "1001"), null, "search_query is a substring match");
    assert.equal(mapSipLogin({ ...row, password: "" }, "1001"), null);
    assert.equal(mapSipLogin({ ...row, user_context: "default" }, "1001")?.domain, null);
});

test("the manager's extension listing never carries the password", () => {
    const x = mapExtension({ extension: "1001", extension_uuid: "u1", password: "s3cr3t" });
    assert.ok(x);
    assert.equal(JSON.stringify(x).includes("s3cr3t"), false);
});

test("WebRTC address: wss only", () => {
    assert.equal(parseWssUrl("wss://acme.kavkom.com:7443/"), "wss://acme.kavkom.com:7443");
    assert.equal(parseWssUrl(" wss://x.example/ws "), "wss://x.example/ws");
    assert.equal(parseWssUrl("ws://insecure:5066"), null);
    assert.equal(parseWssUrl("https://acme.kavkom.com"), null);
    assert.equal(parseWssUrl(""), null);
});

test("auto-answer: the headers FreeSWITCH puts on a click-to-call leg", () => {
    const h = (o: Record<string, string>) => (n: string) => o[n];
    assert.equal(wantsAutoAnswer(h({ "Call-Info": "<sip:pbx>;answer-after=0" })), true);
    assert.equal(wantsAutoAnswer(h({ "Alert-Info": "info=alert-autoanswer" })), true);
    assert.equal(wantsAutoAnswer(h({ "Alert-Info": "<http://x>;info=intercom" })), true);
    assert.equal(wantsAutoAnswer(h({})), false);
});
