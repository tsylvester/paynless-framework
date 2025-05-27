import { describe, it } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { countTokensForMessages } from "./tokenizer_utils.ts";
import type { MessageForTokenCounting, AiModelExtendedConfig } from "../types.ts";

// Helper to create mock configs
const createMockConfig = (modelId: string): AiModelExtendedConfig => {
  let strategy: AiModelExtendedConfig['tokenization_strategy'];
  switch (modelId) {
    case "gpt-4o":
      strategy = { type: "tiktoken", tiktoken_encoding_name: "o200k_base", tiktoken_model_name_for_rules_fallback: "gpt-4o" };
      break;
    case "gpt-3.5-turbo-0301":
      strategy = { type: "tiktoken", tiktoken_encoding_name: "cl100k_base", tiktoken_model_name_for_rules_fallback: "gpt-3.5-turbo-0301" };
      break;
    case "gpt-4":
      strategy = { type: "tiktoken", tiktoken_encoding_name: "cl100k_base", tiktoken_model_name_for_rules_fallback: "gpt-4" };
      break;
    case "text-davinci-003":
      strategy = { type: "tiktoken", tiktoken_encoding_name: "p50k_base" };
      break;
    case "unsupported-model-xyz":
      strategy = { type: "tiktoken", tiktoken_encoding_name: "unsupported-model-xyz" as any };
      break;
    default:
      strategy = { type: "tiktoken", tiktoken_encoding_name: "cl100k_base" }; 
  }
  return {
    api_identifier: modelId,
    tokenization_strategy: strategy,
    input_token_cost_rate: 1,
    output_token_cost_rate: 1,
  };
};

describe("countTokensForMessages", () => {
  it("should throw an error for gpt-4o if o200k_base is not available (simulating tiktoken lib issue)", () => {
    const messages: MessageForTokenCounting[] = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello!" },
    ];
    const mockConfigGpt4oInvalidEncoding = createMockConfig("gpt-4o");
    if (mockConfigGpt4oInvalidEncoding.tokenization_strategy.type === 'tiktoken') {
        mockConfigGpt4oInvalidEncoding.tokenization_strategy.tiktoken_encoding_name = 'invalid-encoding-for-4o' as any;
    }
    assertThrows(
      () => countTokensForMessages(messages, mockConfigGpt4oInvalidEncoding),
      Error,
      "Unsupported encoding name: invalid-encoding-for-4o. Original error: Unknown encoding"
    );
  });

  it("should correctly count tokens for gpt-3.5-turbo-0301 with name property", () => {
    const messages: MessageForTokenCounting[] = [
      { role: "user", content: "Hello from user", name: "testuser" },
      { role: "assistant", content: "Hi there" },
    ];
    assertEquals(countTokensForMessages(messages, createMockConfig("gpt-3.5-turbo-0301")), 19);
  });

  it("should correctly count tokens for gpt-4 with name property", () => {
    const messages: MessageForTokenCounting[] = [
        { role: "user", content: "What is my name?", name: "ExampleUser" },
        { role: "assistant", content: "Your name is ExampleUser." },
    ];
    assertEquals(countTokensForMessages(messages, createMockConfig("gpt-4")), 25);
  });

  it("should throw an error for null content with gpt-4o (if encoding is invalid for test)", () => {
    const messages: MessageForTokenCounting[] = [
      { role: "user", content: null },
      { role: "system", content: "System prompt" },
    ];
    const mockConfigGpt4oInvalidEncoding = createMockConfig("gpt-4o");
    if (mockConfigGpt4oInvalidEncoding.tokenization_strategy.type === 'tiktoken') {
        mockConfigGpt4oInvalidEncoding.tokenization_strategy.tiktoken_encoding_name = 'invalid-encoding-for-null-test' as any;
    }
    assertThrows(
      () => countTokensForMessages(messages, mockConfigGpt4oInvalidEncoding),
      Error,
      "Unsupported encoding name: invalid-encoding-for-null-test. Original error: Unknown encoding"
    );
  });

  it("should throw an error for an unsupported encoding name (custom model name)", () => {
    const messages: MessageForTokenCounting[] = [
      { role: "user", content: "Hello" },
    ];
    assertThrows(
      () => countTokensForMessages(messages, createMockConfig("unsupported-model-xyz")),
      Error,
      "Unsupported encoding name: unsupported-model-xyz. Original error: Unknown encoding"
    );
  });
  
  it("should count tokens using fallback ChatML rules for a model like text-davinci-003 (p50k_base)", () => {
    const messages: MessageForTokenCounting[] = [
      { role: "user", content: "Hello" }, // p50k_base: Hello -> 1 token
    ];
    assertEquals(countTokensForMessages(messages, createMockConfig("text-davinci-003")), 8);
  });
}); 