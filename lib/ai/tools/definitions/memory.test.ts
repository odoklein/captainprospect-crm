/**
 * Memory tools, without a database:
 *     npx tsx --test lib/ai/tools/definitions/memory.test.ts
 *
 * What is pure is tested directly (schemas, scope default, reachability, the
 * error mapping); the one execute path that fails before any query
 * (`remember` in folder scope with no folder) is exercised end to end.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { AssistantMemoryError, checkMemoryContent } from "@/lib/assistant/memory/service";
import { ValidationError } from "@/lib/api-utils";
import { ToolValidationError } from "../types";
import type { AssistantContext } from "../types";
import {
    MEMORY_TOOLS,
    forget,
    isMemoryReachable,
    listMemories,
    normalizeMemoryId,
    remember,
    rememberOutcome,
    resolveMemoryScope,
    toMemoryToolError,
    updateMemory,
} from "./memory";

/** registry.ts MAX_SCHEMA_DESCRIPTION: beyond it, slimToolSchema truncates with an ellipsis. */
const MAX_SCHEMA_DESCRIPTION = 220;

// ============================================
// FIXTURES
// ============================================

function ctx(overrides: Partial<AssistantContext> = {}): AssistantContext {
    return {
        userId: "u1",
        userName: "Odo",
        role: "MANAGER",
        isActive: true,
        permissions: [],
        project: { clientId: "c1", clientName: "Decathlon", missionId: "m1", missionName: "Q4" },
        resolvedAt: new Date("2026-10-29T10:00:00Z"),
        autoWriteBudget: 3,
        conversationId: "conv1",
        folder: { id: "f1", kind: "CLIENT", name: "Decathlon", clientId: "c1" },
        ...overrides,
    };
}

// ============================================
// REGISTRATION SHAPE
// ============================================

test("the four tools are exported together with the expected tiers", () => {
    assert.deepEqual(
        MEMORY_TOOLS.map((t) => t.name),
        ["remember", "update_memory", "forget", "list_memories"],
    );
    for (const t of MEMORY_TOOLS) {
        assert.equal(t.requiresProject, false, `${t.name} must work outside a project`);
        assert.deepEqual(t.allowedRoles, ["MANAGER"]);
    }
    assert.equal(remember.risk, "safe_write");
    assert.equal(updateMemory.risk, "safe_write");
    assert.equal(forget.risk, "safe_write");
    assert.equal(listMemories.risk, "read");
    for (const t of MEMORY_TOOLS) assert.equal(t.noEvidence, true, `${t.name} is never a source to cite`);
});

test("descriptions fit the slimmed schema so no rule is cut mid-sentence", () => {
    for (const t of MEMORY_TOOLS) {
        assert.ok(t.description.length <= MAX_SCHEMA_DESCRIPTION, `${t.name}: ${t.description.length} chars`);
    }
});

// ============================================
// SCHEMAS — the model's JSON is untrusted input
// ============================================

test("remember accepts a plain fact and defaults the rest", () => {
    const parsed = remember.schema.safeParse({ content: "Le client veut des comptes rendus courts." });
    assert.equal(parsed.success, true);
});

test("remember refuses a content that is too short or too long", () => {
    assert.equal(remember.schema.safeParse({ content: "court" }).success, false);
    assert.equal(remember.schema.safeParse({ content: "x".repeat(401) }).success, false);
    assert.equal(remember.schema.safeParse({}).success, false);
});

test("remember refuses an unknown kind or scope", () => {
    assert.equal(remember.schema.safeParse({ content: "Objectif : 20 RDV par mois.", kind: "RUMOUR" }).success, false);
    assert.equal(remember.schema.safeParse({ content: "Objectif : 20 RDV par mois.", scope: "world" }).success, false);
    assert.equal(
        remember.schema.safeParse({ content: "Objectif : 20 RDV par mois.", kind: "GOAL", scope: "user", mission_bound: true })
            .success,
        true,
    );
});

