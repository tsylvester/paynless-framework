import type {
  AiAdapter,
  AiAdapterParams,
  AiAdapterResult,
} from '../ai-adapter.interface.ts';
import { createValidAiAdapterParams } from '../ai-adapter.mock.ts';
import type {
  OpenAIChatCompletionChunk,
  OpenAIChoiceDelta,
  OpenAIUsageDelta,
} from './openai.interface.ts';

export function mockOpenAIChoiceDelta(
  overrides?: Partial<OpenAIChoiceDelta>,
): OpenAIChoiceDelta {
  const base: OpenAIChoiceDelta = {
    delta: {
      content: 'delta text',
    },
  };
  if (overrides === undefined) {
    return base;
  }
  const mergedDelta: OpenAIChoiceDelta['delta'] = {
    ...base.delta,
    ...overrides.delta,
  };
  const merged: OpenAIChoiceDelta = {
    ...base,
    ...overrides,
    delta: mergedDelta,
  };
  return merged;
}

export function mockOpenAIUsageDelta(
  overrides?: Partial<OpenAIUsageDelta>,
): OpenAIUsageDelta {
  const base: OpenAIUsageDelta = {
    prompt_tokens: 1,
    completion_tokens: 2,
    total_tokens: 3,
  };
  if (overrides === undefined) {
    return base;
  }
  const merged: OpenAIUsageDelta = {
    ...base,
    ...overrides,
  };
  return merged;
}

export function mockOpenAIChatCompletionChunk(
  overrides?: Partial<OpenAIChatCompletionChunk>,
): OpenAIChatCompletionChunk {
  const base: OpenAIChatCompletionChunk = {
    choices: [mockOpenAIChoiceDelta()],
    usage: undefined,
  };
  if (overrides === undefined) {
    return base;
  }
  const mergedChoices: OpenAIChoiceDelta[] =
    overrides.choices !== undefined ? overrides.choices : base.choices;
  const merged: OpenAIChatCompletionChunk = {
    ...base,
    ...overrides,
    choices: mergedChoices,
  };
  return merged;
}

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

export function mockOpenAIStreamChunks(
  textParts: string[],
  finalUsage: OpenAIUsageDelta | null,
): OpenAIChatCompletionChunk[] {
  const textChunks: OpenAIChatCompletionChunk[] = textParts.map((part) =>
    mockOpenAIChatCompletionChunk({
      choices: [
        mockOpenAIChoiceDelta({
          delta: { content: part },
        }),
      ],
      usage: undefined,
    }),
  );
  if (finalUsage === null) {
    return textChunks;
  }
  const usageChunk: OpenAIChatCompletionChunk = mockOpenAIChatCompletionChunk({
    choices: [mockOpenAIChoiceDelta({ delta: { content: '' } })],
    usage: finalUsage,
  });
  if (textChunks.length === 0) {
    return [usageChunk];
  }
  return [...textChunks, usageChunk];
}

export async function* mockOpenAIAsyncIterableFromChunks(
  chunks: OpenAIChatCompletionChunk[],
): AsyncIterable<OpenAIChatCompletionChunk> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

export async function* mockOpenAIAsyncIterableYieldThenThrow(
  first: OpenAIChatCompletionChunk,
): AsyncIterable<OpenAIChatCompletionChunk> {
  yield first;
  throw new Error('mock stream error');
}

export function createMockOpenAINodeAdapter(
  overrides?: Partial<AiAdapter>,
): AiAdapter {
  const defaultResult: AiAdapterResult = {
    assembled_content: 'mock openai response',
    token_usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
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
