import type {
  AiAdapter,
  AiAdapterParams,
  AiAdapterResult,
} from '../ai-adapter.interface.ts';
import { createValidAiAdapterParams } from '../ai-adapter.mock.ts';
import type {
  AnthropicMessageDeltaEvent,
  AnthropicMessageDeltaUsage,
  AnthropicMessageStartEvent,
  AnthropicMessageStartUsage,
  AnthropicTextDeltaEvent,
} from './anthropic.interface.ts';

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

export function mockAnthropicMessageStartUsage(
  overrides?: Partial<AnthropicMessageStartUsage>,
): AnthropicMessageStartUsage {
  const base: AnthropicMessageStartUsage = {
    input_tokens: 1,
  };
  if (overrides === undefined) {
    return base;
  }
  const merged: AnthropicMessageStartUsage = {
    ...base,
    ...overrides,
  };
  return merged;
}

export function mockAnthropicMessageStartEvent(
  overrides?: Partial<AnthropicMessageStartEvent>,
): AnthropicMessageStartEvent {
  const base: AnthropicMessageStartEvent = {
    type: 'message_start',
    message: { usage: mockAnthropicMessageStartUsage() },
  };
  if (overrides === undefined) {
    return base;
  }
  if (overrides.message === undefined) {
    const merged: AnthropicMessageStartEvent = {
      ...base,
      ...overrides,
      type: 'message_start',
      message: base.message,
    };
    return merged;
  }
  const mergedUsage: AnthropicMessageStartUsage =
    overrides.message.usage !== undefined
      ? { ...base.message.usage, ...overrides.message.usage }
      : base.message.usage;
  const merged: AnthropicMessageStartEvent = {
    ...base,
    ...overrides,
    type: 'message_start',
    message: { usage: mergedUsage },
  };
  return merged;
}

export function mockAnthropicTextDeltaEvent(
  overrides?: Partial<AnthropicTextDeltaEvent>,
): AnthropicTextDeltaEvent {
  const base: AnthropicTextDeltaEvent = {
    type: 'content_block_delta',
    delta: { type: 'text_delta', text: 'delta text' },
  };
  if (overrides === undefined) {
    return base;
  }
  const mergedDelta: AnthropicTextDeltaEvent['delta'] =
    overrides.delta !== undefined
      ? { ...base.delta, ...overrides.delta }
      : base.delta;
  const merged: AnthropicTextDeltaEvent = {
    ...base,
    ...overrides,
    delta: mergedDelta,
  };
  return merged;
}

export function mockAnthropicMessageDeltaUsage(
  overrides?: Partial<AnthropicMessageDeltaUsage>,
): AnthropicMessageDeltaUsage {
  const base: AnthropicMessageDeltaUsage = {
    output_tokens: 2,
  };
  if (overrides === undefined) {
    return base;
  }
  const merged: AnthropicMessageDeltaUsage = {
    ...base,
    ...overrides,
  };
  return merged;
}

export function mockAnthropicMessageDeltaEvent(
  overrides?: Partial<AnthropicMessageDeltaEvent>,
): AnthropicMessageDeltaEvent {
  const base: AnthropicMessageDeltaEvent = {
    type: 'message_delta',
    usage: mockAnthropicMessageDeltaUsage(),
  };
  if (overrides === undefined) {
    return base;
  }
  const mergedUsage: AnthropicMessageDeltaUsage =
    overrides.usage !== undefined
      ? { ...base.usage, ...overrides.usage }
      : base.usage;
  const merged: AnthropicMessageDeltaEvent = {
    ...base,
    ...overrides,
    usage: mergedUsage,
  };
  return merged;
}

export async function* mockAnthropicAsyncIterableFromEvents(
  events: readonly (
    | AnthropicMessageStartEvent
    | AnthropicTextDeltaEvent
    | AnthropicMessageDeltaEvent
  )[],
): AsyncIterable<
  AnthropicMessageStartEvent | AnthropicTextDeltaEvent | AnthropicMessageDeltaEvent
> {
  for (const event of events) {
    yield event;
  }
}

export async function* mockAnthropicAsyncIterableYieldThenThrow(
  first:
    | AnthropicMessageStartEvent
    | AnthropicTextDeltaEvent
    | AnthropicMessageDeltaEvent,
): AsyncIterable<
  AnthropicMessageStartEvent | AnthropicTextDeltaEvent | AnthropicMessageDeltaEvent
> {
  yield first;
  throw new Error('mock stream error');
}

export function createMockAnthropicNodeAdapter(
  overrides?: Partial<AiAdapter>,
): AiAdapter {
  const defaultResult: AiAdapterResult = {
    assembled_content: 'mock anthropic response',
    token_usage: {
      prompt_tokens: 15,
      completion_tokens: 25,
      total_tokens: 40,
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