test("update_memory needs an id and at least one field to change", () => {
    assert.equal(updateMemory.schema.safeParse({ memory_id: "m1" }).success, false);
    assert.equal(updateMemory.schema.safeParse({ memory_id: "m1", pinned: true }).success, true);
    assert.equal(updateMemory.schema.safeParse({ memory_id: "m1", kind: "DECISION" }).success, true);
    assert.equal(updateMemory.schema.safeParse({ memory_id: "m1", content: "trop" }).success, false);
    assert.equal(updateMemory.schema.safeParse({ content: "Nouveau contenu valide." }).success, false);
});

test("forget takes an id and an optional short reason", () => {
    assert.equal(forget.schema.safeParse({ memory_id: "m1" }).success, true);
    assert.equal(forget.schema.safeParse({ memory_id: "m1", reason: "Décision annulée" }).success, true);
    assert.equal(forget.schema.safeParse({ memory_id: "" }).success, false);
    assert.equal(forget.schema.safeParse({ memory_id: "m1", reason: "x".repeat(201) }).success, false);
});

test("list_memories bounds the limit and the scope", () => {
    assert.equal(listMemories.schema.safeParse({}).success, true);
    assert.equal(listMemories.schema.safeParse({ scope: "all", query: "rdv", limit: 50 }).success, true);
    assert.equal(listMemories.schema.safeParse({ limit: 0 }).success, false);
    assert.equal(listMemories.schema.safeParse({ limit: 51 }).success, false);
    assert.equal(listMemories.schema.safeParse({ limit: 2.5 }).success, false);
    assert.equal(listMemories.schema.safeParse({ scope: "mission" }).success, false);
});

// ============================================
// SCOPE DEFAULTING
// ============================================

test("resolveMemoryScope: folder when the conversation has one, agency otherwise", () => {
    assert.equal(resolveMemoryScope({}, ctx()), "folder");
    assert.equal(resolveMemoryScope({}, ctx({ folder: null })), "agency");
    assert.equal(resolveMemoryScope({}, ctx({ folder: undefined })), "agency");
});

test("resolveMemoryScope: an explicit scope wins over the default", () => {
    assert.equal(resolveMemoryScope({ scope: "user" }, ctx()), "user");
    assert.equal(resolveMemoryScope({ scope: "agency" }, ctx()), "agency");
    assert.equal(resolveMemoryScope({ scope: "folder" }, ctx({ folder: null })), "folder");
});

// ============================================
// MEMORY IDS AS THE CONTEXT PACK PRINTS THEM
// ============================================

test("normalizeMemoryId strips the (m:…) decoration and nothing else", () => {
    assert.equal(normalizeMemoryId("clx123"), "clx123");
    assert.equal(normalizeMemoryId("m:clx123"), "clx123");
    assert.equal(normalizeMemoryId("(m:clx123)"), "clx123");
    assert.equal(normalizeMemoryId("  M: clx123 "), "clx123");
    // An id that merely starts with the letter m keeps it.
    assert.equal(normalizeMemoryId("mclx123"), "mclx123");
    assert.equal(normalizeMemoryId("m:"), "");
});

// ============================================
// REMEMBER OUTCOME — what the model is told after the upsert
// ============================================

const outcomeInput = { scope: "folder" as const, ctx: ctx(), missionBound: false, missionId: null };

test("rememberOutcome: a missing table says so and records nothing", () => {
    const out = rememberOutcome(null, outcomeInput);
    assert.match(out.message, /^Mémoire indisponible/);
    assert.equal(out.artifactId, null);
});

test("rememberOutcome: an active row is reported in its scope", () => {
    const row = { content: "Le client veut des CR courts.", deletedAt: null };
    assert.equal(rememberOutcome(row, outcomeInput).message, "Mémorisé (dossier « Decathlon ») : Le client veut des CR courts.");
    assert.equal(rememberOutcome(row, { ...outcomeInput, scope: "agency" }).message, "Mémorisé (agence) : Le client veut des CR courts.");
    assert.equal(rememberOutcome(row, { ...outcomeInput, scope: "user" }).message, "Mémorisé (préférences) : Le client veut des CR courts.");
});

