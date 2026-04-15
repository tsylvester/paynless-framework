import type {
  OpenAIChatCompletionChunk,
  OpenAIChoiceDelta,
  OpenAIUsageDelta,
} from './openai.interface.ts';

export function isOpenAIUsageDelta(v: unknown): v is OpenAIUsageDelta {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return false;
  }
  if (
    !('prompt_tokens' in v) ||
    !('completion_tokens' in v) ||
    !('total_tokens' in v)
  ) {
    return false;
  }
  const promptTokens: unknown = Reflect.get(v, 'prompt_tokens');
  const completionTokens: unknown = Reflect.get(v, 'completion_tokens');
  const totalTokens: unknown = Reflect.get(v, 'total_tokens');
  if (typeof promptTokens !== 'number') {
    return false;
  }
  if (typeof completionTokens !== 'number') {
    return false;
  }
  if (typeof totalTokens !== 'number') {
    return false;
  }
  if (!Number.isInteger(promptTokens) || promptTokens < 0) {
    return false;
  }
  if (!Number.isInteger(completionTokens) || completionTokens < 0) {
    return false;
  }
  if (!Number.isInteger(totalTokens) || totalTokens < 0) {
    return false;
  }
  return true;
}

export function isOpenAIChoiceDelta(v: unknown): v is OpenAIChoiceDelta {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return false;
  }
  if (!('delta' in v)) {
    return false;
  }
  const delta: unknown = Reflect.get(v, 'delta');
  if (delta === null || typeof delta !== 'object' || Array.isArray(delta)) {
    return false;
  }
  if ('content' in delta) {
    const content: unknown = Reflect.get(delta, 'content');
    if (content !== null && content !== undefined && typeof content !== 'string') {
      return false;
    }
  }
  return true;
}

export function isOpenAIChatCompletionChunk(
  v: unknown,
): v is OpenAIChatCompletionChunk {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return false;
  }
  if (!('choices' in v)) {
    return false;
  }
  const choices: unknown = Reflect.get(v, 'choices');
  if (!Array.isArray(choices)) {
    return false;
  }
  for (const choice of choices) {
    if (!isOpenAIChoiceDelta(choice)) {
      return false;
    }
  }
  if ('usage' in v) {
    const usage: unknown = Reflect.get(v, 'usage');
    if (usage === null || usage === undefined) {
      return true;
    }
    if (!isOpenAIUsageDelta(usage)) {
      return false;
    }
  }
  return true;
}
