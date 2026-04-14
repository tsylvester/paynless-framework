import type {
  AiAdapter,
  NodeProviderMap,
} from './ai-adapter.interface.ts';
import type {
  GetNodeAiAdapterDeps,
  GetNodeAiAdapterParams,
} from './getNodeAiAdapter.interface.ts';
import { createValidAiAdapter } from './ai-adapter.mock.ts';
import {
  createValidGetNodeAiAdapterDeps,
  createValidGetNodeAiAdapterParams,
} from './getNodeAiAdapter.interface.mock.ts';

export function createValidNodeProviderMapSample(): NodeProviderMap {
  const deps: GetNodeAiAdapterDeps = createValidGetNodeAiAdapterDeps();
  return deps.providerMap;
}

export function createValidGetNodeAiAdapterDepsSample(): GetNodeAiAdapterDeps {
  return createValidGetNodeAiAdapterDeps();
}

export function createValidGetNodeAiAdapterParamsSample(): GetNodeAiAdapterParams {
  return createValidGetNodeAiAdapterParams();
}

export function createValidAiAdapterSample(): AiAdapter {
  return createValidAiAdapter();
}
