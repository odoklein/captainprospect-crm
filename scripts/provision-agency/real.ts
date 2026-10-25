// ============================================
// PROVISION AGENCY (real servers) — Postgres admin, MinIO, Docker, the signed
// instance API, DNS, and the state files. Imported only by the CLI; the tests
// use fakes.
// ============================================

import { spawn } from "node:child_process";
import { promises as dns } from "node:dns";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { signInstanceRequest } from "../../lib/instance/auth";
import { ensureBucket } from "../../lib/storage/minio";
import type { Deps, State } from "./run";
import type { DokployClient } from "./dokploy";

const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
const SAFE_PASSWORD = /^[A-Za-z0-9_-]{16,128}$/;

function ident(name: string): string {
    if (!IDENT.test(name)) throw new Error(`unsafe_identifier:${name}`);
    return `"${name}"`;
}

export function realPg(adminUrl: string): Deps["pg"] {
    // Prisma only as a connection: CREATE ROLE / DATABASE run as plain statements.
    const db = new PrismaClient({ datasourceUrl: adminUrl });
    const exists = async (sql: string, name: string) => ((await db.$queryRawUnsafe<unknown[]>(sql, name)) as unknown[]).length > 0;
    const literal = (pw: string) => {
        if (!SAFE_PASSWORD.test(pw)) throw new Error("unsafe_password");
        return `'${pw}'`;
    };
    return {
        roleExists: (r) => exists("SELECT 1 FROM pg_roles WHERE rolname = $1", r),
        databaseExists: (n) => exists("SELECT 1 FROM pg_database WHERE datname = $1", n),
        async createRole(role, password) {
            await db.$executeRawUnsafe(`CREATE ROLE ${ident(role)} LOGIN PASSWORD ${literal(password)}`);
        },
        async setRolePassword(role, password) {
            await db.$executeRawUnsafe(`ALTER ROLE ${ident(role)} PASSWORD ${literal(password)}`);
        },
        async createDatabase(dbName, owner) {
            await db.$executeRawUnsafe(`CREATE DATABASE ${ident(dbName)} OWNER ${ident(owner)}`);
        },
    };
}

function run(cmd: string, args: string[], opts: { env?: Record<string, string>; cwd?: string } = {}): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: "inherit", env: { ...process.env, ...opts.env }, cwd: opts.cwd, shell: process.platform === "win32" });
        child.on("error", reject);
        child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args[0] ?? ""} a échoué (code ${code})`))));
    });
}

export function realStorage(minio: { endpoint: string; accessKeyId: string; secretAccessKey: string; region?: string }, mcAlias?: string): Deps["storage"] {
    const storage: Deps["storage"] = {
        async ensureBucket(bucket) {
            await ensureBucket(bucket, minio);
        },
    };
    if (mcAlias) {
        // Needs the MinIO client (`mc`) with this alias configured as an admin.
        storage.scopedKey = async (bucket, accessKeyId, secretAccessKey) => {
            const policy = `agency-${bucket}`;
            const doc = JSON.stringify({
                Version: "2012-10-17",
                Statement: [{ Effect: "Allow", Action: ["s3:*"], Resource: [`arn:aws:s3:::${bucket}`, `arn:aws:s3:::${bucket}/*`] }],
            });
            const file = path.join(process.cwd(), "provision-out", `${policy}.policy.json`);
            await mkdir(path.dirname(file), { recursive: true });
            await writeFile(file, doc);
            // `user add` on an existing user resets its secret, and `policy create` overwrites: both are safe to repeat.
            await run("mc", ["admin", "user", "add", mcAlias, accessKeyId, secretAccessKey]);
            await run("mc", ["admin", "policy", "create", mcAlias, policy, file]);
            await run("mc", ["admin", "policy", "attach", mcAlias, policy, "--user", accessKeyId]).catch(() => undefined); // already attached
        };
    }
    return storage;
}

export function realDbJob(mode: "docker" | "local", repoRoot: string, dockerNetwork?: string): Deps["runDbJob"] {
    return async (job, input) => {
        const env = { DATABASE_URL: input.databaseUrl, DIRECT_URL: input.directUrl };
        if (mode === "docker") {
            // dockerNetwork: the Postgres service is only on Dokploy's overlay network (no public port).
            const args = ["run", "--rm", ...(dockerNetwork ? ["--network", dockerNetwork] : []), "-e", "DATABASE_URL", "-e", "DIRECT_URL", input.image];
            if (job === "seed") args.push("npm", "run", "db:seed:instance");
            await run("docker", args, { env });
        } else if (job === "migrate") {
            await run("npx", ["prisma", "migrate", "deploy"], { env, cwd: repoRoot });
        } else {
            await run("npm", ["run", "db:seed:instance"], { env, cwd: repoRoot });
        }
    };
}

export function realInstance(): Deps["instance"] {
    return (baseUrl, secret) => async (method, pathWithQuery, body, headers = {}) => {
        const sig = signInstanceRequest({ secret, method, pathWithQuery, body });
        const res = await fetch(baseUrl.replace(/\/+$/, "") + pathWithQuery, {
            method,
            body: body as BodyInit | undefined,
            headers: { ...headers, ...sig },
            signal: AbortSignal.timeout(30_000),
        });
        const text = await res.text();
        let json: unknown = text;
        try {
            json = JSON.parse(text);
        } catch {
            /* not JSON */
        }
        return { status: res.status, json };
    };
}

/** Writes agency-<slug>.yml into the public proxy's watched dynamic directory (Traefik reloads it on its own). */
export function realProxy(dir: string): NonNullable<Deps["proxy"]> {
    return {
        async writeRoute(slug, content) {
            await mkdir(dir, { recursive: true });
            const file = path.join(dir, `agency-${slug}.yml`);
            await writeFile(file, content, { mode: 0o644 });
            return file;
        },
    };
}

export function realDns(): Deps["dns"] {
    return { resolveCname: (host) => dns.resolveCname(host) };
}

export function fileStore(dir: string) {
    const file = (slug: string) => path.join(dir, `${slug}.json`);
    return {
        async load(slug: string): Promise<State | null> {
            try {
                return JSON.parse(await readFile(file(slug), "utf8")) as State;
            } catch {
                return null;
            }
        },
        async save(state: State): Promise<void> {
            await mkdir(dir, { recursive: true });
            await writeFile(file(state.slug), JSON.stringify(state, null, 2), { mode: 0o600 });
            await chmod(file(state.slug), 0o600).catch(() => undefined); // no-op on Windows
        },
    };
}

export function realDeps(parts: { pg: Deps["pg"]; storage: Deps["storage"]; dokploy: DokployClient; dbJob: Deps["runDbJob"]; proxy?: Deps["proxy"] }): Deps {
    return {
        proxy: parts.proxy,
        pg: parts.pg,
        storage: parts.storage,
        runDbJob: parts.dbJob,
        dokploy: parts.dokploy,
        instance: realInstance(),
        dns: realDns(),
        readFile: (p) => readFile(p),
        log: (line) => console.log(line),
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        now: () => new Date(),
    };
}
