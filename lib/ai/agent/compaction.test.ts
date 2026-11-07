/**
 * In-turn compaction of tool messages.
 *     npx tsx --test lib/ai/agent/compaction.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { ChatMessage } from "../providers/types";
import { wrapToolPayload } from "../tools/redact";
import {
    COMPACTION_HINT,
    citedLabels,
    compactToolMessages,
    estimateToolTokens,
    renderFacts,
    shouldCompact,
    type CompactionEntry,
    type CompactionOptions,
} from "./compaction";

// -- Fixtures -----------------------------------------------------------------

function rows(count: number, seed: string) {
    return Array.from({ length: count }, (_, i) => ({
        sdr: `${seed} ${i}`,
        appels: 40 + i,
        rdvPris: i % 7,
        tauxJoint: 12.5,
        commentaire: `Rappel prévu la semaine prochaine, dossier ${seed}-${i} à relancer après le point hebdo.`,
    }));
}

function toolMessage(toolCallId: string, name: string, content: string): ChatMessage {
    return { role: "tool", toolCallId, name, content };
}

function assistantCall(ids: string[], name: string): ChatMessage {
    return {
        role: "assistant",
        content: null,
        toolCalls: ids.map((id) => ({ id, name, arguments: JSON.stringify({ period: "7d" }) })),
    };
}

const errorContent = JSON.stringify({
    tool: "list_meetings",
    source: "E5",
    error: { code: "forbidden", message: "Accès refusé" },
    _note: "Cet outil a échoué ou a été refusé. Explique la limite à l'utilisateur, n'invente pas de données.",
});

/** Four iterations; iteration 0 also holds an unknown label and a failed tool. */
function buildMessages(): ChatMessage[] {
    return [
        { role: "system", content: "Tu es Captain." },
        { role: "user", content: "Bilan de la semaine ?" },
        assistantCall(["call_1", "call_2", "call_3"], "get_mission_metrics"),
        toolMessage("call_1", "get_mission_metrics", wrapToolPayload("get_mission_metrics", { periodeJours: 7, sdrs: rows(120, "Alice") }, "E1")),
        toolMessage("call_2", "get_sdr_activity", wrapToolPayload("get_sdr_activity", { sdrs: rows(80, "Inconnu") }, "E9")),
        toolMessage("call_3", "list_meetings", errorContent),
        assistantCall(["call_4"], "get_campaign_status"),
        toolMessage("call_4", "get_campaign_status", wrapToolPayload("get_campaign_status", { campagnes: rows(100, "Bob") }, "E2")),
        assistantCall(["call_5"], "get_rdv_overview"),
        toolMessage("call_5", "get_rdv_overview", wrapToolPayload("get_rdv_overview", { rdv: rows(100, "Chloé") }, "E3")),
        assistantCall(["call_6"], "get_agency_metrics"),
        toolMessage("call_6", "get_agency_metrics", wrapToolPayload("get_agency_metrics", { equipes: rows(100, "Dan") }, "E4")),
    ];
}

const entries: CompactionEntry[] = [
    {
        label: "E1",
        tool: "get_mission_metrics",
        summary: "Métriques mission sur 7 jours : 120 SDR, 1 260 appels, 36 RDV pris.",
        facts: [
            { key: "rdvPris", value: 12, unit: "count", entity: "Alice 0" },
            { key: "tauxJoint", value: 12.5, unit: "pct", entity: "Alice 0" },
            { key: "sdrs.length", value: 120, unit: "count" },
        ],
    },
    { label: "E2", tool: "get_campaign_status", summary: "Statut des campagnes : 100 campagnes actives.", facts: [{ key: "campagnes.length", value: 100, unit: "count" }] },
    { label: "E3", tool: "get_rdv_overview", summary: "RDV : 100 à venir.", facts: [{ key: "rdv.length", value: 100, unit: "count" }] },
    { label: "E4", tool: "get_agency_metrics", summary: "Agence : 100 équipes.", facts: [{ key: "equipes.length", value: 100, unit: "count" }] },
    { label: "E5", tool: "list_meetings", summary: "Échec : accès refusé.", facts: [] },
];

const tight: CompactionOptions = { budgetTokens: 1_000, entries };
const roomy: CompactionOptions = { budgetTokens: 10_000_000, entries };

function ids(messages: ChatMessage[]): string[] {
    return messages.map((m) => (m.role === "tool" ? `tool:${m.toolCallId}:${m.name ?? ""}` : m.role));
}

function parsed(message: ChatMessage): Record<string, unknown> {
    assert.equal(message.role, "tool");
    return JSON.parse((message as Extract<ChatMessage, { role: "tool" }>).content) as Record<string, unknown>;
}

// -- Tests --------------------------------------------------------------------

test("below the budget nothing is compacted", () => {
    const messages = buildMessages();
    assert.equal(shouldCompact(messages, roomy), false);
    const result = compactToolMessages(messages, roomy);
    assert.equal(result.compacted, 0);
    assert.equal(result.before, result.after);
    assert.notEqual(result.messages, messages);
    assert.deepEqual(result.messages, messages);
});

