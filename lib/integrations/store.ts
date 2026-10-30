// ============================================
// INTEGRATION KEYS (store) — the changeable keys, encrypted in SystemConfig.
//
//   await startIntegrationKeys();                       instrumentation.ts, once
//   await listIntegrationKeys();                        status for the Console / Paramètres (never values)
//   await setIntegrationKeys({ OPENAI_API_KEY: "sk-…", ALLO_API_KEY: null }, actor)
//
// One SystemConfig row per key, "integration:<NAME>", whose value is JSON
// { c: ciphertext, hint, by, at }. Sealed with lib/encryption (ENCRYPTION_KEY,
// fixed at creation). No migration: SystemConfig already exists everywhere.
// Server-only (Prisma).
// ============================================

import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/encryption";
import {
    INTEGRATION_GROUPS, INTEGRATION_KEYS, checkIntegrationValue, isIntegrationKeyName, keyHint,
    type IntegrationGroup, type IntegrationKeyName,
} from "./catalog";
import {
    markIntegrationSnapshotTried, registerIntegrationRefresher, replaceIntegrationSnapshot, type IntegrationKeySource,
} from "./keys";

const PREFIX = "integration:";

type StoredRecord = { c: string; hint: string; by: string; at: string };

export type IntegrationActor = { kind: "console" } | { kind: "manager"; id: string; name: string };

export interface IntegrationKeyStatus {
    name: IntegrationKeyName;
    label: string;
    group: IntegrationGroup;
    groupLabel: string;
    usedFor: string;
    placeholder: string | null;
    docsUrl: string | null;
    /** stored = set here (Console or Paramètres); env = written into the container at creation; none = feature off. */
    source: IntegrationKeySource;
    hint: string | null;
    updatedAt: string | null;
    /** "Console" or the manager's name. */
    updatedBy: string | null;
}

// PBKDF2 makes each decrypt cost ~50 ms: decrypt a ciphertext once per process.
const g = globalThis as typeof globalThis & { __integrationPlain?: Map<string, string> };
const plainCache: Map<string, string> = (g.__integrationPlain ??= new Map());

let warned = false;

function parseRecord(value: string): StoredRecord | null {
    try {
        const r = JSON.parse(value) as Partial<StoredRecord>;
        return typeof r.c === "string" && r.c ? { c: r.c, hint: r.hint ?? "••••", by: r.by ?? "", at: r.at ?? "" } : null;
    } catch {
        return null;
    }
}

async function readRecords(): Promise<Map<IntegrationKeyName, StoredRecord>> {
    const rows = await prisma.systemConfig.findMany({ where: { key: { startsWith: PREFIX } } });
    const out = new Map<IntegrationKeyName, StoredRecord>();
    for (const row of rows) {
        const name = row.key.slice(PREFIX.length);
        const rec = parseRecord(row.value);
        if (isIntegrationKeyName(name) && rec) out.set(name, rec);
    }
    return out;
}

function open(rec: StoredRecord): string | null {
    const hit = plainCache.get(rec.c);
    if (hit !== undefined) return hit;
    try {
        const plain = decrypt(rec.c);
        plainCache.set(rec.c, plain);
        return plain;
    } catch {
        return null;
    }
}

/** Reads the store into the snapshot. Never throws: a failure keeps the previous values. */
export async function loadIntegrationKeys(): Promise<void> {
    try {
        const records = await readRecords();
        const values = new Map<string, string>();
        for (const [name, rec] of records) {
            const plain = open(rec);
            if (plain) values.set(name, plain);
            else console.warn(`[integrations] ${name}: valeur illisible (ENCRYPTION_KEY a changé ?) — ignorée`);
        }
        replaceIntegrationSnapshot(values);
        warned = false;
    } catch (err) {
        markIntegrationSnapshotTried();
        if (!warned) {
            warned = true;
            console.warn("[integrations] lecture des clés impossible, valeurs du conteneur utilisées :", err instanceof Error ? err.message : err);
        }
    }
}

export async function startIntegrationKeys(): Promise<void> {
    registerIntegrationRefresher(loadIntegrationKeys);
    await loadIntegrationKeys();
}

export async function listIntegrationKeys(): Promise<IntegrationKeyStatus[]> {
    const records = await readRecords();
    return INTEGRATION_KEYS.map((def) => {
        const rec = records.get(def.name);
        const env = process.env[def.name]?.trim();
        const source: IntegrationKeySource = rec ? "stored" : env ? "env" : "none";
        const envHint = !rec && env ? keyHint(env) : null;
        const d = def as typeof def & { placeholder?: string; docsUrl?: string };
        return {
            name: def.name,
            label: def.label,
            group: def.group,
            groupLabel: INTEGRATION_GROUPS[def.group].label,
            usedFor: def.usedFor,
            placeholder: d.placeholder ?? null,
            docsUrl: d.docsUrl ?? null,
            source,
            hint: rec?.hint ?? envHint,
            updatedAt: rec?.at || null,
            updatedBy: rec ? (rec.by === "console" ? "Console" : rec.by.replace(/^manager:[^|]*\|/, "") || null) : null,
        };
    });
}

export type IntegrationChanges = Partial<Record<string, string | null>>;

export type SetResult =
    | { ok: true; changed: IntegrationKeyName[]; keys: IntegrationKeyStatus[] }
    | { ok: false; errors: Record<string, string> };

/** `null` removes the stored value (the container env, if any, applies again). */
export async function setIntegrationKeys(changes: IntegrationChanges, actor: IntegrationActor): Promise<SetResult> {
    const errors: Record<string, string> = {};
    const writes: { name: IntegrationKeyName; value: string | null }[] = [];
    for (const [name, raw] of Object.entries(changes)) {
        if (!isIntegrationKeyName(name)) {
            errors[name] = "Clé inconnue";
            continue;
        }
        if (raw === null) {
            writes.push({ name, value: null });
            continue;
        }
        if (typeof raw !== "string") {
            errors[name] = "Texte attendu";
            continue;
        }
        const checked = checkIntegrationValue(name, raw);
        if (!checked.ok) errors[name] = checked.message;
        else writes.push({ name, value: checked.value });
    }
    if (Object.keys(errors).length) return { ok: false, errors };

    const by = actor.kind === "console" ? "console" : `manager:${actor.id}|${actor.name}`;
    const at = new Date().toISOString();
    await prisma.$transaction(
        writes.map(({ name, value }) =>
            value === null
                ? prisma.systemConfig.deleteMany({ where: { key: PREFIX + name } })
                : prisma.systemConfig.upsert({
                      where: { key: PREFIX + name },
                      update: { value: JSON.stringify({ c: encrypt(value), hint: keyHint(value), by, at } satisfies StoredRecord) },
                      create: { key: PREFIX + name, value: JSON.stringify({ c: encrypt(value), hint: keyHint(value), by, at } satisfies StoredRecord) },
                  }),
        ),
    );
    await loadIntegrationKeys();
    return { ok: true, changed: writes.map((w) => w.name), keys: await listIntegrationKeys() };
}
