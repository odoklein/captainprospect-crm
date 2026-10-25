// ============================================
// provision-agency — create (or resume, or upgrade) one agency instance end to end.
//
//   npm run provision-agency -- agency.json --infra provision.infra.env --tag a1b2c3d
//   npm run provision-agency -- agency.json --infra provision.infra.env --tag a1b2c3d --dry-run
//   npm run provision-agency -- agency.json --infra provision.infra.env --tag a1b2c3d --only health,brand
//
// Runbook: docs/PROVISION_AGENCY.md. Same command again = resume (done steps are skipped)
// or upgrade (a new --tag re-points the app and redeploys).
// ============================================

import { readFile } from "node:fs/promises";
import path from "node:path";
import { DokployClient } from "./dokploy";
import { buildInstanceEnv, deriveNames, generateSecrets, parseEnvFile, validateAgencyConfig, PROTECTED_KEYS } from "./plan";
import { fileStore, realDbJob, realDeps, realPg, realProxy, realStorage } from "./real";
import { provision, STEP_IDS } from "./run";

function usage(): never {
    console.error(`Usage: npm run provision-agency -- <agency.json> --infra <infra.env> --tag <image tag> [--only step,step] [--dry-run]
Steps: ${STEP_IDS.join(", ")}`);
    process.exit(2);
}

function args() {
    const argv = process.argv.slice(2);
    const flag = (name: string) => {
        const i = argv.indexOf(`--${name}`);
        return i >= 0 ? (argv[i + 1] ?? "") : undefined;
    };
    const file = argv.find((a, i) => !a.startsWith("--") && !(argv[i - 1] ?? "").startsWith("--"));
    return { file, infra: flag("infra"), tag: flag("tag"), only: flag("only")?.split(",").map((s) => s.trim()).filter(Boolean), dryRun: argv.includes("--dry-run") };
}

function need(env: Record<string, string>, key: string): string {
    const v = env[key]?.trim();
    if (!v) {
        console.error(`Variable manquante dans le fichier infra: ${key}`);
        process.exit(2);
    }
    return v;
}

const mask = (v: string) => (v.length <= 6 ? "***" : `${v.slice(0, 3)}…(${v.length})`);

