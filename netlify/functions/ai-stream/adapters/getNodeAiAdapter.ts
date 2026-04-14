import type { AiAdapter } from './ai-adapter.interface.ts';
import type {
  GetNodeAiAdapterDeps,
  GetNodeAiAdapterParams,
} from './getNodeAiAdapter.interface.ts';

export function getNodeAiAdapter(
  deps: GetNodeAiAdapterDeps,
  params: GetNodeAiAdapterParams,
): AiAdapter | null {
  const lower: string = params.apiIdentifier.toLowerCase();
  const prefix: string | undefined = Object.keys(deps.providerMap).find(
    (key: string) => lower.startsWith(key),
  );
  if (prefix === undefined) {
    return null;
  }
  return deps.providerMap[prefix](params.apiKey);
}
