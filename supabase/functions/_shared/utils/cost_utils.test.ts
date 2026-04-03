import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { calculateActualChatCost } from "./cost_utils.ts";
import type {
  AiModelExtendedConfig,
  TokenUsage,
  ILogger,
  TiktokenEncoding,
  LogMetadata
} from "../types.ts";

import { MockLogger } from "../logger.mock.ts";

const mockLogger = new MockLogger();
const defaultEncoding: TiktokenEncoding = "cl100k_base";

Deno.test("calculateActualChatCost", async (t) => {
  await t.step(
    "should calculate cost correctly with valid inputs and integer rates",
    () => {
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
    }
  );

  await t.step(
    "should calculate cost correctly with fractional rates and apply Math.ceil",
    () => {
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
    }
  );

  await t.step(
    "should calculate cost and round up with Math.ceil for fractional results",
    () => {
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
    }
  );

  // --- Edge Cases for tokenUsage ---
  await t.step("should throw if tokenUsage is null", () => {
    const modelConfig: AiModelExtendedConfig = {
      api_identifier: 'test-api-id-null-usage',
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      tokenization_strategy: {
        type: "tiktoken",
        tiktoken_encoding_name: defaultEncoding,
      },
    };
    assertThrows(
      () => calculateActualChatCost(null, modelConfig, mockLogger),
      Error,
      "TokenUsage object is missing or invalid",
    );
  });

  await t.step("should throw if tokenUsage is undefined", () => {
    const modelConfig: AiModelExtendedConfig = {
      api_identifier: 'test-api-id-undefined-usage',
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      tokenization_strategy: {
        type: "tiktoken",
        tiktoken_encoding_name: defaultEncoding,
      },
    };
    assertThrows(
      () => calculateActualChatCost(undefined, modelConfig, mockLogger),
      Error,
      "TokenUsage object is missing or invalid",
    );
  });

  await t.step("should throw if prompt_tokens is missing", () => {
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
    assertThrows(
      () => calculateActualChatCost(tokenUsage as TokenUsage, modelConfig, mockLogger),
      Error,
      "Invalid prompt_tokens",
    );
  });

  await t.step("should throw if completion_tokens is missing", () => {
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
    assertThrows(
      () => calculateActualChatCost(tokenUsage as TokenUsage, modelConfig, mockLogger),
      Error,
      "Invalid completion_tokens",
    );
  });

  await t.step(
    "should handle zero prompt/completion tokens but non-zero total_tokens, logging warning",
    () => {
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
    }
  );

  // --- Edge Cases for modelConfig ---
  await t.step("should throw if modelConfig is null", () => {
    const tokenUsage: TokenUsage = {
      prompt_tokens: 10,
      completion_tokens: 10,
      total_tokens: 20,
    };
    assertThrows(
      () => calculateActualChatCost(tokenUsage, null, mockLogger),
      Error,
      "ModelConfig object is missing or invalid",
    );
  });

  await t.step("should throw if modelConfig is undefined", () => {
    const tokenUsage: TokenUsage = {
      prompt_tokens: 10,
      completion_tokens: 10,
      total_tokens: 20,
    };
    assertThrows(
      () => calculateActualChatCost(tokenUsage, undefined, mockLogger),
      Error,
      "ModelConfig object is missing or invalid",
    );
  });

  await t.step(
    "should throw if input_token_cost_rate is missing",
    () => {
      const tokenUsage: TokenUsage = {
        prompt_tokens: 100,
        completion_tokens: 100,
        total_tokens: 200,
      };
      const modelConfig = {
        api_identifier: 'test-api-id-missing-input-rate',
        output_token_cost_rate: 1,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: defaultEncoding,
        },
      } as unknown as AiModelExtendedConfig;
      assertThrows(
        () => calculateActualChatCost(tokenUsage, modelConfig, mockLogger),
        Error,
        "Invalid input_token_cost_rate",
      );
    }
  );

  await t.step(
    "should throw if output_token_cost_rate is missing",
    () => {
      const tokenUsage: TokenUsage = {
        prompt_tokens: 100,
        completion_tokens: 100,
        total_tokens: 200,
      };
      const modelConfig = {
        api_identifier: 'test-api-id-missing-output-rate',
        input_token_cost_rate: 1,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: defaultEncoding,
        },
      } as unknown as AiModelExtendedConfig;
      assertThrows(
        () => calculateActualChatCost(tokenUsage, modelConfig, mockLogger),
        Error,
        "Invalid output_token_cost_rate",
      );
    }
  );

  await t.step(
    "should throw if input_token_cost_rate is negative",
    () => {
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
      assertThrows(
        () => calculateActualChatCost(tokenUsage, modelConfig, mockLogger),
        Error,
        "Invalid input_token_cost_rate",
      );
    }
  );

  await t.step(
    "should throw if output_token_cost_rate is NaN",
    () => {
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
      assertThrows(
        () => calculateActualChatCost(tokenUsage, modelConfig, mockLogger),
        Error,
        "Invalid output_token_cost_rate",
      );
    }
  );

  await t.step("should return 0 if calculated cost is 0", () => {
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
  });

  await t.step(
    "should throw if both rates are negative",
    () => {
      const tokenUsage: TokenUsage = {
        prompt_tokens: 10,
        completion_tokens: 10,
        total_tokens: 20,
      };
      const modelConfig: AiModelExtendedConfig = {
        api_identifier: 'test-api-id-negative-rates',
        input_token_cost_rate: -5,
        output_token_cost_rate: -10,
        tokenization_strategy: {
          type: "tiktoken",
          tiktoken_encoding_name: defaultEncoding,
        },
      };
      assertThrows(
        () => calculateActualChatCost(tokenUsage, modelConfig, mockLogger),
        Error,
        "Invalid input_token_cost_rate",
      );
    }
  );


  await t.step("should run without a logger provided and not throw errors", () => {
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
  });

  await t.step(
    "should throw if rates are null",
    () => {
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
      } as unknown as AiModelExtendedConfig;
      assertThrows(
        () => calculateActualChatCost(tokenUsage, modelConfig, mockLogger),
        Error,
        "Invalid input_token_cost_rate",
      );
    }
  );

  await t.step(
    "should throw even if no logger is provided when rates are invalid",
    () => {
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
      assertThrows(
        () => calculateActualChatCost(tokenUsage, modelConfig, undefined),
        Error,
        "Invalid input_token_cost_rate",
      );
    }
  );

  // Main test cases for calculateActualChatCost, ensuring it is robust and correct
  Deno.test("calculateActualChatCost - Happy Path", () => {
    const tokenUsage: TokenUsage = { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 };
    const modelConfig: AiModelExtendedConfig = {
      api_identifier: 'test-happy-path',
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: defaultEncoding },
    };
    assertEquals(calculateActualChatCost(tokenUsage, modelConfig), 300);
  });

  Deno.test("calculateActualChatCost - Missing Cost Rates throws", () => {
    const tokenUsage: TokenUsage = { prompt_tokens: 100, completion_tokens: 0, total_tokens: 100 };
    const modelConfig = {
      // Missing cost rates
    } as unknown as AiModelExtendedConfig;
    assertThrows(
      () => calculateActualChatCost(tokenUsage, modelConfig),
      Error,
      "Invalid input_token_cost_rate",
    );
  });

  Deno.test("calculateActualChatCost - Zero Tokens", () => {
    const tokenUsage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const modelConfig: AiModelExtendedConfig = {
      api_identifier: 'test-zero-tokens',
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: defaultEncoding },
    };
    assertEquals(calculateActualChatCost(tokenUsage, modelConfig), 0);
  });

  Deno.test("calculateActualChatCost - Partial TokenUsage (completion_tokens missing) throws", () => {
    const tokenUsage = { prompt_tokens: 100, total_tokens: 100 } as unknown as TokenUsage;
    const modelConfig: AiModelExtendedConfig = {
      api_identifier: 'test-partial-usage',
      input_token_cost_rate: 1,
      output_token_cost_rate: 5,
      tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: defaultEncoding },
    };
    assertThrows(
      () => calculateActualChatCost(tokenUsage, modelConfig),
      Error,
      "Invalid completion_tokens",
    );
  });

  Deno.test("calculateActualChatCost - Rates as Strings throws", () => {
    const tokenUsage: TokenUsage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };
    const modelConfig = {
      api_identifier: 'test-string-rates',
      input_token_cost_rate: "1",
      output_token_cost_rate: "2",
    } as unknown as AiModelExtendedConfig;
    assertThrows(
      () => calculateActualChatCost(tokenUsage, modelConfig),
      Error,
      "Invalid input_token_cost_rate",
    );
  });

  Deno.test("calculateActualChatCost - Invalid String Rates throws", () => {
    const tokenUsage: TokenUsage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };
    const modelConfig = {
      api_identifier: 'test-invalid-string-rates',
      input_token_cost_rate: "invalid",
      output_token_cost_rate: "invalid",
    } as unknown as AiModelExtendedConfig;
    assertThrows(
      () => calculateActualChatCost(tokenUsage, modelConfig),
      Error,
      "Invalid input_token_cost_rate",
    );
  });

  Deno.test("calculateActualChatCost - No Logger Provided", () => {
    const tokenUsage: TokenUsage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 };
    const modelConfig: AiModelExtendedConfig = {
      api_identifier: 'test-no-logger',
      input_token_cost_rate: 2,
      output_token_cost_rate: 2,
      tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: defaultEncoding },
    };
    assertEquals(calculateActualChatCost(tokenUsage, modelConfig), 300);
  });

  Deno.test("calculateActualChatCost - Zero cost rates throws", () => {
    const tokenUsage: TokenUsage = {
      prompt_tokens: 123,
      completion_tokens: 456,
      total_tokens: 579,
    };
    const modelConfig: AiModelExtendedConfig = {
      api_identifier: 'test-zero-rates',
      input_token_cost_rate: 0,
      output_token_cost_rate: 0,
      tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: defaultEncoding },
    };
    assertThrows(
      () => calculateActualChatCost(tokenUsage, modelConfig),
      Error,
      "Invalid input_token_cost_rate",
    );
  });

  Deno.test("calculateActualChatCost - Negative cost rates throws", () => {
    const tokenUsage: TokenUsage = {
      prompt_tokens: 100,
      completion_tokens: 100,
      total_tokens: 200,
    };
    const modelConfig: AiModelExtendedConfig = {
      api_identifier: 'test-negative-rates-2',
      input_token_cost_rate: -1,
      output_token_cost_rate: -2,
      tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: defaultEncoding },
    };
    assertThrows(
      () => calculateActualChatCost(tokenUsage, modelConfig),
      Error,
      "Invalid input_token_cost_rate",
    );
  });

  Deno.test("calculateActualChatCost - Extremely Large Token Counts", () => {
    const tokenUsage: TokenUsage = {
      prompt_tokens: 1_000_000_000,
      completion_tokens: 2_000_000_000,
      total_tokens: 3_000_000_000,
    };
    const modelConfig: AiModelExtendedConfig = {
      api_identifier: 'test-large-tokens',
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      tokenization_strategy: { type: "tiktoken", tiktoken_encoding_name: defaultEncoding },
    };
    assertEquals(calculateActualChatCost(tokenUsage, modelConfig), 3_000_000_000);
  });

  Deno.test("calculateActualChatCost - Missing rates throws (no service defaults)", () => {
    const tokenUsage: TokenUsage = {
      prompt_tokens: 100,
      completion_tokens: 200,
      total_tokens: 300,
    };
    const modelConfig = {
      api_identifier: 'test-missing-rates-no-defaults',
    } as unknown as AiModelExtendedConfig;
    assertThrows(
      () => calculateActualChatCost(tokenUsage, modelConfig),
      Error,
      "Invalid input_token_cost_rate",
    );
  });
}); 