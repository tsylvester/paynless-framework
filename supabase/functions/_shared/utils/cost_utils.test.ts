import {
  assertEquals,
  assertExists,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts"; // Using a pinned version for stability
import { calculateActualChatCost } from "./cost_utils.ts";
import type {
  AiModelExtendedConfig,
  TokenUsage,
  ILogger,
  TiktokenEncoding,
  LogMetadata
} from "../types.ts";
// Import the default rate constants for use in test assertions
import { DEFAULT_INPUT_TOKEN_COST_RATE, DEFAULT_OUTPUT_TOKEN_COST_RATE } from '../config/token_cost_defaults.ts';
import { assertSpyCall, assertSpyCalls, stub } from "https://deno.land/std@0.224.0/testing/mock.ts";

// Mock Logger for Deno
let mockLoggerWarnCalls: { message: string | Error; details?: unknown }[] = [];
const mockLogger: ILogger = {
  debug: (message: string | Error, details?: LogMetadata) => {
    /* console.debug(message, details); */
  },
  info: (message: string | Error, details?: LogMetadata) => {
    /* console.info(message, details); */
  },
  warn: (message: string | Error, details?: LogMetadata) => {
    mockLoggerWarnCalls.push({ message, details });
    /* console.warn(message, details); */
  },
  error: (message: string | Error, details?: LogMetadata) => {
    mockLoggerWarnCalls.push({ message, details }); // Also track errors for tests if needed, or have separate array
    /* console.error(message, details); */
  },
};

const defaultEncoding: TiktokenEncoding = "cl100k_base";

// Helper function to reset mocks before each test step
const beforeEachStep = () => {
  mockLoggerWarnCalls = [];
};

Deno.test("calculateActualChatCost", async (t) => {
  await t.step(
    "should calculate cost correctly with valid inputs and integer rates",
    () => {
      beforeEachStep();
      const tokenUsage: TokenUsage = {
        prompt_tokens: 100,
        completion_tokens: 200,
        total_tokens: 300,
      };
      const modelConfig: AiModelExtendedConfig = {
        api_identifier: 'test-api-id-integer-rates',
        input_token_cost_rate: 1,
        output_token_cost_rate: 1,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: defaultEncoding,
        },
      };
      assertEquals(calculateActualChatCost(tokenUsage, modelConfig, mockLogger), 300);
      assertEquals(mockLoggerWarnCalls.length, 0);
    }
  );

  await t.step(
    "should calculate cost correctly with fractional rates and apply Math.ceil",
    () => {
      beforeEachStep();
      const tokenUsage: TokenUsage = {
        prompt_tokens: 10,
        completion_tokens: 10,
        total_tokens: 20,
      };
      const modelConfig: AiModelExtendedConfig = {
        api_identifier: 'test-api-id-fractional-rates',
        input_token_cost_rate: 0.5,
        output_token_cost_rate: 1.5,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: defaultEncoding,
        },
      };
      assertEquals(calculateActualChatCost(tokenUsage, modelConfig, mockLogger), 20);
      assertEquals(mockLoggerWarnCalls.length, 0);
    }
  );

  await t.step(
    "should calculate cost and round up with Math.ceil for fractional results",
    () => {
      beforeEachStep();
      const tokenUsage: TokenUsage = {
        prompt_tokens: 7,
        completion_tokens: 3,
        total_tokens: 10,
      };
      const modelConfig: AiModelExtendedConfig = {
        api_identifier: 'test-api-id-ceil-rounding',
        input_token_cost_rate: 0.3,
        output_token_cost_rate: 0.4,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: defaultEncoding,
        },
      };
      assertEquals(calculateActualChatCost(tokenUsage, modelConfig, mockLogger), 4);
      assertEquals(mockLoggerWarnCalls.length, 0);
    }
  );

  // --- Edge Cases for tokenUsage ---
  await t.step("should return 0 if tokenUsage is null", () => {
    beforeEachStep();
    const modelConfig: AiModelExtendedConfig = {
      api_identifier: 'test-api-id-null-usage',
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      tokenization_strategy: {
        type: "tiktoken",
        tiktoken_encoding_name: defaultEncoding,
      },
    };
    assertEquals(calculateActualChatCost(null, modelConfig, mockLogger), 0);
    assertEquals(mockLoggerWarnCalls.length, 1);
    assertStringIncludes(
      mockLoggerWarnCalls[0].message as string, // Cast because we expect a string here
      "TokenUsage object is missing or invalid"
    );
  });

  await t.step("should return 0 if tokenUsage is undefined", () => {
    beforeEachStep();
    const modelConfig: AiModelExtendedConfig = {
      api_identifier: 'test-api-id-undefined-usage',
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      tokenization_strategy: {
        type: "tiktoken",
        tiktoken_encoding_name: defaultEncoding,
      },
    };
    assertEquals(calculateActualChatCost(undefined, modelConfig, mockLogger), 0);
    assertEquals(mockLoggerWarnCalls.length, 1);
    assertStringIncludes(
      mockLoggerWarnCalls[0].message as string, // Cast because we expect a string here
      "TokenUsage object is missing or invalid"
    );
  });

  await t.step("should default prompt_tokens to 0 if missing", () => {
    beforeEachStep();
    const tokenUsage: Partial<TokenUsage> & {
      completion_tokens: number;
      total_tokens: number;
    } = { completion_tokens: 100, total_tokens: 100 };
    const modelConfig: AiModelExtendedConfig = {
      api_identifier: 'test-api-id-missing-prompt',
      input_token_cost_rate: 1,
      output_token_cost_rate: 2,
      tokenization_strategy: {
        type: "tiktoken",
        tiktoken_encoding_name: defaultEncoding,
      },
    };
    assertEquals(
      calculateActualChatCost(tokenUsage as TokenUsage, modelConfig, mockLogger),
      200
    );
    assertEquals(mockLoggerWarnCalls.length, 0);
  });

  await t.step("should default completion_tokens to 0 if missing", () => {
    beforeEachStep();
    const tokenUsage: Partial<TokenUsage> & {
      prompt_tokens: number;
      total_tokens: number;
    } = { prompt_tokens: 100, total_tokens: 100 };
    const modelConfig: AiModelExtendedConfig = {
      api_identifier: 'test-api-id-missing-completion',
      input_token_cost_rate: 1,
      output_token_cost_rate: 2,
      tokenization_strategy: {
        type: "tiktoken",
        tiktoken_encoding_name: defaultEncoding,
      },
    };
    assertEquals(
      calculateActualChatCost(tokenUsage as TokenUsage, modelConfig, mockLogger),
      100
    );
    assertEquals(mockLoggerWarnCalls.length, 0);
  });

  await t.step(
    "should handle zero prompt/completion tokens but non-zero total_tokens, logging warning",
    () => {
      beforeEachStep();
      const tokenUsage: TokenUsage = {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 100,
      };
      const modelConfig: AiModelExtendedConfig = {
        api_identifier: 'test-api-id-zero-tokens-total-present',
        input_token_cost_rate: 2,
        output_token_cost_rate: 3,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: defaultEncoding,
        },
      };
      assertEquals(calculateActualChatCost(tokenUsage, modelConfig, mockLogger), 0);
      assertEquals(mockLoggerWarnCalls.length, 1);
      assertStringIncludes(
        mockLoggerWarnCalls[0].message as string, // Cast because we expect a string here
        "prompt_tokens and completion_tokens are zero, but total_tokens is present"
      );
    }
  );

  // --- Edge Cases for modelConfig ---
  await t.step("should return 0 if modelConfig is null", () => {
    beforeEachStep();
    const tokenUsage: TokenUsage = {
      prompt_tokens: 10,
      completion_tokens: 10,
      total_tokens: 20,
    };
    assertEquals(calculateActualChatCost(tokenUsage, null, mockLogger), 0);
    assertEquals(mockLoggerWarnCalls.length, 1);
    assertStringIncludes(
      mockLoggerWarnCalls[0].message as string, // Cast because we expect a string here
      "ModelConfig object is missing or invalid"
    );
  });

  await t.step("should return 0 if modelConfig is undefined", () => {
    beforeEachStep();
    const tokenUsage: TokenUsage = {
      prompt_tokens: 10,
      completion_tokens: 10,
      total_tokens: 20,
    };
    assertEquals(calculateActualChatCost(tokenUsage, undefined, mockLogger), 0);
    assertEquals(mockLoggerWarnCalls.length, 1);
    assertStringIncludes(
      mockLoggerWarnCalls[0].message as string, // Cast because we expect a string here
      "ModelConfig object is missing or invalid"
    );
  });

  await t.step(
    "should default input_token_cost_rate to DEFAULT_INPUT_TOKEN_COST_RATE and log warning if missing",
    () => {
      beforeEachStep();
      const tokenUsage: TokenUsage = {
        prompt_tokens: 100,
        completion_tokens: 100,
        total_tokens: 200,
      };
      const modelConfigWithoutInputRate: Partial<AiModelExtendedConfig> = {
        api_identifier: 'test-api-id-no-input-rate',
        output_token_cost_rate: 2,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: defaultEncoding,
        },
      };
      assertEquals(
        calculateActualChatCost(
          tokenUsage,
          modelConfigWithoutInputRate as AiModelExtendedConfig,
          mockLogger
        ),
        201
      );
      assertEquals(mockLoggerWarnCalls.length, 1);
      assertStringIncludes(
        mockLoggerWarnCalls[0].message as string,
        `[calculateActualChatCost] Invalid or missing input_token_cost_rate for model (context: ${defaultEncoding}). Defaulting to ${DEFAULT_INPUT_TOKEN_COST_RATE}.`
      );
      assertExists(mockLoggerWarnCalls[0].details);
      assertEquals((mockLoggerWarnCalls[0].details as {originalRate: unknown}).originalRate, undefined);
    }
  );

  await t.step(
    "should default output_token_cost_rate to DEFAULT_OUTPUT_TOKEN_COST_RATE and log warning if missing",
    () => {
      beforeEachStep();
      const tokenUsage: TokenUsage = {
        prompt_tokens: 100,
        completion_tokens: 100,
        total_tokens: 200,
      };
      const modelConfigWithoutOutputRate: Partial<AiModelExtendedConfig> = {
        api_identifier: 'test-api-id-no-output-rate',
        input_token_cost_rate: 2,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: defaultEncoding,
        },
      };
      assertEquals(
        calculateActualChatCost(
          tokenUsage,
          modelConfigWithoutOutputRate as AiModelExtendedConfig,
          mockLogger
        ),
        201
      );
      assertEquals(mockLoggerWarnCalls.length, 1);
      assertStringIncludes(
        mockLoggerWarnCalls[0].message as string,
        `[calculateActualChatCost] Invalid or missing output_token_cost_rate for model (context: ${defaultEncoding}). Defaulting to ${DEFAULT_OUTPUT_TOKEN_COST_RATE}.`
      );
      assertExists(mockLoggerWarnCalls[0].details);
      assertEquals((mockLoggerWarnCalls[0].details as {originalRate: unknown}).originalRate, undefined);
    }
  );

  await t.step(
    "should default input_token_cost_rate to DEFAULT_INPUT_TOKEN_COST_RATE and log warning if negative",
    () => {
      beforeEachStep();
      const tokenUsage: TokenUsage = {
        prompt_tokens: 100,
        completion_tokens: 100,
        total_tokens: 200,
      };
      const modelConfigWithNegativeInputRate: AiModelExtendedConfig = {
        api_identifier: 'test-api-id-negative-input',
        input_token_cost_rate: -1,
        output_token_cost_rate: 1,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: defaultEncoding,
        },
      };
      assertEquals(calculateActualChatCost(tokenUsage, modelConfigWithNegativeInputRate, mockLogger), 101);
      assertEquals(mockLoggerWarnCalls.length, 1);
      assertStringIncludes(
        mockLoggerWarnCalls[0].message as string,
        `[calculateActualChatCost] Invalid or missing input_token_cost_rate for model (context: ${defaultEncoding}). Defaulting to ${DEFAULT_INPUT_TOKEN_COST_RATE}.`
      );
      assertEquals((mockLoggerWarnCalls[0].details as {originalRate: unknown}).originalRate, -1);
    }
  );

  await t.step(
    "should default output_token_cost_rate to DEFAULT_OUTPUT_TOKEN_COST_RATE and log warning if NaN",
    () => {
      beforeEachStep();
      const tokenUsage: TokenUsage = {
        prompt_tokens: 100,
        completion_tokens: 100,
        total_tokens: 200,
      };
      const modelConfigWithNaNRate: AiModelExtendedConfig = {
        api_identifier: 'test-api-id-nan-rate',
        input_token_cost_rate: 1,
        output_token_cost_rate: NaN,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: defaultEncoding,
        },
      };
      assertEquals(calculateActualChatCost(tokenUsage, modelConfigWithNaNRate, mockLogger), 101);
      assertEquals(mockLoggerWarnCalls.length, 1);
      assertStringIncludes(
        mockLoggerWarnCalls[0].message as string,
        `[calculateActualChatCost] Invalid or missing output_token_cost_rate for model (context: ${defaultEncoding}). Defaulting to ${DEFAULT_OUTPUT_TOKEN_COST_RATE}.`
      );
      assertEquals((mockLoggerWarnCalls[0].details as {originalRate: unknown}).originalRate, NaN);
    }
  );

  // --- Zero/Negative Cost Results ---
  await t.step("should return 0 if calculated cost is 0", () => {
    beforeEachStep();
    const tokenUsage: TokenUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };
    const modelConfig: AiModelExtendedConfig = {
      api_identifier: 'test-api-id-zero-tokens',
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      tokenization_strategy: {
        type: "tiktoken",
        tiktoken_encoding_name: defaultEncoding,
      },
    };
    assertEquals(calculateActualChatCost(tokenUsage, modelConfig, mockLogger), 0);
    assertEquals(mockLoggerWarnCalls.length, 0);
  });

  await t.step(
    "should return correct cost and NOT log negative cost warning if negative rates are defaulted",
    () => {
      beforeEachStep();
      const tokenUsage: TokenUsage = {
        prompt_tokens: 10,
        completion_tokens: 10,
        total_tokens: 20,
      };
      const modelConfigWithNegativeRates: AiModelExtendedConfig = {
        api_identifier: 'test-api-id-negative-rates',
        input_token_cost_rate: -0.5,
        output_token_cost_rate: -0.5,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: defaultEncoding,
        },
      };
      assertEquals(
        calculateActualChatCost(tokenUsage, modelConfigWithNegativeRates, mockLogger),
        1
      );
      assertEquals(mockLoggerWarnCalls.length, 2);
      assertStringIncludes(
        mockLoggerWarnCalls[0].message as string,
        `[calculateActualChatCost] Invalid or missing input_token_cost_rate for model (context: ${defaultEncoding}). Defaulting to ${DEFAULT_INPUT_TOKEN_COST_RATE}.`
      );
      assertEquals((mockLoggerWarnCalls[0].details as {originalRate: unknown}).originalRate, -0.5);
      assertStringIncludes(
        mockLoggerWarnCalls[1].message as string,
        `[calculateActualChatCost] Invalid or missing output_token_cost_rate for model (context: ${defaultEncoding}). Defaulting to ${DEFAULT_OUTPUT_TOKEN_COST_RATE}.`
      );
      assertEquals((mockLoggerWarnCalls[1].details as {originalRate: unknown}).originalRate, -0.5);

      const negativeCostWarning = mockLoggerWarnCalls.find(call => (call.message as string).includes("Calculated cost is negative"));
      assertEquals(negativeCostWarning, undefined, "Negative cost warning should not be present as cost itself is not negative after defaults");
    }
  );

  // --- Logger Interaction ---
  await t.step(
    "should run without a logger provided and not throw errors",
    () => {
      beforeEachStep();
      const tokenUsage: TokenUsage = {
        prompt_tokens: 10,
        completion_tokens: 10,
        total_tokens: 20,
      };
      const modelConfig: AiModelExtendedConfig = {
        api_identifier: 'test-api-id-no-logger',
        input_token_cost_rate: 1,
        output_token_cost_rate: 1,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: defaultEncoding,
        },
      };
      let result = 0;
      try {
        result = calculateActualChatCost(tokenUsage, modelConfig, undefined);
      } catch (e) {
        assertEquals(true, false, `Should not throw: ${e}`);
      }
      assertEquals(result, 20);
    }
  );

  await t.step(
    "should not log warnings if all inputs are valid and rates are present",
    () => {
      beforeEachStep();
      const tokenUsage: TokenUsage = {
        prompt_tokens: 10,
        completion_tokens: 10,
        total_tokens: 20,
      };
      const modelConfig: AiModelExtendedConfig = {
        api_identifier: 'test-api-id-no-warnings',
        input_token_cost_rate: 1,
        output_token_cost_rate: 1,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: defaultEncoding,
        },
      };
      calculateActualChatCost(tokenUsage, modelConfig, mockLogger);
      assertEquals(mockLoggerWarnCalls.length, 0);
    }
  );

  await t.step(
    "should use imported default rates when model-specific rates are null",
    () => {
      beforeEachStep();
      const tokenUsage: TokenUsage = {
        prompt_tokens: 100,
        completion_tokens: 100,
        total_tokens: 200,
      };
      const modelConfigWithNullRates: AiModelExtendedConfig = {
        api_identifier: 'test-api-id-null-model-rates',
        input_token_cost_rate: null,
        output_token_cost_rate: null,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: defaultEncoding,
        },
      };

      const expectedCost = 1;

      assertEquals(
        calculateActualChatCost(
          tokenUsage,
          modelConfigWithNullRates,
          mockLogger
        ),
        expectedCost
      );

      assertEquals(mockLoggerWarnCalls.length, 2);
      assertStringIncludes(
        mockLoggerWarnCalls[0].message as string,
        `[calculateActualChatCost] Invalid or missing input_token_cost_rate for model (context: ${defaultEncoding}). Defaulting to 0.001.`
      );
      assertEquals((mockLoggerWarnCalls[0].details as {originalRate: unknown}).originalRate, null);

      assertStringIncludes(
        mockLoggerWarnCalls[1].message as string,
        `[calculateActualChatCost] Invalid or missing output_token_cost_rate for model (context: ${defaultEncoding}). Defaulting to 0.002.`
      );
      assertEquals((mockLoggerWarnCalls[1].details as {originalRate: unknown}).originalRate, null);
    }
  );

  await t.step(
    "should not throw if no logger is provided AND a warning would have been issued",
    () => {
      beforeEachStep();
      const tokenUsage: TokenUsage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };
      
      // Scenario where no warning is generated
      const modelConfigWithoutLoggerRequirement: AiModelExtendedConfig = {
        api_identifier: 'test-api-id-no-logger-needed',
        input_token_cost_rate: 1,
        output_token_cost_rate: 1,
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: defaultEncoding },
      };
      
      let costWithoutWarning = 0;
      try {
        costWithoutWarning = calculateActualChatCost(tokenUsage, modelConfigWithoutLoggerRequirement, undefined); // No logger
      } catch (e) {
        throw new Error(`Test failed: Should not throw when no logger and no warning. Error: ${(e as Error).message}`);
      }
      assertEquals(costWithoutWarning, 2); // (1*1) + (1*1) = 2

      // Scenario where a warning would be generated
      const modelConfigTriggeringWarning: AiModelExtendedConfig = {
        api_identifier: 'test-api-id-logger-needed',
        input_token_cost_rate: -1, // Invalid rate to trigger warning, defaults to 0.001
        output_token_cost_rate: 1,
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: defaultEncoding },
      };
      
      let costWithWarning = 0;
      try {
        // No logger, but warning would be generated. Should not throw.
        costWithWarning = calculateActualChatCost(tokenUsage, modelConfigTriggeringWarning, undefined); 
      } catch (e) {
        // This catch block should ideally not be reached if the function doesn't throw
        throw new Error(`Test failed: Should not throw when logger is missing, even if warning is generated. Error: ${(e as Error).message}`);
      }
      // Expected: (1 * 0.001) + (1 * 1) = 0.001 + 1 = 1.001. Ceiled = 2
      assertEquals(costWithWarning, 2, "Cost should be calculated with default rate even if logger is missing for warning.");
    }
  );
});

