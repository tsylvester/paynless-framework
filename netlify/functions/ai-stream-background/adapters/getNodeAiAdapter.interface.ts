import type {
  AiAdapter,
  NodeModelConfig,
  NodeProviderMap,
} from './ai-adapter.interface.ts';

export interface GetNodeAiAdapterDeps {
  providerMap: NodeProviderMap;
}

export interface GetNodeAiAdapterParams {
  apiIdentifier: string;
  apiKey: string;
  modelConfig: NodeModelConfig;
}

export type GetNodeAiAdapterFn = (
  deps: GetNodeAiAdapterDeps,
  params: GetNodeAiAdapterParams,
) => AiAdapter | null;
