import type {
  AiAdapter,
  NodeAdapterFactory,
  NodeProviderMap,
} from './ai-adapter.interface.ts';
import type {
  GetNodeAiAdapterDeps,
  GetNodeAiAdapterParams,
} from './getNodeAiAdapter.interface.ts';

export const defaultNodeProviderMap: NodeProviderMap = {};

export function getNodeAiAdapter(
  deps: GetNodeAiAdapterDeps,
  params: GetNodeAiAdapterParams,
): AiAdapter | null {
  const lower: string = params.apiIdentifier.toLowerCase();
  if (lower.length === 0) {
    return null;
  }
  const prefix: string | undefined = Object.keys(deps.providerMap).find(
    (candidate: string) => lower.startsWith(candidate),
  );
  if (prefix === undefined) {
    return null;
  }
  const factory: NodeAdapterFactory = deps.providerMap[prefix];
  return factory({
    modelConfig: params.modelConfig,
    apiKey: params.apiKey,
  });
}
