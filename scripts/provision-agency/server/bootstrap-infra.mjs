// One-off, on the server: create the "agencies" Dokploy project with a private Postgres 17 and a MinIO,
// and write /root/provision/infra.env (mode 600) for scripts/provision-agency. Uses Dokploy's loopback API.
//
//   echo "PROVISION_DOKPLOY_API_KEY=<key>" > /root/provision/infra.env && chmod 600 /root/provision/infra.env
//   node bootstrap-infra.mjs <platform domain, e.g. 173-212-225-37.sslip.io>
//
// Used for the first real run on 2026-10-26 (docs/PROVISION_AGENCY.md section 9).
// Never prints a password. Safe to re-run: existing services are reused and their secrets kept.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";

const ENV_FILE = "/root/provision/infra.env";
const BASE = "http://127.0.0.1:3000/api";
const PROJECT = "agencies";
const PLATFORM = process.argv[2];
if (!PLATFORM) throw new Error("usage: node bootstrap-infra.mjs <platform domain>");
const hex = (n) => randomBytes(n).toString("hex");

function readEnv() {
    const out = {};
    if (!existsSync(ENV_FILE)) return out;
    for (const l of readFileSync(ENV_FILE, "utf8").split("\n")) {
        const i = l.indexOf("=");
        if (i > 0 && !l.startsWith("#")) out[l.slice(0, i)] = l.slice(i + 1);
    }
    return out;
}
const env = readEnv();
const KEY = env.PROVISION_DOKPLOY_API_KEY;
if (!KEY) throw new Error("PROVISION_DOKPLOY_API_KEY missing in " + ENV_FILE);

async function call(method, route, body, query) {
    const qs = query ? "?" + new URLSearchParams(query) : "";
    const res = await fetch(`${BASE}/${route}${qs}`, {
        method,
        headers: { "x-api-key": KEY, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${route} -> ${res.status}: ${text.slice(0, 400)}`);
    try { return JSON.parse(text); } catch { return text; }
}
const log = (s) => console.log(s);

async function getProject() {
    const all = await call("GET", "project.all");
    return all.find((p) => p.name === PROJECT);
}

let project = await getProject();
if (!project) {
    await call("POST", "project.create", { name: PROJECT, description: "Agency CRM instances (provision-agency)" });
    project = await getProject();
    log("project created");
} else log("project exists");
const environment = (project.environments || []).find((e) => e.isDefault) || project.environments[0];
const environmentId = environment.environmentId;
log("environment: " + environment.name);

// ---- Postgres 17, private (no external port) ----
// project.all lists databases by id only: resolve each one to match the name.
async function findPostgres() {
    project = await getProject();
    const envNow = project.environments.find((e) => e.environmentId === environmentId);
    for (const p of envNow.postgres || []) {
        const info = await call("GET", "postgres.one", undefined, { postgresId: p.postgresId });
        if (info.name === "agencies-pg") return info;
    }
    return null;
}
const pgUser = "pgadmin";
let pgInfo = await findPostgres();
if (!pgInfo) {
    const fresh = env.PG_PASSWORD_INTERNAL || hex(24);
    await call("POST", "postgres.create", {
        name: "agencies-pg", appName: "agencies-pg", databaseName: "postgres", databaseUser: pgUser,
        databasePassword: fresh, dockerImage: "postgres:17", environmentId,
        description: "Agency databases: one database and role per agency",
    });
    pgInfo = await findPostgres();
    log("postgres created");
} else log("postgres exists (its password is read back from Dokploy)");
// The service is the source of truth for its own password (a run that crashed after creating it never saved one).
const pgPassword = pgInfo.databasePassword;
const pg = { postgresId: pgInfo.postgresId };
const pgHost = pgInfo.appName;
if (!pgInfo.externalPort) log("postgres has no external port (private)"); else log("WARNING: postgres has an external port");
await call("POST", "postgres.deploy", { postgresId: pg.postgresId });
log("postgres deploy requested, service name: " + pgHost);

// ---- MinIO as an application ----
const minioUser = env.MINIO_ROOT_USER_INTERNAL || "agencies-root";
const minioPassword = env.MINIO_ROOT_PASSWORD_INTERNAL || hex(20);
let app = (environment.applications || []).find((a) => a.name === "agencies-minio");
if (!app) {
    const created = await call("POST", "application.create", { name: "agencies-minio", appName: "agencies-minio", environmentId, description: "Object storage for agency instances" });
    const id = created.applicationId || created.data?.applicationId;
    project = await getProject();
    app = (project.environments.find((e) => e.environmentId === environmentId).applications || []).find((a) => a.name === "agencies-minio") || { applicationId: id };
    log("minio application created");
    await call("POST", "application.saveDockerProvider", { applicationId: app.applicationId, dockerImage: "pgsty/minio:RELEASE.2026-06-18T00-00-00Z" /* minio/minio is no longer pullable from Docker Hub */, username: null, password: null, registryUrl: null });
    await call("POST", "application.saveEnvironment", {
        applicationId: app.applicationId,
        env: `MINIO_ROOT_USER=${minioUser}\nMINIO_ROOT_PASSWORD=${minioPassword}\n`,
        buildArgs: null, buildSecrets: null, createEnvFile: true,
    });
    await call("POST", "application.update", { applicationId: app.applicationId, command: "minio server /data --console-address :9001" /* Dokploy's command replaces the entrypoint: give the full command */ });
    await call("POST", "mounts.create", { type: "volume", volumeName: "agencies-minio-data", mountPath: "/data", serviceType: "application", serviceId: app.applicationId });
    log("minio configured (image, env, command, volume)");
} else log("minio application exists (secret kept)");
const appInfo = await call("GET", "application.one", undefined, { applicationId: app.applicationId });
await call("POST", "application.deploy", { applicationId: app.applicationId, title: "bootstrap agencies minio" });
log("minio deploy requested, service name: " + appInfo.appName);

// ---- infra file (secrets stay here) ----
const lines = {
    PROVISION_PLATFORM_DOMAIN: PLATFORM,
    PROVISION_PG_ADMIN_URL: `postgresql://${pgUser}:${pgPassword}@${pgHost}:5432/postgres`,
    PROVISION_MINIO_ENDPOINT: `http://${appInfo.appName}:9000`,
    PROVISION_MINIO_ACCESS_KEY_ID: minioUser,
    PROVISION_MINIO_SECRET_ACCESS_KEY: minioPassword,
    PROVISION_DOKPLOY_URL: "http://dokploy:3000",
    PROVISION_DOKPLOY_API_KEY: KEY,
    PROVISION_DOKPLOY_PROJECT: PROJECT,
    PROVISION_MIGRATE_MODE: "local",
    PROVISION_PROXY_DYNAMIC_DIR: "/dyn",
    PROVISION_SHARED_ENV: "shared.env",
    // kept so a re-run never rotates the passwords of running services
    PG_PASSWORD_INTERNAL: pgPassword,
    MINIO_ROOT_USER_INTERNAL: minioUser,
    MINIO_ROOT_PASSWORD_INTERNAL: minioPassword,
};
writeFileSync(ENV_FILE, Object.entries(lines).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 });
chmodSync(ENV_FILE, 0o600);
log("wrote " + ENV_FILE + " (mode 600)");
