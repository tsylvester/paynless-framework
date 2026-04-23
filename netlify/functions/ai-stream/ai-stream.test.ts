import { ErrorDoNotRetry } from '@netlify/async-workloads';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AiAdapter,
  NodeAdapterConstructorParams,
  NodeAdapterStreamChunk,
} from './adapters/ai-adapter.interface.ts';
import { createMockAnthropicNodeAdapter } from './adapters/anthropic/anthropic.mock.ts';
import { createMockGoogleNodeAdapter } from './adapters/google/google.mock.ts';
import {
  createMockOpenAINodeAdapter,
  mockNodeChatApiRequest,
  mockNodeModelConfig,
} from './adapters/openai/openai.mock.ts';
import { isAiStreamPayload } from './ai-stream.guard.ts';
import {
  createMockAiStreamDeps,
  mockAiStreamSaveResponseUrl,
} from './ai-stream.mock.ts';
import type { AiStreamEvent } from './ai-stream.interface.ts';
import { isAiStreamDeps } from './ai-stream.guard.ts';
import { createAiStreamDeps, runAiStreamWorkloadForTests } from './ai-stream.ts';

describe('ai-stream workload', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws ErrorDoNotRetry for invalid event and does not invoke adapter factories', async () => {
    let factoryCallCount: number = 0;
    const deps = createMockAiStreamDeps({
      providerMap: {
        'openai-': (_params: NodeAdapterConstructorParams): AiAdapter => {
          factoryCallCount += 1;
          return createMockOpenAINodeAdapter();
        },
      },
    });
    await expect(runAiStreamWorkloadForTests(deps, {})).rejects.toBeInstanceOf(
      ErrorDoNotRetry,
    );
    expect(factoryCallCount).toBe(0);
  });

  it('throws ErrorDoNotRetry for unknown api_identifier prefix', async () => {
    const deps = createMockAiStreamDeps({
      providerMap: {
        'openai-': (_params: NodeAdapterConstructorParams): AiAdapter => {
          return createMockOpenAINodeAdapter();
        },
      },
    });
    const event: AiStreamEvent = {
      job_id: 'job-1',
      api_identifier: 'mistral-unknown-model',
      model_config: { ...mockNodeModelConfig, api_identifier: 'mistral-unknown-model' },
      chat_api_request: { ...mockNodeChatApiRequest },
      sig: 'hmac-sig-value',
    };
    await expect(runAiStreamWorkloadForTests(deps, event)).rejects.toBeInstanceOf(
      ErrorDoNotRetry,
    );
  });

  it('dispatches openai prefix, iterates mock adapter, POSTs finish_reason from done chunk', async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL, _init?: RequestInit): Promise<Response> => {
        return new Response(null, { status: 200 });
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    const deps = createMockAiStreamDeps({
      providerMap: {
        'openai-': (_params: NodeAdapterConstructorParams): AiAdapter => {
          return createMockOpenAINodeAdapter();
        },
      },
      getApiKey: (): string => {
        return 'sk-openai';
      },
    });
    const event: AiStreamEvent = {
      job_id: 'job-openai',
      api_identifier: 'openai-gpt-4o',
      model_config: { ...mockNodeModelConfig },
      chat_api_request: { ...mockNodeChatApiRequest },
      sig: 'hmac-openai-sig',
    };
    await runAiStreamWorkloadForTests(deps, event);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall: unknown = fetchMock.mock.calls[0];
    if (!Array.isArray(firstCall) || firstCall.length < 2) {
      throw new Error('expected fetch(url, init)');
    }
    const urlValue: unknown = firstCall[0];
    const initValue: unknown = firstCall[1];
    expect(urlValue).toBe(mockAiStreamSaveResponseUrl);
    if (typeof initValue !== 'object' || initValue === null) {
      throw new Error('expected RequestInit');
    }
    const init: RequestInit = initValue;
    const bodyValue: unknown = init.body;
    if (typeof bodyValue !== 'string') {
      throw new Error('expected string body');
    }
    const parsed: unknown = JSON.parse(bodyValue);
    expect(isAiStreamPayload(parsed)).toBe(true);
    if (!isAiStreamPayload(parsed)) {
      throw new Error('POST body must satisfy AiStreamPayload');
    }
    expect(parsed.sig).toBe('hmac-openai-sig');
    expect(parsed.finish_reason).toBe('stop');
    expect(parsed.assembled_content).toContain('mock openai response');
  });

  it('dispatches anthropic prefix using anthropic mock adapter', async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL, _init?: RequestInit): Promise<Response> => {
        return new Response(null, { status: 200 });
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    const deps = createMockAiStreamDeps({
      providerMap: {
        'anthropic-': (_params: NodeAdapterConstructorParams): AiAdapter => {
          return createMockAnthropicNodeAdapter();
        },
      },
      getApiKey: (): string => {
        return 'sk-anthropic';
      },
    });
    const event: AiStreamEvent = {
      job_id: 'job-anthropic',
      api_identifier: 'anthropic-claude-3-5-sonnet',
      model_config: {
        api_identifier: 'anthropic-claude-3-5-sonnet',
        hard_cap_output_tokens: 4096,
        input_token_cost_rate: null,
        output_token_cost_rate: null,
      },
      chat_api_request: {
        message: 'hi',
        providerId: 'p',
        promptId: 'q',
      },
      sig: 'hmac-anthropic-sig',
    };
    await runAiStreamWorkloadForTests(deps, event);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('dispatches google prefix using google mock adapter', async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL, _init?: RequestInit): Promise<Response> => {
        return new Response(null, { status: 200 });
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    const deps = createMockAiStreamDeps({
      providerMap: {
        'google-': (_params: NodeAdapterConstructorParams): AiAdapter => {
          return createMockGoogleNodeAdapter();
        },
      },
      getApiKey: (): string => {
        return 'google-key';
      },
    });
    const event: AiStreamEvent = {
      job_id: 'job-google',
      api_identifier: 'google-gemini-2-5-pro',
      model_config: {
        api_identifier: 'google-gemini-2-5-pro',
        hard_cap_output_tokens: 4096,
        input_token_cost_rate: null,
        output_token_cost_rate: null,
      },
      chat_api_request: {
        message: 'hi',
        providerId: 'p',
        promptId: 'q',
      },
      sig: 'hmac-google-sig',
    };
    await runAiStreamWorkloadForTests(deps, event);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('propagates adapter stream errors as a retryable failure', async () => {
    const failingAdapter: AiAdapter = {
      async *sendMessageStream(): AsyncGenerator<NodeAdapterStreamChunk> {
        const first: NodeAdapterStreamChunk = {
          type: 'text_delta',
          text: 'before-failure',
        };
        yield first;
        throw new Error('stream failed');
      },
    };
    const deps = createMockAiStreamDeps({
      providerMap: {
        'openai-': (_params: NodeAdapterConstructorParams): AiAdapter => {
          return failingAdapter;
        },
      },
      getApiKey: (): string => {
        return 'sk-openai';
      },
    });
    const event: AiStreamEvent = {
      job_id: 'job-err',
      api_identifier: 'openai-gpt-4o',
      model_config: { ...mockNodeModelConfig },
      chat_api_request: { ...mockNodeChatApiRequest },
      sig: 'hmac-sig-value',
    };
    await expect(runAiStreamWorkloadForTests(deps, event)).rejects.toThrow('stream failed');
  });

  it('throws when back-half POST returns 4xx', async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL, _init?: RequestInit): Promise<Response> => {
        return new Response(null, { status: 400 });
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    const deps = createMockAiStreamDeps({
      providerMap: {
        'openai-': (_params: NodeAdapterConstructorParams): AiAdapter => {
          return createMockOpenAINodeAdapter();
        },
      },
      getApiKey: (): string => {
        return 'sk-openai';
      },
    });
    const event: AiStreamEvent = {
      job_id: 'job-post-err',
      api_identifier: 'openai-gpt-4o',
      model_config: { ...mockNodeModelConfig },
      chat_api_request: { ...mockNodeChatApiRequest },
      sig: 'hmac-sig-value',
    };
    await expect(runAiStreamWorkloadForTests(deps, event)).rejects.toThrow();
  });

  it('POSTs AiStreamPayload with assembled_content and JWT on full happy path', async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL, _init?: RequestInit): Promise<Response> => {
        return new Response(null, { status: 200 });
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    const deps = createMockAiStreamDeps({
      providerMap: {
        'openai-': (_params: NodeAdapterConstructorParams): AiAdapter => {
          return createMockOpenAINodeAdapter();
        },
      },
      getApiKey: (): string => {
        return 'sk-openai';
      },
    });
    const event: AiStreamEvent = {
      job_id: 'job-happy',
      api_identifier: 'openai-gpt-4o',
      model_config: { ...mockNodeModelConfig },
      chat_api_request: { ...mockNodeChatApiRequest },
      sig: 'hmac-happy-sig',
    };
    await runAiStreamWorkloadForTests(deps, event);
    const firstCall: unknown = fetchMock.mock.calls[0];
    if (!Array.isArray(firstCall) || firstCall.length < 2) {
      throw new Error('expected fetch(url, init)');
    }
    const initValue: unknown = firstCall[1];
    if (typeof initValue !== 'object' || initValue === null) {
      throw new Error('expected RequestInit');
    }
    const init: RequestInit = initValue;
    const bodyValue: unknown = init.body;
    if (typeof bodyValue !== 'string') {
      throw new Error('expected string body');
    }
    const parsed: unknown = JSON.parse(bodyValue);
    expect(isAiStreamPayload(parsed)).toBe(true);
    if (!isAiStreamPayload(parsed)) {
      throw new Error('invalid payload');
    }
    expect(parsed.job_id).toBe('job-happy');
    expect(parsed.sig).toBe('hmac-happy-sig');
    expect(parsed.assembled_content).toBe('mock openai response');
    expect(parsed.token_usage).not.toBe(null);
    expect(parsed.finish_reason).toBe('stop');
  });

  it('sets finish_reason to length after soft timeout while posting partial assembled_content', async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL, _init?: RequestInit): Promise<Response> => {
        return new Response(null, { status: 200 });
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    let nowMs: number = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      return nowMs;
    });
    const delayedAdapter: AiAdapter = {
      async *sendMessageStream(): AsyncGenerator<NodeAdapterStreamChunk> {
        const first: NodeAdapterStreamChunk = {
          type: 'text_delta',
          text: 'partial',
        };
        yield first;
        nowMs = 15 * 60 * 1000;
        const second: NodeAdapterStreamChunk = {
          type: 'text_delta',
          text: '-more',
        };
        yield second;
      },
    };
    const deps = createMockAiStreamDeps({
      providerMap: {
        'openai-': (_params: NodeAdapterConstructorParams): AiAdapter => {
          return delayedAdapter;
        },
      },
      getApiKey: (): string => {
        return 'sk-openai';
      },
    });
    const event: AiStreamEvent = {
      job_id: 'job-timeout',
      api_identifier: 'openai-gpt-4o',
      model_config: { ...mockNodeModelConfig },
      chat_api_request: { ...mockNodeChatApiRequest },
      sig: 'hmac-timeout-sig',
    };
    await runAiStreamWorkloadForTests(deps, event);
    const firstCall: unknown = fetchMock.mock.calls[0];
    if (!Array.isArray(firstCall) || firstCall.length < 2) {
      throw new Error('expected fetch(url, init)');
    }
    const initValue: unknown = firstCall[1];
    if (typeof initValue !== 'object' || initValue === null) {
      throw new Error('expected RequestInit');
    }
    const init: RequestInit = initValue;
    const bodyValue: unknown = init.body;
    if (typeof bodyValue !== 'string') {
      throw new Error('expected string body');
    }
    const parsed: unknown = JSON.parse(bodyValue);
    expect(isAiStreamPayload(parsed)).toBe(true);
    if (!isAiStreamPayload(parsed)) {
      throw new Error('invalid payload');
    }
    expect(parsed.finish_reason).toBe('length');
    expect(parsed.assembled_content).toBe('partial');
  });

  it('sends finish_reason null when stream ends without done chunk', async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL, _init?: RequestInit): Promise<Response> => {
        return new Response(null, { status: 200 });
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    const adapterNoDone: AiAdapter = {
      async *sendMessageStream(): AsyncGenerator<NodeAdapterStreamChunk> {
        const text: NodeAdapterStreamChunk = { type: 'text_delta', text: 'only' };
        yield text;
        const usage: NodeAdapterStreamChunk = {
          type: 'usage',
          tokenUsage: {
            prompt_tokens: 1,
            completion_tokens: 1,
            total_tokens: 2,
          },
        };
        yield usage;
      },
    };
    const deps = createMockAiStreamDeps({
      providerMap: {
        'openai-': (_params: NodeAdapterConstructorParams): AiAdapter => {
          return adapterNoDone;
        },
      },
      getApiKey: (): string => {
        return 'sk-openai';
      },
    });
    const event: AiStreamEvent = {
      job_id: 'job-nodone',
      api_identifier: 'openai-gpt-4o',
      model_config: { ...mockNodeModelConfig },
      chat_api_request: { ...mockNodeChatApiRequest },
      sig: 'hmac-nodone-sig',
    };
    await runAiStreamWorkloadForTests(deps, event);
    const firstCall: unknown = fetchMock.mock.calls[0];
    if (!Array.isArray(firstCall) || firstCall.length < 2) {
      throw new Error('expected fetch(url, init)');
    }
    const initValue: unknown = firstCall[1];
    if (typeof initValue !== 'object' || initValue === null) {
      throw new Error('expected RequestInit');
    }
    const init: RequestInit = initValue;
    const bodyValue: unknown = init.body;
    if (typeof bodyValue !== 'string') {
      throw new Error('expected string body');
    }
    const parsed: unknown = JSON.parse(bodyValue);
    expect(isAiStreamPayload(parsed)).toBe(true);
    if (!isAiStreamPayload(parsed)) {
      throw new Error('invalid payload');
    }
    expect(parsed.finish_reason).toBe(null);
  });
});

