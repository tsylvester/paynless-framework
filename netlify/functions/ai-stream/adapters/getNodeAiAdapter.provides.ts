import type { NodeProviderMap } from './ai-adapter.interface.ts';

export const defaultNodeProviderMap: NodeProviderMap = {};

export { getNodeAiAdapter } from './getNodeAiAdapter.ts';

export type {
  GetNodeAiAdapterDeps,
  GetNodeAiAdapterFn,
  GetNodeAiAdapterParams,
} from './getNodeAiAdapter.interface.ts';

export type {
  AiAdapter,
  AiAdapterParams,
  AiAdapterResult,
  NodeAdapterFactory,
  NodeChatApiRequest,
  NodeModelConfig,
  NodeProviderMap,
  NodeTokenUsage,
} from './ai-adapter.interface.ts';

export {
  isAiAdapter,
  isAiAdapterParams,
  isAiAdapterResult,
  isNodeTokenUsage,
} from './getNodeAiAdapter.guard.ts';

export { runAdapterConformanceTests } from './adapter-conformance.test-utils.ts';

export {
  createMockGetNodeAiAdapterDeps,
  createMockGetNodeAiAdapterParams,
  createMockNodeProviderMap,
  mockAiAdapter,
} from './getNodeAiAdapter.mock.ts';
