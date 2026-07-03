import { describe, expect, it } from 'vitest';
import {
  isAiStreamDeps,
  isAiWorkloadEvent,
  isAiWorkloadPayload,
} from './ai-stream-background.guard.ts';

describe('ai-stream.guard', () => {
  describe('isAiWorkloadEvent', () => {
    it('accepts valid stream event with model_config and chat_api_request in corrected shapes', () => {
      const value = {
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
      expect(isAiWorkloadEvent(value)).toBe(true);
    });

    it('accepts valid embedding event shape', () => {
      const value = {
        job_id: 'job-embed-1',
        api_identifier: 'openai-text-embedding-3-large',
        model_config: {
          api_identifier: 'openai-text-embedding-3-large',
          input_token_cost_rate: 0.001,
          output_token_cost_rate: 0,
        },
        operation: 'embedding',
        embedding_api_request: {
          input: 'embed this text',
        },
        sig: 'hmac-sig-value',
        user_config: { tier_output_cap_tokens: null },
      };
      expect(isAiWorkloadEvent(value)).toBe(true);
    });

    it('rejects missing fields', () => {
      expect(isAiWorkloadEvent({})).toBe(false);
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
      expect(isAiWorkloadEvent(value)).toBe(false);
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
      expect(isAiWorkloadEvent(value)).toBe(false);
    });

    it('rejects AiWorkloadEvent missing sig', () => {
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
        user_config: { tier_output_cap_tokens: null },
      };
      expect(isAiWorkloadEvent(value)).toBe(false);
    });

    it('rejects AiWorkloadEvent with user_jwt in place of sig', () => {
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
        user_config: { tier_output_cap_tokens: null },
      };
      expect(isAiWorkloadEvent(value)).toBe(false);
    });

    it('isAiWorkloadEvent accepts valid event with user_config: { tier_output_cap_tokens: null }', () => {
      const value = {
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
      expect(isAiWorkloadEvent(value)).toBe(true);
    });

    it('isAiWorkloadEvent accepts valid event with user_config: { tier_output_cap_tokens: 32768 }', () => {
      const value = {
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
        user_config: { tier_output_cap_tokens: 32_768 },
      };
      expect(isAiWorkloadEvent(value)).toBe(true);
    });

    it('rejects event missing operation discriminator', () => {
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
        user_config: { tier_output_cap_tokens: null },
      };
      expect(isAiWorkloadEvent(value)).toBe(false);
    });

    it('isAiWorkloadEvent rejects event missing user_config field entirely', () => {
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
      expect(isAiWorkloadEvent(value)).toBe(false);
    });
  });

  describe('isAiWorkloadPayload', () => {
    it('accepts valid stream payload with sig', () => {
      const value = {
        job_id: 'job-1',
        operation: 'stream',
        assembled_content: 'text',
        token_usage: {
          prompt_tokens: 1,
          completion_tokens: 2,
          total_tokens: 3,
        },
        finish_reason: 'stop',
        sig: 'hmac-sig-value',
      };
      expect(isAiWorkloadPayload(value)).toBe(true);
    });

    it('accepts embedding payload variant', () => {
      const value = {
        job_id: 'job-embed-1',
        operation: 'embedding',
        embedding: [0.11, -0.22, 0.33],
        token_usage: {
          prompt_tokens: 7,
          completion_tokens: 0,
          total_tokens: 7,
        },
        sig: 'hmac-sig-value',
      };
      expect(isAiWorkloadPayload(value)).toBe(true);
    });

    it('rejects missing job_id', () => {
      const value = {
        assembled_content: 'text',
        token_usage: null,
        finish_reason: null,
      };
      expect(isAiWorkloadPayload(value)).toBe(false);
    });

    it('accepts null token_usage', () => {
      const value = {
        job_id: 'job-1',
        operation: 'stream',
        assembled_content: 'text',
        token_usage: null,
        finish_reason: 'stop',
        sig: 'hmac-sig-value',
      };
      expect(isAiWorkloadPayload(value)).toBe(true);
    });

    it('accepts null finish_reason', () => {
      const value = {
        job_id: 'job-1',
        operation: 'stream',
        assembled_content: 'text',
        token_usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
        finish_reason: null,
        sig: 'hmac-sig-value',
      };
      expect(isAiWorkloadPayload(value)).toBe(true);
    });

    it('rejects payload with mixed/invalid operation output fields', () => {
      const value = {
        job_id: 'job-1',
        operation: 'stream',
        assembled_content: 'text',
        embedding: [0.01, 0.02],
        token_usage: null,
        finish_reason: 'stop',
        sig: 'hmac-sig-value',
      };
      expect(isAiWorkloadPayload(value)).toBe(false);
    });

    it('rejects AiWorkloadPayload missing sig', () => {
      const value = {
        job_id: 'job-1',
        assembled_content: 'text',
        token_usage: null,
        finish_reason: 'stop',
      };
      expect(isAiWorkloadPayload(value)).toBe(false);
    });

    it('rejects missing finish_reason field entirely', () => {
      const value = {
        job_id: 'job-1',
        assembled_content: 'text',
        token_usage: null,
      };
      expect(isAiWorkloadPayload(value)).toBe(false);
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
