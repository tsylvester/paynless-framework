import type {
  AiAdapter,
  AiAdapterParams,
  AiAdapterResult,
  NodeAdapterFactory,
  NodeProviderMap,
} from './ai-adapter.interface.ts';
import type {
  GetNodeAiAdapterDeps,
  GetNodeAiAdapterParams,
} from './getNodeAiAdapter.interface.ts';
import { createValidAiAdapterResultNullUsage } from './ai-adapter.mock.ts';

export const mockAiAdapter: AiAdapter = {
  stream: async (params: AiAdapterParams): Promise<AiAdapterResult> => {
    void params;
    return createValidAiAdapterResultNullUsage();
  },
};

const defaultProviderFactory: NodeAdapterFactory = (
  _apiKey: string,
): AiAdapter => mockAiAdapter;

function mergeNodeProviderMap(
  base: NodeProviderMap,
  overrides?: Partial<NodeProviderMap>,
): NodeProviderMap {
  if (overrides === undefined) {
    return base;
  }
  const merged: NodeProviderMap = { ...base };
  for (const entry of Object.entries(overrides)) {
    const key: string = entry[0];
    const factory: NodeAdapterFactory | undefined = entry[1];
    if (factory !== undefined) {
      merged[key] = factory;
    }
  }
  return merged;
}

export function createMockNodeProviderMap(
  overrides?: Partial<NodeProviderMap>,
): NodeProviderMap {
  const defaults: NodeProviderMap = {
    'openai-': defaultProviderFactory,
    'anthropic-': defaultProviderFactory,
    'google-': defaultProviderFactory,
  };
  return mergeNodeProviderMap(defaults, overrides);
}

export function createMockGetNodeAiAdapterDeps(
  overrides?: Partial<GetNodeAiAdapterDeps>,
): GetNodeAiAdapterDeps {
  const base: GetNodeAiAdapterDeps = {
    providerMap: createMockNodeProviderMap(),
  };
  if (overrides === undefined) {
    return base;
  }
  if (overrides.providerMap !== undefined) {
    return {
      providerMap: mergeNodeProviderMap(base.providerMap, overrides.providerMap),
    };
  }
  return base;
}

export function createMockGetNodeAiAdapterParams(
  overrides?: Partial<GetNodeAiAdapterParams>,
): GetNodeAiAdapterParams {
  const defaults: GetNodeAiAdapterParams = {
    apiIdentifier: 'openai-gpt-4o',
    apiKey: 'sk-mock-default',
  };
  if (overrides === undefined) {
    return defaults;
  }
  return { ...defaults, ...overrides };
}
