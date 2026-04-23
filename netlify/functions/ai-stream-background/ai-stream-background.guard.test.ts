import { describe, expect, it } from 'vitest';
import {
  isAiStreamDeps,
  isAiStreamEvent,
  isAiStreamPayload,
} from './ai-stream-background.guard.ts';

describe('ai-stream.guard', () => {
  describe('isAiStreamEvent', () => {
    it('accepts valid event with model_config and chat_api_request in corrected shapes', () => {
      const value = {
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
        sig: 'hmac-sig-value',
      };
      expect(isAiStreamEvent(value)).toBe(true);
    });

    it('rejects missing fields', () => {
      expect(isAiStreamEvent({})).toBe(false);
    });

    it('rejects invalid model_config', () => {
      const value = {
        job_id: 'job-1',
        api_identifier: 'openai-gpt-4o',
        model_config: {
          input_token_cost_rate: null,
          output_token_cost_rate: null,
        },
        chat_api_request: {
          message: 'hello',
          providerId: 'prov-1',
          promptId: 'prompt-1',
        },
        sig: 'hmac-sig-value',
      };
      expect(isAiStreamEvent(value)).toBe(false);
    });

    it('rejects invalid chat_api_request', () => {
      const value = {
        job_id: 'job-1',
        api_identifier: 'openai-gpt-4o',
        model_config: {
          api_identifier: 'openai-gpt-4o',
          input_token_cost_rate: null,
          output_token_cost_rate: null,
        },
        chat_api_request: {
          message: '',
          providerId: 'prov-1',
          promptId: 'prompt-1',
        },
        sig: 'hmac-sig-value',
      };
      expect(isAiStreamEvent(value)).toBe(false);
    });

    it('rejects AiStreamEvent missing sig', () => {
      const value = {
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
      };
      expect(isAiStreamEvent(value)).toBe(false);
    });

    it('rejects AiStreamEvent with user_jwt in place of sig', () => {
      const value = {
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
      expect(isAiStreamEvent(value)).toBe(false);
    });
  });

  describe('isAiStreamPayload', () => {
    it('accepts valid payload with sig', () => {
      const value = {
        job_id: 'job-1',
        assembled_content: 'text',
        token_usage: {
          prompt_tokens: 1,
          completion_tokens: 2,
          total_tokens: 3,
        },
        finish_reason: 'stop',
        sig: 'hmac-sig-value',
      };
      expect(isAiStreamPayload(value)).toBe(true);
    });

    it('rejects missing job_id', () => {
      const value = {
        assembled_content: 'text',
        token_usage: null,
        finish_reason: null,
      };
      expect(isAiStreamPayload(value)).toBe(false);
    });

    it('accepts null token_usage', () => {
      const value = {
        job_id: 'job-1',
        assembled_content: 'text',
        token_usage: null,
        finish_reason: 'stop',
        sig: 'hmac-sig-value',
      };
      expect(isAiStreamPayload(value)).toBe(true);
    });

    it('accepts null finish_reason', () => {
      const value = {
        job_id: 'job-1',
        assembled_content: 'text',
        token_usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
        finish_reason: null,
        sig: 'hmac-sig-value',
      };
      expect(isAiStreamPayload(value)).toBe(true);
    });

    it('rejects AiStreamPayload missing sig', () => {
      const value = {
        job_id: 'job-1',
        assembled_content: 'text',
        token_usage: null,
        finish_reason: 'stop',
      };
      expect(isAiStreamPayload(value)).toBe(false);
    });

    it('rejects missing finish_reason field entirely', () => {
      const value = {
        job_id: 'job-1',
        assembled_content: 'text',
        token_usage: null,
      };
      expect(isAiStreamPayload(value)).toBe(false);
    });
  });

  describe('isAiStreamDeps', () => {
    it('accepts valid deps', () => {
      const value = {
        providerMap: {},
        saveResponseUrl: 'http://localhost/mock-saveResponse',
        getApiKey: (): string => {
          return 'mock-key';
        },
      };
      expect(isAiStreamDeps(value)).toBe(true);
    });

    it('rejects missing providerMap', () => {
      const value = {
        saveResponseUrl: 'http://localhost/mock-saveResponse',
        getApiKey: (): string => {
          return 'mock-key';
        },
      };
      expect(isAiStreamDeps(value)).toBe(false);
    });

    it('rejects missing saveResponseUrl', () => {
      const value = {
        providerMap: {},
        getApiKey: (): string => {
          return 'mock-key';
        },
      };
      expect(isAiStreamDeps(value)).toBe(false);
    });
  });
});
