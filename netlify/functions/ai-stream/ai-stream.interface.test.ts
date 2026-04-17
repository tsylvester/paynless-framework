import { describe, expect, it } from 'vitest';
import type {
  AiStreamDeps,
  AiStreamEvent,
  AiStreamPayload,
} from './ai-stream.interface.ts';

describe('ai-stream.interface contract', () => {
  it('accepts AiStreamEvent with all required fields', () => {
    const event: AiStreamEvent = {
      job_id: 'job-1',
      api_identifier: 'openai-gpt-4o',
      model_config: {
        api_identifier: 'openai-gpt-4o',
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
      },
      chat_api_request: {
        message: 'hello',
        providerId: 'prov-1',
        promptId: 'prompt-1',
      },
      user_jwt: 'jwt-token',
    };
    expect(typeof event.job_id).toBe('string');
    expect(typeof event.api_identifier).toBe('string');
    expect(typeof event.model_config).toBe('object');
    expect(typeof event.chat_api_request).toBe('object');
    expect(typeof event.user_jwt).toBe('string');
  });

  it('accepts AiStreamPayload with assembled_content and token_usage and finish_reason', () => {
    const payload: AiStreamPayload = {
      job_id: 'job-1',
      assembled_content: 'assembled assistant text',
      token_usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
      finish_reason: 'stop',
    };
    expect(typeof payload.job_id).toBe('string');
    expect(typeof payload.assembled_content).toBe('string');
    expect(payload.token_usage).not.toBe(null);
    expect(typeof payload.finish_reason).toBe('string');
    expect(typeof payload.token_usage?.prompt_tokens).toBe('number');
    expect(typeof payload.token_usage?.completion_tokens).toBe('number');
    expect(typeof payload.token_usage?.total_tokens).toBe('number');
  });

  it('accepts AiStreamPayload with token_usage null and finish_reason null', () => {
    const payload: AiStreamPayload = {
      job_id: 'job-2',
      assembled_content: '',
      token_usage: null,
      finish_reason: null,
    };
    expect(payload.token_usage).toBe(null);
    expect(payload.finish_reason).toBe(null);
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
});
