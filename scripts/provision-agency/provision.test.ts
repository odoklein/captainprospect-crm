/**
 * provision-agency: plan (pure), orchestration over fake servers, Dokploy client:
 *     npm run test:provision-agency
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { verifyInstanceSignature } from "../../lib/instance/auth";
import { DokployClient, pickId, type FetchLike } from "./dokploy";
import {
    brandPayload, buildDatabaseUrl, buildInstanceEnv, deriveNames, generateSecrets, licensePayload,
    multipartLogo, parseEnvFile, renderProxyRoute, toEnvFile, validateAgencyConfig, type AgencyConfig,
} from "./plan";
import { provision, scrub, type Deps, type RunOptions, type State } from "./run";

const CONFIG: AgencyConfig = {
    slug: "agence-nord",
    name: "Agence Nord",
    manager: { email: "Chef@Agence-Nord.fr", name: "Chef Nord" },
    domain: "crm.agence-nord.fr",
    brand: { primaryColor: "#123456", accentColor: "#E4572E", fontPreset: "inter", appUrl: "https://evil.example" } as never,
    logos: { full: "logo.png" },
    license: { plan: "starter", seatLimit: 8, features: { callVault: false } },
};

// ---------- pure ----------

test("config validation: accepts a good one, normalises, explains every problem", () => {
    const ok = validateAgencyConfig(CONFIG);
    assert.ok(ok.ok);
    if (ok.ok) {
        assert.equal(ok.value.manager.email, "chef@agence-nord.fr");
        assert.equal(ok.value.domain, "crm.agence-nord.fr");
    }
    const bad = validateAgencyConfig({ slug: "A_b", name: "", manager: { email: "x" }, domain: "nope", logos: { banner: "x.png" } });
    assert.ok(!bad.ok);
    if (!bad.ok) assert.equal(bad.errors.length, 6);
    assert.ok(!validateAgencyConfig({ ...CONFIG, slug: "admin" }).ok, "reserved slug");
    assert.ok(!validateAgencyConfig({ ...CONFIG, slug: "a" }).ok);
    assert.ok(!validateAgencyConfig(null).ok);
});

test("names: slug becomes safe database, role, bucket, app and host names", () => {
    const n = deriveNames("agence-nord", "Crm-Agence.fr");
    assert.deepEqual(n, { slug: "agence-nord", dbName: "db_agence_nord", dbRole: "agency_agence_nord", bucket: "agence-nord", appName: "crm-agence-nord", platformHost: "agence-nord.crm-agence.fr" });
    assert.throws(() => deriveNames("agence-nord", "not a domain"), /invalid_platform_domain/);
});

test("instance env: per-agency values win over the shared file, secrets are unique per call", () => {
    const names = deriveNames("agence-nord", "crm-agence.fr");
    const s1 = generateSecrets();
    const s2 = generateSecrets();
    assert.notEqual(s1.nextauthSecret, s2.nextauthSecret);
    assert.notEqual(s1.instanceAdminSecret, s2.instanceAdminSecret);
    assert.equal(s1.minioSecret.length, 40);
    assert.ok(s1.instanceAdminSecret.length >= 16);

    const env = buildInstanceEnv({
        names, secrets: s1, primaryHost: names.platformHost,
        pg: { host: "pg.internal", port: 5432, params: "sslmode=require" },
        minio: { endpoint: "https://minio.crm-agence.fr", accessKeyId: "ak", secretAccessKey: "sk" },
        shared: { SYSTEM_SMTP_HOST: "smtp.example.com", MISTRAL_API_KEY: "m" },
    });
    assert.equal(env.DATABASE_URL, `postgresql://agency_agence_nord:${s1.dbPassword}@pg.internal:5432/db_agence_nord?sslmode=require`);
    assert.equal(env.DIRECT_URL, env.DATABASE_URL);
    assert.equal(env.NEXTAUTH_URL, "https://agence-nord.crm-agence.fr");
    assert.equal(env.INSTANCE_ID, "agence-nord");
    assert.equal(env.MINIO_BUCKET, "agence-nord");
    assert.equal(env.SYSTEM_SMTP_HOST, "smtp.example.com");
    assert.equal(buildDatabaseUrl(names, s1, { host: "h", port: 1 }).includes("?"), false);
});

test("env files round-trip, including values with spaces and quotes", () => {
    const env = { A: "plain", B: "two words", C: 'say "hi"', D: "x#y", E: "https://u:p@h/db?x=1" };
    const text = toEnvFile(env);
    assert.match(text, /^B="two words"$/m);
    assert.deepEqual(parseEnvFile("# c\nexport A=1\n\nB = \"two words\"\nC='x'\nbad line\n1X=2"), { A: "1", B: "two words", C: "x" });
    assert.throws(() => toEnvFile({ A: "a\nb" }), /env_value_has_newline/);
    assert.equal(parseEnvFile(text).A, "plain");
});

test("payloads: appUrl is always the real address, license is optional", () => {
    const brand = brandPayload(CONFIG, "agence-nord.crm-agence.fr");
    assert.equal(brand.appUrl, "https://agence-nord.crm-agence.fr");
    assert.equal(brand.name, "Agence Nord");
    assert.equal(brand.primaryColor, "#123456");
    assert.equal(brand.companyName, "Agence Nord");
    assert.deepEqual(licensePayload(CONFIG), { plan: "starter", seatLimit: 8, features: { callVault: false } });
    assert.equal(licensePayload({ ...CONFIG, license: undefined }), null);
});

test("multipart logo body has the slot, the file and a closing boundary", () => {
    const { body, contentType } = multipartLogo("full", "my logo.png", "image/png", Buffer.from([1, 2, 3]), "B");
    assert.equal(contentType, "multipart/form-data; boundary=B");
    const text = body.toString("latin1");
    assert.match(text, /name="slot"\r\n\r\nfull\r\n/);
    assert.match(text, /filename="my_logo.png"/);
    assert.ok(text.endsWith("\r\n--B--\r\n"));
});

test("scrub removes secrets from messages", () => {
    const s = generateSecrets();
    assert.equal(scrub(`boom ${s.dbPassword} and ${s.cronSecret}`, s), "boom *** and ***");
});

// ---------- orchestration over fakes ----------

type World = ReturnType<typeof makeWorld>;

function makeWorld(over: { migrateFails?: { value: boolean }; cnames?: { value: string[] }; a?: { value: Record<string, string[]> }; appUrlDown?: { value: number } } = {}) {
    const calls: string[] = [];
    const logs: string[] = [];
    const saved = new Map<string, State>();
    const dokployEnvs: string[] = [];
    const secretHolder: { value?: string } = {};
    let users = 0;
    let clock = 1_000_000;
    const instanceCalls: { method: string; path: string; body: string; sigOk: boolean }[] = [];
    const domains: string[] = [];
    const routes: string[] = [];

    const deps: Deps = {
        pg: {
            roleExists: async () => (calls.push("pg.roleExists"), calls.includes("pg.createRole")),
            databaseExists: async () => (calls.push("pg.dbExists"), calls.includes("pg.createDatabase")),
            createRole: async () => void calls.push("pg.createRole"),
            setRolePassword: async () => void calls.push("pg.setRolePassword"),
            createDatabase: async () => void calls.push("pg.createDatabase"),
        },
        storage: {
            ensureBucket: async (b) => void calls.push(`storage.ensureBucket:${b}`),
            scopedKey: async (b, ak) => void calls.push(`storage.scopedKey:${b}:${ak}`),
        },
        runDbJob: async (job, input) => {
            calls.push(`db.${job}`);
            assert.match(input.image, /-migrate:abc1234$/);
            if (job === "migrate" && over.migrateFails?.value) throw new Error(`connexion refusée ${input.databaseUrl}`);
        },
        dokploy: {
            findEnvironmentId: async () => (calls.push("dokploy.env"), "env-1"),
            findApplication: async () => null,
            createApplication: async (i) => (calls.push(`dokploy.create:${i.name}`), "app-1"),
            saveDockerProvider: async (i) => void calls.push(`dokploy.image:${i.dockerImage}`),
            saveEnvironment: async (_id, env) => void (calls.push("dokploy.env.save"), dokployEnvs.push(env)),
            createDomain: async (i) => void (calls.push(`dokploy.domain:${i.host}`), domains.push(i.host)),
            listDomains: async () => [...domains],
            deploy: async () => void calls.push("dokploy.deploy"),
        },
        instance: (baseUrl, secret) => async (method, pathWithQuery, body, headers) => {
            secretHolder.value = secret;
            const text = body == null ? "" : typeof body === "string" ? body : Buffer.from(body).toString("latin1");
            const sig = (await import("../../lib/instance/auth")).signInstanceRequest({ secret, method, pathWithQuery, body });
            const sigOk = verifyInstanceSignature({ secret, method, pathWithQuery, body, timestampHeader: sig["X-Instance-Timestamp"], signatureHeader: sig["X-Instance-Signature"] }).ok;
            instanceCalls.push({ method, path: `${baseUrl}${pathWithQuery}`, body: text, sigOk });
            void headers;
            if (pathWithQuery === "/api/instance/brand" && text.startsWith("{\"appUrl\"") && over.appUrlDown && over.appUrlDown.value > 0) {
                over.appUrlDown.value--;
                return { status: 503, json: "no available server" };
            }
            if (pathWithQuery === "/api/instance/health") return { status: 200, json: { dbOk: true, schemaVersion: "20261026100000_add_instance_license", version: "abc1234" } };
            if (pathWithQuery === "/api/instance/bootstrap") {
                if (users++ > 0) return { status: 409, json: { error: "already_bootstrapped" } };
                return { status: 201, json: { ok: true, inviteUrl: "https://agence-nord.crm-agence.fr/reset-password?token=TOKEN123&email=x" } };
            }
            return { status: 200, json: { ok: true } };
        },
        dns: { resolveCname: async () => over.cnames?.value ?? [], resolve4: async (host: string) => over.a?.value[host] ?? [] },
        proxy: { writeRoute: async (slug, content) => (routes.push(content), calls.push(`proxy.route:${slug}`), `/dyn/agency-${slug}.yml`) },
        readFile: async () => Buffer.from([137, 80, 78, 71]),
        log: (l) => void logs.push(l),
        sleep: async () => void (clock += 10_000),
        now: () => new Date(clock),
    };
    const store = {
        load: async (slug: string) => saved.get(slug) ?? null,
        save: async (s: State) => void saved.set(s.slug, JSON.parse(JSON.stringify(s))),
    };
    return { deps, store, calls, logs, saved, dokployEnvs, instanceCalls, domains, secretHolder, routes };
}

const options = (over: Partial<RunOptions> = {}): RunOptions => ({
    config: CONFIG,
    configDir: "/cfg",
    platformDomain: "crm-agence.fr",
    pg: { host: "pg.internal", port: 5432 },
    minio: { endpoint: "https://minio.crm-agence.fr", accessKeyId: "admin", secretAccessKey: "adminsecret" },
    shared: { SYSTEM_SMTP_HOST: "smtp.example.com", NEXTAUTH_SECRET: "must-be-ignored" },
    imageRepo: "ghcr.io/odoklein/captainprospect-crm",
    imageTag: "abc1234",
    dokployProject: "agencies",
    ...over,
});

const idx = (w: World, name: string) => w.calls.findIndex((c) => c.startsWith(name));

test("a full run does the steps in order, signed, without leaking secrets", async () => {
    const w = makeWorld({ cnames: { value: [] } });
    const report = await provision(options(), w.deps, w.store);

    assert.equal(report.ok, true);
    assert.deepEqual(
        report.steps.map((s) => [s.id, s.result]),
        [["database", "done"], ["storage", "done"], ["migrate", "done"], ["seed", "done"], ["app", "done"], ["route", "done"], ["deploy", "done"], ["health", "done"], ["brand", "done"], ["license", "done"], ["logos", "done"], ["custom-domain", "pending"], ["bootstrap", "done"]],
    );

    // Order: database, bucket, schema before the app exists, deploy before any instance call.
    assert.ok(idx(w, "pg.createDatabase") < idx(w, "storage.ensureBucket"));
    assert.ok(idx(w, "db.migrate") < idx(w, "db.seed") && idx(w, "db.seed") < idx(w, "dokploy.create"));
    assert.ok(idx(w, "dokploy.deploy") > idx(w, "dokploy.image"));
    assert.ok(idx(w, "proxy.route") > idx(w, "dokploy.domain") && idx(w, "proxy.route") < idx(w, "dokploy.deploy"), "the public route exists before the deploy");
    assert.match(w.routes[0], /rule: Host\(`agence-nord\.crm-agence\.fr`\)/);
    assert.ok(w.calls.includes("storage.scopedKey:agence-nord:agency-agence-n-" + w.calls.find((c) => c.startsWith("storage.scopedKey"))!.split("-").pop()));

    // The app got the agency's env: own secrets, shared SMTP, scoped MinIO key, and the shared file could not override NEXTAUTH_SECRET.
    const env = w.dokployEnvs.at(-1)!;
    assert.match(env, /^INSTANCE_ID=agence-nord$/m);
    assert.match(env, /^NEXTAUTH_URL=https:\/\/agence-nord\.crm-agence\.fr$/m);
    assert.match(env, /^SYSTEM_SMTP_HOST=smtp\.example\.com$/m);
    assert.doesNotMatch(env, /must-be-ignored/);
    assert.match(env, /^MINIO_ACCESS_KEY_ID=agency-agence-n-/m);

    // Every instance call carried a valid signature; brand and license were sent; the invite was shown once.
    assert.deepEqual(w.instanceCalls.map((c) => c.path.replace(/^.*\/api\/instance/, "")), ["/health", "/brand", "/license", "/brand/assets", "/bootstrap"]);
    assert.ok(w.instanceCalls.every((c) => c.sigOk));
    const brand = w.instanceCalls.find((c) => c.path.endsWith("/brand"))!;
    assert.equal(JSON.parse(brand.body).appUrl, "https://agence-nord.crm-agence.fr");
    assert.deepEqual(JSON.parse(w.instanceCalls.find((c) => c.path.endsWith("/license"))!.body), { plan: "starter", seatLimit: 8, features: { callVault: false } });
    assert.ok(w.instanceCalls.find((c) => c.path.endsWith("/brand/assets"))!.body.includes('name="slot"'));
    assert.ok(w.logs.some((l) => l.includes("token=TOKEN123")));

    // No log line contains a generated secret.
    const state = w.saved.get("agence-nord")!;
    for (const secret of Object.values(state.secrets)) assert.ok(!w.logs.join("\n").includes(secret), "secret leaked in logs");

    // Custom domain is pending with the exact DNS record to add.
    assert.match(report.steps.find((s) => s.id === "custom-domain")!.note!, /CNAME crm\.agence-nord\.fr -> edge\.crm-agence\.fr/);
});

test("a failed step stops the run without leaking, and the same command resumes", async () => {
    const fails = { value: true };
    const w = makeWorld({ migrateFails: fails });
    const first = await provision(options(), w.deps, w.store);
    assert.equal(first.ok, false);
    assert.deepEqual(first.steps.map((s) => s.result), ["done", "done", "failed"]);
    const failure = first.steps[2].note!;
    assert.ok(!failure.includes(w.saved.get("agence-nord")!.secrets.dbPassword), "password scrubbed from the error");
    assert.ok(failure.includes("***"));
    assert.ok(!w.calls.some((c) => c.startsWith("dokploy.create")), "nothing deployed after the failure");

    fails.value = false;
    w.calls.length = 0;
    const second = await provision(options(), w.deps, w.store);
    assert.equal(second.ok, true);
    assert.deepEqual(second.steps.slice(0, 2).map((s) => s.result), ["skipped", "skipped"]);
    assert.ok(!w.calls.includes("pg.createRole"), "database step not repeated");
    assert.ok(w.calls.includes("db.migrate"));
    // Secrets were kept across the two runs.
    assert.equal(w.saved.get("agence-nord")!.secrets.dbPassword.length, 48);
});

test("re-running with the same tag changes nothing but the health check; a new tag upgrades", async () => {
    const w = makeWorld();
    await provision(options(), w.deps, w.store);
    w.calls.length = 0;
    w.instanceCalls.length = 0;

    const again = await provision(options(), w.deps, w.store);
    assert.equal(again.ok, true);
    assert.deepEqual([...w.calls], [], "no server call except the instance health probe");
    assert.deepEqual(w.instanceCalls.map((c) => c.path.replace(/^.*\/api/, "/api")), ["/api/instance/health"]);

    w.instanceCalls.length = 0;
    const jobs: string[] = [];
    const upgrade = await provision(options({ imageTag: "def5678" }), { ...w.deps, runDbJob: async (job, i) => void jobs.push(`${job}:${i.image.split(":").pop()}`) }, w.store);
    assert.equal(upgrade.ok, true);
    assert.deepEqual(jobs, ["migrate:def5678", "seed:def5678"], "an upgrade migrates with the NEW migrate image before redeploying");
    assert.ok(w.calls.includes("dokploy.image:ghcr.io/odoklein/captainprospect-crm:def5678"));
    assert.ok(w.calls.includes("dokploy.deploy"));
    assert.equal(w.saved.get("agence-nord")!.deployedTag, "def5678");
});

test("custom domain: once the CNAME resolves the address switches and the instance is told", async () => {
    const cnames = { value: [] as string[] };
    const w = makeWorld({ cnames });
    await provision(options(), w.deps, w.store);
    assert.equal(w.saved.get("agence-nord")!.primaryHost, "agence-nord.crm-agence.fr");

    cnames.value = ["edge.crm-agence.fr."];
    w.calls.length = 0;
    w.instanceCalls.length = 0;
    const report = await provision(options(), w.deps, w.store);
    assert.equal(report.primaryHost, "crm.agence-nord.fr");
    assert.equal(report.steps.find((s) => s.id === "custom-domain")!.result, "done");
    assert.ok(w.calls.includes("dokploy.domain:crm.agence-nord.fr"));
    assert.match(w.routes.at(-1)!, /Host\(`agence-nord\.crm-agence\.fr`\) \|\| Host\(`crm\.agence-nord\.fr`\)/, "the route now serves both hosts");
    assert.match(w.dokployEnvs.at(-1)!, /^NEXTAUTH_URL=https:\/\/crm\.agence-nord\.fr$/m);
    assert.ok(w.domains.includes("agence-nord.crm-agence.fr"), "the platform address stays attached");
    const appUrlCall = w.instanceCalls.find((c) => c.method === "PUT" && c.path.endsWith("/brand"))!;
    assert.deepEqual(JSON.parse(appUrlCall.body), { appUrl: "https://crm.agence-nord.fr" });
    assert.ok(appUrlCall.path.startsWith("https://agence-nord.crm-agence.fr"), "told through the old address, which still serves");
});

test("custom domain: an A record to the edge's address counts like the CNAME, any other address does not", async () => {
    const a = { value: { "edge.crm-agence.fr": ["203.0.113.7"], "crm.agence-nord.fr": ["198.51.100.1"] } as Record<string, string[]> };
    const w = makeWorld({ a });
    let report = await provision(options(), w.deps, w.store);
    assert.equal(report.steps.find((s) => s.id === "custom-domain")!.result, "pending");

    a.value["crm.agence-nord.fr"] = ["203.0.113.7"];
    report = await provision(options(), w.deps, w.store);
    assert.equal(report.steps.find((s) => s.id === "custom-domain")!.result, "done");
    assert.equal(report.primaryHost, "crm.agence-nord.fr");
});

test("custom domain: the appUrl call waits out the restart, and a re-run sends it again", async () => {
    const cnames = { value: ["edge.crm-agence.fr"] };
    const appUrlDown = { value: 2 };
    const w = makeWorld({ cnames, appUrlDown });
    let report = await provision(options(), w.deps, w.store);
    assert.equal(report.steps.find((s) => s.id === "custom-domain")!.result, "done");
    assert.equal(w.instanceCalls.filter((c) => c.body.startsWith("{\"appUrl\"")).length, 3, "two 503 while restarting, then 200");

    appUrlDown.value = 1_000;
    const w2 = makeWorld({ cnames, appUrlDown });
    report = await provision(options(), w2.deps, w2.store);
    assert.equal(report.ok, false, "gives up after the health timeout");
    assert.equal(w2.saved.get("agence-nord")!.primaryHost, "crm.agence-nord.fr", "the switch itself was saved");

    appUrlDown.value = 0;
    w2.instanceCalls.length = 0;
    report = await provision(options(), w2.deps, w2.store);
    assert.equal(report.steps.find((s) => s.id === "custom-domain")!.result, "done");
    assert.deepEqual(JSON.parse(w2.instanceCalls.find((c) => c.body.startsWith("{\"appUrl\""))!.body), { appUrl: "https://crm.agence-nord.fr" });
});

test("--only runs just the named steps and rejects unknown ones", async () => {
    const w = makeWorld();
    await provision(options(), w.deps, w.store);
    w.calls.length = 0;
    const r = await provision(options({ only: ["brand"] }), w.deps, w.store);
    assert.deepEqual(r.steps.filter((s) => s.result !== "skipped").map((s) => s.id), ["brand"]);
    await assert.rejects(provision(options({ only: ["nope"] }), w.deps, w.store), /étape inconnue/);
});

// ---------- Dokploy client ----------

function fakeFetch(routes: Record<string, unknown>, seen: { url: string; init: any }[]): FetchLike {
    return async (url, init) => {
        seen.push({ url, init });
        const key = Object.keys(routes).find((k) => url.includes(k));
        if (!key) return { ok: false, status: 404, text: async () => "no route" };
        return { ok: true, status: 200, text: async () => JSON.stringify(routes[key]) };
    };
}

test("dokploy: finds the default environment and existing applications, sends the api key", async () => {
    const seen: { url: string; init: any }[] = [];
    const client = new DokployClient("https://dok.example.com/", "KEY", fakeFetch({
        "project.all": [{ name: "agencies", environments: [{ environmentId: "e-dev", name: "dev" }, { environmentId: "e-prod", name: "production", isDefault: true, applications: [{ applicationId: "a1", name: "crm-agence-nord", appName: "crm-agence-nord-x1y2" }] }] }],
    }, seen));
    assert.equal(await client.findEnvironmentId("agencies"), "e-prod");
    assert.equal(await client.findApplication("agencies", "crm-agence-nord"), "a1");
    assert.equal(await client.findApplication("agencies", "crm-other"), null);
    assert.equal(seen[0].url, "https://dok.example.com/api/project.all");
    assert.equal(seen[0].init.headers["x-api-key"], "KEY");
});

test("dokploy: ids are found whether bare or nested; errors carry route and body", async () => {
    assert.equal(pickId({ applicationId: "a" }, "applicationId"), "a");
    assert.equal(pickId({ result: { data: { json: { applicationId: "b" } } } }, "applicationId"), "b");
    assert.equal(pickId({ nothing: 1 }, "applicationId"), null);

    const seen: { url: string; init: any }[] = [];
    const client = new DokployClient("https://dok.example.com", "KEY", fakeFetch({ "application.create": { application: { applicationId: "c" } } }, seen));
    assert.equal(await client.createApplication({ name: "crm-x", environmentId: "e" }), "c");
    assert.deepEqual(JSON.parse(seen[0].init.body), { name: "crm-x", environmentId: "e" });
    await assert.rejects(client.deploy("a", "t"), /dokploy application\.deploy -> 404: no route/);
});


test("without a proxy configured the route step is pending and prints the file", async () => {
    const w = makeWorld();
    const r = await provision(options({ only: ["app", "route"] }), { ...w.deps, proxy: undefined }, w.store);
    const route = r.steps.find((x) => x.id === "route")!;
    assert.equal(route.result, "pending");
    assert.match(route.note!, /PROVISION_PROXY_DYNAMIC_DIR[\s\S]*agency-agence-nord-http/);
});
