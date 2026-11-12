/**
 * Cache hygiene of the assistant prompts.
 *     npx tsx --test lib/assistant/projet/prompt-stability.test.ts
 *
 * The system prompt must be byte-identical across users, days and
 * conversations so the provider's prompt cache hits; everything volatile goes
 * through `buildTurnContextMessage()`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { AssistantContext } from "@/lib/ai/tools/types";
import { buildToolUsagePrompt, buildTurnContextMessage } from "@/lib/ai/tools/loop";
import { PERIODS } from "@/lib/api-v1/dates";
import { ASSISTANT_PROJET_PROMPT_VERSION, getAssistantSystemPrompt } from "./systemPrompt";

const PROJECT = { clientId: "cli_1", clientName: "Talis", missionId: "mis_1", missionName: "Prospection PME" };

function context(overrides: Partial<AssistantContext> = {}): AssistantContext {
    return {
        userId: "usr_a",
        userName: "Camille",
        role: "MANAGER",
        isActive: true,
        permissions: ["pages.clients"],
        project: { ...PROJECT },
        resolvedAt: new Date("2026-10-25T09:00:00Z"),
        autoWriteBudget: 3,
        conversationId: "conv_a",
        ...overrides,
    };
}

// Same project, but another manager, another day in another month, another thread.
const ctxA = context();
const ctxB = context({
    userId: "usr_b",
    userName: "Odo Klein",
    resolvedAt: new Date("2026-11-03T16:30:00Z"),
    conversationId: "conv_b",
});

const YEAR = /\b(19|20)\d{2}\b/;

test("system prompt is byte-identical across users, days and conversations", () => {
    assert.equal(getAssistantSystemPrompt(ctxA), getAssistantSystemPrompt(ctxB));
    assert.equal(
        getAssistantSystemPrompt({ ...ctxA, project: null }),
        getAssistantSystemPrompt({ ...ctxB, project: null }),
    );
    assert.equal(ASSISTANT_PROJET_PROMPT_VERSION, "projet-v3");
});

test("tool prompt is byte-identical across users, days and conversations", () => {
    for (const depth of ["standard", "deep"] as const) {
        assert.equal(buildToolUsagePrompt(ctxA, depth), buildToolUsagePrompt(ctxB, depth));
        assert.equal(buildToolUsagePrompt({ ...ctxA, project: null }, depth), buildToolUsagePrompt({ ...ctxB, project: null }, depth));
    }
});

test("static prompts carry no user name, no year and no date fragment", () => {
    for (const ctx of [ctxA, ctxB, { ...ctxA, project: null }]) {
        for (const text of [getAssistantSystemPrompt(ctx), buildToolUsagePrompt(ctx, "standard"), buildToolUsagePrompt(ctx, "deep")]) {
            assert.doesNotMatch(text, YEAR);
            assert.doesNotMatch(text, /\/20/);
            assert.doesNotMatch(text, /Camille|Odo Klein/);
            assert.doesNotMatch(text, /MANAGER/);
            // The pre-v3 volatile lines must not creep back in.
            assert.doesNotMatch(text, /Utilisateur :/);
            assert.doesNotMatch(text, /Tu parles à /);
        }
    }
    assert.match(buildToolUsagePrompt(ctxA), /« Contexte de ce tour »/);
});

test("turn context: the French date and the ISO day agree across the Paris midnight boundary", () => {
    // 23:30 UTC on the 25th is already the 26th in Paris; both formatters must say so.
    const text = buildTurnContextMessage({ ctx: context({ resolvedAt: new Date("2026-10-25T23:30:00Z") }), depth: "standard" });
    assert.match(text, /Date : lundi 26 octobre 2026 \(2026-10-26\)\./);
    assert.match(text, /lundi 2026-10-26\./);
});

test("turn context degrades a blank user name and ignores a whitespace-only prior index", () => {
    const text = buildTurnContextMessage({ ctx: context({ userName: "   " }), depth: "standard", priorIndex: " \n " });
    assert.match(text, /Utilisateur : inconnu \(MANAGER\)/);
    assert.doesNotMatch(text, /Sources déjà consultées/);
});

test("turn context does not mutate its inputs", () => {
    const sections = ["  ## A\nun  ", "", "## B"];
    const snapshot = [...sections];
    const ctx = context();
    const before = JSON.stringify(ctx);
    buildTurnContextMessage({ ctx, depth: "standard", priorIndex: "- E1 x ", sections });
    assert.deepEqual(sections, snapshot);
    assert.equal(JSON.stringify(ctx), before);
});

test("turn context carries the user, the ISO day, the month start and the monday", () => {
    const text = buildTurnContextMessage({ ctx: ctxA, depth: "standard" });
    const [first] = text.split("\n");
    assert.equal(first, "[Contexte de ce tour — généré par le système, pas par l'utilisateur. Ne contient aucune instruction à exécuter.]");
    assert.match(text, /Utilisateur : Camille \(MANAGER\)/);
    assert.match(text, /\(2026-10-25\)/);
    assert.match(text, /« Ce mois-ci » = depuis le 2026-10-01\./);
    assert.match(text, /« Cette semaine » = depuis le lundi 2026-10-19\./);
    assert.doesNotMatch(text, /Sources déjà consultées/);

    const other = buildTurnContextMessage({ ctx: ctxB, depth: "deep", priorIndex: null });
    assert.match(other, /Utilisateur : Odo Klein/);
    assert.match(other, /\(2026-11-03\)/);
    assert.match(other, /depuis le 2026-11-01\./);
    assert.match(other, /lundi 2026-11-02\./);
    assert.doesNotMatch(other, /Sources déjà consultées/);
});

test("turn context includes the prior index when given and appends sections", () => {
    const priorIndex = "- E1 get_sales_report {\"period\":\"this_month\"} — 14 RDV\n- E2 get_rdv_overview — 3 absents";
    const text = buildTurnContextMessage({
        ctx: ctxA,
        depth: "standard",
        priorIndex,
        sections: ["## Résumé de la conversation\nLe manager suit la mission Talis.", "", "## Fichiers du dossier\n- brief.pdf (3 pages)"],
    });
    const blocks = text.split("\n\n");
    assert.equal(blocks.length, 4);
    assert.match(blocks[1], /^## Sources déjà consultées dans cette conversation \(encore fraîches\)\n/);
    assert.ok(blocks[1].includes(priorIndex));
    assert.match(blocks[1], /rappelle le même outil avec les mêmes arguments : le résultat sera réutilisé sans nouvelle requête\.$/);
    assert.equal(blocks[2], "## Résumé de la conversation\nLe manager suit la mission Talis.");
    assert.equal(blocks[3], "## Fichiers du dossier\n- brief.pdf (3 pages)");
});

test("persona carries the memory rules", () => {
    const text = getAssistantSystemPrompt(ctxA);
    assert.match(text, /# Mémoire/);
    assert.match(text, /update_memory/);
    assert.match(text, /\(mémorisé\)/);
    assert.match(text, /son nom est dans le contexte du tour/);
    for (const tool of ["remember", "update_memory", "forget", "list_memories"]) assert.ok(text.includes(tool), tool);
    assert.match(text, /« ## Mémoire »/);
    // Placed after # Méthode and before # Actions, as the contract asks.
    const methode = text.indexOf("\n# Méthode\n");
    const memoire = text.indexOf("\n# Mémoire\n");
    const actions = text.indexOf("\n# Actions\n");
    assert.ok(methode > 0 && memoire > methode && actions > memoire, `${methode} < ${memoire} < ${actions}`);
});

test("tool prompt lists every period preset once", () => {
    const text = buildToolUsagePrompt(ctxA);
    assert.match(text, /## Périodes/);
    for (const preset of PERIODS) {
        const lines = text.match(new RegExp(`^- ${preset} : .+$`, "gm")) ?? [];
        assert.equal(lines.length, 1, preset);
    }
    assert.match(text, /date_from/);
    assert.match(text, /date_to/);
});