Deno.test("calculateActualChatCost - Happy Path", () => {
    beforeEachStep();
    const tokenUsage: TokenUsage = { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 };
    const modelConfig: AiModelExtendedConfig = {
        api_identifier: 'test-api-id-happy',
        input_token_cost_rate: 1.0,
        output_token_cost_rate: 1.5,
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
    };
    const cost = calculateActualChatCost(tokenUsage, modelConfig, mockLogger);
    assertEquals(cost, Math.ceil((100 * 1.0) + (200 * 1.5)));
});

Deno.test("calculateActualChatCost - Missing Cost Rates (Applies Defaults)", () => {
    beforeEachStep();
    const tokenUsage: TokenUsage = { prompt_tokens: 50, completion_tokens: 50, total_tokens: 100 };
    const modelConfig: AiModelExtendedConfig = {
        api_identifier: 'test-api-id-missing-rates',
        input_token_cost_rate: null,
        output_token_cost_rate: null,
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
    };
    const loggerSpy = stub(mockLogger, "warn");
    try {
        const cost = calculateActualChatCost(tokenUsage, modelConfig, mockLogger);
        assertEquals(cost, Math.ceil((50 * 0.001) + (50 * 0.002)));
        assertSpyCalls(loggerSpy, 2);
        assertSpyCall(loggerSpy, 0, { args: [`[calculateActualChatCost] Invalid or missing input_token_cost_rate for model (context: cl100k_base). Defaulting to 0.001.`, { originalRate: null }] });
        assertSpyCall(loggerSpy, 1, { args: [`[calculateActualChatCost] Invalid or missing output_token_cost_rate for model (context: cl100k_base). Defaulting to 0.002.`, { originalRate: null }] });
    } finally {
        loggerSpy.restore();
    }
});

