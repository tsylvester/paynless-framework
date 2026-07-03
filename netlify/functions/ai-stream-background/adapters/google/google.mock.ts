import type {
  AiAdapter,
  NodeAdapterConstructorParams,
  NodeEmbeddingRequest,
  NodeEmbeddingResponse,
  NodeAdapterStreamChunk,
  NodeChatApiRequest,
  NodeModelConfig,
  NodeUserConfig,
} from '../ai-adapter.interface.ts';
import type {
  GoogleCandidate,
  GoogleEmbeddingResponse,
  GoogleFinalResponse,
  GoogleStreamChunk,
  GoogleTokenCountResponse,
  GoogleUsageMetadata,
} from './google.interface.ts';

export interface MockGoogleSendMessageStreamResult {
  stream: AsyncIterable<GoogleStreamChunk>;
  response: Promise<GoogleSdkFinalResponse>;
}

export interface GoogleSdkCandidate {
  content?: GoogleCandidate['content'];
  finishReason?: GoogleCandidate['finishReason'] | string;
}

export interface GoogleSdkUsageMetadata {
  promptTokenCount: GoogleUsageMetadata['promptTokenCount'] | string;
  candidatesTokenCount: GoogleUsageMetadata['candidatesTokenCount'] | string;
  totalTokenCount: GoogleUsageMetadata['totalTokenCount'] | string;
}

export interface GoogleSdkFinalResponse {
  candidates?: GoogleSdkCandidate[];
  usageMetadata?: GoogleSdkUsageMetadata | null;
}

export interface GoogleSdkCandidateOverrides {
  content?: GoogleSdkCandidate['content'] | null | undefined;
  finishReason?: GoogleSdkCandidate['finishReason'] | null | undefined;
}

export interface GoogleSdkUsageMetadataOverrides {
  promptTokenCount?: GoogleSdkUsageMetadata['promptTokenCount'] | null | undefined;
  candidatesTokenCount?: GoogleSdkUsageMetadata['candidatesTokenCount'] | null | undefined;
  totalTokenCount?: GoogleSdkUsageMetadata['totalTokenCount'] | null | undefined;
}

export interface GoogleSdkFinalResponseOverrides {
  candidates?: GoogleSdkCandidateOverrides[] | null | undefined;
  usageMetadata?: GoogleSdkUsageMetadataOverrides | null | undefined;
};

export type GoogleNodeModelConfigOverrides = {
  [K in keyof NodeModelConfig]?: NodeModelConfig[K] | null;
};

export type GoogleNodeUserConfigOverrides = {
  [K in keyof NodeUserConfig]?: NodeUserConfig[K] | null;
};

export type GoogleNodeAdapterConstructorParamsOverrides = {
  [K in keyof NodeAdapterConstructorParams]?: NodeAdapterConstructorParams[K] | null;
};

export type GoogleNodeChatApiRequestOverrides = {
  [K in keyof NodeChatApiRequest]?: NodeChatApiRequest[K] | null;
};

export type GoogleEmbeddingResponseOverrides = {
  [K in keyof GoogleEmbeddingResponse]?: GoogleEmbeddingResponse[K] | null;
};

export type GoogleTokenCountResponseOverrides = {
  [K in keyof GoogleTokenCountResponse]?: GoogleTokenCountResponse[K] | null;
};

export type GoogleNodeAdapterOverrides = {
  [K in keyof AiAdapter]?: AiAdapter[K] | null;
};

export const mockGoogleNodeModelConfig: NodeModelConfig = {
  api_identifier: 'google-gemini-2-5-pro',
  hard_cap_output_tokens: 4096,
  input_token_cost_rate: 0.001,
  output_token_cost_rate: 0.002,
};

export const mockGoogleNodeUserConfig: NodeUserConfig = {
  tier_output_cap_tokens: null,
};

