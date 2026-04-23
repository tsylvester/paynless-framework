import { describe, expect, it } from 'vitest';
import type {
  GetNodeAiAdapterDeps,
  GetNodeAiAdapterParams,
} from './getNodeAiAdapter.interface.ts';
import type {
  NodeAdapterStreamChunk,
  NodeChatApiRequest,
} from './ai-adapter.interface.ts';

describe('getNodeAiAdapter.interface contract', () => {
  it('accepts GetNodeAiAdapterDeps with providerMap having at least one function entry', () => {
    const deps: GetNodeAiAdapterDeps = {
      providerMap: {
        'openai-': (_params) => ({
          async *sendMessageStream(_request: NodeChatApiRequest, _apiIdentifier: string) {
            const chunk: NodeAdapterStreamChunk = {
              type: 'text_delta',
              text: '',
            };
            yield chunk;
          },
        }),
      },
    };
    expect(typeof deps.providerMap).toBe('object');
    expect(Object.keys(deps.providerMap).length >= 1).toBe(true);
    expect(typeof deps.providerMap['openai-']).toBe('function');
  });

  it('accepts GetNodeAiAdapterParams with non-empty apiIdentifier, non-empty apiKey, and modelConfig', () => {
    const params: GetNodeAiAdapterParams = {
      apiIdentifier: 'openai-gpt-4o',
      apiKey: 'sk-test',
      modelConfig: {
        api_identifier: 'openai-gpt-4o',
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
      },
    };
    expect(params.apiIdentifier.length >= 1).toBe(true);
    expect(params.apiKey.length >= 1).toBe(true);
    expect(typeof params.modelConfig).toBe('object');
    expect(typeof params.modelConfig.api_identifier).toBe('string');
    expect(params.modelConfig.api_identifier.length >= 1).toBe(true);
  });
});
