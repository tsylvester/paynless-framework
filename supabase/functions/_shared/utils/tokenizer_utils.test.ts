import { describe, it } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { countTokens } from "./tokenizer_utils.ts";
import type { Messages, AiModelExtendedConfig } from "../types.ts";
import type { CountTokensDeps, CountableChatPayload } from "../types/tokenizer.types.ts";

// Strict DI deps for tokenizer; throw on unknown encodings to exercise error paths deterministically
const buildDeps = (): CountTokensDeps => ({
  getEncoding: (name: string) => {
    const allowed = new Set(["cl100k_base", "o200k_base", "p50k_base", "r50k_base", "gpt2"]);
    if (!allowed.has(name)) {
      throw new Error("Unknown encoding");
    }
    return {
      encode: (input: string) => Array.from(input ?? "").map((_, i) => i),
    };
  },
  countTokensAnthropic: (text: string) => (text ?? "").length,
  logger: { warn: () => {}, error: () => {} },
});

// Full payload used for counting in every test

const makePayload = (p: Partial<CountableChatPayload> = {}): CountableChatPayload => ({
  systemInstruction: p.systemInstruction,
  message: p.message,
  messages: p.messages ?? [],
  resourceDocuments: p.resourceDocuments ?? [],
});

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

describe("countTokens", () => {
  it("should throw an error for gpt-4o if o200k_base is not available (simulating tiktoken lib issue)", () => {
    const messages: Messages[] = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello!" },
    ];
    const mockConfigGpt4oInvalidEncoding = createMockConfig("gpt-4o");
    if (mockConfigGpt4oInvalidEncoding.tokenization_strategy.type === 'tiktoken') {
        mockConfigGpt4oInvalidEncoding.tokenization_strategy.tiktoken_encoding_name = 'invalid-encoding-for-4o' as any;
    }
    const deps = buildDeps();
    const payload = makePayload({ messages });
    assertThrows(
      () => countTokens(deps, payload, mockConfigGpt4oInvalidEncoding),
      Error,
      "Unsupported encoding name: invalid-encoding-for-4o. Original error: Unknown encoding"
    );
  });

  it("gpt-3.5-turbo-0301: returns positive count and increases with more messages (name supported)", () => {
    const baseMessages: Messages[] = [
      { role: "user", content: "Hello from user", name: "testuser" },
      { role: "assistant", content: "Hi there" },
    ];
    const deps = buildDeps();
    const base = countTokens(deps, makePayload({ messages: baseMessages }), createMockConfig("gpt-3.5-turbo-0301"));
    const more = countTokens(
      deps,
      makePayload({ messages: [...baseMessages, { role: "user", content: "Adding one more" }] }),
      createMockConfig("gpt-3.5-turbo-0301"),
    );
    assertEquals(base > 0, true);
    assertEquals(more > base, true);
  });

  it("gpt-4: returns positive count and increases with more content (name supported)", () => {
    const baseMessages: Messages[] = [
      { role: "user", content: "What is my name?", name: "ExampleUser" },
      { role: "assistant", content: "Your name is ExampleUser." },
    ];
    const deps = buildDeps();
    const base = countTokens(deps, makePayload({ messages: baseMessages }), createMockConfig("gpt-4"));
    const more = countTokens(
      deps,
      makePayload({ messages: [...baseMessages, { role: "user", content: "Add detail" }] }),
      createMockConfig("gpt-4"),
    );
    assertEquals(base > 0, true);
    assertEquals(more > base, true);
  });

  it("should throw an error for null content with gpt-4o (if encoding is invalid for test)", () => {
    const messages: Messages[] = [
      { role: "user", content: null },
      { role: "system", content: "System prompt" },
    ];
    const mockConfigGpt4oInvalidEncoding = createMockConfig("gpt-4o");
    if (mockConfigGpt4oInvalidEncoding.tokenization_strategy.type === 'tiktoken') {
        mockConfigGpt4oInvalidEncoding.tokenization_strategy.tiktoken_encoding_name = 'invalid-encoding-for-null-test' as any;
    }
    const deps = buildDeps();
    const payload = makePayload({ messages });
    assertThrows(
      () => countTokens(deps, payload, mockConfigGpt4oInvalidEncoding),
      Error,
      "Unsupported encoding name: invalid-encoding-for-null-test. Original error: Unknown encoding"
    );
  });

  it("should throw an error for an unsupported encoding name (custom model name)", () => {
    const messages: Messages[] = [
      { role: "user", content: "Hello" },
    ];
    const deps = buildDeps();
    const payload = makePayload({ messages });
    assertThrows(
      () => countTokens(deps, payload, createMockConfig("unsupported-model-xyz")),
      Error,
      "Unsupported encoding name: unsupported-model-xyz. Original error: Unknown encoding"
    );
  });
  
  it("text-davinci-003 (p50k_base): returns positive count and increases with more content", () => {
    const baseMessages: Messages[] = [
      { role: "user", content: "Hello" },
    ];
    const deps = buildDeps();
    const base = countTokens(deps, makePayload({ messages: baseMessages }), createMockConfig("text-davinci-003"));
    const more = countTokens(
      deps,
      makePayload({ messages: [...baseMessages, { role: "user", content: "More tokens" }] }),
      createMockConfig("text-davinci-003"),
    );
    assertEquals(base > 0, true);
    assertEquals(more > base, true);
  });

  // --- NEW: Official strategies coverage (Step 32 RED) ---
  it("OpenAI (tiktoken, ChatML rules): returns positive count and increases with another user message", () => {
    const messagesBase: Messages[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi!" },
    ];
    const config: AiModelExtendedConfig = {
      api_identifier: "gpt-4",
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      tokenization_strategy: {
        type: "tiktoken",
        tiktoken_encoding_name: "cl100k_base",
        tiktoken_model_name_for_rules_fallback: "gpt-4",
        is_chatml_model: true,
        api_identifier_for_tokenization: "gpt-4",
      },
    };
    const deps = buildDeps();
    const base = countTokens(deps, makePayload({ messages: messagesBase }), config);
    const withExtraUser = countTokens(
      deps,
      makePayload({ messages: [...messagesBase, { role: "user", content: "Add more context" }] }),
      config,
    );
    assertEquals(base > 0, true);
    assertEquals(withExtraUser > base, true);
  });

  it("Anthropic (official tokenizer): returns positive count and increases with longer input", () => {
    const config: AiModelExtendedConfig = {
      api_identifier: "claude-3.5-sonnet-20240620",
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      tokenization_strategy: { type: "anthropic_tokenizer", model: "claude-3.5-sonnet-20240620" },
    };
    const shortMsgs: Messages[] = [
      { role: "user", content: "Hello" },
    ];
    const longMsgs: Messages[] = [
      { role: "user", content: "Hello, please summarize this paragraph." },
      { role: "assistant", content: "Sure." },
    ];
    const deps = buildDeps();
    const shortCount = countTokens(deps, makePayload({ messages: shortMsgs }), config);
    const longCount = countTokens(deps, makePayload({ messages: longMsgs }), config);
    assertEquals(shortCount > 0, true);
    assertEquals(longCount > shortCount, true);
  });

  it("Google (gemini, ratio honored): with chars_per_token_ratio returns ceil(totalChars/ratio)", () => {
    const sumChars = (msgs: Messages[]) => msgs.reduce((acc, m) => acc + (m.role?.length || 0) + (m.content?.length || 0) + (m.name?.length || 0), 0);
    const messages: Messages[] = [
      { role: "user", content: "abcde" },
      { role: "assistant", content: "xyz" },
    ];
    const totalChars = sumChars(messages);

    // Default behavior (no ratio provided) should be ceil(total/4)
    const configDefault: AiModelExtendedConfig = {
      api_identifier: "google-gemini-2.5-pro",
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      tokenization_strategy: { type: "google_gemini_tokenizer" },
    };
    const deps = buildDeps();
    const defaultCount = countTokens(deps, makePayload({ messages }), configDefault);
    assertEquals(defaultCount, Math.ceil(totalChars / 4));

    // When a ratio is provided, implementation should honor it
    const configWithRatio: AiModelExtendedConfig = {
      api_identifier: "google-gemini-2.5-pro",
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      tokenization_strategy: { type: "google_gemini_tokenizer", chars_per_token_ratio: 5 },
    };
    const ratioCount = countTokens(deps, makePayload({ messages }), configWithRatio);
    assertEquals(ratioCount, Math.ceil(totalChars / 5));
  });

  // Step 44 RED: Ensure 4o/4.1 with o200k_base produce positive and increasing counts
  it("OpenAI gpt-4o (o200k_base): returns positive count and increases with more content", () => {
    const baseMessages: Messages[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi!" },
    ];
    const config: AiModelExtendedConfig = {
      api_identifier: "gpt-4o",
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      tokenization_strategy: {
        type: "tiktoken",
        tiktoken_encoding_name: "o200k_base",
        tiktoken_model_name_for_rules_fallback: "gpt-4o",
        is_chatml_model: true,
        api_identifier_for_tokenization: "gpt-4o",
      },
    };
    const deps = buildDeps();
    const base = countTokens(deps, makePayload({ messages: baseMessages }), config);
    const more = countTokens(
      deps,
      makePayload({ messages: [...baseMessages, { role: "user", content: "Add more context please." }] }),
      config,
    );
    assertEquals(base > 0, true);
    assertEquals(more > base, true);
  });

  it("OpenAI gpt-4.1 (o200k_base): returns positive count and increases with more content", () => {
    const baseMessages: Messages[] = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi!" },
    ];
    const config: AiModelExtendedConfig = {
      api_identifier: "gpt-4.1",
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      tokenization_strategy: {
        type: "tiktoken",
        tiktoken_encoding_name: "o200k_base",
        // For ChatML rules, 4.1 behaves like modern ChatML; fallback key can be generic
        tiktoken_model_name_for_rules_fallback: "gpt-4",
        is_chatml_model: true,
        api_identifier_for_tokenization: "gpt-4.1",
      },
    };
    const deps = buildDeps();
    const base = countTokens(deps, makePayload({ messages: baseMessages }), config);
    const more = countTokens(
      deps,
      makePayload({ messages: [...baseMessages, { role: "user", content: "Add more context please." }] }),
      config,
    );
    assertEquals(base > 0, true);
    assertEquals(more > base, true);
  });

  // Size exactly what we send (full payload components; no projection)
  it("countTokens: counts systemInstruction, message, messages, and resourceDocuments", () => {
    const history: Messages[] = [ { role: "assistant", content: "Hi" } ];
    const baseReq: CountableChatPayload = makePayload({
      message: "Hello",
      systemInstruction: "You are helpful.",
      messages: history,
      resourceDocuments: [ { id: "d1", content: "Doc A" } ],
    });
    const cfg: AiModelExtendedConfig = {
      api_identifier: "rough-counter",
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      tokenization_strategy: { type: "rough_char_count", chars_per_token_ratio: 1 },
    };

    const deps = buildDeps();
    const base = countTokens(deps, baseReq, cfg);
    const moreSys = countTokens(deps, { ...baseReq, systemInstruction: (baseReq.systemInstruction || "") + "!" }, cfg);
    const moreMsg = countTokens(deps, { ...baseReq, message: (baseReq.message || "") + " world" }, cfg);
    const moreHistory = countTokens(
      deps,
      { ...baseReq, messages: [...(baseReq.messages || []), { role: "user", content: "More" }] },
      cfg,
    );
    const moreDocs = countTokens(
      deps,
      { ...baseReq, resourceDocuments: [...(baseReq.resourceDocuments || []), { content: "Doc B" }] },
      cfg,
    );

    // Positive
    assertEquals(base > 0, true);
    // Increases when each component grows
    assertEquals(moreSys > base, true);
    assertEquals(moreMsg > base, true);
    assertEquals(moreHistory > base, true);
    assertEquals(moreDocs > base, true);
  });

  // Anthropics counted via official tokenizer on message arrays
  it("Anthropic (messages array): official tokenizer returns positive and increasing counts", () => {
    const baseMessages: Messages[] = [
      { role: "user", content: "Hello Anthropic." },
      { role: "assistant", content: "Hello!" },
    ];
    const config: AiModelExtendedConfig = {
      api_identifier: "claude-3.5-sonnet-20240620",
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      tokenization_strategy: { type: "anthropic_tokenizer", model: "claude-3.5-sonnet-20240620" },
    };
    const deps = buildDeps();
    const base = countTokens(deps, makePayload({ messages: baseMessages }), config);
    const more = countTokens(
      deps,
      makePayload({ messages: [...baseMessages, { role: "user", content: "Add more content for counting." }] }),
      config,
    );
    assertEquals(base > 0, true);
    assertEquals(more > base, true);
  });

  // Step 73 RED: Empty/minimal payload edge cases (use rough_char_count with ratio 1 for deterministic sums)
  it("minimal payload: only top-level message is counted and positive (rough_char_count)", () => {
    const cfg: AiModelExtendedConfig = {
      api_identifier: "rough-counter",
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      tokenization_strategy: { type: "rough_char_count", chars_per_token_ratio: 1 },
    };
    const deps = buildDeps();
    const payload = makePayload({ message: "Hello" });
    const count = countTokens(deps, payload, cfg);
    assertEquals(count > 0, true);
  });

  it("minimal payload: only systemInstruction is counted and positive (rough_char_count)", () => {
    const cfg: AiModelExtendedConfig = {
      api_identifier: "rough-counter",
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      tokenization_strategy: { type: "rough_char_count", chars_per_token_ratio: 1 },
    };
    const deps = buildDeps();
    const payload = makePayload({ systemInstruction: "You are helpful." });
    const count = countTokens(deps, payload, cfg);
    assertEquals(count > 0, true);
  });

  it("minimal payload: only resourceDocuments are counted and positive; increases with more docs (rough_char_count)", () => {
    const cfg: AiModelExtendedConfig = {
      api_identifier: "rough-counter",
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      tokenization_strategy: { type: "rough_char_count", chars_per_token_ratio: 1 },
    };
    const deps = buildDeps();
    const base = countTokens(deps, makePayload({ resourceDocuments: [ { content: "Doc A" } ] }), cfg);
    const more = countTokens(deps, makePayload({ resourceDocuments: [ { content: "Doc A" }, { content: "Doc B longer" } ] }), cfg);
    assertEquals(base > 0, true);
    assertEquals(more > base, true);
  });

  it("minimal payload: only messages[] are counted and positive; increases with more messages (rough_char_count)", () => {
    const cfg: AiModelExtendedConfig = {
      api_identifier: "rough-counter",
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      tokenization_strategy: { type: "rough_char_count", chars_per_token_ratio: 1 },
    };
    const deps = buildDeps();
    const msgs1: Messages[] = [ { role: "user", content: "Hi" } ];
    const msgs2: Messages[] = [ { role: "user", content: "Hi" }, { role: "assistant", content: "Hello" } ];
    const base = countTokens(deps, makePayload({ messages: msgs1 }), cfg);
    const more = countTokens(deps, makePayload({ messages: msgs2 }), cfg);
    assertEquals(base > 0, true);
    assertEquals(more > base, true);
  });

  it("combinations: adding components increases count coherently (rough_char_count)", () => {
    const cfg: AiModelExtendedConfig = {
      api_identifier: "rough-counter",
      input_token_cost_rate: 1,
      output_token_cost_rate: 1,
      tokenization_strategy: { type: "rough_char_count", chars_per_token_ratio: 1 },
    };
    const deps = buildDeps();
    const onlyMessage = countTokens(deps, makePayload({ message: "Hello" }), cfg);
    const plusSys = countTokens(deps, makePayload({ message: "Hello", systemInstruction: "You are helpful." }), cfg);
    const plusMsgs = countTokens(deps, makePayload({ message: "Hello", systemInstruction: "You are helpful.", messages: [ { role: "user", content: "Hi" } ] }), cfg);
    const plusDocs = countTokens(deps, makePayload({ message: "Hello", systemInstruction: "You are helpful.", messages: [ { role: "user", content: "Hi" } ], resourceDocuments: [ { content: "Doc A" } ] }), cfg);
    assertEquals(onlyMessage > 0, true);
    assertEquals(plusSys > onlyMessage, true);
    assertEquals(plusMsgs > plusSys, true);
    assertEquals(plusDocs > plusMsgs, true);
  });
}); 