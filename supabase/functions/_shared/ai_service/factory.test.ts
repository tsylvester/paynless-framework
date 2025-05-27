import { assertEquals, assertExists, assertInstanceOf } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getAiProviderAdapter } from './factory.ts';
import { OpenAiAdapter } from './openai_adapter.ts';
import { AnthropicAdapter } from './anthropic_adapter.ts';
import { GoogleAdapter } from './google_adapter.ts';
import { DummyAdapter, type DummyAdapterConfig } from './dummy_adapter.ts';
import type { ILogger, AiModelExtendedConfig } from '../types.ts';
import type { Json } from '../../../functions/types_db.ts';

// Mock logger for testing
const mockLogger: ILogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
const testApiKey = 'test-api-key';

Deno.test("AI Adapter Factory - getAiProviderAdapter", () => {
  // Test known providers (case-insensitive)
  const adapterOpenAI = getAiProviderAdapter('openai-test-model', null, testApiKey, mockLogger);
  assertExists(adapterOpenAI);
  assertInstanceOf(adapterOpenAI, OpenAiAdapter);
  // assertEquals(adapterOpenAI, openAiAdapter); // Check it returns the exported instance

  const adapterOpenAICased = getAiProviderAdapter('OpenAI-Test-Model', null, testApiKey, mockLogger);
  assertExists(adapterOpenAICased);
  assertInstanceOf(adapterOpenAICased, OpenAiAdapter);
  // assertEquals(adapterOpenAICased, openAiAdapter);

  const adapterAnthropic = getAiProviderAdapter('anthropic-test-model', null, testApiKey, mockLogger);
  assertExists(adapterAnthropic);
  assertInstanceOf(adapterAnthropic, AnthropicAdapter);
  // assertEquals(adapterAnthropic, anthropicAdapter);

  const adapterAnthropicCased = getAiProviderAdapter('AnThRoPiC-Test-Model', null, testApiKey, mockLogger);
  assertExists(adapterAnthropicCased);
  assertInstanceOf(adapterAnthropicCased, AnthropicAdapter);
  // assertEquals(adapterAnthropicCased, anthropicAdapter);

  const adapterGoogle = getAiProviderAdapter('google-test-model', null, testApiKey, mockLogger);
  assertExists(adapterGoogle);
  assertInstanceOf(adapterGoogle, GoogleAdapter);
  // assertEquals(adapterGoogle, googleAdapter);

  const adapterGoogleCased = getAiProviderAdapter('GOOGLE-Test-Model', null, testApiKey, mockLogger);
  assertExists(adapterGoogleCased);
  assertInstanceOf(adapterGoogleCased, GoogleAdapter);
  // assertEquals(adapterGoogleCased, googleAdapter);

  // Test unknown provider
  const adapterUnknown = getAiProviderAdapter('some-other-provider', null, testApiKey, mockLogger);
  assertEquals(adapterUnknown, null);

  // Test empty string
  const adapterEmpty = getAiProviderAdapter('', null, testApiKey, mockLogger);
  assertEquals(adapterEmpty, null);
});

