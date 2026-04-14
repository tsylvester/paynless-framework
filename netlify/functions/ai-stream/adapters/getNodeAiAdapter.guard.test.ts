import { describe, it, expect } from 'vitest';
import {
  isAiAdapter,
  isGetNodeAiAdapterDeps,
  isGetNodeAiAdapterParams,
  isNodeProviderMap,
} from './getNodeAiAdapter.guard.ts';
import {
  createValidAiAdapterSample,
  createValidGetNodeAiAdapterDepsSample,
  createValidGetNodeAiAdapterParamsSample,
  createValidNodeProviderMapSample,
} from './getNodeAiAdapter.guard.mock.ts';

describe('getNodeAiAdapter.guard', () => {
  describe('isNodeProviderMap', () => {
    it('accepts a valid NodeProviderMap', () => {
      expect(isNodeProviderMap(createValidNodeProviderMapSample())).toBe(true);
    });

    it('rejects an empty object', () => {
      const empty = {};
      expect(isNodeProviderMap(empty)).toBe(false);
    });

    it('rejects non-function map values', () => {
      const nonFunctionValues = { 'openai-': 'not-a-function' };
      expect(isNodeProviderMap(nonFunctionValues)).toBe(false);
    });
  });

  describe('isGetNodeAiAdapterDeps', () => {
    it('accepts valid GetNodeAiAdapterDeps', () => {
      expect(
        isGetNodeAiAdapterDeps(createValidGetNodeAiAdapterDepsSample()),
      ).toBe(true);
    });

    it('rejects missing providerMap', () => {
      const missingProviderMap = {};
      expect(isGetNodeAiAdapterDeps(missingProviderMap)).toBe(false);
    });
  });

  describe('isGetNodeAiAdapterParams', () => {
    it('accepts valid GetNodeAiAdapterParams', () => {
      expect(
        isGetNodeAiAdapterParams(createValidGetNodeAiAdapterParamsSample()),
      ).toBe(true);
    });

    it('rejects empty apiIdentifier', () => {
      const emptyIdentifier = {
        apiIdentifier: '',
        apiKey: 'sk-nonempty',
      };
      expect(isGetNodeAiAdapterParams(emptyIdentifier)).toBe(false);
    });

    it('rejects empty apiKey', () => {
      const emptyKey = {
        apiIdentifier: 'openai-gpt-4o',
        apiKey: '',
      };
      expect(isGetNodeAiAdapterParams(emptyKey)).toBe(false);
    });
  });

  describe('isAiAdapter', () => {
    it('accepts an object with stream function', () => {
      expect(isAiAdapter(createValidAiAdapterSample())).toBe(true);
    });

    it('rejects missing stream', () => {
      const missingStream = {};
      expect(isAiAdapter(missingStream)).toBe(false);
    });

    it('rejects non-function stream', () => {
      const badStream = { stream: 'not-a-function' };
      expect(isAiAdapter(badStream)).toBe(false);
    });
  });
});
