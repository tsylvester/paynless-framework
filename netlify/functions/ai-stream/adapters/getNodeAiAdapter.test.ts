import { describe, it, expect, beforeEach } from 'vitest';
import type { AiAdapter } from './ai-adapter.interface.ts';
import type {
  GetNodeAiAdapterDeps,
  GetNodeAiAdapterParams,
} from './getNodeAiAdapter.interface.ts';
import { getNodeAiAdapter } from './getNodeAiAdapter.ts';
import {
  createMockGetNodeAiAdapterDeps,
  mockAiAdapter,
} from './getNodeAiAdapter.mock.ts';

describe('getNodeAiAdapter', () => {
  let lastFactoryApiKey: string | undefined;

  beforeEach(() => {
    lastFactoryApiKey = undefined;
  });

  function createDepsWithOpenAiKeyTracking(): GetNodeAiAdapterDeps {
    return createMockGetNodeAiAdapterDeps({
      providerMap: {
        'openai-': (apiKey: string): AiAdapter => {
          lastFactoryApiKey = apiKey;
          return mockAiAdapter;
        },
      },
    });
  }

  it('dispatches known prefix openai-gpt-4o: returns adapter and calls map factory with apiKey', () => {
    const deps: GetNodeAiAdapterDeps = createDepsWithOpenAiKeyTracking();
    const params: GetNodeAiAdapterParams = {
      apiIdentifier: 'openai-gpt-4o',
      apiKey: 'sk-unit-test-key',
    };
    const result = getNodeAiAdapter(deps, params);
    expect(result).not.toBe(null);
    expect(lastFactoryApiKey).toBe('sk-unit-test-key');
  });

  it('dispatches known prefix case-insensitive OPENAI-GPT-4O: same behavior', () => {
    const deps: GetNodeAiAdapterDeps = createDepsWithOpenAiKeyTracking();
    const params: GetNodeAiAdapterParams = {
      apiIdentifier: 'OPENAI-GPT-4O',
      apiKey: 'sk-unit-test-key',
    };
    const result = getNodeAiAdapter(deps, params);
    expect(result).not.toBe(null);
    expect(lastFactoryApiKey).toBe('sk-unit-test-key');
  });

  it('returns null for unknown apiIdentifier prefix', () => {
    const deps: GetNodeAiAdapterDeps = createMockGetNodeAiAdapterDeps();
    const params: GetNodeAiAdapterParams = {
      apiIdentifier: 'unknown-provider-model',
      apiKey: 'sk-unit-test-key',
    };
    const result = getNodeAiAdapter(deps, params);
    expect(result).toBe(null);
  });

  it('returns null for empty apiIdentifier', () => {
    const deps: GetNodeAiAdapterDeps = createMockGetNodeAiAdapterDeps();
    const params: GetNodeAiAdapterParams = {
      apiIdentifier: '',
      apiKey: 'sk-unit-test-key',
    };
    const result = getNodeAiAdapter(deps, params);
    expect(result).toBe(null);
  });
});