export const mockGoogleNodeAdapterConstructorParams: NodeAdapterConstructorParams = {
  modelConfig: { ...mockGoogleNodeModelConfig },
  apiKey: 'google-api-key-mock',
  userConfig: { ...mockGoogleNodeUserConfig },
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

export const mockGoogleEmbeddingResponse: GoogleEmbeddingResponse = {
  embedding: {
    values: [0.101, 0.202, 0.303],
  },
};

export const mockGoogleTokenCountResponse: GoogleTokenCountResponse = {
  totalTokenCount: 9,
};

export function buildGoogleStreamResult(options: {
  chunks: GoogleStreamChunk[];
  response: GoogleSdkFinalResponse;
}): MockGoogleSendMessageStreamResult {
  const chunkList: GoogleStreamChunk[] = options.chunks;
  const settledResponse: GoogleSdkFinalResponse = options.response;
  async function* streamGen(): AsyncGenerator<GoogleStreamChunk> {
    for (const chunk of chunkList) {
      yield chunk;
    }
  }
  const streamIterable: AsyncIterable<GoogleStreamChunk> = streamGen();
  const responsePromise: Promise<GoogleSdkFinalResponse> = Promise.resolve(settledResponse);
  return {
    stream: streamIterable,
    response: responsePromise,
  };
}

export function buildGoogleSdkFinalResponse(
  overrides?: GoogleSdkFinalResponseOverrides,
): GoogleSdkFinalResponse {
  const usageSource = mockGoogleSdkFinalResponse.usageMetadata;
  const usageMetadataResolved: GoogleSdkUsageMetadata =
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
  const baseCandidates: GoogleSdkCandidate[] | undefined =
    mockGoogleSdkFinalResponse.candidates?.map((candidate) => ({
      content: candidate.content,
      finishReason: candidate.finishReason,
    }));
  const base: GoogleSdkFinalResponse = {
    candidates: baseCandidates,
    usageMetadata: usageMetadataResolved,
  };
  if (overrides === undefined) {
    return base;
  }

  const candidates: GoogleSdkCandidate[] | undefined =
    overrides.candidates === undefined
      ? base.candidates
      : overrides.candidates === null
        ? undefined
        : overrides.candidates.map((candidateOverride) => {
            const content: GoogleSdkCandidate['content'] =
              'content' in candidateOverride
                ? candidateOverride.content === null
                  ? undefined
                  : candidateOverride.content
                : undefined;
            const finishReason: GoogleSdkCandidate['finishReason'] =
              'finishReason' in candidateOverride
                ? candidateOverride.finishReason === null
                  ? undefined
                  : candidateOverride.finishReason
                : undefined;
            return {
              content,
              finishReason,
            };
          });

  const usageMetadata: GoogleSdkUsageMetadata | null | undefined =
    overrides.usageMetadata === undefined
      ? base.usageMetadata
      : overrides.usageMetadata === null
        ? null
        : {
            promptTokenCount:
              overrides.usageMetadata.promptTokenCount === undefined
                ? usageMetadataResolved.promptTokenCount
                : overrides.usageMetadata.promptTokenCount === null
                  ? usageMetadataResolved.promptTokenCount
                  : overrides.usageMetadata.promptTokenCount,
            candidatesTokenCount:
              overrides.usageMetadata.candidatesTokenCount === undefined
                ? usageMetadataResolved.candidatesTokenCount
                : overrides.usageMetadata.candidatesTokenCount === null
                  ? usageMetadataResolved.candidatesTokenCount
                  : overrides.usageMetadata.candidatesTokenCount,
            totalTokenCount:
              overrides.usageMetadata.totalTokenCount === undefined
                ? usageMetadataResolved.totalTokenCount
                : overrides.usageMetadata.totalTokenCount === null
                  ? usageMetadataResolved.totalTokenCount
                  : overrides.usageMetadata.totalTokenCount,
          };

  return {
    candidates,
    usageMetadata,
  };
}

export function buildGoogleNodeModelConfig(
  overrides?: GoogleNodeModelConfigOverrides,
): NodeModelConfig {
  if (overrides === undefined) {
    return { ...mockGoogleNodeModelConfig };
  }
  return {
    api_identifier:
      overrides.api_identifier !== undefined && overrides.api_identifier !== null
        ? overrides.api_identifier
        : mockGoogleNodeModelConfig.api_identifier,
    hard_cap_output_tokens:
      'hard_cap_output_tokens' in overrides
        ? overrides.hard_cap_output_tokens === null
          ? mockGoogleNodeModelConfig.hard_cap_output_tokens
          : overrides.hard_cap_output_tokens
        : mockGoogleNodeModelConfig.hard_cap_output_tokens,
    input_token_cost_rate:
      overrides.input_token_cost_rate !== undefined && overrides.input_token_cost_rate !== null
        ? overrides.input_token_cost_rate
        : mockGoogleNodeModelConfig.input_token_cost_rate,
    output_token_cost_rate:
      overrides.output_token_cost_rate !== undefined && overrides.output_token_cost_rate !== null
        ? overrides.output_token_cost_rate
        : mockGoogleNodeModelConfig.output_token_cost_rate,
  };
}

export function buildGoogleNodeUserConfig(
  overrides?: GoogleNodeUserConfigOverrides,
): NodeUserConfig {
  if (overrides === undefined) {
    return { ...mockGoogleNodeUserConfig };
  }
  const tier_output_cap_tokens: number | null =
    overrides.tier_output_cap_tokens !== undefined && overrides.tier_output_cap_tokens !== null
      ? overrides.tier_output_cap_tokens
      : mockGoogleNodeUserConfig.tier_output_cap_tokens;
  return { tier_output_cap_tokens };
}

export function buildGoogleNodeAdapterConstructorParams(
  overrides?: GoogleNodeAdapterConstructorParamsOverrides,
): NodeAdapterConstructorParams {
  if (overrides === undefined) {
    return {
      modelConfig: buildGoogleNodeModelConfig(),
      apiKey: mockGoogleNodeAdapterConstructorParams.apiKey,
      userConfig: buildGoogleNodeUserConfig(),
    };
  }
  const modelConfig: NodeModelConfig =
    overrides.modelConfig !== undefined && overrides.modelConfig !== null
      ? buildGoogleNodeModelConfig(overrides.modelConfig)
      : buildGoogleNodeModelConfig();
  const apiKey: string =
    overrides.apiKey !== undefined && overrides.apiKey !== null
      ? overrides.apiKey
      : mockGoogleNodeAdapterConstructorParams.apiKey;
  const userConfig: NodeUserConfig =
    overrides.userConfig !== undefined && overrides.userConfig !== null
      ? buildGoogleNodeUserConfig(overrides.userConfig)
      : buildGoogleNodeUserConfig();
  return {
    modelConfig,
    apiKey,
    userConfig,
  };
}

export function buildGoogleNodeChatApiRequest(
  overrides?: GoogleNodeChatApiRequestOverrides,
): NodeChatApiRequest {
  if (overrides === undefined) {
    return { ...mockGoogleNodeChatApiRequest };
  }
  return {
    message:
      overrides.message !== undefined && overrides.message !== null
        ? overrides.message
        : mockGoogleNodeChatApiRequest.message,
    providerId:
      overrides.providerId !== undefined && overrides.providerId !== null
        ? overrides.providerId
        : mockGoogleNodeChatApiRequest.providerId,
    promptId:
      overrides.promptId !== undefined && overrides.promptId !== null
        ? overrides.promptId
        : mockGoogleNodeChatApiRequest.promptId,
    ...('messages' in overrides
      ? {
          messages:
            overrides.messages === null
              ? mockGoogleNodeChatApiRequest.messages
              : overrides.messages,
        }
      : {
          messages: mockGoogleNodeChatApiRequest.messages,
        }),
    ...('resourceDocuments' in overrides
      ? {
          resourceDocuments:
            overrides.resourceDocuments === null
              ? mockGoogleNodeChatApiRequest.resourceDocuments
              : overrides.resourceDocuments,
        }
      : {
          resourceDocuments: mockGoogleNodeChatApiRequest.resourceDocuments,
        }),
    ...('max_tokens_to_generate' in overrides
      ? {
          max_tokens_to_generate:
            overrides.max_tokens_to_generate === null
              ? mockGoogleNodeChatApiRequest.max_tokens_to_generate
              : overrides.max_tokens_to_generate,
        }
      : {
          max_tokens_to_generate: mockGoogleNodeChatApiRequest.max_tokens_to_generate,
        }),
  };
}

export function buildGoogleEmbeddingResponse(
  overrides?: GoogleEmbeddingResponseOverrides,
): GoogleEmbeddingResponse {
  if (overrides === undefined) {
    return {
      embedding: {
        values: [...mockGoogleEmbeddingResponse.embedding.values],
      },
    };
  }
  return {
    embedding:
      overrides.embedding !== undefined && overrides.embedding !== null
        ? overrides.embedding
        : {
            values: [...mockGoogleEmbeddingResponse.embedding.values],
          },
  };
}

export function buildGoogleTokenCountResponse(
  overrides?: GoogleTokenCountResponseOverrides,
): GoogleTokenCountResponse {
  if (overrides === undefined) {
    return { ...mockGoogleTokenCountResponse };
  }
  return {
    totalTokenCount:
      overrides.totalTokenCount !== undefined && overrides.totalTokenCount !== null
        ? overrides.totalTokenCount
        : mockGoogleTokenCountResponse.totalTokenCount,
  };
}

export const mockGoogleGetEmbedding: AiAdapter['getEmbedding'] = async (
  _request: NodeEmbeddingRequest,
  _apiIdentifier: string,
): Promise<NodeEmbeddingResponse> => {
  return {
    embedding: [...mockGoogleEmbeddingResponse.embedding.values],
    tokenUsage: {
      prompt_tokens: mockGoogleTokenCountResponse.totalTokenCount,
      completion_tokens: 0,
      total_tokens: mockGoogleTokenCountResponse.totalTokenCount,
    },
  };
};

export async function collectNodeAdapterStreamChunks(
  stream: AsyncGenerator<NodeAdapterStreamChunk>,
): Promise<NodeAdapterStreamChunk[]> {
  const result: NodeAdapterStreamChunk[] = [];
  for await (const chunk of stream) {
    result.push(chunk);
  }
  return result;
}

export function buildGoogleNodeAdapter(overrides?: GoogleNodeAdapterOverrides): AiAdapter {
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
    return {
      sendMessageStream: defaultSendMessageStream,
    };
  }
  const sendMessageStream: AiAdapter['sendMessageStream'] =
    overrides.sendMessageStream !== undefined && overrides.sendMessageStream !== null
      ? overrides.sendMessageStream
      : defaultSendMessageStream;
  const adapter: AiAdapter = { sendMessageStream };
  if (overrides.getEmbedding !== undefined && overrides.getEmbedding !== null) {
    adapter.getEmbedding = overrides.getEmbedding;
  }
  return adapter;
}
