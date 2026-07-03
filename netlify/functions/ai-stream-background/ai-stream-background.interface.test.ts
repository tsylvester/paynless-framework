import { describe, expect, it } from 'vitest';
import type {
  AiWorkloadEmbeddingEvent,
  AiWorkloadEmbeddingPayload,
  AiWorkloadEvent,
  AiWorkloadPayload,
  AiWorkloadStreamEvent,
  AiWorkloadStreamPayload,
  AiStreamDeps,
} from './ai-stream-background.interface.ts';

describe('ai-stream.interface contract', () => {
  it('accepts stream workload event with required operation marker and chat request fields', () => {
    const event: AiWorkloadStreamEvent = {
      job_id: 'job-1',
      api_identifier: 'openai-gpt-4o',
      model_config: {
        api_identifier: 'openai-gpt-4o',
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
      },
      operation: 'stream',
      chat_api_request: {
        message: 'hello',
        providerId: 'prov-1',
        promptId: 'prompt-1',
      },
      sig: 'hmac-sig-value',
      user_config: { tier_output_cap_tokens: null },
    };
    expect(typeof event.job_id).toBe('string');
    expect(typeof event.api_identifier).toBe('string');
    expect(typeof event.model_config).toBe('object');
    expect(event.operation).toBe('stream');
    expect(typeof event.chat_api_request).toBe('object');
    expect(typeof event.sig).toBe('string');
  });

  it('accepts stream workload payload with stream-only output fields', () => {
    const payload: AiWorkloadStreamPayload = {
      job_id: 'job-1',
      operation: 'stream',
      assembled_content: 'assembled assistant text',
      token_usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
      finish_reason: 'stop',
      sig: 'hmac-sig-value',
    };
    expect(typeof payload.job_id).toBe('string');
    expect(payload.operation).toBe('stream');
    expect(typeof payload.assembled_content).toBe('string');
    expect(payload.token_usage).not.toBe(null);
    expect(typeof payload.finish_reason).toBe('string');
    expect(typeof payload.token_usage?.prompt_tokens).toBe('number');
    expect(typeof payload.token_usage?.completion_tokens).toBe('number');
    expect(typeof payload.token_usage?.total_tokens).toBe('number');
    expect(typeof payload.sig).toBe('string');
  });

  it('accepts stream workload payload with token_usage null and finish_reason null', () => {
    const payload: AiWorkloadStreamPayload = {
      job_id: 'job-2',
      operation: 'stream',
      assembled_content: '',
      token_usage: null,
      finish_reason: null,
      sig: 'hmac-sig-value',
    };
    expect(payload.operation).toBe('stream');
    expect(payload.token_usage).toBe(null);
    expect(payload.finish_reason).toBe(null);
    expect(typeof payload.sig).toBe('string');
  });

  it('accepts embedding workload event with required mode marker and embedding input fields', () => {
    const event: AiWorkloadEmbeddingEvent = {
      job_id: 'job-embed-1',
      api_identifier: 'openai-text-embedding-3-large',
      model_config: {
        api_identifier: 'openai-text-embedding-3-large',
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.0,
      },
      operation: 'embedding',
      embedding_api_request: {
        input: 'embed this sentence',
      },
      sig: 'hmac-sig-value',
      user_config: { tier_output_cap_tokens: null },
    };
    expect(typeof event.job_id).toBe('string');
    expect(typeof event.api_identifier).toBe('string');
    expect(typeof event.model_config).toBe('object');
    expect(event.operation).toBe('embedding');
    expect(typeof event.embedding_api_request.input).toBe('string');
    expect(typeof event.sig).toBe('string');
  });

  it('accepts embedding workload payload with embedding output fields', () => {
    const payload: AiWorkloadEmbeddingPayload = {
      job_id: 'job-embed-1',
      operation: 'embedding',
      embedding: [0.11, -0.22, 0.33],
      token_usage: {
        prompt_tokens: 12,
        completion_tokens: 0,
        total_tokens: 12,
      },
      sig: 'hmac-sig-value',
    };
    expect(typeof payload.job_id).toBe('string');
    expect(payload.operation).toBe('embedding');
    expect(Array.isArray(payload.embedding)).toBe(true);
    expect(typeof payload.embedding[0]).toBe('number');
    expect(typeof payload.token_usage.prompt_tokens).toBe('number');
    expect(typeof payload.token_usage.completion_tokens).toBe('number');
    expect(typeof payload.token_usage.total_tokens).toBe('number');
    expect(typeof payload.sig).toBe('string');
  });

  it('accepts workload event union for stream and embedding variants', () => {
    const streamEvent: AiWorkloadEvent = {
      job_id: 'job-stream-union',
      api_identifier: 'openai-gpt-4o',
      model_config: {
        api_identifier: 'openai-gpt-4o',
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
      },
      operation: 'stream',
      chat_api_request: {
        message: 'hello',
        providerId: 'prov-1',
        promptId: 'prompt-1',
      },
      sig: 'hmac-stream-union',
      user_config: { tier_output_cap_tokens: null },
    };
    const embeddingEvent: AiWorkloadEvent = {
      job_id: 'job-embedding-union',
      api_identifier: 'openai-text-embedding-3-large',
      model_config: {
        api_identifier: 'openai-text-embedding-3-large',
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.0,
      },
      operation: 'embedding',
      embedding_api_request: {
        input: 'embed this sentence',
      },
      sig: 'hmac-embedding-union',
      user_config: { tier_output_cap_tokens: null },
    };
    expect(streamEvent.operation).toBe('stream');
    expect(embeddingEvent.operation).toBe('embedding');
  });

  it('accepts workload payload union for stream and embedding variants without ambiguity', () => {
    const streamPayload: AiWorkloadPayload = {
      job_id: 'job-stream-payload-union',
      operation: 'stream',
      assembled_content: 'assembled assistant text',
      token_usage: null,
      finish_reason: null,
      sig: 'hmac-stream-payload-union',
    };
    const embeddingPayload: AiWorkloadPayload = {
      job_id: 'job-embedding-payload-union',
      operation: 'embedding',
      embedding: [0.01, 0.02, 0.03],
      token_usage: {
        prompt_tokens: 3,
        completion_tokens: 0,
        total_tokens: 3,
      },
      sig: 'hmac-embedding-payload-union',
    };
    expect(streamPayload.operation).toBe('stream');
    expect(embeddingPayload.operation).toBe('embedding');
  });

  it('accepts AiStreamDeps with providerMap, saveResponseUrl, and getApiKey', () => {
    const deps: AiStreamDeps = {
      providerMap: {},
      saveResponseUrl: 'http://localhost/mock-saveResponse',
      getApiKey: (apiIdentifier: string): string => {
        return apiIdentifier.length > 0 ? 'mock-key' : '';
      },
    };
    expect(typeof deps.saveResponseUrl).toBe('string');
    expect(typeof deps.providerMap).toBe('object');
    expect(typeof deps.getApiKey).toBe('function');
    expect(typeof deps.getApiKey('openai-gpt-4o')).toBe('string');
  });

  it('stream workload event contract includes user_config tier_output_cap_tokens', () => {
    const withNull: AiWorkloadStreamEvent = {
      job_id: 'j',
      api_identifier: 'a',
      model_config: {
        api_identifier: 'a',
        input_token_cost_rate: null,
        output_token_cost_rate: null,
      },
      operation: 'stream',
      chat_api_request: {
        message: 'hi',
        providerId: 'p',
        promptId: 'q',
      },
      sig: 's',
      user_config: { tier_output_cap_tokens: null },
    };
    const withNumber: AiWorkloadStreamEvent = {
      ...withNull,
      user_config: { tier_output_cap_tokens: 32_768 },
    };
    expect(withNull.user_config.tier_output_cap_tokens).toBe(null);
    expect(withNumber.user_config.tier_output_cap_tokens).toBe(32_768);
  });
});