Deno.test("calculateActualChatCost - Zero Tokens", () => {
    beforeEachStep();
    const tokenUsage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const modelConfig: AiModelExtendedConfig = {
        api_identifier: 'test-api-id-zero-tokens-2',
        input_token_cost_rate: 2.0,
        output_token_cost_rate: 3.0,
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
    };
    const cost = calculateActualChatCost(tokenUsage, modelConfig, mockLogger);
    assertEquals(cost, 0);
});

Deno.test("calculateActualChatCost - Null TokenUsage", () => {
    beforeEachStep();
    const tokenUsage = null;
    const modelConfig: AiModelExtendedConfig = {
        api_identifier: 'test-api-id-null-usage-2',
        input_token_cost_rate: 1.0,
        output_token_cost_rate: 1.0,
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
    };
    const loggerSpy = stub(mockLogger, "warn");
    try {
        const cost = calculateActualChatCost(tokenUsage, modelConfig, mockLogger);
        assertEquals(cost, 0);
        assertSpyCall(loggerSpy, 0, { args: ["[calculateActualChatCost] TokenUsage object is missing or invalid. Cost calculation cannot proceed."]});
    } finally {
        loggerSpy.restore();
    }
});

Deno.test("calculateActualChatCost - Partial TokenUsage (completion_tokens missing)", () => {
    beforeEachStep();
    const tokenUsage = {
        prompt_tokens: 100,
        // completion_tokens: undefined, // Intentionally missing for test
    } as unknown as TokenUsage; 
    const modelConfig: AiModelExtendedConfig = {
        api_identifier: 'test-api-id-partial-completion-2',
        input_token_cost_rate: 1.0, // Rate for prompt tokens
        output_token_cost_rate: 2.0, // Rate for completion tokens (will be 0)
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
    };
    // No spy needed if we are not checking specific warning messages for this partial case, 
    // as the function defaults missing tokens to 0 internally.
    const cost = calculateActualChatCost(tokenUsage, modelConfig, mockLogger);
    // Expect completion_tokens to default to 0 inside calculateActualChatCost if missing.
    // Cost = (100 * 1.0) + (0 * 2.0) = 100. Ceiled = 100.
    assertEquals(cost, 100);
});