Deno.test("AI Adapter Factory - DummyAdapter Configuration", () => {
  const validEchoConfig: DummyAdapterConfig = {
    modelId: 'dummy-echo-test',
    mode: 'echo',
    tokensPerChar: 0.3,
    basePromptTokens: 5,
    tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' }
  };

  const validFixedConfig: DummyAdapterConfig = {
    modelId: 'dummy-fixed-test',
    mode: 'fixed_response',
    fixedResponse: { content: 'Fixed test content' },
    tokenization_strategy: { type: 'rough_char_count', chars_per_token_ratio: 4 }
  };

  // Test 1: Valid echo config
  const adapterEcho = getAiProviderAdapter('dummy-echo-test', validEchoConfig as unknown as Json, testApiKey, mockLogger);
  assertExists(adapterEcho, "Echo adapter should be created with valid config");
  assertInstanceOf(adapterEcho, DummyAdapter, "Should be an instance of DummyAdapter");

  // Test 2: Valid fixed_response config
  const adapterFixed = getAiProviderAdapter('dummy-fixed-test', validFixedConfig as unknown as Json, testApiKey, mockLogger);
  assertExists(adapterFixed, "Fixed response adapter should be created with valid config");
  assertInstanceOf(adapterFixed, DummyAdapter, "Should be an instance of DummyAdapter");

  // Test 3: Missing mode
  const invalidConfigNoMode = { ...validEchoConfig, mode: undefined } as unknown as DummyAdapterConfig;
  const adapterNoMode = getAiProviderAdapter('dummy-no-mode', invalidConfigNoMode as unknown as Json, testApiKey, mockLogger);
  assertEquals(adapterNoMode, null, "Adapter should be null if mode is missing");

  // Test 4: Missing tokenization_strategy
  const invalidConfigNoTokenization = { ...validEchoConfig, tokenization_strategy: undefined } as unknown as DummyAdapterConfig;
  const adapterNoTokenization = getAiProviderAdapter('dummy-no-tokenization', invalidConfigNoTokenization as unknown as Json, testApiKey, mockLogger);
  assertEquals(adapterNoTokenization, null, "Adapter should be null if tokenization_strategy is missing");

  // Test 5: Missing fixedResponse.content for fixed_response mode
  const invalidConfigNoFixedContent: DummyAdapterConfig = {
    modelId: 'dummy-no-fixed-content',
    mode: 'fixed_response',
    // fixedResponse: { content: undefined } // This won't work due to type constraints, simulate by providing incomplete object
    fixedResponse: {} as { content: string },
    tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' }
  };
  const adapterNoFixedContent = getAiProviderAdapter('dummy-no-fixed-content', invalidConfigNoFixedContent as unknown as Json, testApiKey, mockLogger);
  assertEquals(adapterNoFixedContent, null, "Adapter should be null if fixedResponse.content is missing for fixed_response mode");

  // Test 6: Null or invalid providerDbConfig
  const adapterNullConfig = getAiProviderAdapter('dummy-null-config', null, testApiKey, mockLogger);
  assertEquals(adapterNullConfig, null, "Adapter should be null if providerDbConfig is null");

  const adapterInvalidConfigType = getAiProviderAdapter('dummy-invalid-config-type', "not-an-object" as unknown as Json, testApiKey, mockLogger);
  assertEquals(adapterInvalidConfigType, null, "Adapter should be null if providerDbConfig is not an object");

  // Test 7: modelId defaults to providerApiIdentifier
  const configNoModelId: DummyAdapterConfig = {
    // modelId: undefined, // Simulate missing
    mode: 'echo',
    tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' }
  } as unknown as DummyAdapterConfig; // Cast needed because modelId is required in type, but factory handles its absence
  const adapterDefaultModelId = getAiProviderAdapter('dummy-default-modelid', configNoModelId as unknown as Json, testApiKey, mockLogger);
  assertExists(adapterDefaultModelId, "Adapter should be created even if modelId is missing in config");
  assertInstanceOf(adapterDefaultModelId, DummyAdapter);
  // How to check the internal config.modelId? Requires exposing it or a getter. For now, trusting factory logic.

  // Test 8: tokensPerChar and basePromptTokens default if not in config
  const configNoTokenDefaults: DummyAdapterConfig = {
    modelId: 'dummy-token-defaults',
    mode: 'echo',
    tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' }
    // tokensPerChar: undefined, // Simulate missing
    // basePromptTokens: undefined, // Simulate missing
  };
  const adapterTokenDefaults = getAiProviderAdapter('dummy-token-defaults', configNoTokenDefaults as unknown as Json, testApiKey, mockLogger);
  assertExists(adapterTokenDefaults, "Adapter should be created with default token params");
  assertInstanceOf(adapterTokenDefaults, DummyAdapter);
  // Similar to modelId, checking these defaults would require exposing them.
}); 