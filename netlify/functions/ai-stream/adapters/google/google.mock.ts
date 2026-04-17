import type {
  AiAdapter,
  NodeAdapterConstructorParams,
  NodeAdapterStreamChunk,
  NodeChatApiRequest,
  NodeModelConfig,
} from '../ai-adapter.interface.ts';
import type { GoogleFinalResponse, GoogleStreamChunk } from './google.interface.ts';

export interface MockGoogleSendMessageStreamResult {
  stream: AsyncIterable<GoogleStreamChunk>;
  response: Promise<GoogleFinalResponse>;
}

export const mockGoogleNodeModelConfig: NodeModelConfig = {
  api_identifier: 'google-gemini-2-5-pro',
  hard_cap_output_tokens: 4096,
  input_token_cost_rate: 0.001,
  output_token_cost_rate: 0.002,
};

export const mockGoogleNodeAdapterConstructorParams: NodeAdapterConstructorParams = {
  modelConfig: { ...mockGoogleNodeModelConfig },
  apiKey: 'google-api-key-mock',
};

export const mockGoogleNodeChatApiRequest: NodeChatApiRequest = {
  message: 'unit-message',
  providerId: 'prov-google',
  promptId: 'prompt-google',
};

export const mockGoogleSdkFinalResponse: GoogleFinalResponse = {
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'stub' }] } }],
  usageMetadata: {
    promptTokenCount: 12,
    candidatesTokenCount: 18,
    totalTokenCount: 30,
  },
};

export function createGoogleStreamResult(options: {
  chunks: GoogleStreamChunk[];
  response: GoogleFinalResponse;
}): MockGoogleSendMessageStreamResult {
  const chunkList: GoogleStreamChunk[] = options.chunks;
  const settledResponse: GoogleFinalResponse = options.response;
  async function* streamGen(): AsyncGenerator<GoogleStreamChunk> {
    for (const chunk of chunkList) {
      yield chunk;
    }
  }
  const streamIterable: AsyncIterable<GoogleStreamChunk> = streamGen();
  const responsePromise: Promise<GoogleFinalResponse> = Promise.resolve(settledResponse);
  return {
    stream: streamIterable,
    response: responsePromise,
  };
}

/**
 * Builds a final response object that may include SDK-only `finishReason` strings
 * not present on `GoogleFinishReason`, for unit tests of adapter mapping.
 */
export function createGoogleStreamResultWithSdkShapedResponse(options: {
  chunks: GoogleStreamChunk[];
  responseBody: Record<string, unknown>;
}): MockGoogleSendMessageStreamResult {
  const chunkList: GoogleStreamChunk[] = options.chunks;
  const responseAsFinal: GoogleFinalResponse = options.responseBody as GoogleFinalResponse;
  async function* streamGen(): AsyncGenerator<GoogleStreamChunk> {
    for (const chunk of chunkList) {
      yield chunk;
    }
  }
  const streamIterable: AsyncIterable<GoogleStreamChunk> = streamGen();
  const responsePromise: Promise<GoogleFinalResponse> = Promise.resolve(responseAsFinal);
  return {
    stream: streamIterable,
    response: responsePromise,
  };
}

export function createMockGoogleSdkFinalResponse(
  overrides?: Partial<GoogleFinalResponse>,
): GoogleFinalResponse {
  const usageSource = mockGoogleSdkFinalResponse.usageMetadata;
  const usageMetadataResolved =
    usageSource === undefined || usageSource === null
      ? {
          promptTokenCount: 12,
          candidatesTokenCount: 18,
          totalTokenCount: 30,
        }
      : {
          promptTokenCount: usageSource.promptTokenCount,
          candidatesTokenCount: usageSource.candidatesTokenCount,
          totalTokenCount: usageSource.totalTokenCount,
        };
  const base: GoogleFinalResponse = {
    candidates: mockGoogleSdkFinalResponse.candidates?.map((c) => ({ ...c })),
    usageMetadata: usageMetadataResolved,
  };
  if (overrides === undefined) {
    return base;
  }
  return { ...base, ...overrides };
}

export function createMockGoogleNodeModelConfig(
  overrides?: Partial<NodeModelConfig>,
): NodeModelConfig {
  if (overrides === undefined) {
    return { ...mockGoogleNodeModelConfig };
  }
  return { ...mockGoogleNodeModelConfig, ...overrides };
}

export function createMockGoogleNodeAdapterConstructorParams(
  overrides?: Partial<NodeAdapterConstructorParams>,
): NodeAdapterConstructorParams {
  if (overrides === undefined) {
    return {
      modelConfig: { ...mockGoogleNodeAdapterConstructorParams.modelConfig },
      apiKey: mockGoogleNodeAdapterConstructorParams.apiKey,
    };
  }
  const modelConfig: NodeModelConfig =
    overrides.modelConfig === undefined
      ? { ...mockGoogleNodeModelConfig }
      : { ...mockGoogleNodeModelConfig, ...overrides.modelConfig };
  const apiKey: string =
    overrides.apiKey === undefined
      ? mockGoogleNodeAdapterConstructorParams.apiKey
      : overrides.apiKey;
  return {
    modelConfig,
    apiKey,
  };
}

export function createMockGoogleNodeChatApiRequest(
  overrides?: Partial<NodeChatApiRequest>,
): NodeChatApiRequest {
  if (overrides === undefined) {
    return { ...mockGoogleNodeChatApiRequest };
  }
  return { ...mockGoogleNodeChatApiRequest, ...overrides };
}

export async function collectNodeAdapterStreamChunks(
  stream: AsyncGenerator<NodeAdapterStreamChunk>,
): Promise<NodeAdapterStreamChunk[]> {
  const result: NodeAdapterStreamChunk[] = [];
  for await (const chunk of stream) {
    result.push(chunk);
  }
  return result;
}

export function createMockGoogleNodeAdapter(overrides?: Partial<AiAdapter>): AiAdapter {
  async function* defaultSendMessageStream(
    _request: NodeChatApiRequest,
    _apiIdentifier: string,
  ): AsyncGenerator<NodeAdapterStreamChunk> {
    const textDelta: NodeAdapterStreamChunk = {
      type: 'text_delta',
      text: 'mock google response',
    };
    yield textDelta;
    const usage: NodeAdapterStreamChunk = {
      type: 'usage',
      tokenUsage: {
        prompt_tokens: 12,
        completion_tokens: 18,
        total_tokens: 30,
      },
    };
    yield usage;
    const done: NodeAdapterStreamChunk = {
      type: 'done',
      finish_reason: 'stop',
    };
    yield done;
  }

  if (overrides === undefined) {
    return { sendMessageStream: defaultSendMessageStream };
  }
  const sendMessageStream: AiAdapter['sendMessageStream'] =
    overrides.sendMessageStream === undefined
      ? defaultSendMessageStream
      : overrides.sendMessageStream;
  return { sendMessageStream };
}