describe('createAiStreamDeps', () => {
  const savedEnv: {
    DIALECTIC_SAVERESPONSE_URL: string | undefined;
    OPENAI_API_KEY: string | undefined;
    ANTHROPIC_API_KEY: string | undefined;
    GOOGLE_API_KEY: string | undefined;
  } = {
    DIALECTIC_SAVERESPONSE_URL: undefined,
    OPENAI_API_KEY: undefined,
    ANTHROPIC_API_KEY: undefined,
    GOOGLE_API_KEY: undefined,
  };

  beforeEach(() => {
    savedEnv.DIALECTIC_SAVERESPONSE_URL =
      process.env['DIALECTIC_SAVERESPONSE_URL'];
    savedEnv.OPENAI_API_KEY = process.env['OPENAI_API_KEY'];
    savedEnv.ANTHROPIC_API_KEY = process.env['ANTHROPIC_API_KEY'];
    savedEnv.GOOGLE_API_KEY = process.env['GOOGLE_API_KEY'];

    process.env['DIALECTIC_SAVERESPONSE_URL'] = 'http://test/saveResponse';
    process.env['OPENAI_API_KEY'] = 'sk-test-openai';
    process.env['ANTHROPIC_API_KEY'] = 'sk-test-anthropic';
    process.env['GOOGLE_API_KEY'] = 'test-google-key';
  });

  afterEach(() => {
    if (savedEnv.DIALECTIC_SAVERESPONSE_URL === undefined) {
      delete process.env['DIALECTIC_SAVERESPONSE_URL'];
    } else {
      process.env['DIALECTIC_SAVERESPONSE_URL'] =
        savedEnv.DIALECTIC_SAVERESPONSE_URL;
    }
    if (savedEnv.OPENAI_API_KEY === undefined) {
      delete process.env['OPENAI_API_KEY'];
    } else {
      process.env['OPENAI_API_KEY'] = savedEnv.OPENAI_API_KEY;
    }
    if (savedEnv.ANTHROPIC_API_KEY === undefined) {
      delete process.env['ANTHROPIC_API_KEY'];
    } else {
      process.env['ANTHROPIC_API_KEY'] = savedEnv.ANTHROPIC_API_KEY;
    }
    if (savedEnv.GOOGLE_API_KEY === undefined) {
      delete process.env['GOOGLE_API_KEY'];
    } else {
      process.env['GOOGLE_API_KEY'] = savedEnv.GOOGLE_API_KEY;
    }
  });

  it('throws ErrorDoNotRetry when DIALECTIC_SAVERESPONSE_URL is missing', () => {
    delete process.env['DIALECTIC_SAVERESPONSE_URL'];
    expect(() => createAiStreamDeps()).toThrow();
    try {
      createAiStreamDeps();
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ErrorDoNotRetry);
    }
  });

  it('throws ErrorDoNotRetry when DIALECTIC_SAVERESPONSE_URL is empty', () => {
    process.env['DIALECTIC_SAVERESPONSE_URL'] = '';
    expect(() => createAiStreamDeps()).toThrow();
    try {
      createAiStreamDeps();
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ErrorDoNotRetry);
    }
  });

  it('returns valid AiStreamDeps when all env vars are set', () => {
    const deps = createAiStreamDeps();
    expect(isAiStreamDeps(deps)).toBe(true);
    expect(deps.saveResponseUrl).toBe('http://test/saveResponse');
    expect(typeof deps.getApiKey).toBe('function');
    expect(typeof deps.providerMap).toBe('object');
  });

  it('getApiKey returns OPENAI_API_KEY for openai- prefix', () => {
    const deps = createAiStreamDeps();
    const key: string = deps.getApiKey('openai-gpt-4o');
    expect(key).toBe('sk-test-openai');
  });

  it('getApiKey returns ANTHROPIC_API_KEY for anthropic- prefix', () => {
    const deps = createAiStreamDeps();
    const key: string = deps.getApiKey('anthropic-claude-3-5-sonnet');
    expect(key).toBe('sk-test-anthropic');
  });

  it('getApiKey returns GOOGLE_API_KEY for google- prefix', () => {
    const deps = createAiStreamDeps();
    const key: string = deps.getApiKey('google-gemini-2-5-pro');
    expect(key).toBe('test-google-key');
  });

  it('getApiKey throws ErrorDoNotRetry when OPENAI_API_KEY is missing', () => {
    delete process.env['OPENAI_API_KEY'];
    const deps = createAiStreamDeps();
    expect(() => deps.getApiKey('openai-gpt-4o')).toThrow();
    try {
      deps.getApiKey('openai-gpt-4o');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ErrorDoNotRetry);
    }
  });

  it('getApiKey throws ErrorDoNotRetry when ANTHROPIC_API_KEY is missing', () => {
    delete process.env['ANTHROPIC_API_KEY'];
    const deps = createAiStreamDeps();
    expect(() => deps.getApiKey('anthropic-claude-3-5-sonnet')).toThrow();
    try {
      deps.getApiKey('anthropic-claude-3-5-sonnet');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ErrorDoNotRetry);
    }
  });

  it('getApiKey throws ErrorDoNotRetry when GOOGLE_API_KEY is missing', () => {
    delete process.env['GOOGLE_API_KEY'];
    const deps = createAiStreamDeps();
    expect(() => deps.getApiKey('google-gemini-2-5-pro')).toThrow();
    try {
      deps.getApiKey('google-gemini-2-5-pro');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ErrorDoNotRetry);
    }
  });

  it('getApiKey throws ErrorDoNotRetry for unknown api_identifier prefix', () => {
    const deps = createAiStreamDeps();
    expect(() => deps.getApiKey('mistral-7b')).toThrow();
    try {
      deps.getApiKey('mistral-7b');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ErrorDoNotRetry);
    }
  });
});
