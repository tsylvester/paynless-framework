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
    assertEquals(result, 90);
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
    assertEquals(result, 10);
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
    assertEquals(result, 90);
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
    assertEquals(result, 126);
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
    assertEquals(result, 9);
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
    assertEquals(result, 10);
  });
});
