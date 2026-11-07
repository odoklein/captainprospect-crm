/**
 * Rolling summary and AI title, with a fake store and a scripted chat.
 *     npx tsx --test lib/assistant/summary/rolling.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { ChatCallRequest, ChatCallResponse } from "@/lib/ai/providers/types";
import type { AiUsageEntry } from "@/lib/ai/ledger";
import {
    RAW_WINDOW,
    SUMMARY_TRIGGER,
    buildSummaryPrompt,
    buildTitlePrompt,
    cleanTitle,
    compactForSummary,
    estimateSummaryTokens,
    looksLikeDefaultTitle,
    maybeSummarize,
    maybeTitle,
    selectSummaryCutoff,
    type SaveSummaryInput,
    type SummaryConversation,
    type SummaryDb,
    type SummaryMessage,
} from "./rolling";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function messagesOf(count: number): SummaryMessage[] {
    return Array.from({ length: count }, (_, i) => ({
        id: `m${i + 1}`,
        role: i % 2 === 0 ? "USER" : "ASSISTANT",
        content: i % 2 === 0 ? `Question ${i + 1}` : `Réponse ${i + 1}`,
        createdAt: new Date(2026, 9, 29, 9, i),
    }));
}

function conversationOf(patch: Partial<SummaryConversation> = {}): SummaryConversation {
    return {
        id: "conv1",
        summary: null,
        summaryUpToMessageId: null,
        messageCount: 0,
        title: "Vue agence",
        titleEditedAt: null,
        createdById: "user1",
        clientId: "client1",
        missionId: null,
        ...patch,
    };
}

interface FakeDbOptions {
    conversation?: SummaryConversation | null;
    messages?: SummaryMessage[];
    saveSummaryResult?: boolean;
    saveTitleResult?: boolean;
}

function fakeDb(options: FakeDbOptions = {}) {
    const calls = { saveSummary: [] as Array<{ id: string; input: SaveSummaryInput }>, saveTitle: [] as Array<{ id: string; title: string }> };
    const db: SummaryDb = {
        findConversation: async () => (options.conversation === undefined ? conversationOf() : options.conversation),
        listMessages: async () => options.messages ?? [],
        saveSummary: async (id, input) => {
            calls.saveSummary.push({ id, input });
            return options.saveSummaryResult ?? true;
        },
        saveTitle: async (id, title) => {
            calls.saveTitle.push({ id, title });
            return options.saveTitleResult ?? true;
        },
    };
    return { db, calls };
}

function fakeChat(text: string | null) {
    const requests: ChatCallRequest[] = [];
    const chat = async (request: ChatCallRequest): Promise<ChatCallResponse> => {
        requests.push(request);
        return {
            text,
            toolCalls: [],
            usage: { inputTokens: 300, cachedInputTokens: 0, outputTokens: 50, reasoningTokens: 0, totalTokens: 350 },
            model: "gpt-4.1-mini",
            provider: "openai",
            finish: "stop",
        };
    };
    return { chat, requests };
}

function ledgerSpy() {
    const entries: AiUsageEntry[] = [];
    return { entries, ledger: (entry: AiUsageEntry) => entries.push(entry) };
}

function userContent(request: ChatCallRequest): string {
    const message = request.messages.find((m) => m.role === "user");
    return message && "content" in message && typeof message.content === "string" ? message.content : "";
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test("selectSummaryCutoff: nothing to do below the trigger", () => {
    assert.equal(selectSummaryCutoff(messagesOf(RAW_WINDOW), null), null);
    assert.equal(selectSummaryCutoff(messagesOf(RAW_WINDOW + SUMMARY_TRIGGER - 1), null), null);
    assert.equal(selectSummaryCutoff([], null), null);
});

test("selectSummaryCutoff: first summary covers everything before the raw window", () => {
    assert.deepEqual(selectSummaryCutoff(messagesOf(20), null), { from: 0, to: 8 });
    assert.deepEqual(selectSummaryCutoff(messagesOf(23), null), { from: 0, to: 11 });
});

test("selectSummaryCutoff: a later summary starts after the previous cutoff", () => {
    const messages = messagesOf(28);
    assert.deepEqual(selectSummaryCutoff(messages, "m8"), { from: 8, to: 16 });
    // Only 7 new messages beyond the window: wait.
    assert.equal(selectSummaryCutoff(messagesOf(27), "m8"), null);
    // A superseded cutoff message restarts from the top.
    assert.deepEqual(selectSummaryCutoff(messages, "gone"), { from: 0, to: 16 });
    // The list shrank (edits superseded rows) and the cutoff now sits inside the raw window: wait, never a negative slice.
    assert.equal(selectSummaryCutoff(messagesOf(20), "m15"), null);
    assert.equal(selectSummaryCutoff(messagesOf(20), "m20"), null);
});

test("compactForSummary strips the :::suivi block and caps lengths", () => {
    const longUser = "u".repeat(700);
    const longAnswer = `${"a".repeat(1500)}\n\n:::suivi\n- Et ensuite ?\n- Et les appels ?\n:::`;
    const transcript = compactForSummary([
        { role: "USER", content: longUser },
        { role: "ASSISTANT", content: longAnswer },
        { role: "ASSISTANT", content: "Court.\n:::suivi\n- Suite ?\n:::" },
    ]);
    const lines = transcript.split("\n\n");
    assert.equal(lines.length, 3);
    assert.ok(lines[0].startsWith("Manager : "));
    assert.equal(lines[0].length, "Manager : ".length + 600);
    assert.ok(lines[0].endsWith("…"));
    assert.ok(lines[1].startsWith("Assistant : "));
    assert.equal(lines[1].length, "Assistant : ".length + 1200);
    assert.ok(!transcript.includes("suivi"));
    assert.ok(!transcript.includes("Et les appels"));
    assert.equal(lines[2], "Assistant : Court.");
});

test("buildSummaryPrompt carries the previous summary and the rules", () => {
    const withPrevious = buildSummaryPrompt("Ancien résumé.", "Manager : bonjour");
    assert.ok(withPrevious.user.includes("Ancien résumé."));
    assert.ok(withPrevious.user.includes("Manager : bonjour"));
    assert.ok(withPrevious.system.includes("350 mots"));
    assert.ok(/N.invente rien/.test(withPrevious.system));
    const without = buildSummaryPrompt(null, "x");
    assert.ok(without.user.includes("(aucun)"));
});

test("buildTitlePrompt asks for a short French title", () => {
    const prompt = buildTitlePrompt("Manager : combien de RDV ?");
    assert.ok(prompt.system.includes("3 et 8 mots"));
    assert.equal(prompt.user, "Manager : combien de RDV ?");
});

test("cleanTitle strips quotes, prefixes, trailing period and caps at 80", () => {
    assert.equal(cleanTitle("« RDV de la semaine. »"), "RDV de la semaine");
    assert.equal(cleanTitle("\"Titre : Suivi des relances\"\n\nautre ligne"), "Suivi des relances");
    assert.equal(cleanTitle("  Bilan   TALIS  — octobre "), "Bilan TALIS – octobre");
    assert.equal(cleanTitle("x".repeat(100)).length, 80);
    assert.equal(cleanTitle(""), "");
});

test("cleanTitle drops the markdown small models wrap a title in", () => {
    assert.equal(cleanTitle("**Relances Acme en retard**"), "Relances Acme en retard");
    assert.equal(cleanTitle("# Bilan RDV semaine 44"), "Bilan RDV semaine 44");
    assert.equal(cleanTitle("`Point TALIS`"), "Point TALIS");
    assert.equal(cleanTitle("__Suivi Julie__"), "Suivi Julie");
    assert.equal(cleanTitle("**Titre :** Objectifs Q4."), "Objectifs Q4");
    assert.equal(cleanTitle("***"), "");
});

test("looksLikeDefaultTitle recognises the titles the app sets itself", () => {
    assert.equal(looksLikeDefaultTitle("Vue agence", ""), true);
    assert.equal(looksLikeDefaultTitle("Acme — Prospection Q4", ""), true);
    assert.equal(looksLikeDefaultTitle("Combien de RDV ?", "Combien de RDV ?"), true);
    const long = "Peux-tu me dire combien de rendez-vous ont été pris cette semaine par Julie ?";
    assert.equal(looksLikeDefaultTitle(`${long.slice(0, 57)}…`, long), true);
    assert.equal(looksLikeDefaultTitle("", "x"), true);
    assert.equal(looksLikeDefaultTitle("Mon titre à moi", "Combien de RDV ?"), false);
    assert.equal(looksLikeDefaultTitle("RDV de Julie – semaine 44", long), false);
});

// ---------------------------------------------------------------------------
// maybeSummarize
// ---------------------------------------------------------------------------

test("maybeSummarize is a no-op below the trigger and calls no model", async () => {
    const { db, calls } = fakeDb({ messages: messagesOf(19) });
    const { chat, requests } = fakeChat("résumé");
    const result = await maybeSummarize("conv1", { db, chat, ledger: () => {} });
    assert.deepEqual(result, { updated: false, reason: "below_trigger" });
    assert.equal(requests.length, 0);
    assert.equal(calls.saveSummary.length, 0);
});

test("maybeSummarize writes the summary guarded by the previous cutoff and feeds the old summary to the model", async () => {
    const { db, calls } = fakeDb({
        conversation: conversationOf({ summary: "Ancien résumé : Julie 7 RDV en S43.", summaryUpToMessageId: "m8", missionId: "mission1" }),
        messages: messagesOf(28),
    });
    const { chat, requests } = fakeChat("  Nouveau résumé fusionné.\n");
    const { ledger, entries } = ledgerSpy();
    let tick = 0;
    const now = () => new Date(1_000 + 250 * tick++);

    const result = await maybeSummarize("conv1", { db, chat, ledger, now, model: "gpt-4.1-mini" });
    assert.deepEqual(result, { updated: true, reason: "summarised" });

    assert.equal(requests.length, 1);
    const request = requests[0];
    assert.equal(request.model, "gpt-4.1-mini");
    assert.equal(request.maxOutputTokens, 700);
    assert.equal(request.temperature, 0.2);
    assert.equal(request.reasoningEffort, "none");
    assert.equal(request.timeoutMs, 60_000);
    assert.equal(request.messages[0].role, "system");
    const user = userContent(request);
    assert.ok(user.includes("Ancien résumé : Julie 7 RDV en S43."));
    assert.ok(user.includes("Question 9"), "first new message is m9");
    assert.ok(user.includes("Réponse 16"), "last summarised message is m16");
    assert.ok(!user.includes("Question 17"), "the raw window stays out");
    assert.ok(!user.includes("Réponse 8"), "already summarised messages stay out");

    assert.equal(calls.saveSummary.length, 1);
    assert.deepEqual(calls.saveSummary[0], {
        id: "conv1",
        input: {
            summary: "Nouveau résumé fusionné.",
            summaryUpToMessageId: "m16",
            summaryTokens: estimateSummaryTokens("Nouveau résumé fusionné."),
            previousUpTo: "m8",
        },
    });
    assert.equal(calls.saveSummary[0].input.summaryTokens, Math.ceil("Nouveau résumé fusionné.".length / 3.3));

    assert.equal(entries.length, 1);
    assert.equal(entries[0].surface, "assistant.summary");
    assert.equal(entries[0].model, "gpt-4.1-mini");
    assert.equal(entries[0].userId, "user1");
    assert.equal(entries[0].clientId, "client1");
    assert.equal(entries[0].missionId, "mission1");
    assert.equal(entries[0].conversationId, "conv1");
    assert.equal(entries[0].usage.inputTokens, 300);
    assert.equal(entries[0].latencyMs, 250);
});

test("maybeSummarize without a previous summary starts at the first message with previousUpTo null", async () => {
    const { db, calls } = fakeDb({ messages: messagesOf(20) });
    const { chat, requests } = fakeChat("Premier résumé.");
    const result = await maybeSummarize("conv1", { db, chat, ledger: () => {} });
    assert.equal(result.updated, true);
    assert.ok(userContent(requests[0]).includes("(aucun)"));
    assert.equal(calls.saveSummary[0].input.previousUpTo, null);
    assert.equal(calls.saveSummary[0].input.summaryUpToMessageId, "m8");
});

test("maybeSummarize takes the model from ASSISTANT_SUMMARY_MODEL and ignores a blank value", async () => {
    const previous = process.env.ASSISTANT_SUMMARY_MODEL;
    try {
        process.env.ASSISTANT_SUMMARY_MODEL = "   ";
        const blank = fakeChat("Résumé.");
        await maybeSummarize("conv1", { db: fakeDb({ messages: messagesOf(20) }).db, chat: blank.chat, ledger: () => {} });
        assert.equal(blank.requests[0].model, "gpt-4.1-mini");

        process.env.ASSISTANT_SUMMARY_MODEL = " deepseek-chat ";
        const set = fakeChat("Résumé.");
        const { ledger, entries } = ledgerSpy();
        await maybeSummarize("conv1", { db: fakeDb({ messages: messagesOf(20) }).db, chat: set.chat, ledger });
        assert.equal(set.requests[0].model, "deepseek-chat");
        assert.equal(entries[0].model, "deepseek-chat");

        // An explicit dep still wins over the environment.
        const explicit = fakeChat("Résumé.");
        await maybeSummarize("conv1", { db: fakeDb({ messages: messagesOf(20) }).db, chat: explicit.chat, ledger: () => {}, model: "gpt-4.1" });
        assert.equal(explicit.requests[0].model, "gpt-4.1");
    } finally {
        if (previous === undefined) delete process.env.ASSISTANT_SUMMARY_MODEL;
        else process.env.ASSISTANT_SUMMARY_MODEL = previous;
    }
});

test("maybeSummarize reports a lost race without throwing", async () => {
    const { db } = fakeDb({ messages: messagesOf(20), saveSummaryResult: false });
    const { chat } = fakeChat("Résumé.");
    const result = await maybeSummarize("conv1", { db, chat, ledger: () => {} });
    assert.deepEqual(result, { updated: false, reason: "race_lost" });
});

test("maybeSummarize never throws: model failure, store failure, empty answer, unknown conversation", async () => {
    const { db } = fakeDb({ messages: messagesOf(20) });
    const failing = await maybeSummarize("conv1", {
        db,
        chat: async () => {
            throw new Error("boom 429");
        },
        ledger: () => {},
    });
    assert.equal(failing.updated, false);
    assert.ok(failing.reason.includes("boom 429"));

    const brokenDb: SummaryDb = {
        ...db,
        findConversation: async () => {
            throw new Error("connexion perdue");
        },
    };
    const broken = await maybeSummarize("conv1", { db: brokenDb, chat: fakeChat("x").chat, ledger: () => {} });
    assert.equal(broken.updated, false);
    assert.ok(broken.reason.includes("connexion perdue"));

    const empty = await maybeSummarize("conv1", { db, chat: fakeChat("   ").chat, ledger: () => {} });
    assert.deepEqual(empty, { updated: false, reason: "empty_summary" });

    const missing = await maybeSummarize("conv1", { db: fakeDb({ conversation: null }).db, chat: fakeChat("x").chat, ledger: () => {} });
    assert.deepEqual(missing, { updated: false, reason: "conversation_unavailable" });
});

// ---------------------------------------------------------------------------
// maybeTitle
// ---------------------------------------------------------------------------

test("maybeTitle replaces a default title after the first exchange and records the ledger", async () => {
    const messages = messagesOf(2);
    messages[0].content = "Combien de RDV cette semaine ?";
    messages[1].content = "Julie a pris 7 RDV en S44.\n\n:::suivi\n- Et le mois ?\n:::";
    const { db, calls } = fakeDb({
        conversation: conversationOf({ messageCount: 2, title: "Combien de RDV cette semaine ?" }),
        messages,
    });
    const { chat, requests } = fakeChat("« RDV de la semaine de Julie. »");
    const { ledger, entries } = ledgerSpy();

    const result = await maybeTitle("conv1", { db, chat, ledger });
    assert.deepEqual(result, { updated: true, reason: "titled" });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].maxOutputTokens, 40);
    const user = userContent(requests[0]);
    assert.ok(user.includes("Combien de RDV cette semaine ?"));
    assert.ok(user.includes("Julie a pris 7 RDV"));
    assert.ok(!user.includes("suivi"));
    assert.deepEqual(calls.saveTitle, [{ id: "conv1", title: "RDV de la semaine de Julie" }]);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].surface, "assistant.title");
    assert.equal(entries[0].conversationId, "conv1");
    assert.equal(entries[0].userId, "user1");
});

test("maybeTitle also handles the agency and project default titles", async () => {
    for (const title of ["Vue agence", "Acme — Prospection Q4"]) {
        const { db, calls } = fakeDb({ conversation: conversationOf({ messageCount: 2, title }), messages: messagesOf(2) });
        const result = await maybeTitle("conv1", { db, chat: fakeChat("Point RDV Acme").chat, ledger: () => {} });
        assert.equal(result.updated, true, title);
        assert.equal(calls.saveTitle[0].title, "Point RDV Acme");
    }
});

test("maybeTitle leaves custom or edited titles and young threads alone", async () => {
    const messages = messagesOf(2);
    const edited = fakeDb({ conversation: conversationOf({ messageCount: 2, titleEditedAt: new Date() }), messages });
    const editedChat = fakeChat("x");
    assert.deepEqual(await maybeTitle("conv1", { db: edited.db, chat: editedChat.chat, ledger: () => {} }), { updated: false, reason: "title_edited" });
    assert.equal(editedChat.requests.length, 0);

    const custom = fakeDb({ conversation: conversationOf({ messageCount: 4, title: "Suivi Julie – S44" }), messages });
    const customChat = fakeChat("x");
    assert.deepEqual(await maybeTitle("conv1", { db: custom.db, chat: customChat.chat, ledger: () => {} }), { updated: false, reason: "title_custom" });
    assert.equal(customChat.requests.length, 0);

    const young = fakeDb({ conversation: conversationOf({ messageCount: 1 }), messages: messagesOf(1) });
    assert.deepEqual(await maybeTitle("conv1", { db: young.db, chat: fakeChat("x").chat, ledger: () => {} }), { updated: false, reason: "too_few_messages" });
    assert.equal(young.calls.saveTitle.length, 0);
});

test("maybeTitle never throws and reports a rename that happened meanwhile", async () => {
    const raced = fakeDb({ conversation: conversationOf({ messageCount: 2 }), messages: messagesOf(2), saveTitleResult: false });
    assert.deepEqual(await maybeTitle("conv1", { db: raced.db, chat: fakeChat("Titre").chat, ledger: () => {} }), { updated: false, reason: "title_edited" });

    const empty = fakeDb({ conversation: conversationOf({ messageCount: 2 }), messages: messagesOf(2) });
    assert.deepEqual(await maybeTitle("conv1", { db: empty.db, chat: fakeChat("\"\"").chat, ledger: () => {} }), { updated: false, reason: "empty_title" });

    const failing = await maybeTitle("conv1", {
        db: fakeDb({ conversation: conversationOf({ messageCount: 2 }), messages: messagesOf(2) }).db,
        chat: async () => {
            throw new Error("timeout");
        },
        ledger: () => {},
    });
    assert.equal(failing.updated, false);
    assert.ok(failing.reason.includes("timeout"));
});
