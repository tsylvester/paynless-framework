import { describe, it, expect } from 'vitest';
import type { GetNodeAiAdapterDeps, GetNodeAiAdapterParams } from './getNodeAiAdapter.interface.ts';
import {
  createValidGetNodeAiAdapterDeps,
  createValidGetNodeAiAdapterParams,
} from './getNodeAiAdapter.interface.mock.ts';

describe('getNodeAiAdapter.interface contract', () => {
  it('valid GetNodeAiAdapterDeps: providerMap is a NodeProviderMap with at least one function entry', () => {
    const deps: GetNodeAiAdapterDeps = createValidGetNodeAiAdapterDeps();
    expect(typeof deps.providerMap).toBe('object');
    expect(deps.providerMap).not.toBe(null);
    const keys: string[] = Object.keys(deps.providerMap);
    expect(keys.length).toBeGreaterThan(0);
    const firstKey: string = keys[0];
    const factory = deps.providerMap[firstKey];
    expect(typeof factory).toBe('function');
  });

  it('valid GetNodeAiAdapterParams: non-empty apiIdentifier and non-empty apiKey', () => {
    const params: GetNodeAiAdapterParams = createValidGetNodeAiAdapterParams();
    expect(params.apiIdentifier.length).toBeGreaterThan(0);
    expect(params.apiKey.length).toBeGreaterThan(0);
  });

  it('invalid deps shapes: missing providerMap, empty providerMap, non-function map values', () => {
    const missingProviderMap = {};
    expect('providerMap' in missingProviderMap).toBe(false);

    const emptyProviderMap = { providerMap: {} };
    expect(Object.keys(emptyProviderMap.providerMap).length).toBe(0);

    const badFactoryMap = {
      providerMap: {
        'openai-': 'not-a-function',
      },
    };
    const entry = badFactoryMap.providerMap['openai-'];
    expect(typeof entry).not.toBe('function');
  });

  it('invalid params: empty apiIdentifier', () => {
    const emptyIdentifier = {
      apiIdentifier: '',
      apiKey: 'sk-nonempty',
    };
    expect(emptyIdentifier.apiIdentifier.length).toBe(0);
  });
});
