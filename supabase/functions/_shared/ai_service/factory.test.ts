import { assertEquals, assertExists, assertInstanceOf } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getAiProviderAdapter } from './factory.ts';
import { OpenAiAdapter } from './openai_adapter.ts';
import { AnthropicAdapter } from './anthropic_adapter.ts';
import { GoogleAdapter } from './google_adapter.ts';
import { DummyAdapter } from './dummy_adapter.ts';
import { MockLogger } from "../logger.mock.ts";
import type { AiModelExtendedConfig } from "../types.ts";

const mockLogger = new MockLogger();
const testApiKey = 'test-api-key';

Deno.test("AI Adapter Factory - getAiProviderAdapter", () => {
  // Test cases for each known provider, including case-insensitivity
  const providers = [
    { name: 'openai-test-model', adapterClass: OpenAiAdapter },
    { name: 'OpenAI-Test-Model', adapterClass: OpenAiAdapter },
    { name: 'anthropic-test-model', adapterClass: AnthropicAdapter },
    { name: 'AnThRoPiC-Test-Model', adapterClass: AnthropicAdapter },
    { name: 'google-test-model', adapterClass: GoogleAdapter },
    { name: 'GOOGLE-Test-Model', adapterClass: GoogleAdapter },
    { name: 'dummy-test-model', adapterClass: DummyAdapter },
    { name: 'DUMMY-Test-Model', adapterClass: DummyAdapter },
  ];

  const MOCK_MODEL_CONFIG: AiModelExtendedConfig = {
    api_identifier: 'test-model',
    input_token_cost_rate: 0,
    output_token_cost_rate: 0,
    tokenization_strategy: { type: 'none' },
  };

  for (const provider of providers) {
    // The factory expects a config for all real providers.
    // It only creates a default for the dummy adapter.
    const config = provider.name.startsWith('dummy-') ? null : MOCK_MODEL_CONFIG;
    const adapter = getAiProviderAdapter(provider.name, config, testApiKey, mockLogger);
    assertExists(adapter, `Adapter should be created for ${provider.name}`);
    assertInstanceOf(adapter, provider.adapterClass, `Adapter for ${provider.name} should be instance of ${provider.adapterClass.name}`);
  }

  // Test unknown provider
  const adapterUnknown = getAiProviderAdapter('some-other-provider', null, testApiKey, mockLogger);
  assertEquals(adapterUnknown, null, "Adapter should be null for unknown provider");

  // Test empty string
  const adapterEmpty = getAiProviderAdapter('', null, testApiKey, mockLogger);
  assertEquals(adapterEmpty, null, "Adapter should be null for empty provider string");
});

 