async function main() {
    const a = args();
    if (!a.file || !a.infra || !a.tag) usage();

    const parsed = validateAgencyConfig(JSON.parse(await readFile(a.file, "utf8")));
    if (!parsed.ok) {
        console.error("agency.json invalide:\n - " + parsed.errors.join("\n - "));
        process.exit(2);
    }
    const infra = { ...parseEnvFile(await readFile(a.infra, "utf8")) };
    const platformDomain = need(infra, "PROVISION_PLATFORM_DOMAIN");
    const adminUrl = new URL(need(infra, "PROVISION_PG_ADMIN_URL"));
    const pg = { host: infra.PROVISION_PG_APP_HOST || adminUrl.hostname, port: Number(infra.PROVISION_PG_APP_PORT || adminUrl.port || 5432), params: infra.PROVISION_PG_PARAMS };
    const minio = {
        endpoint: need(infra, "PROVISION_MINIO_ENDPOINT"),
        accessKeyId: need(infra, "PROVISION_MINIO_ACCESS_KEY_ID"),
        secretAccessKey: need(infra, "PROVISION_MINIO_SECRET_ACCESS_KEY"),
        region: infra.PROVISION_MINIO_REGION,
    };
    const configDir = path.dirname(path.resolve(a.file));
    const shared = infra.PROVISION_SHARED_ENV ? parseEnvFile(await readFile(path.resolve(path.dirname(a.infra), infra.PROVISION_SHARED_ENV), "utf8")) : {};

    const options = {
        config: parsed.value,
        configDir,
        platformDomain,
        pg,
        minio,
        shared,
        imageRepo: infra.PROVISION_IMAGE_REPO || "ghcr.io/odoklein/captainprospect-crm",
        imageTag: a.tag,
        dokployProject: infra.PROVISION_DOKPLOY_PROJECT || "agencies",
        dokployEnvironmentId: infra.PROVISION_DOKPLOY_ENVIRONMENT_ID || undefined,
        registry: infra.PROVISION_REGISTRY_USER ? { username: infra.PROVISION_REGISTRY_USER, password: need(infra, "PROVISION_REGISTRY_TOKEN"), url: "ghcr.io" } : undefined,
        only: a.only,
    };

    if (a.dryRun) {
        const names = deriveNames(options.config.slug, platformDomain);
        const env = buildInstanceEnv({ names, secrets: generateSecrets(), primaryHost: names.platformHost, pg, minio, shared: Object.fromEntries(Object.entries(shared).filter(([k]) => !(PROTECTED_KEYS as readonly string[]).includes(k))) });
        console.log("DRY RUN: rien n'est créé.\n");
        console.log(`Agence        ${options.config.name} (${names.slug})`);
        console.log(`Adresse       https://${names.platformHost}${options.config.domain ? `   puis https://${options.config.domain} (CNAME vers edge.${platformDomain})` : ""}`);
        console.log(`Base          ${names.dbName} (rôle ${names.dbRole}) sur ${pg.host}:${pg.port}`);
        console.log(`Bucket        ${names.bucket}${infra.PROVISION_MINIO_MC_ALIAS ? " + clé limitée à ce bucket (mc)" : "  (clé administrateur MinIO partagée: PROVISION_MINIO_MC_ALIAS absent)"}`);
        console.log(`Application   ${names.appName} dans le projet Dokploy « ${options.dokployProject} »`);
        console.log(`Images        ${options.imageRepo}:${options.imageTag} et ${options.imageRepo}-migrate:${options.imageTag}`);
        console.log(`Migrations    ${infra.PROVISION_MIGRATE_MODE || "docker"}${infra.PROVISION_DOCKER_NETWORK ? ` (réseau ${infra.PROVISION_DOCKER_NETWORK})` : ""}`);
        console.log(`Proxy public  ${infra.PROVISION_PROXY_DYNAMIC_DIR ? `fichier agency-${names.slug}.yml dans ${infra.PROVISION_PROXY_DYNAMIC_DIR}` : "NON CONFIGURÉ (PROVISION_PROXY_DYNAMIC_DIR): la route sera à placer à la main"}`);
        console.log(`Manager       ${options.config.manager.name} <${options.config.manager.email}>`);
        console.log(`\nVariables de l'application (${Object.keys(env).length}):`);
        for (const [k, v] of Object.entries(env).sort(([x], [y]) => x.localeCompare(y))) console.log(`  ${k}=${/URL|HOST|ID|DOMAIN|NODE_ENV|PORT|BUCKET|REGION|FROM|NAME/.test(k) && !/SECRET|PASSWORD|KEY|TOKEN/.test(k) ? v.replace(/:\/\/([^:]+):[^@]+@/, "://$1:***@") : mask(v)}`);
        console.log(`\nÉtapes: ${STEP_IDS.join(" > ")}`);
        return;
    }

    const mode = infra.PROVISION_MIGRATE_MODE === "local" ? "local" : "docker";
    const deps = realDeps({
        pg: realPg(need(infra, "PROVISION_PG_ADMIN_URL")),
        storage: realStorage(minio, infra.PROVISION_MINIO_MC_ALIAS || undefined),
        dokploy: new DokployClient(need(infra, "PROVISION_DOKPLOY_URL"), need(infra, "PROVISION_DOKPLOY_API_KEY")),
        dbJob: realDbJob(mode, process.cwd(), infra.PROVISION_DOCKER_NETWORK || undefined),
        proxy: infra.PROVISION_PROXY_DYNAMIC_DIR ? realProxy(infra.PROVISION_PROXY_DYNAMIC_DIR) : undefined,
    });
    const report = await provision(options, deps, fileStore(path.resolve("provision-out")));

    console.log("\n" + "=".repeat(60));
    for (const s of report.steps) console.log(`${s.result === "done" ? "OK     " : s.result === "skipped" ? "déjà   " : s.result === "pending" ? "ATTENTE" : "ÉCHEC  "} ${s.label}${s.note ? ` — ${s.note}` : ""}`);
    console.log(`\nAdresse: https://${report.primaryHost}\nÉtat et secrets: provision-out/${report.slug}.json (ne pas committer, à stocker dans un coffre)`);
    process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
