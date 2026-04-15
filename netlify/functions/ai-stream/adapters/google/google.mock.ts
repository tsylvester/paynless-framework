import type {
  AiAdapter,
  AiAdapterParams,
  AiAdapterResult,
} from '../ai-adapter.interface.ts';
import { createValidAiAdapterParams } from '../ai-adapter.mock.ts';
import type { GoogleStreamChunk, GoogleUsageMetadata } from './google.interface.ts';

export function mockAiAdapterParams(
  overrides?: Partial<AiAdapterParams>,
): AiAdapterParams {
  const base: AiAdapterParams = createValidAiAdapterParams();
  if (overrides === undefined) {
    return base;
  }
  const merged: AiAdapterParams = {
    ...base,
    ...overrides,
    chatApiRequest: overrides.chatApiRequest ?? base.chatApiRequest,
    modelConfig: overrides.modelConfig ?? base.modelConfig,
    apiKey: overrides.apiKey ?? base.apiKey,
  };
  return merged;
}

export function mockGoogleUsageMetadata(
  overrides?: Partial<GoogleUsageMetadata>,
): GoogleUsageMetadata {
  const base: GoogleUsageMetadata = {
    promptTokenCount: 1,
    candidatesTokenCount: 2,
    totalTokenCount: 3,
  };
  if (overrides === undefined) {
    return base;
  }
  const merged: GoogleUsageMetadata = {
    ...base,
    ...overrides,
  };
  return merged;
}

export function mockGoogleStreamChunk(
  overrides?: Partial<GoogleStreamChunk>,
): GoogleStreamChunk {
  const baseText: () => string = (): string => {
    return 'chunk text';
  };
  const base: GoogleStreamChunk = {
    text: baseText,
    usageMetadata: undefined,
  };
  if (overrides === undefined) {
    return base;
  }
  const merged: GoogleStreamChunk = {
    ...base,
    ...overrides,
  };
  return merged;
}

export function mockGoogleStreamChunks(
  textParts: string[],
  finalUsage: GoogleUsageMetadata | null,
): GoogleStreamChunk[] {
  const textChunks: GoogleStreamChunk[] = textParts.map((part: string) => {
    const textFn = (): string => part;
    return mockGoogleStreamChunk({
      text: textFn,
      usageMetadata: undefined,
    });
  });
  if (finalUsage === null) {
    return textChunks;
  }
  const emptyText = (): string => '';
  const usageChunk: GoogleStreamChunk = mockGoogleStreamChunk({
    text: emptyText,
    usageMetadata: finalUsage,
  });
  if (textChunks.length === 0) {
    return [usageChunk];
  }
  return [...textChunks, usageChunk];
}

export async function* mockGoogleAsyncIterableFromChunks(
  chunks: GoogleStreamChunk[],
): AsyncIterable<GoogleStreamChunk> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

export async function* mockGoogleAsyncIterableYieldThenThrow(
  first: GoogleStreamChunk,
): AsyncIterable<GoogleStreamChunk> {
  yield first;
  throw new Error('mock stream error');
}

export function createMockGoogleNodeAdapter(
  overrides?: Partial<AiAdapter>,
): AiAdapter {
  const defaultResult: AiAdapterResult = {
    assembled_content: 'mock google response',
    token_usage: {
      prompt_tokens: 12,
      completion_tokens: 18,
      total_tokens: 30,
    },
  };
  const defaultStream = async (
    _params: AiAdapterParams,
  ): Promise<AiAdapterResult> => {
    return defaultResult;
  };
  if (overrides === undefined) {
    const adapter: AiAdapter = {
      stream: defaultStream,
    };
    return adapter;
  }
  const merged: AiAdapter = {
    stream: overrides.stream ?? defaultStream,
  };
  return merged;
}
