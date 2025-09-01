import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ChatApiRequestSchema, AiModelExtendedConfigSchema } from "./zodSchema.ts";

Deno.test("ChatApiRequestSchema - accepts optional systemInstruction pass-through", () => {
  const valid = ChatApiRequestSchema.safeParse({
    message: "Hello",
    providerId: crypto.randomUUID(),
    promptId: "__none__",
    messages: [{ role: 'user', content: 'Hello' }],
    systemInstruction: "Do not alter; pass-through",
  });

  assert(valid.success, "Schema should accept optional systemInstruction");
});

// Additional schema tests below

Deno.test("ChatApiRequestSchema - accepts and preserves isDialectic flag", () => {
  const req = {
    message: "Hello",
    providerId: crypto.randomUUID(),
    promptId: "__none__",
    messages: [{ role: 'user', content: 'Hello' }],
    isDialectic: true,
  };
  const result = ChatApiRequestSchema.safeParse(req);
  assert(result.success, "Schema should accept isDialectic flag");
  if (result.success) {
    assert(result.data.isDialectic === true, "Schema should preserve isDialectic=true in parsed output");
  }
});

Deno.test("ChatApiRequestSchema - accepts optional resourceDocuments array", () => {
  const req = {
    message: "Hello",
    providerId: crypto.randomUUID(),
    promptId: "__none__",
    messages: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ],
    resourceDocuments: [
      { id: "doc-1", content: "Reference A" },
      { content: "Reference B" },
    ],
  };
  const result = ChatApiRequestSchema.safeParse(req);
  assert(result.success, "Schema should accept optional resourceDocuments array");
});

Deno.test("zodSchema.ts: AiModelExtendedConfigSchema Validation", async (t) => {

  await t.step("should successfully validate a CORRECT Anthropic config object", () => {
    // This object represents the structure that the database SHOULD contain.
    // It matches the known-good pattern from sync-ai-models/anthropic_sync.ts.
    const correctAnthropicConfig = {
      api_identifier: 'claude-3-opus-20240229',
      input_token_cost_rate: 15.00,
      output_token_cost_rate: 75.00,
      tokenization_strategy: { 
        type: 'anthropic_tokenizer', 
        model: 'claude-3-opus-20240229' // The 'model' property is present and correct.
      },
      hard_cap_output_tokens: 4096,
      context_window_tokens: 200000,
    };

    // We use safeParse which does not throw, and we assert success.
    const result = AiModelExtendedConfigSchema.safeParse(correctAnthropicConfig);
    assert(result.success, "A correctly formed Anthropic config object should pass validation.");
  });

  await t.step("should FAIL to validate an INCORRECT Anthropic config (missing 'model' property)", () => {
    // This object represents the flawed structure currently in the database.
    const incorrectAnthropicConfig = {
      api_identifier: 'claude-3-opus-20240229',
      input_token_cost_rate: 15.00,
      output_token_cost_rate: 75.00,
      tokenization_strategy: { 
        type: 'anthropic_tokenizer' // The 'model' property is MISSING.
      },
      hard_cap_output_tokens: 4096,
      context_window_tokens: 200000,
    };

    const result = AiModelExtendedConfigSchema.safeParse(incorrectAnthropicConfig);
    
    // Assert that the validation fails as expected.
    assert(!result.success, "An incorrectly formed Anthropic config should fail validation.");

    // Further assert that the failure is for the exact reason we identified.
    if (!result.success) {
      const issue = result.error.issues[0];
      assert(issue.path[0] === "tokenization_strategy", "The error should be located at the 'tokenization_strategy' path.");
      assert(issue.message === "Invalid input", "The Zod error message should indicate an invalid union, confirming our analysis.");
    }
  });

  await t.step("should FAIL to validate a config with non-positive numeric values", () => {
    // This test ensures that our `.positive()` constraints are working as intended.
    const configWithZeroCost = {
      api_identifier: 'test-model-zero-cost',
      input_token_cost_rate: 0, // Invalid: must be > 0
      output_token_cost_rate: 75.00,
      tokenization_strategy: { type: 'rough_char_count', chars_per_token_ratio: 4 },
      hard_cap_output_tokens: 4096,
      context_window_tokens: 200000,
    };

    const configWithNegativeWindow = {
        api_identifier: 'test-model-negative-window',
        input_token_cost_rate: 15.00,
        output_token_cost_rate: 75.00,
        tokenization_strategy: { type: 'rough_char_count', chars_per_token_ratio: 4 },
        hard_cap_output_tokens: 4096,
        context_window_tokens: -100, // Invalid: must be > 0
    };

    const resultZeroCost = AiModelExtendedConfigSchema.safeParse(configWithZeroCost);
    assert(!resultZeroCost.success, "Config with zero cost rate should fail validation.");
    if (!resultZeroCost.success) {
      assert(resultZeroCost.error.issues[0].path[0] === "input_token_cost_rate");
      assert(resultZeroCost.error.issues[0].message === "Number must be greater than 0");
    }
    
    const resultNegativeWindow = AiModelExtendedConfigSchema.safeParse(configWithNegativeWindow);
    assert(!resultNegativeWindow.success, "Config with negative context window should fail validation.");
    if (!resultNegativeWindow.success) {
      assert(resultNegativeWindow.error.issues[0].path[0] === "context_window_tokens");
      assert(resultNegativeWindow.error.issues[0].message === "Number must be greater than 0");
    }
  });
});
