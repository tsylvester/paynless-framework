// supabase/functions/_shared/utils/tokenizer_utils.mock.ts

import type { AiModelExtendedConfig } from "../types.ts";
import type {
  CountableChatPayload,
  CountTokensDeps,
  CountTokensFn,
} from "../types/tokenizer.types.ts";

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