Deno.test("calculateActualChatCost - Rates as Strings", () => {
    beforeEachStep();
    const tokenUsage: TokenUsage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };
    const modelConfig = {
        api_identifier: 'test-api-id-string-rates-2',
        input_token_cost_rate: "1.5", // This will be treated as invalid and defaulted
        output_token_cost_rate: "2.5", // This will be treated as invalid and defaulted
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
    } as unknown as AiModelExtendedConfig;
    const loggerSpy = stub(mockLogger, "warn");
    try {
        const cost = calculateActualChatCost(tokenUsage, modelConfig, mockLogger);
        // cost_utils.ts does not parseFloat strings; it defaults them if typeof is not 'number'.
        // Input rate "1.5" -> defaults to 0.001
        // Output rate "2.5" -> defaults to 0.002
        // Cost = (10 * 0.001) + (20 * 0.002) = 0.01 + 0.04 = 0.05. Math.ceil(0.05) = 1.
        assertEquals(cost, 1);
        assertSpyCalls(loggerSpy, 2); // Expect two warnings, one for each string rate defaulting.
        assertSpyCall(loggerSpy, 0, { 
            args: [
                `[calculateActualChatCost] Invalid or missing input_token_cost_rate for model (context: cl100k_base). Defaulting to ${DEFAULT_INPUT_TOKEN_COST_RATE}.`,
                { originalRate: "1.5" } // The original string value is logged
            ]
        });
        assertSpyCall(loggerSpy, 1, { 
            args: [
                `[calculateActualChatCost] Invalid or missing output_token_cost_rate for model (context: cl100k_base). Defaulting to ${DEFAULT_OUTPUT_TOKEN_COST_RATE}.`,
                { originalRate: "2.5" } // The original string value is logged
            ]
        });
    } finally {
        loggerSpy.restore();
    }
});

