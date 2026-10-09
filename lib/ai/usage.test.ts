import test from "node:test";
import assert from "node:assert/strict";
import { calculateTokenCost, EUR_USD_RATE, OPENAI_PRICING } from "./usage";
import { toOpenAITools } from "./tools/registry";
import { AssistantContext } from "./tools/types";

test("calculateTokenCost calculates correct USD and EUR for gpt-4o-mini", () => {
    const promptTokens = 1_000_000;
    const completionTokens = 1_000_000;

    const result = calculateTokenCost(promptTokens, completionTokens, "gpt-4o-mini");
    const expectedUsd = 0.15 + 0.60; // 0.75 USD
    const expectedEur = expectedUsd * EUR_USD_RATE; // 0.69 EUR

    assert.equal(result.costUsd, 0.75);
    assert.equal(result.costEur, 0.69);
});

test("calculateTokenCost scales correctly for smaller token amounts", () => {
    // 10,000 prompt tokens and 2,000 completion tokens
    const promptTokens = 10_000;
    const completionTokens = 2_000;

    const result = calculateTokenCost(promptTokens, completionTokens, "gpt-4o-mini");
    const expectedUsd = (10_000 * 0.15) / 1_000_000 + (2_000 * 0.60) / 1_000_000; // 0.0015 + 0.0012 = 0.0027
    const expectedEur = expectedUsd * EUR_USD_RATE;

    assert.equal(result.costUsd, 0.0027);
    assert.equal(result.costEur, Math.round(expectedEur * 1_000_000) / 1_000_000);
});

test("toOpenAITools generates valid OpenAI function specs", () => {
    const fakeCtx: AssistantContext = {
        userId: "user-1",
        userName: "Test Manager",
        role: "MANAGER",
        permissions: [],
        isActive: true,
        project: null,
        resolvedAt: new Date(),
    };

    const tools = toOpenAITools(fakeCtx);
    assert.ok(tools.length > 0);

    for (const tool of tools) {
        assert.equal(tool.type, "function");
        assert.ok(tool.function.name);
        assert.ok(tool.function.description);
        assert.ok(tool.function.parameters);
        assert.equal(typeof tool.function.parameters, "object");
    }
});
