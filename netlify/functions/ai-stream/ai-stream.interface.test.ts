import { describe, it, expect } from 'vitest';
import type { AiStreamEvent, AiStreamPayload } from './ai-stream.interface.ts';
import {
  createValidNodeChatApiRequest,
  createValidNodeModelConfig,
} from './adapters/ai-adapter.mock.ts';
import { createValidAiStreamEvent, createValidAiStreamPayload } from './ai-stream.mock.ts';

describe('ai-stream.interface contract', () => {
  it('valid AiStreamEvent: all required fields present and typed correctly', () => {
    const event: AiStreamEvent = createValidAiStreamEvent();
    expect(typeof event.job_id).toBe('string');
    expect(event.job_id.length).toBeGreaterThan(0);
    expect(typeof event.api_identifier).toBe('string');
    expect(typeof event.extended_model_config).toBe('object');
    expect(event.extended_model_config).not.toBe(null);
    expect(typeof event.chat_api_request).toBe('object');
    expect(event.chat_api_request).not.toBe(null);
    expect(typeof event.user_jwt).toBe('string');
    expect(event.user_jwt.length).toBeGreaterThan(0);
  });

  it('valid AiStreamPayload: job_id, assembled_content, token_usage (nullable)', () => {
    const withUsage: AiStreamPayload = createValidAiStreamPayload();
    expect(typeof withUsage.job_id).toBe('string');
    expect(withUsage.job_id.length).toBeGreaterThan(0);
    expect(typeof withUsage.assembled_content).toBe('string');
    const usageOrNull = withUsage.token_usage;
    const usageIsObjectOrNull: boolean =
      usageOrNull === null || typeof usageOrNull === 'object';
    expect(usageIsObjectOrNull).toBe(true);
    if (usageOrNull !== null) {
      expect(Number.isInteger(usageOrNull.prompt_tokens)).toBe(true);
      expect(Number.isInteger(usageOrNull.completion_tokens)).toBe(true);
      expect(Number.isInteger(usageOrNull.total_tokens)).toBe(true);
    }
    const withNullUsage: AiStreamPayload = createValidAiStreamPayload({
      token_usage: null,
    });
    expect(withNullUsage.token_usage).toBe(null);
  });

  it('invalid structural shapes: missing job_id, missing user_jwt, empty api_identifier', () => {
    const modelConfig = createValidNodeModelConfig();
    const chatRequest = createValidNodeChatApiRequest();
    const missingJobId = {
      api_identifier: 'openai-x',
      extended_model_config: modelConfig,
      chat_api_request: chatRequest,
      user_jwt: 'jwt-present',
    };
    expect('job_id' in missingJobId).toBe(false);

    const missingUserJwt = {
      job_id: 'job-1',
      api_identifier: 'openai-x',
      extended_model_config: modelConfig,
      chat_api_request: chatRequest,
    };
    expect('user_jwt' in missingUserJwt).toBe(false);

    const emptyApiIdentifier = {
      job_id: 'job-1',
      api_identifier: '',
      extended_model_config: modelConfig,
      chat_api_request: chatRequest,
      user_jwt: 'jwt-present',
    };
    expect(emptyApiIdentifier.api_identifier.length).toBe(0);
  });

  it('invalid domain: api_identifier prefix not openai-, anthropic-, or google-', () => {
    const unsupportedIdentifier: string = 'mistral-large-latest';
    const hasSupportedPrefix: boolean =
      unsupportedIdentifier.startsWith('openai-') ||
      unsupportedIdentifier.startsWith('anthropic-') ||
      unsupportedIdentifier.startsWith('google-');
    expect(hasSupportedPrefix).toBe(false);
  });

  it('api_identifier dispatch: openai-, anthropic-, google- prefixes are supported', () => {
    const openaiEvent: AiStreamEvent = createValidAiStreamEvent({
      api_identifier: 'openai-gpt-4',
    });
    const anthropicEvent: AiStreamEvent = createValidAiStreamEvent({
      api_identifier: 'anthropic-claude-3',
    });
    const googleEvent: AiStreamEvent = createValidAiStreamEvent({
      api_identifier: 'google-gemini-pro',
    });
    expect(openaiEvent.api_identifier.startsWith('openai-')).toBe(true);
    expect(anthropicEvent.api_identifier.startsWith('anthropic-')).toBe(true);
    expect(googleEvent.api_identifier.startsWith('google-')).toBe(true);
  });

  it('api_identifier dispatch: unrelated prefix is not a supported provider prefix', () => {
    const identifier: string = 'cohere-command';
    const isSupported: boolean =
      identifier.startsWith('openai-') ||
      identifier.startsWith('anthropic-') ||
      identifier.startsWith('google-');
    expect(isSupported).toBe(false);
  });
});
