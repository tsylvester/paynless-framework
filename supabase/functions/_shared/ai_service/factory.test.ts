import { assertEquals, assertExists, assertInstanceOf } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getAiProviderAdapter } from './factory.ts';
import { OpenAiAdapter } from './openai_adapter.ts';
import { AnthropicAdapter } from './anthropic_adapter.ts';
import { GoogleAdapter } from './google_adapter.ts';
import type { ILogger } from '../types.ts';

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
  const adapterOpenAI = getAiProviderAdapter('openai', testApiKey, mockLogger);
  assertExists(adapterOpenAI);
  assertInstanceOf(adapterOpenAI, OpenAiAdapter);
  // assertEquals(adapterOpenAI, openAiAdapter); // Check it returns the exported instance

  const adapterOpenAICased = getAiProviderAdapter('OpenAI', testApiKey, mockLogger);
  assertExists(adapterOpenAICased);
  assertInstanceOf(adapterOpenAICased, OpenAiAdapter);
  // assertEquals(adapterOpenAICased, openAiAdapter);

  const adapterAnthropic = getAiProviderAdapter('anthropic', testApiKey, mockLogger);
  assertExists(adapterAnthropic);
  assertInstanceOf(adapterAnthropic, AnthropicAdapter);
  // assertEquals(adapterAnthropic, anthropicAdapter);

  const adapterAnthropicCased = getAiProviderAdapter('AnThRoPiC', testApiKey, mockLogger);
  assertExists(adapterAnthropicCased);
  assertInstanceOf(adapterAnthropicCased, AnthropicAdapter);
  // assertEquals(adapterAnthropicCased, anthropicAdapter);

  const adapterGoogle = getAiProviderAdapter('google', testApiKey, mockLogger);
  assertExists(adapterGoogle);
  assertInstanceOf(adapterGoogle, GoogleAdapter);
  // assertEquals(adapterGoogle, googleAdapter);

  const adapterGoogleCased = getAiProviderAdapter('GOOGLE', testApiKey, mockLogger);
  assertExists(adapterGoogleCased);
  assertInstanceOf(adapterGoogleCased, GoogleAdapter);
  // assertEquals(adapterGoogleCased, googleAdapter);

  // Test unknown provider
  const adapterUnknown = getAiProviderAdapter('some-other-provider', testApiKey, mockLogger);
  assertEquals(adapterUnknown, null);

  // Test empty string
  const adapterEmpty = getAiProviderAdapter('', testApiKey, mockLogger);
  assertEquals(adapterEmpty, null);
}); 