test("rememberOutcome: a soft-deleted twin the store did not revive is not reported as memorised", () => {
    const row = { content: "Le client veut des CR courts.", deletedAt: new Date("2026-10-01T00:00:00Z") };
    const out = rememberOutcome(row, outcomeInput);
    assert.doesNotMatch(out.message, /^Mémorisé/);
    assert.match(out.message, /^Non mémorisé/);
    assert.match(out.message, /restaurer/);
});

test("rememberOutcome: a mission_bound request without an active mission says the link was dropped", () => {
    const row = { content: "Objectif : 20 RDV par mois.", deletedAt: null };
    assert.match(rememberOutcome(row, { ...outcomeInput, missionBound: true, missionId: null }).message, /aucune mission active/);
    assert.doesNotMatch(rememberOutcome(row, { ...outcomeInput, missionBound: true, missionId: "m1" }).message, /aucune mission/);
    assert.doesNotMatch(rememberOutcome(row, { ...outcomeInput, missionBound: false, missionId: null }).message, /mission/);
});

// ============================================
// REACHABILITY MATRIX
// ============================================

test("isMemoryReachable: agency rows are visible to every turn", () => {
    const row = { scope: "AGENCY" as const, folderId: null, userId: null };
    assert.equal(isMemoryReachable(row, ctx()), true);
    assert.equal(isMemoryReachable(row, ctx({ folder: null })), true);
});

test("isMemoryReachable: a folder row only from inside that folder", () => {
    const own = { scope: "FOLDER" as const, folderId: "f1", userId: null };
    const other = { scope: "FOLDER" as const, folderId: "f2", userId: null };
    assert.equal(isMemoryReachable(own, ctx()), true);
    assert.equal(isMemoryReachable(other, ctx()), false);
    assert.equal(isMemoryReachable(own, ctx({ folder: null })), false);
    // A FOLDER row without a folder id is malformed, never reachable.
    assert.equal(isMemoryReachable({ scope: "FOLDER", folderId: null, userId: null }, ctx()), false);
});

test("isMemoryReachable: a user row only for its own user", () => {
    const mine = { scope: "USER" as const, folderId: null, userId: "u1" };
    const theirs = { scope: "USER" as const, folderId: null, userId: "u2" };
    assert.equal(isMemoryReachable(mine, ctx()), true);
    assert.equal(isMemoryReachable(theirs, ctx()), false);
    assert.equal(isMemoryReachable({ scope: "USER", folderId: null, userId: null }, ctx()), false);
});

// ============================================
// ERROR MAPPING — the store's refusals reach the model as argument errors
// ============================================

test("a forbidden content refused by checkMemoryContent becomes a ToolValidationError", () => {
    let caught: unknown;
    try {
        checkMemoryContent("Le mot de passe du portail est hunter2");
    } catch (error) {
        caught = error;
    }
    assert.ok(caught instanceof AssistantMemoryError);
    const mapped = toMemoryToolError(caught);
    assert.ok(mapped instanceof ToolValidationError);
    assert.match(mapped.message, /mot de passe/);
});

test("an IBAN and a digit-heavy string are refused the same way", () => {
    for (const content of ["IBAN FR76 3000 6000 0112 3456 7890 189", "0612345678 0698765432"]) {
        assert.throws(() => checkMemoryContent(content), AssistantMemoryError);
    }
});

test("a context ValidationError is mapped too; anything else passes through untouched", () => {
    const mapped = toMemoryToolError(new ValidationError("Aucun dossier"));
    assert.ok(mapped instanceof ToolValidationError);
    assert.equal(mapped.message, "Aucun dossier");

    const other = new TypeError("boom");
    assert.equal(toMemoryToolError(other), other);
});

test("remember in folder scope without a folder refuses before touching the store", async () => {
    await assert.rejects(
        () => remember.execute({ content: "Le client veut des CR courts.", scope: "folder" }, ctx({ folder: null })),
        (error: unknown) => error instanceof ToolValidationError && /dossier/.test(error.message),
    );
});