Deno.test("calculateActualChatCost - Invalid String Rates", () => {
    beforeEachStep();
    const tokenUsage: TokenUsage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };
    const modelConfig = {
        api_identifier: 'test-api-id-invalid-strings-2',
        input_token_cost_rate: "abc",
        output_token_cost_rate: "def",
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
    } as unknown as AiModelExtendedConfig;
    const loggerSpy = stub(mockLogger, "warn");
    try {
        const cost = calculateActualChatCost(tokenUsage, modelConfig, mockLogger);
        assertEquals(cost, 1);
        assertSpyCalls(loggerSpy, 2);
        assertSpyCall(loggerSpy, 0, { args: [`[calculateActualChatCost] Invalid or missing input_token_cost_rate for model (context: cl100k_base). Defaulting to 0.001.`, { originalRate: "abc" }] });
        assertSpyCall(loggerSpy, 1, { args: [`[calculateActualChatCost] Invalid or missing output_token_cost_rate for model (context: cl100k_base). Defaulting to 0.002.`, { originalRate: "def" }] });
    } finally {
        loggerSpy.restore();
    }
});

Deno.test("calculateActualChatCost - No Logger Provided", () => {
    beforeEachStep();
    const tokenUsage: TokenUsage = { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 };
    const modelConfig: AiModelExtendedConfig = {
        api_identifier: 'test-api-id-no-logger-2',
        input_token_cost_rate: 0.5,
        output_token_cost_rate: 0.5,
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
    };
    const cost = calculateActualChatCost(tokenUsage, modelConfig, undefined); // Pass undefined for logger
    assertEquals(cost, Math.ceil((100 * 0.5) + (200 * 0.5))); // 50 + 100 = 150
});

