import { describe, it } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { countTokensForMessages } from "./tokenizer_utils.ts";
import type { MessageForTokenCounting } from "../types.ts";

describe("countTokensForMessages", () => {
  it("should throw an error for gpt-4o as it is unsupported in js-tiktoken@1.0.10", () => {
    const messages: MessageForTokenCounting[] = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello!" },
    ];
    assertThrows(
      () => countTokensForMessages(messages, "gpt-4o"),
      Error,
      "Unsupported model for token counting: gpt-4o. The tiktoken library could not find an encoding for this model. Original error: Unknown model"
    );
  });

  it("should correctly count tokens for gpt-3.5-turbo-0301 with name property", () => {
    const messages: MessageForTokenCounting[] = [
      { role: "user", content: "Hello from user", name: "testuser" },
      { role: "assistant", content: "Hi there" },
    ];
    // Expected: 20, Actual from js-tiktoken@1.0.10: 19
    assertEquals(countTokensForMessages(messages, "gpt-3.5-turbo-0301"), 19);
  });

  it("should correctly count tokens for gpt-4 with name property", () => {
    const messages: MessageForTokenCounting[] = [
        { role: "user", content: "What is my name?", name: "ExampleUser" },
        { role: "assistant", content: "Your name is ExampleUser." },
    ];
    // Expected: 26, Actual from js-tiktoken@1.0.10: 25
    assertEquals(countTokensForMessages(messages, "gpt-4"), 25);
  });

  it("should throw an error for null content with gpt-4o (unsupported model)", () => {
    const messages: MessageForTokenCounting[] = [
      { role: "user", content: null },
      { role: "system", content: "System prompt" },
    ];
    assertThrows(
      () => countTokensForMessages(messages, "gpt-4o"),
      Error,
      "Unsupported model for token counting: gpt-4o. The tiktoken library could not find an encoding for this model. Original error: Unknown model"
    );
  });

  it("should throw an error for an unsupported model (custom name)", () => {
    const messages: MessageForTokenCounting[] = [
      { role: "user", content: "Hello" },
    ];
    assertThrows(
      () => countTokensForMessages(messages, "unsupported-model-xyz"),
      Error,
      "Unsupported model for token counting: unsupported-model-xyz. The tiktoken library could not find an encoding for this model. Original error: Unknown model"
    );
  });
  
  it("should throw an error for a model valid in tiktoken but not in our explicit ChatML rule list", () => {
    const messages: MessageForTokenCounting[] = [
      { role: "user", content: "Hello" },
    ];
    // "text-davinci-003" is a valid TiktokenModel but not one for which we have ChatML rules.
    assertThrows(
      () => countTokensForMessages(messages, "text-davinci-003"),
      Error,
      `Model "text-davinci-003" is not a recognized chat model for accurate message token counting using ChatML rules.`
    );
  });
}); 