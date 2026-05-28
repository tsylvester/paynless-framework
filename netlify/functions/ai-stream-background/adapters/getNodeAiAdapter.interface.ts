import type {
  AiAdapter,
  NodeModelConfig,
  NodeProviderMap,
  NodeUserConfig,
} from './ai-adapter.interface.ts';

export interface GetNodeAiAdapterDeps {
  providerMap: NodeProviderMap;
}

export interface GetNodeAiAdapterParams {
  apiIdentifier: string;
  apiKey: string;
  modelConfig: NodeModelConfig;
  userConfig: NodeUserConfig;
}

export type GetNodeAiAdapterFn = (
  deps: GetNodeAiAdapterDeps,
  params: GetNodeAiAdapterParams,
) => AiAdapter | null;
