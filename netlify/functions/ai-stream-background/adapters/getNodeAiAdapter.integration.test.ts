import { describe, expect, it } from 'vitest';
import type {
  GetNodeAiAdapterDeps,
  GetNodeAiAdapterParams,
} from './getNodeAiAdapter.interface.ts';
import { getNodeAiAdapter } from './getNodeAiAdapter.ts';
import { createAnthropicNodeAdapter } from './anthropic/anthropic.ts';
import { createGoogleNodeAdapter } from './google/google.ts';
import { createOpenAINodeAdapter } from './openai/openai.ts';

describe('getNodeAiAdapter (integration)', () => {
  it('resolves embedding operation for real provider-map entries that point to embedding-capable adapter factories', () => {
    const deps: GetNodeAiAdapterDeps = {
      providerMap: {
        'openai-': createOpenAINodeAdapter,
        'google-': createGoogleNodeAdapter,
        'anthropic-': createAnthropicNodeAdapter,
      },
    };

    const openAiParams: GetNodeAiAdapterParams = {
      apiIdentifier: 'openai-gpt-4o',
      apiKey: 'sk-integration-openai',
      modelConfig: {
        api_identifier: 'openai-gpt-4o',
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
      },
      userConfig: { tier_output_cap_tokens: null },
      operation: 'embedding',
    };
    const googleParams: GetNodeAiAdapterParams = {
      apiIdentifier: 'google-gemini-2-5-pro',
      apiKey: 'google-integration-key',
      modelConfig: {
        api_identifier: 'google-gemini-2-5-pro',
        hard_cap_output_tokens: 4096,
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
      },
      userConfig: { tier_output_cap_tokens: null },
      operation: 'embedding',
    };
    const anthropicParams: GetNodeAiAdapterParams = {
      apiIdentifier: 'anthropic-claude-3-5-sonnet',
      apiKey: 'sk-integration-anthropic',
      modelConfig: {
        api_identifier: 'anthropic-claude-3-5-sonnet',
        hard_cap_output_tokens: 4096,
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
      },
      userConfig: { tier_output_cap_tokens: null },
      operation: 'embedding',
    };

    const openAiAdapter = getNodeAiAdapter(deps, openAiParams);
    const googleAdapter = getNodeAiAdapter(deps, googleParams);
    const anthropicAdapter = getNodeAiAdapter(deps, anthropicParams);

    expect(openAiAdapter).not.toBeNull();
    if (openAiAdapter === null) {
      throw new Error('Expected selector to resolve embedding-capable OpenAI adapter.');
    }
    expect(typeof openAiAdapter.getEmbedding).toBe('function');

    expect(googleAdapter).not.toBeNull();
    if (googleAdapter === null) {
      throw new Error('Expected selector to resolve embedding-capable Google adapter.');
    }
    expect(typeof googleAdapter.getEmbedding).toBe('function');

    expect(anthropicAdapter).not.toBeNull();
    if (anthropicAdapter === null) {
      throw new Error('Expected selector to resolve embedding-capable Anthropic adapter.');
    }
    expect(typeof anthropicAdapter.getEmbedding).toBe('function');
  });

  it('keeps stream operation resolvable with the existing real multi-provider map behavior', () => {
    const deps: GetNodeAiAdapterDeps = {
      providerMap: {
        'openai-': createOpenAINodeAdapter,
        'google-': createGoogleNodeAdapter,
        'anthropic-': createAnthropicNodeAdapter,
      },
    };

    const openAiParams: GetNodeAiAdapterParams = {
      apiIdentifier: 'openai-gpt-4o',
      apiKey: 'sk-integration-openai',
      modelConfig: {
        api_identifier: 'openai-gpt-4o',
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
      },
      userConfig: { tier_output_cap_tokens: null },
      operation: 'stream',
    };
    const googleParams: GetNodeAiAdapterParams = {
      apiIdentifier: 'google-gemini-2-5-pro',
      apiKey: 'google-integration-key',
      modelConfig: {
        api_identifier: 'google-gemini-2-5-pro',
        hard_cap_output_tokens: 4096,
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
      },
      userConfig: { tier_output_cap_tokens: null },
      operation: 'stream',
    };
    const anthropicParams: GetNodeAiAdapterParams = {
      apiIdentifier: 'anthropic-claude-3-5-sonnet',
      apiKey: 'sk-integration-anthropic',
      modelConfig: {
        api_identifier: 'anthropic-claude-3-5-sonnet',
        hard_cap_output_tokens: 4096,
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
      },
      userConfig: { tier_output_cap_tokens: null },
      operation: 'stream',
    };

    const openAiAdapter = getNodeAiAdapter(deps, openAiParams);
    const googleAdapter = getNodeAiAdapter(deps, googleParams);
    const anthropicAdapter = getNodeAiAdapter(deps, anthropicParams);

    expect(openAiAdapter).not.toBeNull();
    expect(googleAdapter).not.toBeNull();
    expect(anthropicAdapter).not.toBeNull();
  });

  it.todo(
    'blocked: no real exported stream-only NodeAdapterFactory exists in adapters scope; the embedding->null case cannot be asserted with a real provider-map entry without introducing test-only factories or selector mocks',
  );
});