Deno.test("calculateActualChatCost - Zero cost for free model", () => {
    beforeEachStep();
  const tokenUsage: TokenUsage = { prompt_tokens: 123, completion_tokens: 456, total_tokens: 579 };
  const modelConfig: AiModelExtendedConfig = {
    api_identifier: "free-model-id-2",
    input_token_cost_rate: 0.0,
    output_token_cost_rate: 0.0,
    tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" }, 
  };
  const cost = calculateActualChatCost(tokenUsage, modelConfig, mockLogger);
  assertEquals(cost, 0);
});

Deno.test("calculateActualChatCost - Negative cost rates", () => {
    beforeEachStep();
  const tokenUsage: TokenUsage = { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 };
  const modelConfig: AiModelExtendedConfig = {
    api_identifier: "negative-rate-model-2",
    input_token_cost_rate: -1.0,
    output_token_cost_rate: -2.0,
    tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" }, 
  };
  const loggerSpy = stub(mockLogger, "warn");
  try {
      const cost = calculateActualChatCost(tokenUsage, modelConfig, mockLogger);
      assertEquals(cost, 1);
      assertSpyCalls(loggerSpy, 2);
      assertSpyCall(loggerSpy, 0, { args: [`[calculateActualChatCost] Invalid or missing input_token_cost_rate for model (context: cl100k_base). Defaulting to 0.001.`, { originalRate: -1.0 }] });
      assertSpyCall(loggerSpy, 1, { args: [`[calculateActualChatCost] Invalid or missing output_token_cost_rate for model (context: cl100k_base). Defaulting to 0.002.`, { originalRate: -2.0 }] });
  } finally {
      loggerSpy.restore();
  }
});

