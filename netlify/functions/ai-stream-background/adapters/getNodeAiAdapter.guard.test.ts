import { describe, expect, it } from 'vitest';
import {
  createMockGetNodeAiAdapterDeps,
  createMockGetNodeAiAdapterParams,
  createMockNodeProviderMap,
  mockAiAdapter,
} from './getNodeAiAdapter.mock.ts';
import {
  isAiAdapter,
  isGetNodeAiAdapterDeps,
  isGetNodeAiAdapterParams,
  isNodeAdapterStreamChunk,
  isNodeProviderMap,
} from './getNodeAiAdapter.guard.ts';

describe('getNodeAiAdapter.guard', () => {
  describe('isNodeProviderMap', () => {
    it('accepts valid map with function values', () => {
      const map = createMockNodeProviderMap();
      expect(isNodeProviderMap(map)).toBe(true);
    });

    it('rejects empty object', () => {
      expect(isNodeProviderMap({})).toBe(false);
    });

    it('rejects non-function map values', () => {
      const invalid = { 'openai-': 'not-a-function' };
      expect(isNodeProviderMap(invalid)).toBe(false);
    });
  });

  describe('isGetNodeAiAdapterDeps', () => {
    it('accepts valid deps', () => {
      const deps = createMockGetNodeAiAdapterDeps();
      expect(isGetNodeAiAdapterDeps(deps)).toBe(true);
    });

    it('rejects missing providerMap', () => {
      expect(isGetNodeAiAdapterDeps({})).toBe(false);
    });

    it('rejects empty providerMap', () => {
      const deps = createMockGetNodeAiAdapterDeps({ providerMap: {} });
      expect(isGetNodeAiAdapterDeps(deps)).toBe(false);
    });
  });

  describe('isGetNodeAiAdapterParams', () => {
    it('accepts valid params', () => {
      const params = createMockGetNodeAiAdapterParams();
      expect(isGetNodeAiAdapterParams(params)).toBe(true);
    });

    it('rejects empty apiIdentifier', () => {
      const params = createMockGetNodeAiAdapterParams({ apiIdentifier: '' });
      expect(isGetNodeAiAdapterParams(params)).toBe(false);
    });

    it('rejects empty apiKey', () => {
      const params = createMockGetNodeAiAdapterParams({ apiKey: '' });
      expect(isGetNodeAiAdapterParams(params)).toBe(false);
    });

    it('rejects missing modelConfig', () => {
      const params = { apiIdentifier: 'openai-gpt-4o', apiKey: 'sk-test' };
      expect(isGetNodeAiAdapterParams(params)).toBe(false);
    });
  });

  describe('isAiAdapter', () => {
    it('accepts object with sendMessageStream function', () => {
      expect(isAiAdapter(mockAiAdapter)).toBe(true);
    });

    it('rejects missing sendMessageStream', () => {
      const invalid = {};
      expect(isAiAdapter(invalid)).toBe(false);
    });

    it('rejects non-function sendMessageStream', () => {
      const invalid = { sendMessageStream: 'not-fn' };
      expect(isAiAdapter(invalid)).toBe(false);
    });
  });

  describe('isNodeAdapterStreamChunk', () => {
    it('accepts text_delta variant', () => {
      const chunk = { type: 'text_delta', text: 'a' };
      expect(isNodeAdapterStreamChunk(chunk)).toBe(true);
    });

    it('accepts usage variant', () => {
      const chunk = {
        type: 'usage',
        tokenUsage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      };
      expect(isNodeAdapterStreamChunk(chunk)).toBe(true);
    });

    it('accepts done variant', () => {
      const chunk = { type: 'done', finish_reason: 'stop' };
      expect(isNodeAdapterStreamChunk(chunk)).toBe(true);
    });

    it('rejects unknown type values', () => {
      const chunk = { type: 'unknown', text: 'x' };
      expect(isNodeAdapterStreamChunk(chunk)).toBe(false);
    });
  });
});
