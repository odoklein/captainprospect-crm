/**
 * Provider layer — catalog, request bodies per wire, stream parsers, cost.
 *     npm run test:providers
 *
 * Nothing touches the network: the two SSE parsers are fed fake streams and
 * the request builders are checked as plain objects.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { allowedResidencies, endpointFor, residencyAllows, resolveModel, wireFor } from "./catalog";
import { ProviderError } from "./errors";
import { assertEligible, providerChatFn } from "./index";
import { DEEPSEEK_CHAT_QUIRKS, OPENAI_CHAT_QUIRKS, buildChatBody, parseChatUsage, readChatStream } from "./openai-chat";
import { buildResponsesBody, readResponsesStream, toResponsesInput } from "./openai-responses";
import type { ChatCallRequest, ChatMessage } from "./types";
import { calculateTokenCost } from "../usage";

function request(partial: Partial<ChatCallRequest> & { model: string }): ChatCallRequest {
    return {
        messages: [
            { role: "system", content: "sys" },
            { role: "user", content: "hello" },
        ],
        maxOutputTokens: 500,
        reasoningEffort: "none",
        timeoutMs: 1000,
        ...partial,
    };
}

function sse(lines: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
        start(controller) {
            for (const line of lines) controller.enqueue(encoder.encode(line));
            controller.close();
        },
    });
}

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
    const saved: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(vars)) {
        saved[k] = process.env[k];
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
    try {
        return fn();
    } finally {
        for (const [k, v] of Object.entries(saved)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    }
}

// -- catalog -------------------------------------------------------------------

test("models resolve exactly, by prefix, or to a priced family default", () => {
    assert.equal(resolveModel("gpt-5.5").provider, "openai");
    assert.equal(resolveModel("gpt-5.5").reasoning, true);
    const dated = resolveModel("gpt-5.5-2026-11-01");
    assert.equal(dated.known, false);
    assert.equal(dated.price.inputPerM, 5);
    assert.equal(resolveModel("deepseek-chat").provider, "deepseek");
    assert.equal(resolveModel("deepseek-v4-preview").provider, "deepseek");
    assert.equal(resolveModel("o4-mini").family, "o-series");
    assert.equal(resolveModel("mystery").price.inputPerM, 0.15, "unknown ids are priced like gpt-4o-mini, never zero");
});

test("the wire is Chat Completions unless ASSISTANT_WIRE=responses; DeepSeek never switches", () => {
    withEnv({ ASSISTANT_WIRE: undefined }, () => assert.equal(wireFor(resolveModel("gpt-5.5")), "openai-chat"));
    withEnv({ ASSISTANT_WIRE: "responses" }, () => {
        assert.equal(wireFor(resolveModel("gpt-5.5")), "openai-responses");
        assert.equal(wireFor(resolveModel("deepseek-chat")), "openai-chat");
    });
});

test("DeepSeek residency is China unless declared EU; CRM data never goes there by default", () => {
    withEnv({ DEEPSEEK_BASE_URL: undefined, DEEPSEEK_RESIDENCY: undefined, AI_ALLOW_CN_RAW_CRM: undefined }, () => {
        assert.equal(endpointFor("deepseek").residency, "cn");
        assert.equal(residencyAllows("raw_crm", "deepseek"), false);
        assert.equal(residencyAllows("public", "deepseek"), true);
        assert.equal(residencyAllows("raw_crm", "openai"), true);
        assert.throws(() => assertEligible(resolveModel("deepseek-chat"), "raw_crm"), (e: unknown) => e instanceof ProviderError && e.code === "NO_ELIGIBLE_MODEL");
    });
    withEnv({ DEEPSEEK_BASE_URL: "https://deepseek.eu.example/v1/", DEEPSEEK_RESIDENCY: "eu" }, () => {
        assert.equal(endpointFor("deepseek").baseUrl, "https://deepseek.eu.example/v1", "trailing slash removed");
        assert.equal(endpointFor("deepseek").residency, "eu");
        assert.equal(residencyAllows("raw_crm", "deepseek"), true);
    });
    withEnv({ DEEPSEEK_BASE_URL: "https://deepseek.eu.example", DEEPSEEK_RESIDENCY: undefined }, () => {
        assert.equal(endpointFor("deepseek").residency, "cn", "an EU-looking hostname is not a declaration");
    });
    withEnv({ AI_ALLOW_CN_RAW_CRM: "true" }, () => assert.deepEqual(allowedResidencies("raw_crm"), ["eu", "us", "cn"]));
});

test("a missing key is refused as not_configured, before any network call", async () => {
    await withEnv({ DEEPSEEK_API_KEY: undefined }, async () => {
        await assert.rejects(
            providerChatFn({ dataClass: "public" })(request({ model: "deepseek-chat" })),
            (e: unknown) => e instanceof ProviderError && e.kind === "not_configured" && e.code === "NOT_CONFIGURED",
        );
    });
});

// -- Chat Completions wire -----------------------------------------------------

test("chat body: temperature and reasoning_effort follow the model family", () => {
    const base = { temperature: 0.7, tools: [{ name: "t", description: "d", parameters: { type: "object" } }] };
    const none = buildChatBody(request({ model: "gpt-5.5", ...base }), resolveModel("gpt-5.5"), OPENAI_CHAT_QUIRKS, {});
    assert.equal(none.temperature, 0.7);
    assert.equal(none.reasoning_effort, "none");
    assert.equal(none.max_completion_tokens, 500);
    assert.equal(none.tool_choice, "auto");
    assert.deepEqual((none.tools as unknown[])[0], { type: "function", function: { name: "t", description: "d", parameters: { type: "object" } } });

    const high = buildChatBody(request({ model: "gpt-5.5", ...base, reasoningEffort: "high" }), resolveModel("gpt-5.5"), OPENAI_CHAT_QUIRKS, {});
    assert.equal(high.temperature, undefined, "reasoning models reject a custom temperature");
    assert.equal(high.reasoning_effort, "high");

    const o = buildChatBody(request({ model: "o3-mini", temperature: 0.7 }), resolveModel("o3-mini"), OPENAI_CHAT_QUIRKS, {});
    assert.equal(o.reasoning_effort, "low", "o-series know no none");
    assert.equal(o.temperature, undefined);

    const classic = buildChatBody(request({ model: "gpt-4.1", ...base, temperature: 0.2, cacheKey: "conv_1", responseFormat: "json", toolChoice: "none" }), resolveModel("gpt-4.1"), OPENAI_CHAT_QUIRKS, {});
    assert.equal(classic.temperature, 0.2);
    assert.equal(classic.reasoning_effort, undefined);
    assert.equal(classic.prompt_cache_key, "conv_1");
    assert.deepEqual(classic.response_format, { type: "json_object" });
    assert.equal(classic.tool_choice, "none");
    assert.deepEqual(classic.stream_options, { include_usage: true });
});

test("chat body: DeepSeek quirks (max_tokens, no cache key, no effort, env model name)", () => {
    const body = buildChatBody(
        request({ model: "deepseek-chat", temperature: 0.5, cacheKey: "c" }),
        resolveModel("deepseek-chat"),
        DEEPSEEK_CHAT_QUIRKS,
        { DEEPSEEK_MODEL_CHAT: "DeepSeek-V3-EU" },
    );
    assert.equal(body.model, "DeepSeek-V3-EU");
    assert.equal(body.max_tokens, 500);
    assert.equal(body.max_completion_tokens, undefined);
    assert.equal(body.prompt_cache_key, undefined);
    assert.equal(body.reasoning_effort, undefined);
    assert.equal(body.temperature, 0.5);
    const reasoner = buildChatBody(request({ model: "deepseek-reasoner", temperature: 0.5 }), resolveModel("deepseek-reasoner"), DEEPSEEK_CHAT_QUIRKS, {});
    assert.equal(reasoner.temperature, undefined);
});

test("chat usage: cached tokens are read from each endpoint's own field", () => {
    const openai = parseChatUsage({ prompt_tokens: 1000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 900 }, completion_tokens_details: { reasoning_tokens: 20 } }, OPENAI_CHAT_QUIRKS);
    assert.deepEqual(openai, { inputTokens: 1000, cachedInputTokens: 900, outputTokens: 50, reasoningTokens: 20, totalTokens: 1050 });
    const deepseek = parseChatUsage({ prompt_tokens: 1000, completion_tokens: 50, prompt_cache_hit_tokens: 640, prompt_cache_miss_tokens: 360 }, DEEPSEEK_CHAT_QUIRKS);
    assert.equal(deepseek?.cachedInputTokens, 640);
});

test("chat stream: reasoning_content deltas are routed apart from the answer text", async () => {
    const reasoning: string[] = [];
    const res = await readChatStream(
        sse([
            'data: {"choices":[{"delta":{"reasoning_content":"pense"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"Oui"},"finish_reason":"stop"}]}\n\n',
            'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}\n\n',
            "data: [DONE]\n\n",
        ]),
        "deepseek-reasoner",
        "deepseek",
        DEEPSEEK_CHAT_QUIRKS,
        { onReasoningDelta: (t) => reasoning.push(t) },
    );
    assert.deepEqual(reasoning, ["pense"]);
    assert.equal(res.text, "Oui");
    assert.equal(res.finish, "stop");
    assert.equal(res.provider, "deepseek");
});

// -- Responses wire ------------------------------------------------------------

test("responses input: system → instructions, reasoning items replayed before their function calls", () => {
    const messages: ChatMessage[] = [
        { role: "system", content: "A" },
        { role: "system", content: "B" },
        { role: "user", content: "q" },
        { role: "assistant", content: null, toolCalls: [{ id: "call_1", name: "t", arguments: "{}" }], providerItems: [{ type: "reasoning", id: "rs_1", encrypted_content: "x" }] },
        { role: "tool", toolCallId: "call_1", name: "t", content: "{\"ok\":true}" },
        { role: "assistant", content: "done" },
    ];
    const { instructions, input } = toResponsesInput(messages);
    assert.equal(instructions, "A\n\nB");
    assert.deepEqual(input, [
        { role: "user", content: "q" },
        { type: "reasoning", id: "rs_1", encrypted_content: "x" },
        { type: "function_call", call_id: "call_1", name: "t", arguments: "{}" },
        { type: "function_call_output", call_id: "call_1", output: "{\"ok\":true}" },
        { role: "assistant", content: "done" },
    ]);
});

test("responses body: reasoning with summary and encrypted replay, tools, json format, cache key", () => {
    const body = buildResponsesBody(
        request({
            model: "gpt-5.5",
            reasoningEffort: "low",
            reasoningSummary: true,
            temperature: 0.7,
            cacheKey: "conv_9",
            responseFormat: "json",
            tools: [{ name: "t", description: "d", parameters: { type: "object" } }],
        }),
        resolveModel("gpt-5.5"),
        {},
    );
    assert.equal(body.store, false);
    assert.equal(body.stream, true);
    assert.equal(body.instructions, "sys");
    assert.deepEqual(body.reasoning, { effort: "low", summary: "auto" });
    assert.deepEqual(body.include, ["reasoning.encrypted_content"]);
    assert.equal(body.temperature, undefined);
    assert.equal(body.max_output_tokens, 500);
    assert.equal(body.prompt_cache_key, "conv_9");
    assert.deepEqual(body.text, { format: { type: "json_object" } });
    assert.deepEqual((body.tools as unknown[])[0], { type: "function", name: "t", description: "d", parameters: { type: "object" }, strict: false });

    const none = buildResponsesBody(request({ model: "gpt-5.5", temperature: 0.7 }), resolveModel("gpt-5.5"), {});
    assert.deepEqual(none.reasoning, { effort: "none" });
    assert.equal(none.include, undefined);
    assert.equal(none.temperature, 0.7);
});

test("responses stream: text, a function call assembled from fragments, a reasoning item and usage", async () => {
    const deltas: string[] = [];
    const summary: string[] = [];
    const res = await readResponsesStream(
        sse([
            'event: response.created\ndata: {"type":"response.created","response":{"id":"r1"}}\n\n',
            'data: {"type":"response.reasoning_summary_text.delta","delta":"Je regarde"}\n\n',
            'data: {"type":"response.output_item.done","output_index":0,"item":{"type":"reasoning","id":"rs_1","encrypted_content":"zzz","summary":[]}}\n\n',
            'data: {"type":"response.output_text.delta","delta":"Bon"}\n\n',
            'data: {"type":"response.output_text.delta","delta":"jour"}\n\n',
            'data: {"type":"response.output_item.added","output_index":2,"item":{"type":"function_call","id":"fc_1","call_id":"call_a","name":"get_mission_metrics","arguments":""}}\n\n',
            'data: {"type":"response.function_call_arguments.delta","output_index":2,"delta":"{\\"days\\":"}\n\n',
            'data: {"type":"response.function_call_arguments.delta","output_index":2,"delta":"30}"}\n\n',
            'data: {"type":"response.function_call_arguments.done","output_index":2,"arguments":"{\\"days\\":30}"}\n\n',
            'data: {"type":"response.output_item.done","output_index":2,"item":{"type":"function_call","id":"fc_1","call_id":"call_a","name":"get_mission_metrics","arguments":"{\\"days\\":30}"}}\n\n',
            'data: {"type":"response.completed","response":{"id":"r1","model":"gpt-5.5-2026-10","status":"completed","usage":{"input_tokens":2000,"output_tokens":120,"total_tokens":2120,"input_tokens_details":{"cached_tokens":1500},"output_tokens_details":{"reasoning_tokens":100}}}}\n\n',
        ]),
        "gpt-5.5",
        { onTextDelta: (t) => deltas.push(t), onReasoningDelta: (t) => summary.push(t) },
    );
    assert.deepEqual(deltas, ["Bon", "jour"]);
    assert.deepEqual(summary, ["Je regarde"]);
    assert.equal(res.text, "Bonjour");
    assert.deepEqual(res.toolCalls, [{ id: "call_a", name: "get_mission_metrics", arguments: '{"days":30}' }]);
    assert.equal((res.providerItems as Array<{ id: string }>)[0].id, "rs_1");
    assert.deepEqual(res.usage, { inputTokens: 2000, cachedInputTokens: 1500, outputTokens: 120, reasoningTokens: 100, totalTokens: 2120 });
    assert.equal(res.model, "gpt-5.5-2026-10");
    assert.equal(res.finish, "tool_calls");
});

test("responses stream: no terminal event is a truncated stream; incomplete is reported as such", async () => {
    await assert.rejects(
        readResponsesStream(sse(['data: {"type":"response.output_text.delta","delta":"Bon"}\n\n']), "gpt-5.5"),
        (e: unknown) => e instanceof ProviderError && e.code === "STREAM_TRUNCATED" && e.retryable,
    );
    const res = await readResponsesStream(
        sse([
            'data: {"type":"response.output_text.delta","delta":"Bon"}\n\n',
            'data: {"type":"response.incomplete","response":{"status":"incomplete","incomplete_details":{"reason":"max_output_tokens"},"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
        ]),
        "gpt-5.5",
    );
    assert.equal(res.finish, "incomplete");
    assert.equal(res.text, "Bon");
    await assert.rejects(
        readResponsesStream(sse(['data: {"type":"error","code":"invalid_request","message":"bad tool schema"}\n\n']), "gpt-5.5"),
        (e: unknown) => e instanceof ProviderError && e.kind === "bad_request" && !e.retryable,
    );
});

// -- cost ----------------------------------------------------------------------

test("cost bills cached input at the cached price and keeps the legacy signature", () => {
    const full = calculateTokenCost({ inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 1_000_000 }, "gpt-5.5");
    assert.equal(full.costUsd, 5);
    const half = calculateTokenCost({ inputTokens: 1_000_000, cachedInputTokens: 500_000, outputTokens: 0, reasoningTokens: 0, totalTokens: 1_000_000 }, "gpt-5.5");
    assert.equal(half.costUsd, 2.75);
    assert.equal(calculateTokenCost(1_000_000, 1_000_000, "gpt-4o-mini").costUsd, 0.75);
    assert.equal(calculateTokenCost({ promptTokens: 1_000_000, completionTokens: 1_000_000 }, "gpt-4o-mini").costUsd, 0.75);
});