Deno.test("calculateActualChatCost - Extremely Large Token Counts", () => {
    beforeEachStep();
    const tokenUsage: TokenUsage = { prompt_tokens: 1e9, completion_tokens: 2e9, total_tokens: 3e9 };
    const modelConfig: AiModelExtendedConfig = {
        api_identifier: 'large-token-model-2',
        input_token_cost_rate: 1.0,
        output_token_cost_rate: 1.5,
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
    };
    const cost = calculateActualChatCost(tokenUsage, modelConfig, mockLogger);
    const expectedCost = Math.ceil((1e9 * 1.0) + (2e9 * 1.5));
    assertEquals(cost, expectedCost);
});

// This test needs to be re-evaluated as `service_default_..._rate` is not directly used by `calculateActualChatCost`.
// The behavior is that if primary rates are null, it falls back to DEFAULT_..._RATES.
Deno.test("calculateActualChatCost - Service Default Rates (effectively DEFAULT_..._RATES)", () => {
    beforeEachStep();
    const tokenUsage: TokenUsage = { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 };
    const modelConfig: AiModelExtendedConfig = {
        api_identifier: 'service-default-model-as-default-rates',
        input_token_cost_rate: null,
        output_token_cost_rate: null,
        service_default_input_cost_rate: 0.5, 
        service_default_output_cost_rate: 0.75,
        tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" },
    };
    const loggerSpy = stub(mockLogger, "warn");
    try {
        const cost = calculateActualChatCost(tokenUsage, modelConfig, mockLogger);
        assertEquals(cost, 1);
        assertSpyCalls(loggerSpy, 2);
        assertSpyCall(loggerSpy, 0, { args: [`[calculateActualChatCost] Invalid or missing input_token_cost_rate for model (context: cl100k_base). Defaulting to 0.001.`, { originalRate: null }] });
        assertSpyCall(loggerSpy, 1, { args: [`[calculateActualChatCost] Invalid or missing output_token_cost_rate for model (context: cl100k_base). Defaulting to 0.002.`, { originalRate: null }] });
    } finally {
        loggerSpy.restore();
    }
}); 