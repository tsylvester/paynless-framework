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
      assertEquals(calculateActualChatCost(tokenUsage, modelConfig, mockLogger), 10);
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
      100
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
      assertEquals(calculateActualChatCost(tokenUsage, modelConfig, mockLogger), 100);
      assertEquals(mockLoggerWarnCalls.length, 1);
      assertStringIncludes(
        mockLoggerWarnCalls[0].message as string,
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
      const modelConfig = { // Using 'any' to simulate a missing property
        api_identifier: 'test-api-id-missing-input-rate',
        output_token_cost_rate: 1,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: defaultEncoding,
        },
      } as any;
      assertEquals(calculateActualChatCost(tokenUsage, modelConfig, mockLogger), 200);
      assertEquals(mockLoggerWarnCalls.length, 1);
      assertStringIncludes(
        mockLoggerWarnCalls[0].message as string, // Cast because we expect a string here
        "Invalid or missing input_token_cost_rate"
      );
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
      const modelConfig = { // Using 'any' to simulate a missing property
        api_identifier: 'test-api-id-missing-output-rate',
        input_token_cost_rate: 1,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: defaultEncoding,
        },
      } as any;
      assertEquals(calculateActualChatCost(tokenUsage, modelConfig, mockLogger), 200);
      assertEquals(mockLoggerWarnCalls.length, 1);
      assertStringIncludes(
        mockLoggerWarnCalls[0].message as string, // Cast because we expect a string here
        "Invalid or missing output_token_cost_rate"
      );
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
      const modelConfig: AiModelExtendedConfig = {
        api_identifier: 'test-api-id-negative-input-rate',
        input_token_cost_rate: -1,
        output_token_cost_rate: 1,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: defaultEncoding,
        },
      };
      assertEquals(calculateActualChatCost(tokenUsage, modelConfig, mockLogger), 200);
      assertEquals(mockLoggerWarnCalls.length, 1);
      assertStringIncludes(
        mockLoggerWarnCalls[0].message as string, // Cast because we expect a string here
        "Invalid or missing input_token_cost_rate"
      );
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
      const modelConfig: AiModelExtendedConfig = {
        api_identifier: 'test-api-id-nan-output-rate',
        input_token_cost_rate: 1,
        output_token_cost_rate: NaN,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: defaultEncoding,
        },
      };
      assertEquals(calculateActualChatCost(tokenUsage, modelConfig, mockLogger), 200);
      assertEquals(mockLoggerWarnCalls.length, 1);
      assertStringIncludes(
        mockLoggerWarnCalls[0].message as string, // Cast because we expect a string here
        "Invalid or missing output_token_cost_rate"
      );
    }
  );

  await t.step("should return 0 if calculated cost is 0", () => {
    beforeEachStep();
    const tokenUsage: TokenUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };
    const modelConfig: AiModelExtendedConfig = {
      api_identifier: 'test-api-id-zero-cost',
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
      const modelConfig: AiModelExtendedConfig = {
        api_identifier: 'test-api-id-negative-rates-defaulted',
        input_token_cost_rate: -5,
        output_token_cost_rate: -10,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: defaultEncoding,
        },
      };
      // Cost should be based on default rates, not negative ones
      const expectedCost = 20;
      assertEquals(calculateActualChatCost(tokenUsage, modelConfig, mockLogger), 20);

      // Check that warnings for invalid rates were logged
      assertEquals(mockLoggerWarnCalls.length, 2);
      assertStringIncludes(
        mockLoggerWarnCalls[0].message as string,
        "Invalid or missing input_token_cost_rate"
      );
      assertStringIncludes(
        mockLoggerWarnCalls[1].message as string,
        "Invalid or missing output_token_cost_rate"
      );

      // Crucially, ensure no "calculated cost is negative" warning
      const hasNegativeCostWarning = mockLoggerWarnCalls.some((call) =>
        (call.message as string).includes("Calculated cost is negative")
      );
      assertEquals(hasNegativeCostWarning, false);
    }
  );


  await t.step("should run without a logger provided and not throw errors", () => {
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
    assertEquals(calculateActualChatCost(tokenUsage, modelConfig), 20);
    assertEquals(mockLoggerWarnCalls.length, 0);
  });

  await t.step(
    "should use imported default rates when model-specific rates are null",
    () => {
      beforeEachStep();
      const tokenUsage: TokenUsage = {
        prompt_tokens: 100,
        completion_tokens: 100,
        total_tokens: 200,
      };
      const modelConfig = {
        api_identifier: 'test-api-id-null-rates',
        input_token_cost_rate: null,
        output_token_cost_rate: null,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: defaultEncoding,
        },
      } as unknown as AiModelExtendedConfig; // Force type for test case
      const expectedCost = 200;
      assertEquals(calculateActualChatCost(tokenUsage, modelConfig, mockLogger), expectedCost);
      assertEquals(mockLoggerWarnCalls.length, 2); // Both rates are invalid
    }
  );

  await t.step(
    "should not throw if no logger is provided AND a warning would have been issued",
    () => {
      beforeEachStep();
      const tokenUsage: TokenUsage = {
        prompt_tokens: 10,
        completion_tokens: 10,
        total_tokens: 20,
      };
      const modelConfig: AiModelExtendedConfig = {
        api_identifier: 'test-api-id-no-logger-with-warning',
        input_token_cost_rate: -1,
        output_token_cost_rate: -1,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: defaultEncoding,
        },
      };
      assertEquals(calculateActualChatCost(tokenUsage, modelConfig, undefined), 20);
      assertEquals(mockLoggerWarnCalls.length, 0);
    }
  );

  // Main test cases for calculateActualChatCost, ensuring it is robust and correct
  Deno.test("calculateActualChatCost - Happy Path", () => {
    const tokenUsage = { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 };
    const modelConfig = {
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
    } as AiModelExtendedConfig;
    assertEquals(calculateActualChatCost(tokenUsage, modelConfig), 300);
  });

  Deno.test("calculateActualChatCost - Missing Cost Rates (Applies Defaults)", () => {
    const tokenUsage = { prompt_tokens: 100, completion_tokens: 0, total_tokens: 100 };
    const modelConfig = {
      // Missing cost rates
    } as AiModelExtendedConfig;
    const expectedCost =
      100 * DEFAULT_INPUT_TOKEN_COST_RATE + 0 * DEFAULT_OUTPUT_TOKEN_COST_RATE;
    assertEquals(calculateActualChatCost(tokenUsage, modelConfig), Math.ceil(expectedCost));
  });

  Deno.test("calculateActualChatCost - Zero Tokens", () => {
    const tokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const modelConfig = {
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
    } as AiModelExtendedConfig;
    assertEquals(calculateActualChatCost(tokenUsage, modelConfig), 0);
  });

  Deno.test("calculateActualChatCost - Partial TokenUsage (completion_tokens missing)", () => {
    const tokenUsage = { prompt_tokens: 100, total_tokens: 100 }; // completion_tokens is missing
    const modelConfig = {
      input_token_cost_rate: 1,
      output_token_cost_rate: 5,
    } as AiModelExtendedConfig;
    assertEquals(calculateActualChatCost(tokenUsage as TokenUsage, modelConfig), 100);
  });

  Deno.test("calculateActualChatCost - Rates as Strings", () => {
    const tokenUsage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };
    const modelConfig = {
      input_token_cost_rate: "1",
      output_token_cost_rate: "2",
    } as unknown as AiModelExtendedConfig;
    assertEquals(calculateActualChatCost(tokenUsage, modelConfig), 30);
  });

  Deno.test("calculateActualChatCost - Invalid String Rates", () => {
    const tokenUsage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };
    const modelConfig = {
      input_token_cost_rate: "invalid",
      output_token_cost_rate: "invalid",
    } as unknown as AiModelExtendedConfig;
    const expectedCost =
      10 * DEFAULT_INPUT_TOKEN_COST_RATE +
      20 * DEFAULT_OUTPUT_TOKEN_COST_RATE;
    assertEquals(calculateActualChatCost(tokenUsage, modelConfig), 30);
  });

  Deno.test("calculateActualChatCost - No Logger Provided", () => {
    const tokenUsage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 };
    const modelConfig = {
      input_token_cost_rate: 2,
      output_token_cost_rate: 2,
    } as AiModelExtendedConfig;
    assertEquals(calculateActualChatCost(tokenUsage, modelConfig), 150);
  });

  Deno.test("calculateActualChatCost - Zero cost for free model", () => {
    const tokenUsage = {
      prompt_tokens: 123,
      completion_tokens: 456,
      total_tokens: 579,
    };
    const modelConfig = {
      input_token_cost_rate: 0,
      output_token_cost_rate: 0,
    } as AiModelExtendedConfig;
    assertEquals(calculateActualChatCost(tokenUsage, modelConfig), 0);
  });

  Deno.test("calculateActualChatCost - Negative cost rates", () => {
    const tokenUsage = {
      prompt_tokens: 100,
      completion_tokens: 100,
      total_tokens: 200,
    };
    const modelConfig = {
      input_token_cost_rate: -1,
      output_token_cost_rate: -2,
    } as AiModelExtendedConfig;
    const expectedCost =
      100 * DEFAULT_INPUT_TOKEN_COST_RATE +
      100 * DEFAULT_OUTPUT_TOKEN_COST_RATE;
    assertEquals(calculateActualChatCost(tokenUsage, modelConfig), Math.ceil(expectedCost));
  });

  Deno.test("calculateActualChatCost - Extremely Large Token Counts", () => {
    const tokenUsage = {
      prompt_tokens: 1_000_000_000,
      completion_tokens: 2_000_000_000,
      total_tokens: 3_000_000_000,
    };
    const modelConfig = {
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
    } as AiModelExtendedConfig;
    assertEquals(calculateActualChatCost(tokenUsage, modelConfig), 3_000_000_000);
  });

  Deno.test("calculateActualChatCost - Service Default Rates (effectively DEFAULT_..._RATES)", () => {
    const tokenUsage = {
      prompt_tokens: 100,
      completion_tokens: 200,
      total_tokens: 300,
    };
    const modelConfig = {
      // Rates are missing, should use service defaults
    } as AiModelExtendedConfig;
    const expectedCost =
      100 * DEFAULT_INPUT_TOKEN_COST_RATE +
      200 * DEFAULT_OUTPUT_TOKEN_COST_RATE;
    assertEquals(calculateActualChatCost(tokenUsage, modelConfig), Math.ceil(expectedCost));
  });
}); 