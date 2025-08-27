import {
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { getMaxOutputTokens } from './affordability_utils.ts';
import type { AiModelExtendedConfig, ILogger, LogMetadata } from '../types.ts';

// Mock Logger for Deno
// deno-lint-ignore no-explicit-any
let mockLoggerErrorCalls: { message: string | Error; details?: any }[] = [];
const mockLogger: ILogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: (message: string | Error, details?: LogMetadata) => {
    mockLoggerErrorCalls.push({ message, details });
  },
};

const beforeEachStep = () => {
    mockLoggerErrorCalls = [];
};

Deno.test('getMaxOutputTokens', async (t) => {
  const modelConfig: AiModelExtendedConfig = {
    api_identifier: 'test-model',
    input_token_cost_rate: 1,
    output_token_cost_rate: 2,
    hard_cap_output_tokens: 4096,
    tokenization_strategy: {
        type: 'tiktoken',
        tiktoken_encoding_name: 'cl100k_base',
    },
  };

  await t.step('should calculate max output tokens correctly with sufficient balance', () => {
    beforeEachStep();
    const user_balance_tokens = 1000;
    const prompt_input_tokens = 100;
    const result = getMaxOutputTokens(user_balance_tokens, prompt_input_tokens, modelConfig, mockLogger);
    // prompt_cost = 100 * 1 = 100
    // budget_for_output = 1000 - 100 = 900
    // max_spendable_output_tokens = 900 / 2 = 450
    // twenty_percent_balance_as_output_tokens = floor((0.20 * 900) / 2) = 90
    // dynamic_hard_cap = min(90, 4096) = 90
    // result = min(450, 90) = 90
    assertEquals(result, 400);
  });

  await t.step('should return -1 when balance is insufficient for the prompt', () => {
    beforeEachStep();
    const user_balance_tokens = 50;
    const prompt_input_tokens = 100;
    const result = getMaxOutputTokens(user_balance_tokens, prompt_input_tokens, modelConfig, mockLogger);
    // effective_balance (50) < prompt_cost (100)
    // returns -1
    assertEquals(result, -1);
  });

  await t.step('should return -1 when balance is zero and prompt has cost', () => {
    beforeEachStep();
    const user_balance_tokens = 0;
    const prompt_input_tokens = 100;
    const result = getMaxOutputTokens(user_balance_tokens, prompt_input_tokens, modelConfig, mockLogger);
    // effective_balance (0) < prompt_cost (100)
    // returns -1
    assertEquals(result, -1);
  });

  await t.step('should allow deficit spending correctly', () => {
    beforeEachStep();
    const user_balance_tokens = 50;
    const prompt_input_tokens = 100;
    const deficit_tokens_allowed = 50;
    const result = getMaxOutputTokens(user_balance_tokens, prompt_input_tokens, modelConfig, mockLogger, deficit_tokens_allowed);
    // effective_balance = 50 + 50 = 100
    // prompt_cost = 100 * 1 = 100
    // budget_for_output = 100 - 100 = 0
    // returns 0
    assertEquals(result, 0);
  });

  await t.step('should allow deficit spending to generate output', () => {
    beforeEachStep();
    const user_balance_tokens = 50;
    const prompt_input_tokens = 100;
    const deficit_tokens_allowed = 150;
    const result = getMaxOutputTokens(user_balance_tokens, prompt_input_tokens, modelConfig, mockLogger, deficit_tokens_allowed);
    // effective_balance = 50 + 150 = 200
    // prompt_cost = 100 * 1 = 100
    // budget_for_output = 200 - 100 = 100
    // max_spendable_output_tokens = 100 / 2 = 50
    // twenty_percent_balance_as_output_tokens = floor((0.20 * 100) / 2) = 10
    // dynamic_hard_cap = min(10, 4096) = 10
    // result = min(50, 10) = 10
    assertEquals(result, 20);
  });

  await t.step('should be capped by provider hard cap', () => {
    beforeEachStep();
    const user_balance_tokens = 100000;
    const prompt_input_tokens = 100;
    const limitedModelConfig = { ...modelConfig, hard_cap_output_tokens: 50 };
    const result = getMaxOutputTokens(user_balance_tokens, prompt_input_tokens, limitedModelConfig, mockLogger);
    // prompt_cost = 100 * 1 = 100
    // budget_for_output = 100000 - 100 = 99900
    // max_spendable_output_tokens = 99900 / 2 = 49950
    // twenty_percent_balance_as_output_tokens = floor((0.20 * 99900) / 2) = 9990
    // dynamic_hard_cap = min(9990, 50) = 50
    // result = min(49950, 50) = 50
    assertEquals(result, 50);
  });

  await t.step('should handle no provider hard cap', () => {
    beforeEachStep();
    const user_balance_tokens = 1000;
    const prompt_input_tokens = 100;
    const unlimitedModelConfig: AiModelExtendedConfig = {
        ...modelConfig,
        hard_cap_output_tokens: undefined,
    };
    const result = getMaxOutputTokens(user_balance_tokens, prompt_input_tokens, unlimitedModelConfig, mockLogger);
    // budget_for_output = 900
    // max_spendable_output_tokens = 450
    // twenty_percent_balance_as_output_tokens = 90
    // provider_hard_cap = Infinity
    // dynamic_hard_cap = min(90, Infinity) = 90
    // result = min(450, 90) = 90
    assertEquals(result, 400);
  });

  await t.step('should throw error for invalid input_token_cost_rate', () => {
    beforeEachStep();
    const invalidModelConfig = { ...modelConfig, input_token_cost_rate: -1 };
    assertThrows(() => {
        getMaxOutputTokens(1000, 100, invalidModelConfig, mockLogger);
    }, Error, 'Cannot calculate max output tokens: Invalid input token cost rate.');
    assertEquals(mockLoggerErrorCalls.length, 1);
  });

  await t.step('should throw error for invalid output_token_cost_rate', () => {
    beforeEachStep();
    const invalidModelConfig = { ...modelConfig, output_token_cost_rate: 0 };
    assertThrows(() => {
        getMaxOutputTokens(1000, 100, invalidModelConfig, mockLogger);
    }, Error, 'Cannot calculate max output tokens: Invalid output token cost rate.');
    assertEquals(mockLoggerErrorCalls.length, 1);
  });

  await t.step('should work with floating point rates', () => {
    beforeEachStep();
    const user_balance_tokens = 1000;
    const prompt_input_tokens = 100;
    const floatModelConfig = { 
        ...modelConfig, 
        input_token_cost_rate: 0.5,
        output_token_cost_rate: 1.5
    };
    const result = getMaxOutputTokens(user_balance_tokens, prompt_input_tokens, floatModelConfig, mockLogger);
    // prompt_cost = 100 * 0.5 = 50
    // budget_for_output = 1000 - 50 = 950
    // max_spendable_output_tokens = floor(950 / 1.5) = 633
    // twenty_percent_balance_as_output_tokens = floor((0.20 * 950) / 1.5) = 126
    // dynamic_hard_cap = min(126, 4096) = 126
    // result = min(633, 126) = 126
    assertEquals(result, 533);
  });

  await t.step('should return 0 for negative balance even with deficit allowance due to dynamic cap', () => {
    beforeEachStep();
    const user_balance_tokens = -100;
    const prompt_input_tokens = 10;
    const deficit_tokens_allowed = 200; // Allows spending
    const result = getMaxOutputTokens(user_balance_tokens, prompt_input_tokens, modelConfig, mockLogger, deficit_tokens_allowed);
    // effective_balance = -100 + 200 = 100
    // prompt_cost = 10 * 1 = 10
    // budget_for_output = 100 - 10 = 90
    // max_spendable_output_tokens = 90 / 2 = 45
    // twenty_percent_balance_as_output_tokens = floor((0.20 * 90) / 2) = 9
    // dynamic_hard_cap = min(9, 4096) = 9
    // non_negative_dynamic_hard_cap = max(0, 9) = 9
    // result = min(45, 9) = 9
    assertEquals(result, 0);
  });

  await t.step('should return 0 if provider hard cap is 0', () => {
    beforeEachStep();
    const user_balance_tokens = 1000;
    const prompt_input_tokens = 100;
    const zeroCapModelConfig = { ...modelConfig, hard_cap_output_tokens: 0 };
    const result = getMaxOutputTokens(user_balance_tokens, prompt_input_tokens, zeroCapModelConfig, mockLogger);
    // budget_for_output = 900
    // twenty_percent_balance_as_output_tokens = 90
    // dynamic_hard_cap = min(90, 0) = 0
    // result = min(450, 0) = 0
    assertEquals(result, 0);
  });

  await t.step('should be limited by the model context window', () => {
    beforeEachStep();
    const user_balance_tokens = 100000; // High balance, not a limiting factor
    const prompt_input_tokens = 3000;
    const modelWithContextWindow: AiModelExtendedConfig = {
      ...modelConfig,
      context_window_tokens: 4096, // Standard context window
      hard_cap_output_tokens: 8192, // High hard cap, not a limiting factor
    };
    const result = getMaxOutputTokens(user_balance_tokens, prompt_input_tokens, modelWithContextWindow, mockLogger);
    
    // prompt_cost = 3000 * 1 = 3000
    // budget_for_output = 100000 - 3000 = 97000
    // max_spendable_output_tokens = floor(97000 / 2) = 48500
    
    // twenty_percent_balance_as_output_tokens = floor((0.20 * 97000) / 2) = 9700
    // absolute_provider_cap = 8192
    // dynamic_hard_cap = min(9700, 8192) = 8192

    // max_affordable = min(48500, 8192) = 8192

    // available_context = 4096 - 3000 = 1096
    
    // The final result must be the minimum of what's affordable and what fits in the context window.
    // result = min(8192, 1096) = 1096
    assertEquals(result, 1096);
  });

  await t.step('should be limited by spendable tokens when prompt is large', () => {
    beforeEachStep();
    const user_balance_tokens = 1000;
    const prompt_input_tokens = 900;
    const result = getMaxOutputTokens(user_balance_tokens, prompt_input_tokens, modelConfig, mockLogger);
    // prompt_cost = 900 * 1 = 900
    // budget_for_output = 1000 - 900 = 100
    // max_spendable_output_tokens = 100 / 2 = 50
    // twenty_percent_balance_as_output_tokens = floor((0.20 * 100) / 2) = 10
    // dynamic_hard_cap = min(10, 4096) = 10
    // result = min(50, 10) = 10
    assertEquals(result, 50);
  });

  // --- SSOT RED tests (spend fraction = 0.80) ---
  await t.step('budget cap uses 80% of remaining balance (no provider caps)', () => {
    beforeEachStep();
    const user_balance_tokens = 1000;
    const prompt_input_tokens = 100;
    const cfg: AiModelExtendedConfig = {
      ...modelConfig,
      hard_cap_output_tokens: undefined,
      // no provider_max_output_tokens
    };
    const result = getMaxOutputTokens(user_balance_tokens, prompt_input_tokens, cfg, mockLogger);
    // SSOT target expectation (RED):
    // prompt_cost = 100 * 1 = 100
    // remaining = 1000 - 100 = 900
    // spendable_budget = min(balance * 0.80 = 800, remaining = 900) = 800
    // output_tokens = floor(800 / output_rate(2)) = 400
    // Expected under SSOT: 400 (current implementation uses 20% and should FAIL this RED test)
    assertEquals(result, 400);
  });

  await t.step('user cap < provider cap → user cap wins', () => {
    beforeEachStep();
    const user_balance_tokens = 1000;
    const prompt_input_tokens = 100;
    const cfg: AiModelExtendedConfig = {
      ...modelConfig,
      hard_cap_output_tokens: 10000,
      provider_max_output_tokens: 10000,
    };
    const result = getMaxOutputTokens(user_balance_tokens, prompt_input_tokens, cfg, mockLogger);
    // SSOT user cap (as above) expected: 400; both provider caps are higher → user cap should win
    assertEquals(result, 400);
  });

  await t.step('[SSOT] user cap > provider cap → provider cap wins', () => {
    beforeEachStep();
    const user_balance_tokens = 1_000_000; // very large
    const prompt_input_tokens = 10;
    const cfg: AiModelExtendedConfig = {
      ...modelConfig,
      hard_cap_output_tokens: undefined,
      provider_max_output_tokens: 50,
    };
    const result = getMaxOutputTokens(user_balance_tokens, prompt_input_tokens, cfg, mockLogger);
    // Provider cap 50 should dominate
    assertEquals(result, 50);
  });
});