test("above the budget only iterations older than the last two are compacted", () => {
    const messages = buildMessages();
    assert.equal(shouldCompact(messages, tight), true);
    const result = compactToolMessages(messages, tight);
    // E1 and E2 are in iterations 0 and 1; E3 and E4 are in the two kept iterations.
    assert.equal(result.compacted, 2);
    assert.equal(parsed(result.messages[3])._compacted, true);
    assert.equal(parsed(result.messages[7])._compacted, true);
    assert.equal(parsed(result.messages[9])._compacted, undefined);
    assert.equal(parsed(result.messages[11])._compacted, undefined);
    assert.equal(result.messages[9], messages[9]);
    assert.equal(result.messages[11], messages[11]);
});

test("keepLastIterations is honoured", () => {
    const messages = buildMessages();
    const result = compactToolMessages(messages, { ...tight, keepLastIterations: 1 });
    assert.equal(result.compacted, 3);
    assert.equal(parsed(result.messages[9])._compacted, true);
    assert.equal(parsed(result.messages[11])._compacted, undefined);
});

test("the compacted message carries the digest and the hint", () => {
    const result = compactToolMessages(buildMessages(), tight);
    const digest = parsed(result.messages[3]);
    assert.deepEqual(digest, {
        tool: "get_mission_metrics",
        source: "E1",
        _compacted: true,
        summary: entries[0].summary,
        facts: "rdvPris=Alice 0 12; tauxJoint=Alice 0 12.5%; sdrs.length 120",
        hint: COMPACTION_HINT,
    });
    assert.ok(COMPACTION_HINT.includes("mêmes arguments"));
});

test("protected labels stay raw", () => {
    const messages = buildMessages();
    const options: CompactionOptions = { ...tight, protectLabels: new Set(["E1"]) };
    const result = compactToolMessages(messages, options);
    assert.equal(result.compacted, 1);
    assert.equal(result.messages[3], messages[3]);
    assert.equal(parsed(result.messages[7])._compacted, true);
});

test("when everything eligible is protected, shouldCompact is false", () => {
    const messages = buildMessages();
    const options: CompactionOptions = { ...tight, protectLabels: new Set(["E1", "E2"]) };
    assert.equal(shouldCompact(messages, options), false);
    assert.equal(compactToolMessages(messages, options).compacted, 0);
});

test("unknown labels and error messages are left untouched", () => {
    const messages = buildMessages();
    const result = compactToolMessages(messages, tight);
    assert.equal(result.messages[4], messages[4]);
    assert.equal(parsed(result.messages[4]).source, "E9");
    assert.equal(result.messages[5], messages[5]);
    assert.equal((result.messages[5] as Extract<ChatMessage, { role: "tool" }>).content, errorContent);
});

test("ordering, roles and tool call ids are preserved; the input is not mutated", () => {
    const messages = buildMessages();
    const snapshot = structuredClone(messages);
    const result = compactToolMessages(messages, tight);
    assert.equal(result.messages.length, messages.length);
    assert.deepEqual(ids(result.messages), ids(messages));
    assert.deepEqual(messages, snapshot);
    for (let i = 0; i < messages.length; i++) {
        if (messages[i].role !== "tool") assert.equal(result.messages[i], messages[i]);
    }
});

test("compaction is idempotent", () => {
    const once = compactToolMessages(buildMessages(), tight);
    const twice = compactToolMessages(once.messages, tight);
    assert.equal(twice.compacted, 0);
    assert.deepEqual(twice.messages, once.messages);
    assert.equal(twice.before, once.after);
    assert.equal(twice.after, once.after);
});

test("the token estimate drops and matches estimateToolTokens", () => {
    const messages = buildMessages();
    const result = compactToolMessages(messages, tight);
    assert.equal(result.before, estimateToolTokens(messages));
    assert.equal(result.after, estimateToolTokens(result.messages));
    assert.ok(result.after < result.before, `expected a drop, got ${result.before} -> ${result.after}`);
    // The drop is exactly the two rewritten payloads; the kept iterations, the
    // unknown label and the error weigh the same before and after.
    const length = (m: ChatMessage) => (m.role === "tool" ? m.content.length : 0);
    const saved = [3, 7].reduce((sum, i) => sum + Math.ceil(length(messages[i]) / 3.6) - Math.ceil(length(result.messages[i]) / 3.6), 0);
    assert.equal(result.before - result.after, saved);
    const custom = compactToolMessages(messages, { ...tight, estimate: (text) => text.length });
    assert.equal(custom.before, messages.filter((m) => m.role === "tool").reduce((sum, m) => sum + (m as { content: string }).content.length, 0));
});

test("facts are capped at 40 and the remainder is counted", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ key: `k${i}`, value: i, unit: "count" }));
    const rendered = renderFacts(many);
    assert.equal(rendered.split("; ").length - 1, 40);
    assert.ok(rendered.endsWith("(20 autres)"));
    assert.ok(rendered.startsWith("k0 0; k1 1; "));
});

test("citedLabels parses [E1] ... [E12] and ignores bare or malformed labels", () => {
    const labels = citedLabels("Selon [E1], 36 RDV ; voir aussi [E12] et [E1] encore. E3 sans crochets, [F4] non, [E] non.");
    assert.deepEqual([...labels], ["E1", "E12"]);
    assert.equal(citedLabels("").size, 0);
});
