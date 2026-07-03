import { describe, expect, it, vi } from 'vitest';
import { getNodeAiAdapter } from './getNodeAiAdapter.ts';
import {
  createMockGetNodeAiAdapterDeps,
  createMockGetNodeAiAdapterParams,
  createMockNodeProviderMap,
  mockEmbeddingCapableAiAdapter,
  mockAiAdapter,
  mockStreamOnlyAiAdapter,
} from './getNodeAiAdapter.mock.ts';

describe('getNodeAiAdapter', () => {
  it('resolves stream operation adapter for matching provider prefix and calls factory with modelConfig, apiKey, and userConfig', () => {
    const factorySpy = vi.fn(() => mockAiAdapter);
    const providerMap = createMockNodeProviderMap({ 'openai-': factorySpy });
    const deps = createMockGetNodeAiAdapterDeps({ providerMap });
    const params = createMockGetNodeAiAdapterParams({
      apiIdentifier: 'openai-gpt-4o',
      apiKey: 'sk-expected',
      operation: 'stream',
    });
    const adapter = getNodeAiAdapter(deps, params);
    expect(adapter).toBe(mockAiAdapter);
    expect(factorySpy).toHaveBeenCalledTimes(1);
    expect(factorySpy).toHaveBeenCalledWith({
      modelConfig: params.modelConfig,
      apiKey: params.apiKey,
      userConfig: params.userConfig,
    });
  });

  it('matches known prefix case-insensitively for stream operation', () => {
    const factorySpy = vi.fn(() => mockAiAdapter);
    const providerMap = createMockNodeProviderMap({ 'openai-': factorySpy });
    const deps = createMockGetNodeAiAdapterDeps({ providerMap });
    const params = createMockGetNodeAiAdapterParams({
      apiIdentifier: 'OPENAI-GPT-4O',
      apiKey: 'sk-case',
      operation: 'stream',
    });
    const adapter = getNodeAiAdapter(deps, params);
    expect(adapter).toBe(mockAiAdapter);
    expect(factorySpy).toHaveBeenCalledTimes(1);
    expect(factorySpy).toHaveBeenCalledWith({
      modelConfig: params.modelConfig,
      apiKey: params.apiKey,
      userConfig: params.userConfig,
    });
  });

  it('returns null for unknown api_identifier prefix', () => {
    const factorySpy = vi.fn(() => mockAiAdapter);
    const providerMap = createMockNodeProviderMap({ 'openai-': factorySpy });
    const deps = createMockGetNodeAiAdapterDeps({ providerMap });
    const params = createMockGetNodeAiAdapterParams({
      apiIdentifier: 'totally-unknown-model-id',
      operation: 'stream',
    });
    const adapter = getNodeAiAdapter(deps, params);
    expect(adapter).toBe(null);
    expect(factorySpy).toHaveBeenCalledTimes(0);
  });

  it('returns null for empty apiIdentifier', () => {
    const factorySpy = vi.fn(() => mockAiAdapter);
    const providerMap = createMockNodeProviderMap({ 'openai-': factorySpy });
    const deps = createMockGetNodeAiAdapterDeps({ providerMap });
    const params = createMockGetNodeAiAdapterParams({
      apiIdentifier: '',
      operation: 'stream',
    });
    const adapter = getNodeAiAdapter(deps, params);
    expect(adapter).toBe(null);
    expect(factorySpy).toHaveBeenCalledTimes(0);
  });

  it('resolves adapter using default mock NodeProviderMap from createMockGetNodeAiAdapterDeps', () => {
    const deps = createMockGetNodeAiAdapterDeps();
    const params = createMockGetNodeAiAdapterParams({
      operation: 'stream',
    });
    const adapter = getNodeAiAdapter(deps, params);
    expect(adapter).toBe(mockAiAdapter);
  });

  it('resolves embedding operation adapter when resolved adapter has getEmbedding', () => {
    const embeddingAdapter = mockEmbeddingCapableAiAdapter();
    const factorySpy = vi.fn(() => embeddingAdapter);
    const providerMap = createMockNodeProviderMap({ 'openai-': factorySpy });
    const deps = createMockGetNodeAiAdapterDeps({ providerMap });
    const params = createMockGetNodeAiAdapterParams({
      apiIdentifier: 'openai-text-embedding-3-large',
      operation: 'embedding',
    });

    const adapter = getNodeAiAdapter(deps, params);

    expect(adapter).toBe(embeddingAdapter);
    expect(factorySpy).toHaveBeenCalledTimes(1);
  });

  it('returns null for embedding operation when resolved adapter lacks getEmbedding', () => {
    const streamOnlyAdapter = mockStreamOnlyAiAdapter();
    const factorySpy = vi.fn(() => streamOnlyAdapter);
    const providerMap = createMockNodeProviderMap({ 'openai-': factorySpy });
    const deps = createMockGetNodeAiAdapterDeps({ providerMap });
    const params = createMockGetNodeAiAdapterParams({
      apiIdentifier: 'openai-text-embedding-3-large',
      operation: 'embedding',
    });

    const adapter = getNodeAiAdapter(deps, params);

    expect(adapter).toBe(null);
    expect(factorySpy).toHaveBeenCalledTimes(1);
  });
});
