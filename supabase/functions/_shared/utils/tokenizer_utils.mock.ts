// supabase/functions/_shared/utils/tokenizer_utils.mock.ts

import type { AiModelExtendedConfig } from "../types.ts";
import type {
  CountableChatPayload,
  CountTokensDeps,
  CountTokensFn,
  BoundCountTokensFn,
} from "../types/tokenizer.types.ts";
import { MockLogger } from "../logger.mock.ts";
import { countTokens } from "./tokenizer_utils.ts";

export type MockCountTokensOverrides = {
  countTokens?: CountTokensFn;
};

const defaultCountTokens: CountTokensFn = (
  _deps: CountTokensDeps,
  _payload: CountableChatPayload,
  _modelConfig: AiModelExtendedConfig,
): number => {
  return 0;
};

export function createMockCountTokens(
  overrides: MockCountTokensOverrides = {},
): CountTokensFn {
  return overrides.countTokens !== undefined
    ? overrides.countTokens
    : defaultCountTokens;
}

export type CountTokensDepsOverrides = Partial<CountTokensDeps>;

export function buildCountTokensDeps(
  overrides?: CountTokensDepsOverrides,
): CountTokensDeps {
  const base: CountTokensDeps = {
    getEncoding: (_name: string) => ({
      encode: (input: string) => Array.from(input, (_ch, index: number) => index),
    }),
    countTokensAnthropic: (text: string) => text.length,
    logger: new MockLogger(),
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type CountTokensDepsCorruptions = { [K in keyof CountTokensDeps]?: unknown };

export function invalidateCountTokensDeps(
  corruptions: CountTokensDepsCorruptions,
): unknown {
  return { ...buildCountTokensDeps(), ...corruptions };
}

export const mockBoundCountTokens: BoundCountTokensFn = (
  payload,
  modelConfig,
) => countTokens(buildCountTokensDeps(), payload, modelConfig);
