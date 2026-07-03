import type {
  AiAdapter,
  NodeAdapterConstructorParams,
  NodeEmbeddingRequest,
  NodeEmbeddingVector,
  NodeProviderMap,
  NodeTokenUsage,
  NodeUserConfig,
} from './adapters/ai-adapter.interface.ts';
import { buildMockAnthropicNodeAdapter } from './adapters/anthropic/anthropic.mock.ts';
import { buildGoogleNodeAdapter } from './adapters/google/google.mock.ts';
import {
  buildOpenAINodeAdapter,
  mockNodeChatApiRequest,
  mockNodeModelConfig,
} from './adapters/openai/openai.mock.ts';
import type { AsyncWorkloadEvent } from '@netlify/async-workloads';
import type {
  AiStreamDeps,
  AiWorkloadEmbeddingEvent,
  AiWorkloadEmbeddingPayload,
  AiWorkloadEvent,
  AiWorkloadPayload,
  AiWorkloadStreamEvent,
  AiWorkloadStreamPayload,
  GetApiKeyFn,
} from './ai-stream-background.interface.ts';

export const mockAiStreamSaveResponseUrl: string =
  'http://localhost/mock-saveResponse';

const defaultUserConfig: NodeUserConfig = { tier_output_cap_tokens: null };
const defaultTokenUsage: NodeTokenUsage = {
  prompt_tokens: 10,
  completion_tokens: 20,
  total_tokens: 30,
};
const defaultEmbeddingVector: NodeEmbeddingVector = [0.123, 0.456, 0.789];
const defaultEmbeddingRequest: NodeEmbeddingRequest = { input: 'embed this text' };

const defaultGetApiKey: GetApiKeyFn = (): string => {
  return 'mock-key';
};

const defaultOpenAiFactory = (
  _params: NodeAdapterConstructorParams,
): AiAdapter => {
  return buildOpenAINodeAdapter();
};

const defaultAnthropicFactory = (
  _params: NodeAdapterConstructorParams,
): AiAdapter => {
  return buildMockAnthropicNodeAdapter();
};

const defaultGoogleFactory = (
  _params: NodeAdapterConstructorParams,
): AiAdapter => {
  return buildGoogleNodeAdapter();
};

const defaultProviderMap: NodeProviderMap = {
  'openai-': defaultOpenAiFactory,
  'anthropic-': defaultAnthropicFactory,
  'google-': defaultGoogleFactory,
};

