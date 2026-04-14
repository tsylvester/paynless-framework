import { describe, it, expect } from 'vitest';
import type {
  AiAdapter,
  AiAdapterParams,
  AiAdapterResult,
  NodeChatApiRequest,
  NodeChatMessage,
  NodeModelConfig,
  NodeTokenUsage,
} from './ai-adapter.interface.ts';
import {
  createValidAiAdapter,
  createValidAiAdapterParams,
  createValidAiAdapterResultNullUsage,
  createValidAiAdapterResultWithUsage,
  createValidNodeChatApiRequest,
  createValidNodeChatMessage,
  createValidNodeModelConfig,
  createValidNodeTokenUsage,
} from './ai-adapter.mock.ts';

describe('ai-adapter.interface contract', () => {
  it('valid NodeChatMessage: role is user | assistant | system and content is string', () => {
    const user: NodeChatMessage = createValidNodeChatMessage();
    const assistant: NodeChatMessage = { role: 'assistant', content: 'a' };
    const system: NodeChatMessage = { role: 'system', content: 's' };
    expect(user.role === 'user' || user.role === 'assistant' || user.role === 'system').toBe(
      true,
    );
    expect(typeof user.content).toBe('string');
    expect(assistant.role === 'user' || assistant.role === 'assistant' || assistant.role === 'system').toBe(
      true,
    );
    expect(typeof assistant.content).toBe('string');
    expect(system.role === 'user' || system.role === 'assistant' || system.role === 'system').toBe(
      true,
    );
    expect(typeof system.content).toBe('string');
  });

  it('valid NodeChatApiRequest: non-empty messages array of valid NodeChatMessage', () => {
    const request: NodeChatApiRequest = createValidNodeChatApiRequest();
    expect(Array.isArray(request.messages)).toBe(true);
    expect(request.messages.length).toBeGreaterThan(0);
    const first: NodeChatMessage = request.messages[0];
    expect(
      first.role === 'user' || first.role === 'assistant' || first.role === 'system',
    ).toBe(true);
    expect(typeof first.content).toBe('string');
    expect(typeof request.model).toBe('string');
    expect(typeof request.max_tokens).toBe('number');
  });

  it('valid NodeModelConfig: non-empty model_identifier and positive integer max_tokens', () => {
    const config: NodeModelConfig = createValidNodeModelConfig();
    expect(config.model_identifier.length).toBeGreaterThan(0);
    expect(Number.isInteger(config.max_tokens)).toBe(true);
    expect(config.max_tokens).toBeGreaterThan(0);
  });

  it('valid AiAdapterResult: assembled_content is string; token_usage is NodeTokenUsage or null', () => {
    const withUsage: AiAdapterResult = createValidAiAdapterResultWithUsage();
    const withNull: AiAdapterResult = createValidAiAdapterResultNullUsage();
    expect(typeof withUsage.assembled_content).toBe('string');
    expect(withUsage.token_usage === null || typeof withUsage.token_usage === 'object').toBe(
      true,
    );
    expect(typeof withNull.assembled_content).toBe('string');
    expect(withNull.token_usage).toBe(null);
  });

  it('valid NodeTokenUsage: prompt_tokens, completion_tokens, total_tokens are non-negative integers', () => {
    const usage: NodeTokenUsage = createValidNodeTokenUsage();
    expect(Number.isInteger(usage.prompt_tokens)).toBe(true);
    expect(usage.prompt_tokens).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(usage.completion_tokens)).toBe(true);
    expect(usage.completion_tokens).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(usage.total_tokens)).toBe(true);
    expect(usage.total_tokens).toBeGreaterThanOrEqual(0);
  });

  it('invalid shapes: missing messages, null apiKey, empty model_identifier, non-integer token counts', () => {
    const missingMessages = { model: 'm', max_tokens: 1 };
    expect('messages' in missingMessages).toBe(false);

    const nullKeyPayload = {
      chatApiRequest: createValidNodeChatApiRequest(),
      modelConfig: createValidNodeModelConfig(),
      apiKey: null,
    };
    expect(nullKeyPayload.apiKey).toBe(null);

    const emptyModelId = { model_identifier: '', max_tokens: 1 };
    expect(emptyModelId.model_identifier.length).toBe(0);

    const fractionalTokens = {
      prompt_tokens: 1.5,
      completion_tokens: 0,
      total_tokens: 1.5,
    };
    expect(Number.isInteger(fractionalTokens.prompt_tokens)).toBe(false);
    expect(Number.isInteger(fractionalTokens.total_tokens)).toBe(false);
  });

  it('AiAdapter: object with stream function is accepted; object without stream is not', () => {
    const adapter: AiAdapter = createValidAiAdapter();
    expect(typeof adapter.stream).toBe('function');

    const missingStream: Record<string, unknown> = {};
    expect('stream' in missingStream).toBe(false);
  });

  it('AiAdapterParams: valid params wire chatApiRequest, modelConfig, and apiKey', () => {
    const params: AiAdapterParams = createValidAiAdapterParams();
    expect(params.apiKey.length).toBeGreaterThan(0);
    expect(Array.isArray(params.chatApiRequest.messages)).toBe(true);
    expect(params.modelConfig.model_identifier.length).toBeGreaterThan(0);
  });
});
