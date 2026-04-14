import type {
  AiAdapter,
  NodeAdapterFactory,
  NodeProviderMap,
} from './ai-adapter.interface.ts';
import type { GetNodeAiAdapterDeps, GetNodeAiAdapterParams } from './getNodeAiAdapter.interface.ts';
import { createValidAiAdapter } from './ai-adapter.mock.ts';

export function createValidGetNodeAiAdapterDeps(): GetNodeAiAdapterDeps {
  const factory: NodeAdapterFactory = (): AiAdapter => createValidAiAdapter();
  const providerMap: NodeProviderMap = {
    'openai-': factory,
  };
  const deps: GetNodeAiAdapterDeps = {
    providerMap,
  };
  return deps;
}

export function createValidGetNodeAiAdapterParams(): GetNodeAiAdapterParams {
  const params: GetNodeAiAdapterParams = {
    apiIdentifier: 'openai-gpt-4o',
    apiKey: 'sk-contract-key',
  };
  return params;
}