export function buildMockAiStreamDeps(
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

export type AiWorkloadStreamEventOverrides = {
  [K in keyof AiWorkloadStreamEvent]?: AiWorkloadStreamEvent[K] | null;
};

export type AiWorkloadEmbeddingEventOverrides = {
  [K in keyof AiWorkloadEmbeddingEvent]?: AiWorkloadEmbeddingEvent[K] | null;
};

export type AiWorkloadStreamPayloadOverrides = {
  [K in keyof AiWorkloadStreamPayload]?: AiWorkloadStreamPayload[K] | null;
};

export type AiWorkloadEmbeddingPayloadOverrides = {
  [K in keyof AiWorkloadEmbeddingPayload]?: AiWorkloadEmbeddingPayload[K] | null;
};

export const mockAiWorkloadStreamEvent: AiWorkloadStreamEvent = {
  job_id: 'mock-job-id',
  api_identifier: 'openai-gpt-4o',
  model_config: { ...mockNodeModelConfig },
  operation: 'stream',
  chat_api_request: { ...mockNodeChatApiRequest },
  sig: 'mock-hmac-sig',
  user_config: { ...defaultUserConfig },
};

export const mockAiWorkloadEmbeddingEvent: AiWorkloadEmbeddingEvent = {
  job_id: 'mock-embedding-job-id',
  api_identifier: 'openai-text-embedding-3-large',
  model_config: {
    ...mockNodeModelConfig,
    api_identifier: 'openai-text-embedding-3-large',
    output_token_cost_rate: 0,
  },
  operation: 'embedding',
  embedding_api_request: { ...defaultEmbeddingRequest },
  sig: 'mock-hmac-sig',
  user_config: { ...defaultUserConfig },
};

export const mockAiWorkloadStreamPayload: AiWorkloadStreamPayload = {
  job_id: 'mock-job-id',
  operation: 'stream',
  assembled_content: 'mock stream content',
  token_usage: { ...defaultTokenUsage },
  finish_reason: 'stop',
  sig: 'mock-hmac-sig',
};

export const mockAiWorkloadEmbeddingPayload: AiWorkloadEmbeddingPayload = {
  job_id: 'mock-embedding-job-id',
  operation: 'embedding',
  embedding: [...defaultEmbeddingVector],
  token_usage: { ...defaultTokenUsage, completion_tokens: 0, total_tokens: 10 },
  sig: 'mock-hmac-sig',
};

export function buildMockAiWorkloadStreamEvent(
  overrides?: AiWorkloadStreamEventOverrides,
): AiWorkloadStreamEvent {
  if (overrides === undefined) {
    return {
      ...mockAiWorkloadStreamEvent,
      model_config: { ...mockAiWorkloadStreamEvent.model_config },
      chat_api_request: { ...mockAiWorkloadStreamEvent.chat_api_request },
      user_config: { ...mockAiWorkloadStreamEvent.user_config },
    };
  }
  return {
    job_id:
      overrides.job_id !== undefined && overrides.job_id !== null
        ? overrides.job_id
        : mockAiWorkloadStreamEvent.job_id,
    api_identifier:
      overrides.api_identifier !== undefined && overrides.api_identifier !== null
        ? overrides.api_identifier
        : mockAiWorkloadStreamEvent.api_identifier,
    model_config:
      overrides.model_config !== undefined && overrides.model_config !== null
        ? overrides.model_config
        : { ...mockAiWorkloadStreamEvent.model_config },
    operation: 'stream',
    chat_api_request:
      overrides.chat_api_request !== undefined && overrides.chat_api_request !== null
        ? overrides.chat_api_request
        : { ...mockAiWorkloadStreamEvent.chat_api_request },
    sig:
      overrides.sig !== undefined && overrides.sig !== null
        ? overrides.sig
        : mockAiWorkloadStreamEvent.sig,
    user_config:
      overrides.user_config !== undefined && overrides.user_config !== null
        ? overrides.user_config
        : { ...mockAiWorkloadStreamEvent.user_config },
  };
}

export function buildAiWorkloadEmbeddingEvent(
  overrides?: AiWorkloadEmbeddingEventOverrides,
): AiWorkloadEmbeddingEvent {
  if (overrides === undefined) {
    return {
      ...mockAiWorkloadEmbeddingEvent,
      model_config: { ...mockAiWorkloadEmbeddingEvent.model_config },
      embedding_api_request: { ...mockAiWorkloadEmbeddingEvent.embedding_api_request },
      user_config: { ...mockAiWorkloadEmbeddingEvent.user_config },
    };
  }
  return {
    job_id:
      overrides.job_id !== undefined && overrides.job_id !== null
        ? overrides.job_id
        : mockAiWorkloadEmbeddingEvent.job_id,
    api_identifier:
      overrides.api_identifier !== undefined && overrides.api_identifier !== null
        ? overrides.api_identifier
        : mockAiWorkloadEmbeddingEvent.api_identifier,
    model_config:
      overrides.model_config !== undefined && overrides.model_config !== null
        ? overrides.model_config
        : { ...mockAiWorkloadEmbeddingEvent.model_config },
    operation: 'embedding',
    embedding_api_request:
      overrides.embedding_api_request !== undefined && overrides.embedding_api_request !== null
        ? overrides.embedding_api_request
        : { ...mockAiWorkloadEmbeddingEvent.embedding_api_request },
    sig:
      overrides.sig !== undefined && overrides.sig !== null
        ? overrides.sig
        : mockAiWorkloadEmbeddingEvent.sig,
    user_config:
      overrides.user_config !== undefined && overrides.user_config !== null
        ? overrides.user_config
        : { ...mockAiWorkloadEmbeddingEvent.user_config },
  };
}

export function buildAiWorkloadEvent(
  overrides?: Partial<AiWorkloadEvent>,
): AiWorkloadEvent {
  if (overrides?.operation === 'embedding') {
    return buildAiWorkloadEmbeddingEvent(overrides);
  }
  if (overrides?.operation === 'stream') {
    return buildMockAiWorkloadStreamEvent(overrides);
  }
  return buildMockAiWorkloadStreamEvent();
}

export function buildAiWorkloadStreamPayload(
  overrides?: AiWorkloadStreamPayloadOverrides,
): AiWorkloadStreamPayload {
  if (overrides === undefined) {
    return {
      ...mockAiWorkloadStreamPayload,
      token_usage:
        mockAiWorkloadStreamPayload.token_usage === null
          ? null
          : { ...mockAiWorkloadStreamPayload.token_usage },
    };
  }
  return {
    job_id:
      overrides.job_id !== undefined && overrides.job_id !== null
        ? overrides.job_id
        : mockAiWorkloadStreamPayload.job_id,
    operation: 'stream',
    assembled_content:
      overrides.assembled_content !== undefined && overrides.assembled_content !== null
        ? overrides.assembled_content
        : mockAiWorkloadStreamPayload.assembled_content,
    token_usage:
      overrides.token_usage !== undefined
        ? overrides.token_usage
        : mockAiWorkloadStreamPayload.token_usage,
    finish_reason:
      overrides.finish_reason !== undefined
        ? overrides.finish_reason
        : mockAiWorkloadStreamPayload.finish_reason,
    sig:
      overrides.sig !== undefined && overrides.sig !== null
        ? overrides.sig
        : mockAiWorkloadStreamPayload.sig,
  };
}

export function buildAiWorkloadEmbeddingPayload(
  overrides?: AiWorkloadEmbeddingPayloadOverrides,
): AiWorkloadEmbeddingPayload {
  if (overrides === undefined) {
    return {
      ...mockAiWorkloadEmbeddingPayload,
      embedding: [...mockAiWorkloadEmbeddingPayload.embedding],
      token_usage: { ...mockAiWorkloadEmbeddingPayload.token_usage },
    };
  }
  return {
    job_id:
      overrides.job_id !== undefined && overrides.job_id !== null
        ? overrides.job_id
        : mockAiWorkloadEmbeddingPayload.job_id,
    operation: 'embedding',
    embedding:
      overrides.embedding !== undefined && overrides.embedding !== null
        ? overrides.embedding
        : [...mockAiWorkloadEmbeddingPayload.embedding],
    token_usage:
      overrides.token_usage !== undefined && overrides.token_usage !== null
        ? overrides.token_usage
        : { ...mockAiWorkloadEmbeddingPayload.token_usage },
    sig:
      overrides.sig !== undefined && overrides.sig !== null
        ? overrides.sig
        : mockAiWorkloadEmbeddingPayload.sig,
  };
}

export function buildMockAiWorkloadPayload(
  overrides?: Partial<AiWorkloadPayload>,
): AiWorkloadPayload {
  if (overrides?.operation === 'embedding') {
    return buildAiWorkloadEmbeddingPayload(overrides);
  }
  if (overrides?.operation === 'stream') {
    return buildAiWorkloadStreamPayload(overrides);
  }
  return buildAiWorkloadStreamPayload();
}

export function buildMockAiStreamEvent(
  overrides?: Partial<AiWorkloadStreamEvent>,
): AiWorkloadStreamEvent {
  return buildMockAiWorkloadStreamEvent(overrides);
}

export function buildMockAsyncWorkloadEvent(
  overrides?: Partial<AsyncWorkloadEvent>,
): AsyncWorkloadEvent {
  const eventName: string =
    overrides?.eventName === undefined ? 'ai-stream' : overrides.eventName;
  const eventData: unknown =
    overrides?.eventData === undefined
      ? buildMockAiWorkloadStreamEvent()
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
