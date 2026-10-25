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
