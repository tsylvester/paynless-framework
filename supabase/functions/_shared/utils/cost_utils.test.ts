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
    "should default input_token_cost_rate to 1.0 and log warning if missing",
    () => {
      beforeEachStep();
      const tokenUsage: TokenUsage = {
        prompt_tokens: 100,
        completion_tokens: 100,
        total_tokens: 200,
      };
      const modelConfig: Partial<AiModelExtendedConfig> = {
        output_token_cost_rate: 2,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: defaultEncoding,
        },
      };
      assertEquals(
        calculateActualChatCost(
          tokenUsage,
          modelConfig as AiModelExtendedConfig,
          mockLogger
        ),
        300
      );
      assertEquals(mockLoggerWarnCalls.length, 1);
      assertStringIncludes(
        mockLoggerWarnCalls[0].message as string, // Cast because we expect a string here
        `Invalid or missing input_token_cost_rate for model (context: ${defaultEncoding}). Defaulting to 1.0.`
      );
      assertExists(mockLoggerWarnCalls[0].details);
      assertEquals((mockLoggerWarnCalls[0].details as {originalRate: unknown}).originalRate, undefined);
    }
  );

  await t.step(
    "should default output_token_cost_rate to 1.0 and log warning if missing",
    () => {
      beforeEachStep();
      const tokenUsage: TokenUsage = {
        prompt_tokens: 100,
        completion_tokens: 100,
        total_tokens: 200,
      };
      const modelConfig: Partial<AiModelExtendedConfig> = {
        input_token_cost_rate: 2,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: defaultEncoding,
        },
      };
      assertEquals(
        calculateActualChatCost(
          tokenUsage,
          modelConfig as AiModelExtendedConfig,
          mockLogger
        ),
        300
      );
      assertEquals(mockLoggerWarnCalls.length, 1);
      assertStringIncludes(
        mockLoggerWarnCalls[0].message as string, // Cast because we expect a string here
        `Invalid or missing output_token_cost_rate for model (context: ${defaultEncoding}). Defaulting to 1.0.`
      );
      assertExists(mockLoggerWarnCalls[0].details);
      assertEquals((mockLoggerWarnCalls[0].details as {originalRate: unknown}).originalRate, undefined);
    }
  );

  await t.step(
    "should default input_token_cost_rate to 1.0 and log warning if negative",
    () => {
      beforeEachStep();
      const tokenUsage: TokenUsage = {
        prompt_tokens: 100,
        completion_tokens: 100,
        total_tokens: 200,
      };
      const modelConfig: AiModelExtendedConfig = {
        input_token_cost_rate: -2,
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
        `Invalid or missing input_token_cost_rate for model (context: ${defaultEncoding}). Defaulting to 1.0.`
      );
      assertEquals((mockLoggerWarnCalls[0].details as {originalRate: unknown}).originalRate, -2);
    }
  );

  await t.step(
    "should default output_token_cost_rate to 1.0 and log warning if NaN",
    () => {
      beforeEachStep();
      const tokenUsage: TokenUsage = {
        prompt_tokens: 100,
        completion_tokens: 100,
        total_tokens: 200,
      };
      const modelConfig: AiModelExtendedConfig = {
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
        `Invalid or missing output_token_cost_rate for model (context: ${defaultEncoding}). Defaulting to 1.0.`
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
    "should return 0 and NOT log negative cost warning if negative rates are defaulted",
    () => {
      beforeEachStep();
      const tokenUsage: TokenUsage = {
        prompt_tokens: 10,
        completion_tokens: 10,
        total_tokens: 20,
      };
      const modelConfigWithNegativeRates: AiModelExtendedConfig = {
        input_token_cost_rate: -0.5,
        output_token_cost_rate: -0.5,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: defaultEncoding,
        },
      };
      assertEquals(
        calculateActualChatCost(tokenUsage, modelConfigWithNegativeRates, mockLogger),
        20
      );
      assertEquals(mockLoggerWarnCalls.length, 2);
      assertStringIncludes(
        mockLoggerWarnCalls[0].message as string, // Cast because we expect a string here
        `Invalid or missing input_token_cost_rate for model (context: ${defaultEncoding}). Defaulting to 1.0.`
      );
      assertEquals((mockLoggerWarnCalls[0].details as {originalRate: unknown}).originalRate, -0.5);
      assertStringIncludes(
        mockLoggerWarnCalls[1].message as string, // Cast because we expect a string here
        `Invalid or missing output_token_cost_rate for model (context: ${defaultEncoding}). Defaulting to 1.0.`
      );
      assertEquals((mockLoggerWarnCalls[1].details as {originalRate: unknown}).originalRate, -0.5);

      const negativeCostWarning = mockLoggerWarnCalls.find(call => (call.message as string).includes("Calculated cost is negative"));
      assertEquals(negativeCostWarning, undefined, "Negative cost warning should not be present");
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
}); 