import { describe, it, expect } from 'vitest';
import {
  isAiStreamDeps,
  isAiStreamEvent,
  isAiStreamPayload,
} from './ai-stream.guard.ts';
import {
  createValidAiStreamEvent,
  createValidAiStreamPayload,
  mockAiStreamDeps,
} from './ai-stream.mock.ts';

describe('ai-stream.guard', () => {
  describe('isAiStreamEvent', () => {
    it('accepts a valid AiStreamEvent', () => {
      expect(isAiStreamEvent(createValidAiStreamEvent())).toBe(true);
    });

    it('rejects a value missing job_id', () => {
      const full: ReturnType<typeof createValidAiStreamEvent> =
        createValidAiStreamEvent();
      const missingJobId = {
        api_identifier: full.api_identifier,
        extended_model_config: full.extended_model_config,
        chat_api_request: full.chat_api_request,
        user_jwt: full.user_jwt,
      };
      expect(isAiStreamEvent(missingJobId)).toBe(false);
    });

    it('rejects a value missing user_jwt', () => {
      const full: ReturnType<typeof createValidAiStreamEvent> =
        createValidAiStreamEvent();
      const missingUserJwt = {
        job_id: full.job_id,
        api_identifier: full.api_identifier,
        extended_model_config: full.extended_model_config,
        chat_api_request: full.chat_api_request,
      };
      expect(isAiStreamEvent(missingUserJwt)).toBe(false);
    });

    it('rejects an api_identifier whose prefix is not openai-, anthropic-, or google-', () => {
      expect(
        isAiStreamEvent(
          createValidAiStreamEvent({ api_identifier: 'mistral-unsup' }),
        ),
      ).toBe(false);
    });

    it('rejects an empty api_identifier', () => {
      expect(
        isAiStreamEvent(createValidAiStreamEvent({ api_identifier: '' })),
      ).toBe(false);
    });
  });

  describe('isAiStreamPayload', () => {
    it('accepts a valid AiStreamPayload', () => {
      expect(isAiStreamPayload(createValidAiStreamPayload())).toBe(true);
    });

    it('rejects a value missing job_id', () => {
      const full: ReturnType<typeof createValidAiStreamPayload> =
        createValidAiStreamPayload();
      const missingJobId = {
        assembled_content: full.assembled_content,
        token_usage: full.token_usage,
      };
      expect(isAiStreamPayload(missingJobId)).toBe(false);
    });

    it('accepts null token_usage', () => {
      expect(
        isAiStreamPayload(
          createValidAiStreamPayload({ token_usage: null }),
        ),
      ).toBe(true);
    });
  });

  describe('isAiStreamDeps', () => {
    it('accepts valid AiStreamDeps', () => {
      expect(isAiStreamDeps(mockAiStreamDeps())).toBe(true);
    });

    it('rejects a value missing adapter entries', () => {
      expect(isAiStreamDeps({})).toBe(false);
    });

    it('rejects a value missing the back-half URL field', () => {
      const deps = mockAiStreamDeps();
      const missingUrl = {
        openaiAdapter: deps.openaiAdapter,
        anthropicAdapter: deps.anthropicAdapter,
        googleAdapter: deps.googleAdapter,
        getApiKey: deps.getApiKey,
      };
      expect(isAiStreamDeps(missingUrl)).toBe(false);
    });
  });
});
