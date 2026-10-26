/**
 * provision-agency: the public proxy route. Part of `npm run test:provision-agency`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { renderProxyRoute } from "./plan";

test("proxy route: both routers, https via the resolver, upstream is Dokploy's Traefik", () => {
    const y = renderProxyRoute("demo", ["demo.173-212-225-37.sslip.io"]);
    assert.match(y, /agency-demo-http:\n {6}entryPoints:\n {8}- http\n {6}rule: Host\(`demo\.173-212-225-37\.sslip\.io`\)/);
    assert.match(y, /agency-demo-https:\n {6}entryPoints:\n {8}- https\n {6}rule: Host\(`demo\.173-212-225-37\.sslip\.io`\)\n {6}service: agency-demo-dokploy\n {6}tls:\n {8}certResolver: letsencrypt/);
    assert.match(y, /- url: http:\/\/dokploy-traefik:80/);
    assert.match(y, /redirectScheme:\n {8}scheme: https/);
});

test("proxy route: hosts are de-duplicated and validated (no rule injection)", () => {
    const y = renderProxyRoute("x", ["a.example.com", "a.example.com", "b.example.com"]);
    assert.equal(y.match(/rule: Host\(`a\.example\.com`\) \|\| Host\(`b\.example\.com`\)/g)?.length, 2, "one rule per router, two distinct hosts");
    assert.throws(() => renderProxyRoute("x", []), /invalid_proxy_hosts/);
    assert.throws(() => renderProxyRoute("x", ["a.example.com`) || Host(`evil.com"]), /invalid_proxy_hosts/);
});

test("dokploy domains are plain http: TLS ends at the public proxy (an https domain loops on 308)", async () => {
    const { DokployClient } = await import("./dokploy");
    const sent: { url: string; body: string }[] = [];
    const client = new DokployClient("https://dok.example.com", "KEY", async (url, init) => {
        sent.push({ url, body: String(init?.body) });
        return { ok: true, status: 200, text: async () => "{}" };
    });
    await client.createDomain({ applicationId: "a1", host: "demo.example.com", port: 5000 });
    assert.match(sent[0].url, /\/api\/domain\.create$/);
    assert.deepEqual(JSON.parse(sent[0].body), { host: "demo.example.com", port: 5000, https: false, certificateType: "none", applicationId: "a1", domainType: "application" });
});
