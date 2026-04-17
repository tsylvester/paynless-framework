import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiStreamEvent } from './ai-stream.interface.ts';
import { isAiStreamPayload } from './ai-stream.guard.ts';
import type { OpenAIChatCompletionChunk } from './adapters/openai/openai.interface.ts';
import type {
  AnthropicContentBlockDeltaEvent,
  AnthropicFinalMessage,
} from './adapters/anthropic/anthropic.interface.ts';
import type {
  GoogleFinalResponse,
  GoogleStreamChunk,
} from './adapters/google/google.interface.ts';

// ---------------------------------------------------------------------------
// vi.hoisted — controllable references shared between mock factories and tests
// ---------------------------------------------------------------------------

const netlifyMock = vi.hoisted(() => {
  const state: {
    handler: ((event: unknown) => Promise<void>) | null;
    stepNames: string[];
  } = {
    handler: null,
    stepNames: [],
  };
  return state;
});

const openaiSdk = vi.hoisted(() => {
  return {
    chatCompletionsCreate: vi.fn(),
  };
});

const anthropicSdk = vi.hoisted(() => {
  return {
    messagesStream: vi.fn(),
  };
});

const googleSdk = vi.hoisted(() => {
  return {
    getGenerativeModel: vi.fn(),
    startChat: vi.fn(),
    sendMessageStream: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// vi.mock — external boundary mocks
// ---------------------------------------------------------------------------

vi.mock('@netlify/async-workloads', () => {
  class ErrorDoNotRetry extends Error {
    public constructor(message?: string) {
      super(message);
      this.name = 'ErrorDoNotRetry';
    }
  }

  function asyncWorkloadFn(
    fn: (event: unknown) => Promise<void>,
  ): (event: unknown) => Promise<void> {
    netlifyMock.handler = fn;
    return fn;
  }

  return {
    asyncWorkloadFn,
    ErrorDoNotRetry,
  };
});

vi.mock('openai', () => {
  class APIError extends Error {
    public status: number | undefined;

    public constructor(message?: string) {
      super(message);
      this.name = 'APIError';
    }
  }

  class OpenAI {
    public static APIError: typeof APIError = APIError;

    public chat: {
      completions: {
        create: typeof openaiSdk.chatCompletionsCreate;
      };
    };

    public constructor() {
      this.chat = {
        completions: {
          create: openaiSdk.chatCompletionsCreate,
        },
      };
    }
  }

  return {
    default: OpenAI,
  };
});

vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    public status: number | undefined;

    public constructor(message?: string) {
      super(message);
      this.name = 'APIError';
    }
  }

  class Anthropic {
    public static APIError: typeof APIError = APIError;

    public messages: {
      stream: typeof anthropicSdk.messagesStream;
    };

    public constructor() {
      this.messages = {
        stream: anthropicSdk.messagesStream,
      };
    }
  }

  return {
    default: Anthropic,
  };
});

vi.mock('@google/generative-ai', () => {
  class GoogleGenerativeAI {
    public getGenerativeModel: typeof googleSdk.getGenerativeModel;

    public constructor() {
      this.getGenerativeModel = googleSdk.getGenerativeModel;
    }
  }

  return {
    GoogleGenerativeAI,
  };
});

// Side-effect import: triggers module evaluation which calls asyncWorkloadFn,
// storing the real handler in netlifyMock.handler.
import './ai-stream.ts';

// ---------------------------------------------------------------------------
// Helpers — SDK stream factories (external SDK shapes, one per provider)
// ---------------------------------------------------------------------------

async function* openaiSdkStream(): AsyncGenerator<
  OpenAIChatCompletionChunk,
  void,
  undefined
