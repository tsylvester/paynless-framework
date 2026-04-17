import type {
  AiAdapter,
  NodeAdapterConstructorParams,
  NodeProviderMap,
} from './adapters/ai-adapter.interface.ts';
import { createMockAnthropicNodeAdapter } from './adapters/anthropic/anthropic.mock.ts';
import { createMockGoogleNodeAdapter } from './adapters/google/google.mock.ts';
import { createMockOpenAINodeAdapter } from './adapters/openai/openai.mock.ts';
import type { AiStreamDeps, GetApiKeyFn } from './ai-stream.interface.ts';

export const mockAiStreamSaveResponseUrl: string =
  'http://localhost/mock-saveResponse';

const defaultGetApiKey: GetApiKeyFn = (): string => {
  return 'mock-key';
};

const defaultOpenAiFactory = (
  _params: NodeAdapterConstructorParams,
): AiAdapter => {
  return createMockOpenAINodeAdapter();
};

const defaultAnthropicFactory = (
  _params: NodeAdapterConstructorParams,
): AiAdapter => {
  return createMockAnthropicNodeAdapter();
};

const defaultGoogleFactory = (
  _params: NodeAdapterConstructorParams,
): AiAdapter => {
  return createMockGoogleNodeAdapter();
};

const defaultProviderMap: NodeProviderMap = {
  'openai-': defaultOpenAiFactory,
  'anthropic-': defaultAnthropicFactory,
  'google-': defaultGoogleFactory,
};

export function createMockAiStreamDeps(
  overrides?: Partial<AiStreamDeps>,
): AiStreamDeps {
  const providerMap: NodeProviderMap =
    overrides?.providerMap === undefined
      ? { ...defaultProviderMap }
      : overrides.providerMap;
  const saveResponseUrl: string =
    overrides?.saveResponseUrl === undefined
      ? mockAiStreamSaveResponseUrl
      : overrides.saveResponseUrl;
  const getApiKey: GetApiKeyFn =
    overrides?.getApiKey === undefined ? defaultGetApiKey : overrides.getApiKey;
  return {
    providerMap,
    saveResponseUrl,
    getApiKey,
  };
}
