import { describe, expect, it, vi } from 'vitest';
import { getNodeAiAdapter } from './getNodeAiAdapter.ts';
import {
  createMockGetNodeAiAdapterDeps,
  createMockGetNodeAiAdapterParams,
  createMockNodeProviderMap,
  mockAiAdapter,
} from './getNodeAiAdapter.mock.ts';

describe('getNodeAiAdapter', () => {
  it('returns factory result for known prefix openai-gpt-4o and calls factory with modelConfig and apiKey', () => {
    const factorySpy = vi.fn(() => mockAiAdapter);
    const providerMap = createMockNodeProviderMap({ 'openai-': factorySpy });
    const deps = createMockGetNodeAiAdapterDeps({ providerMap });
    const params = createMockGetNodeAiAdapterParams({
      apiIdentifier: 'openai-gpt-4o',
      apiKey: 'sk-expected',
    });
    const adapter = getNodeAiAdapter(deps, params);
    expect(adapter).toBe(mockAiAdapter);
    expect(factorySpy).toHaveBeenCalledTimes(1);
    expect(factorySpy).toHaveBeenCalledWith({
      modelConfig: params.modelConfig,
      apiKey: params.apiKey,
    });
  });

  it('matches known prefix case-insensitively for OPENAI-GPT-4O', () => {
    const factorySpy = vi.fn(() => mockAiAdapter);
    const providerMap = createMockNodeProviderMap({ 'openai-': factorySpy });
    const deps = createMockGetNodeAiAdapterDeps({ providerMap });
    const params = createMockGetNodeAiAdapterParams({
      apiIdentifier: 'OPENAI-GPT-4O',
      apiKey: 'sk-case',
    });
    const adapter = getNodeAiAdapter(deps, params);
    expect(adapter).toBe(mockAiAdapter);
    expect(factorySpy).toHaveBeenCalledTimes(1);
    expect(factorySpy).toHaveBeenCalledWith({
      modelConfig: params.modelConfig,
      apiKey: params.apiKey,
    });
  });

  it('returns null for unknown api_identifier prefix', () => {
    const factorySpy = vi.fn(() => mockAiAdapter);
    const providerMap = createMockNodeProviderMap({ 'openai-': factorySpy });
    const deps = createMockGetNodeAiAdapterDeps({ providerMap });
    const params = createMockGetNodeAiAdapterParams({
      apiIdentifier: 'totally-unknown-model-id',
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
    });
    const adapter = getNodeAiAdapter(deps, params);
    expect(adapter).toBe(null);
    expect(factorySpy).toHaveBeenCalledTimes(0);
  });

  it('resolves adapter using default mock NodeProviderMap from createMockGetNodeAiAdapterDeps', () => {
    const deps = createMockGetNodeAiAdapterDeps();
    const params = createMockGetNodeAiAdapterParams();
    const adapter = getNodeAiAdapter(deps, params);
    expect(adapter).toBe(mockAiAdapter);
  });
});
