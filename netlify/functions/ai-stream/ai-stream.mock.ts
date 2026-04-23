import type {
  AiAdapter,
  NodeAdapterConstructorParams,
  NodeChatApiRequest,
  NodeModelConfig,
  NodeProviderMap,
} from './adapters/ai-adapter.interface.ts';
import { createMockAnthropicNodeAdapter } from './adapters/anthropic/anthropic.mock.ts';
import { createMockGoogleNodeAdapter } from './adapters/google/google.mock.ts';
import {
  createMockOpenAINodeAdapter,
  mockNodeChatApiRequest,
  mockNodeModelConfig,
} from './adapters/openai/openai.mock.ts';
import type { AsyncWorkloadEvent } from '@netlify/async-workloads';
import type { AiStreamDeps, AiStreamEvent, GetApiKeyFn } from './ai-stream.interface.ts';

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

export function createMockAiStreamEvent(
  overrides?: Partial<AiStreamEvent>,
): AiStreamEvent {
  const job_id: string =
    overrides?.job_id === undefined ? 'mock-job-id' : overrides.job_id;
  const api_identifier: string =
    overrides?.api_identifier === undefined
      ? 'openai-gpt-4o'
      : overrides.api_identifier;
  const model_config: NodeModelConfig =
    overrides?.model_config === undefined
      ? { ...mockNodeModelConfig }
      : overrides.model_config;
  const chat_api_request: NodeChatApiRequest =
    overrides?.chat_api_request === undefined
      ? { ...mockNodeChatApiRequest }
      : overrides.chat_api_request;
  const sig: string =
    overrides?.sig === undefined ? 'mock-hmac-sig' : overrides.sig;
  return { job_id, api_identifier, model_config, chat_api_request, sig };
}

export function createMockAsyncWorkloadEvent(
  overrides?: Partial<AsyncWorkloadEvent>,
): AsyncWorkloadEvent {
  const eventName: string =
    overrides?.eventName === undefined ? 'ai-stream' : overrides.eventName;
  const eventData: unknown =
    overrides?.eventData === undefined
      ? createMockAiStreamEvent()
      : overrides.eventData;
  const eventId: string =
    overrides?.eventId === undefined ? 'mock-event-id' : overrides.eventId;
  const request: Request =
    overrides?.request === undefined
      ? new Request('http://localhost/mock')
      : overrides.request;
  const attempt: number =
    overrides?.attempt === undefined ? 0 : overrides.attempt;
  const step: AsyncWorkloadEvent['step'] =
    overrides?.step === undefined
      ? {
          run: async <ST>(
            _stepId: string,
            _cb: () => Promise<ST> | ST,
          ): Promise<ST> => {
            throw new Error('step.run must not be called');
          },
          sleep: async (
            _reasonId: string,
            _sleepMs: number | string,
          ): Promise<void> => {
            throw new Error('step.sleep must not be called');
          },
        }
      : overrides.step;
  const sendEvent: AsyncWorkloadEvent['sendEvent'] =
    overrides?.sendEvent === undefined
      ? async (
          _eventName: string,
        ): Promise<{ sendStatus: 'succeeded' | 'failed'; eventId: string }> => {
          return { sendStatus: 'succeeded', eventId: 'mock-send-event-id' };
        }
      : overrides.sendEvent;
  return { eventName, eventData, eventId, request, attempt, step, sendEvent };
}