> {
  const textChunk: OpenAIChatCompletionChunk = {
    choices: [{ delta: { content: 'integration-openai' }, finish_reason: null }],
  };
  yield textChunk;
  const finalChunk: OpenAIChatCompletionChunk = {
    choices: [{ delta: {}, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };
  yield finalChunk;
}

function createAnthropicSdkStream(): {
  finalMessage: () => Promise<AnthropicFinalMessage>;
  [Symbol.asyncIterator](): AsyncGenerator<
    AnthropicContentBlockDeltaEvent,
    void,
    undefined
  >;
} {
  return {
    async *[Symbol.asyncIterator]() {
      const event: AnthropicContentBlockDeltaEvent = {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'integration-anthropic' },
      };
      yield event;
    },
    finalMessage: async (): Promise<AnthropicFinalMessage> => {
      return {
        usage: { input_tokens: 15, output_tokens: 25 },
        stop_reason: 'end_turn',
      };
    },
  };
}

function createGoogleSdkStreamResult(): {
  stream: AsyncIterable<GoogleStreamChunk>;
  response: Promise<GoogleFinalResponse>;
} {
  async function* streamGen(): AsyncGenerator<GoogleStreamChunk, void, undefined> {
    const chunk: GoogleStreamChunk = {
      candidates: [{ content: { parts: [{ text: 'integration-google' }] } }],
    };
    yield chunk;
  }
  const streamIterable: AsyncIterable<GoogleStreamChunk> = streamGen();
  const responseBody: GoogleFinalResponse = {
    candidates: [{ finishReason: 'STOP' }],
    usageMetadata: {
      promptTokenCount: 12,
      candidatesTokenCount: 18,
      totalTokenCount: 30,
    },
  };
  const responsePromise: Promise<GoogleFinalResponse> =
    Promise.resolve(responseBody);
  return {
    stream: streamIterable,
    response: responsePromise,
  };
}

// ---------------------------------------------------------------------------
// Helpers — handler invocation and fetch assertion
// ---------------------------------------------------------------------------

function getHandler(): (event: unknown) => Promise<void> {
  const handler = netlifyMock.handler;
  if (handler === null) {
    throw new Error(
      'asyncWorkloadFn handler was not captured — import ai-stream.ts must trigger module evaluation',
    );
  }
  return handler;
}

function createMockWorkloadEvent(eventData: unknown): unknown {
  return {
    eventData,
    step: {
      run: async (
        name: string,
        fn: () => Promise<unknown>,
      ): Promise<unknown> => {
        netlifyMock.stepNames.push(name);
        return fn();
      },
    },
  };
}

function extractFetchPostArgs(fetchMock: ReturnType<typeof vi.fn>): {
  url: string;
  authorization: string;
  body: unknown;
} {
  const firstCall: unknown = fetchMock.mock.calls[0];
  if (!Array.isArray(firstCall) || firstCall.length < 2) {
    throw new Error('expected fetch(url, init) — fetch was not called correctly');
  }
  const urlValue: unknown = firstCall[0];
  if (typeof urlValue !== 'string') {
    throw new Error('expected string URL as first argument to fetch');
  }
  const initValue: unknown = firstCall[1];
  if (typeof initValue !== 'object' || initValue === null) {
    throw new Error('expected RequestInit as second argument to fetch');
  }
  const init: RequestInit = initValue;
  const headersValue: unknown = init.headers;
  if (
    typeof headersValue !== 'object' ||
    headersValue === null ||
    Array.isArray(headersValue)
  ) {
    throw new Error('expected headers object in RequestInit');
  }
  if (!('Authorization' in headersValue)) {
    throw new Error('expected Authorization header in fetch call');
  }
  const authValue: unknown = Reflect.get(headersValue, 'Authorization');
  if (typeof authValue !== 'string') {
    throw new Error('expected string Authorization header');
  }
  const bodyValue: unknown = init.body;
  if (typeof bodyValue !== 'string') {
    throw new Error('expected string body in fetch call');
  }
  const parsed: unknown = JSON.parse(bodyValue);
  return {
    url: urlValue,
    authorization: authValue,
    body: parsed,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const TEST_SAVE_RESPONSE_URL: string = 'http://test-integration/saveResponse';

describe('ai-stream integration', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    netlifyMock.stepNames.length = 0;

    openaiSdk.chatCompletionsCreate.mockReset();
    anthropicSdk.messagesStream.mockReset();
    googleSdk.getGenerativeModel.mockReset();
    googleSdk.startChat.mockReset();
    googleSdk.sendMessageStream.mockReset();

    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    process.env['DIALECTIC_SAVERESPONSE_URL'] = TEST_SAVE_RESPONSE_URL;
    process.env['OPENAI_API_KEY'] = 'sk-integration-openai';
    process.env['ANTHROPIC_API_KEY'] = 'sk-integration-anthropic';
    process.env['GOOGLE_API_KEY'] = 'integration-google-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env['DIALECTIC_SAVERESPONSE_URL'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
  });

  it('full chain — OpenAI: real createAiStreamDeps → real getNodeAiAdapter → real createOpenAINodeAdapter → mocked SDK → POST', async () => {
    openaiSdk.chatCompletionsCreate.mockResolvedValue(openaiSdkStream());

    const eventPayload: AiStreamEvent = {
      job_id: 'integration-openai',
      api_identifier: 'openai-gpt-4o',
      model_config: {
        api_identifier: 'openai-gpt-4o',
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
      },
      chat_api_request: {
        message: 'integration test openai',
        providerId: 'prov-1',
        promptId: 'prompt-1',
      },
      user_jwt: 'jwt-openai-integration',
    };
    const mockEvent: unknown = createMockWorkloadEvent(eventPayload);

    await getHandler()(mockEvent);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const posted = extractFetchPostArgs(fetchMock);
    expect(posted.url).toBe(TEST_SAVE_RESPONSE_URL);
    expect(posted.authorization).toBe('Bearer jwt-openai-integration');
    expect(isAiStreamPayload(posted.body)).toBe(true);
    if (!isAiStreamPayload(posted.body)) {
      throw new Error('POST body must satisfy AiStreamPayload');
    }
    expect(posted.body.job_id).toBe('integration-openai');
    expect(posted.body.assembled_content).toBe('integration-openai');
    expect(posted.body.finish_reason).toBe('stop');
    expect(posted.body.token_usage).not.toBe(null);
    if (posted.body.token_usage !== null) {
      expect(posted.body.token_usage.prompt_tokens).toBe(10);
      expect(posted.body.token_usage.completion_tokens).toBe(20);
      expect(posted.body.token_usage.total_tokens).toBe(30);
    }
    expect(netlifyMock.stepNames).toEqual(['stream-ai', 'post-result']);
  });

  it('full chain — Anthropic: real createAiStreamDeps → real getNodeAiAdapter → real createAnthropicNodeAdapter → mocked SDK → POST', async () => {
    anthropicSdk.messagesStream.mockReturnValue(createAnthropicSdkStream());

    const eventPayload: AiStreamEvent = {
      job_id: 'integration-anthropic',
      api_identifier: 'anthropic-claude-3-5-sonnet',
      model_config: {
        api_identifier: 'anthropic-claude-3-5-sonnet',
        hard_cap_output_tokens: 4096,
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
      },
      chat_api_request: {
        message: 'integration test anthropic',
        providerId: 'prov-1',
        promptId: 'prompt-1',
      },
      user_jwt: 'jwt-anthropic-integration',
    };
    const mockEvent: unknown = createMockWorkloadEvent(eventPayload);

    await getHandler()(mockEvent);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const posted = extractFetchPostArgs(fetchMock);
    expect(posted.url).toBe(TEST_SAVE_RESPONSE_URL);
    expect(posted.authorization).toBe('Bearer jwt-anthropic-integration');
    expect(isAiStreamPayload(posted.body)).toBe(true);
    if (!isAiStreamPayload(posted.body)) {
      throw new Error('POST body must satisfy AiStreamPayload');
    }
    expect(posted.body.job_id).toBe('integration-anthropic');
    expect(posted.body.assembled_content).toBe('integration-anthropic');
    expect(posted.body.finish_reason).toBe('stop');
    expect(posted.body.token_usage).not.toBe(null);
    if (posted.body.token_usage !== null) {
      expect(posted.body.token_usage.prompt_tokens).toBe(15);
      expect(posted.body.token_usage.completion_tokens).toBe(25);
      expect(posted.body.token_usage.total_tokens).toBe(40);
    }
    expect(netlifyMock.stepNames).toEqual(['stream-ai', 'post-result']);
  });

  it('full chain — Google: real createAiStreamDeps → real getNodeAiAdapter → real createGoogleNodeAdapter → mocked SDK → POST', async () => {
    googleSdk.getGenerativeModel.mockReturnValue({
      startChat: googleSdk.startChat,
    });
    googleSdk.startChat.mockReturnValue({
      sendMessageStream: googleSdk.sendMessageStream,
    });
    googleSdk.sendMessageStream.mockResolvedValue(
      createGoogleSdkStreamResult(),
    );

    const eventPayload: AiStreamEvent = {
      job_id: 'integration-google',
      api_identifier: 'google-gemini-2-5-pro',
      model_config: {
        api_identifier: 'google-gemini-2-5-pro',
        hard_cap_output_tokens: 4096,
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
      },
      chat_api_request: {
        message: 'integration test google',
        providerId: 'prov-1',
        promptId: 'prompt-1',
      },
      user_jwt: 'jwt-google-integration',
    };
    const mockEvent: unknown = createMockWorkloadEvent(eventPayload);

    await getHandler()(mockEvent);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const posted = extractFetchPostArgs(fetchMock);
    expect(posted.url).toBe(TEST_SAVE_RESPONSE_URL);
    expect(posted.authorization).toBe('Bearer jwt-google-integration');
    expect(isAiStreamPayload(posted.body)).toBe(true);
    if (!isAiStreamPayload(posted.body)) {
      throw new Error('POST body must satisfy AiStreamPayload');
    }
    expect(posted.body.job_id).toBe('integration-google');
    expect(posted.body.assembled_content).toBe('integration-google');
    expect(posted.body.finish_reason).toBe('stop');
    expect(posted.body.token_usage).not.toBe(null);
    if (posted.body.token_usage !== null) {
      expect(posted.body.token_usage.prompt_tokens).toBe(12);
      expect(posted.body.token_usage.completion_tokens).toBe(18);
      expect(posted.body.token_usage.total_tokens).toBe(30);
    }
    expect(netlifyMock.stepNames).toEqual(['stream-ai', 'post-result']);
  });

  it('step isolation — adapter error: step.run(stream-ai) propagates, step.run(post-result) never called', async () => {
    openaiSdk.chatCompletionsCreate.mockRejectedValue(
      new Error('SDK connection error'),
    );

    const eventPayload: AiStreamEvent = {
      job_id: 'integration-step-error',
      api_identifier: 'openai-gpt-4o',
      model_config: {
        api_identifier: 'openai-gpt-4o',
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
      },
      chat_api_request: {
        message: 'integration step error test',
        providerId: 'prov-1',
        promptId: 'prompt-1',
      },
      user_jwt: 'jwt-step-error',
    };
    const mockEvent: unknown = createMockWorkloadEvent(eventPayload);

    await expect(getHandler()(mockEvent)).rejects.toThrow(
      'SDK connection error',
    );
    expect(netlifyMock.stepNames).toEqual(['stream-ai']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('step isolation — POST failure: adapter called once, step.run(post-result) throws, no re-entry into step-1', async () => {
    openaiSdk.chatCompletionsCreate.mockResolvedValue(openaiSdkStream());

    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    const eventPayload: AiStreamEvent = {
      job_id: 'integration-post-failure',
      api_identifier: 'openai-gpt-4o',
      model_config: {
        api_identifier: 'openai-gpt-4o',
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
      },
      chat_api_request: {
        message: 'integration post failure test',
        providerId: 'prov-1',
        promptId: 'prompt-1',
      },
      user_jwt: 'jwt-post-failure',
    };
    const mockEvent: unknown = createMockWorkloadEvent(eventPayload);

    await expect(getHandler()(mockEvent)).rejects.toThrow();
    expect(netlifyMock.stepNames).toEqual(['stream-ai', 'post-result']);
    expect(openaiSdk.chatCompletionsCreate).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
