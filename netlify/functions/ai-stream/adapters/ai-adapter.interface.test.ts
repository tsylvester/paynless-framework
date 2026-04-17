import { describe, expect, it } from 'vitest';
import type {
  AiAdapter,
  NodeAdapterStreamChunk,
  NodeChatApiRequest,
  NodeChatMessage,
  NodeModelConfig,
  NodeOutboundDocument,
  NodeTokenUsage,
} from './ai-adapter.interface.ts';

describe('ai-adapter.interface contract', () => {
  it('accepts NodeChatMessage with role user and string content', () => {
    const message: NodeChatMessage = {
      role: 'user',
      content: 'hello',
    };
    expect(message.role).toBe('user');
    expect(typeof message.content).toBe('string');
  });

  it('accepts NodeChatMessage with role assistant', () => {
    const message: NodeChatMessage = {
      role: 'assistant',
      content: 'reply',
    };
    expect(message.role).toBe('assistant');
    expect(typeof message.content).toBe('string');
  });

  it('accepts NodeChatMessage with role system', () => {
    const message: NodeChatMessage = {
      role: 'system',
      content: 'system text',
    };
    expect(message.role).toBe('system');
    expect(typeof message.content).toBe('string');
  });

  it('accepts NodeChatApiRequest with required fields and optional fields', () => {
    const resource: NodeOutboundDocument = {
      id: 'doc-1',
      content: 'document body',
      document_key: 'business_case',
      stage_slug: 'thesis',
    };
    const messages: NodeChatMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'user line' },
    ];
    const request: NodeChatApiRequest = {
      message: 'primary user message',
      messages,
      resourceDocuments: [resource],
      max_tokens_to_generate: 1024,
      providerId: 'prov-1',
      promptId: 'prompt-1',
    };
    expect(typeof request.message).toBe('string');
    expect(Array.isArray(request.messages)).toBe(true);
    expect(Array.isArray(request.resourceDocuments)).toBe(true);
    expect(request.max_tokens_to_generate).toBe(1024);
    expect(request.providerId).toBe('prov-1');
    expect(request.promptId).toBe('prompt-1');
  });

  it('accepts NodeChatApiRequest with only required fields', () => {
    const request: NodeChatApiRequest = {
      message: 'm',
      providerId: 'p',
      promptId: 'q',
    };
    expect(request.message).toBe('m');
    expect(request.providerId).toBe('p');
    expect(request.promptId).toBe('q');
  });

  it('accepts NodeOutboundDocument with id and content', () => {
    const document: NodeOutboundDocument = {
      id: 'd1',
      content: 'c1',
    };
    expect(typeof document.id).toBe('string');
    expect(typeof document.content).toBe('string');
  });

  it('accepts NodeOutboundDocument with optional document_key and stage_slug', () => {
    const document: NodeOutboundDocument = {
      id: 'd2',
      content: 'c2',
      document_key: 'key',
      stage_slug: 'antithesis',
    };
    expect(document.document_key).toBe('key');
    expect(document.stage_slug).toBe('antithesis');
  });

  it('accepts NodeModelConfig with api_identifier and numeric token cost rates', () => {
    const config: NodeModelConfig = {
      api_identifier: 'openai-gpt-4o',
      provider_max_input_tokens: 100_000,
      context_window_tokens: 128_000,
      hard_cap_output_tokens: 4096,
      provider_max_output_tokens: 8192,
      input_token_cost_rate: 0.001,
      output_token_cost_rate: 0.002,
    };
    expect(typeof config.api_identifier).toBe('string');
    expect(config.provider_max_input_tokens).toBe(100_000);
    expect(config.context_window_tokens).toBe(128_000);
    expect(config.hard_cap_output_tokens).toBe(4096);
    expect(config.provider_max_output_tokens).toBe(8192);
    expect(config.input_token_cost_rate).toBe(0.001);
    expect(config.output_token_cost_rate).toBe(0.002);
  });

  it('accepts NodeModelConfig with null token cost rates', () => {
    const config: NodeModelConfig = {
      api_identifier: 'anthropic-claude-3',
      input_token_cost_rate: null,
      output_token_cost_rate: null,
    };
    expect(config.input_token_cost_rate).toBe(null);
    expect(config.output_token_cost_rate).toBe(null);
  });

  it('accepts NodeTokenUsage with non-negative integer token counts', () => {
    const usage: NodeTokenUsage = {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    };
    expect(usage.prompt_tokens).toBe(10);
    expect(usage.completion_tokens).toBe(20);
    expect(usage.total_tokens).toBe(30);
    expect(usage.prompt_tokens >= 0).toBe(true);
    expect(usage.completion_tokens >= 0).toBe(true);
    expect(usage.total_tokens >= 0).toBe(true);
  });

  it('accepts NodeAdapterStreamChunk text_delta variant', () => {
    const chunk: NodeAdapterStreamChunk = {
      type: 'text_delta',
      text: 'partial',
    };
    expect(chunk.type).toBe('text_delta');
    expect(chunk.text).toBe('partial');
  });

  it('accepts NodeAdapterStreamChunk usage variant', () => {
    const tokenUsage: NodeTokenUsage = {
      prompt_tokens: 1,
      completion_tokens: 2,
      total_tokens: 3,
    };
    const chunk: NodeAdapterStreamChunk = {
      type: 'usage',
      tokenUsage,
    };
    expect(chunk.type).toBe('usage');
    expect(chunk.tokenUsage.prompt_tokens).toBe(1);
    expect(chunk.tokenUsage.completion_tokens).toBe(2);
    expect(chunk.tokenUsage.total_tokens).toBe(3);
  });

  it('accepts NodeAdapterStreamChunk done variant', () => {
    const chunk: NodeAdapterStreamChunk = {
      type: 'done',
      finish_reason: 'stop',
    };
    expect(chunk.type).toBe('done');
    expect(chunk.finish_reason).toBe('stop');
  });

  it('accepts AiAdapter with sendMessageStream as AsyncGenerator factory', () => {
    const adapter: AiAdapter = {
      async *sendMessageStream() {
        const first: NodeAdapterStreamChunk = {
          type: 'text_delta',
          text: 'x',
        };
        yield first;
      },
    };
    expect(typeof adapter.sendMessageStream).toBe('function');
  });
});
