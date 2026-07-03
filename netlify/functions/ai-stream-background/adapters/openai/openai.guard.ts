import type {
  OpenAIChatCompletionChunk,
  OpenAIChoice,
  OpenAIDelta,
  OpenAIFinishReason,
  OpenAIEmbeddingDatum,
  OpenAIEmbeddingResponse,
  OpenAIEmbeddingUsage,
  OpenAIUsageDelta,
} from './openai.interface.ts';
import { isPlainRecord } from '../getNodeAiAdapter.guard.ts';

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function isOpenAIFinishReason(v: unknown): v is OpenAIFinishReason {
  if (typeof v !== 'string') {
    return false;
  }
  if (v === 'stop') {
    return true;
  }
  if (v === 'length') {
    return true;
  }
  if (v === 'tool_calls') {
    return true;
  }
  if (v === 'content_filter') {
    return true;
  }
  if (v === 'function_call') {
    return true;
  }
  return false;
}

export function isOpenAIDelta(v: unknown): v is OpenAIDelta {
  if (!isPlainRecord(v)) {
    return false;
  }
  if ('content' in v) {
    const contentValue: unknown = v['content'];
    if (contentValue === undefined) {
      return false;
    }
    if (typeof contentValue !== 'string' && contentValue !== null) {
      return false;
    }
  }
  return true;
}

export function isOpenAIChoice(v: unknown): v is OpenAIChoice {
  if (!isPlainRecord(v)) {
    return false;
  }
  if (!('delta' in v)) {
    return false;
  }
  if (!('finish_reason' in v)) {
    return false;
  }
  const deltaValue: unknown = v['delta'];
  if (!isOpenAIDelta(deltaValue)) {
    return false;
  }
  const finishReasonValue: unknown = v['finish_reason'];
  if (finishReasonValue === null) {
    return true;
  }
  return isOpenAIFinishReason(finishReasonValue);
}

export function isOpenAIUsageDelta(v: unknown): v is OpenAIUsageDelta {
  if (!isPlainRecord(v)) {
    return false;
  }
  const promptTokens: unknown = v['prompt_tokens'];
  const completionTokens: unknown = v['completion_tokens'];
  const totalTokens: unknown = v['total_tokens'];
  if (
    !isNonNegativeInteger(promptTokens) ||
    !isNonNegativeInteger(completionTokens) ||
    !isNonNegativeInteger(totalTokens)
  ) {
    return false;
  }
  return true;
}

export function isOpenAIEmbeddingUsage(v: unknown): v is OpenAIEmbeddingUsage {
  if (!isPlainRecord(v)) {
    return false;
  }
  const promptTokens: unknown = v['prompt_tokens'];
  const totalTokens: unknown = v['total_tokens'];
  if (!isNonNegativeInteger(promptTokens) || !isNonNegativeInteger(totalTokens)) {
    return false;
  }
  return true;
}

export function isOpenAIEmbeddingDatum(v: unknown): v is OpenAIEmbeddingDatum {
  if (!isPlainRecord(v)) {
    return false;
  }
  if (!('embedding' in v)) {
    return false;
  }
  const embeddingValue: unknown = v['embedding'];
  if (!Array.isArray(embeddingValue)) {
    return false;
  }
  for (const item of embeddingValue) {
    if (typeof item !== 'number' || Number.isNaN(item)) {
      return false;
    }
  }
  return true;
}

export function isOpenAIEmbeddingResponse(
  v: unknown,
): v is OpenAIEmbeddingResponse {
  if (!isPlainRecord(v)) {
    return false;
  }
  if (!('data' in v) || !('usage' in v)) {
    return false;
  }
  const dataValue: unknown = v['data'];
  const usageValue: unknown = v['usage'];
  if (!Array.isArray(dataValue) || dataValue.length === 0) {
    return false;
  }
  for (const item of dataValue) {
    if (!isOpenAIEmbeddingDatum(item)) {
      return false;
    }
  }
  return isOpenAIEmbeddingUsage(usageValue);
}

export function isOpenAIChatCompletionChunk(
  v: unknown,
): v is OpenAIChatCompletionChunk {
  if (!isPlainRecord(v)) {
    return false;
  }
  if (!('choices' in v)) {
    return false;
  }
  const choicesValue: unknown = v['choices'];
  if (!Array.isArray(choicesValue)) {
    return false;
  }
  for (const item of choicesValue) {
    if (!isOpenAIChoice(item)) {
      return false;
    }
  }
  if ('usage' in v) {
    const usageValue: unknown = v['usage'];
    if (usageValue === null) {
      return true;
    }
    if (!isOpenAIUsageDelta(usageValue)) {
      return false;
    }
  }
  return true;
}
