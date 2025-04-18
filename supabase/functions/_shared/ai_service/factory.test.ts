import { assertEquals, assertExists, assertInstanceOf } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getAiProviderAdapter } from './factory.ts';
import { OpenAiAdapter, openAiAdapter } from './openai_adapter.ts';
import { AnthropicAdapter, anthropicAdapter } from './anthropic_adapter.ts';
import { GoogleAdapter, googleAdapter } from './google_adapter.ts';

Deno.test("AI Adapter Factory - getAiProviderAdapter", () => {
  // Test known providers (case-insensitive)
  const adapterOpenAI = getAiProviderAdapter('openai');
  assertExists(adapterOpenAI);
  assertInstanceOf(adapterOpenAI, OpenAiAdapter);
  assertEquals(adapterOpenAI, openAiAdapter); // Check it returns the exported instance

  const adapterOpenAICased = getAiProviderAdapter('OpenAI');
  assertExists(adapterOpenAICased);
  assertInstanceOf(adapterOpenAICased, OpenAiAdapter);
  assertEquals(adapterOpenAICased, openAiAdapter);

  const adapterAnthropic = getAiProviderAdapter('anthropic');
  assertExists(adapterAnthropic);
  assertInstanceOf(adapterAnthropic, AnthropicAdapter);
  assertEquals(adapterAnthropic, anthropicAdapter);

  const adapterAnthropicCased = getAiProviderAdapter('AnThRoPiC');
  assertExists(adapterAnthropicCased);
  assertInstanceOf(adapterAnthropicCased, AnthropicAdapter);
  assertEquals(adapterAnthropicCased, anthropicAdapter);

  const adapterGoogle = getAiProviderAdapter('google');
  assertExists(adapterGoogle);
  assertInstanceOf(adapterGoogle, GoogleAdapter);
  assertEquals(adapterGoogle, googleAdapter);

  const adapterGoogleCased = getAiProviderAdapter('GOOGLE');
  assertExists(adapterGoogleCased);
  assertInstanceOf(adapterGoogleCased, GoogleAdapter);
  assertEquals(adapterGoogleCased, googleAdapter);

  // Test unknown provider
  const adapterUnknown = getAiProviderAdapter('some-other-provider');
  assertEquals(adapterUnknown, null);

  // Test empty string
  const adapterEmpty = getAiProviderAdapter('');
  assertEquals(adapterEmpty, null);
}); 